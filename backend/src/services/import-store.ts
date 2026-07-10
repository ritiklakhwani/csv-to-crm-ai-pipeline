import { randomUUID } from 'node:crypto';
import type { CsvRow } from '@groweasy/shared';

/**
 * A bounded, expiring, in-memory store for parsed uploads.
 *
 * The assignment allows a stateless service, so there is no database. That has one honest
 * consequence: on a free-tier host that sleeps after fifteen minutes, an `importId` handed out
 * before a restart is gone afterwards. The API answers that with a typed 404 rather than a 500, and
 * the frontend still holds the File, so it can re-upload. Production would put this in Redis.
 *
 * Expiry is lazy — checked on read — so there are no timers keeping the event loop alive.
 */

export interface StoredImport {
  importId: string;
  fileName: string;
  sizeBytes: number;
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
  createdAt: number;
}

export interface ImportStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 50;

export type NewImport = Omit<StoredImport, 'importId' | 'createdAt'>;

export class ImportStore {
  private readonly entries = new Map<string, StoredImport>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor({
    ttlMs = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = Date.now,
  }: ImportStoreOptions = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  create(data: NewImport): StoredImport {
    this.evictExpired();

    // A 5 MB CSV becomes a much larger array of row objects, so the map is bounded by count as
    // well as by age. Oldest first, because Map preserves insertion order.
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }

    const stored: StoredImport = { ...data, importId: randomUUID(), createdAt: this.now() };
    this.entries.set(stored.importId, stored);
    return stored;
  }

  get(importId: string): StoredImport | undefined {
    const stored = this.entries.get(importId);
    if (!stored) return undefined;

    if (this.isExpired(stored)) {
      this.entries.delete(importId);
      return undefined;
    }

    return stored;
  }

  delete(importId: string): boolean {
    return this.entries.delete(importId);
  }

  get size(): number {
    return this.entries.size;
  }

  private isExpired(stored: StoredImport): boolean {
    return this.now() - stored.createdAt > this.ttlMs;
  }

  private evictExpired(): void {
    for (const [importId, stored] of this.entries) {
      if (this.isExpired(stored)) this.entries.delete(importId);
    }
  }
}
