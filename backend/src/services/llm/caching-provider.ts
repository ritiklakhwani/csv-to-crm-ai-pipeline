import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Logger } from '../../utils/logger';
import { EMPTY_USAGE, type LlmJsonRequest, type LlmJsonResult, type LlmProvider } from './provider';

/**
 * Wraps another provider and memoises its responses to disk, so `LLM_CACHE=true` lets you iterate on
 * the frontend without spending a cent. The extraction pipeline never knows this class exists.
 *
 * Development only. `createLlmProvider` refuses to install it in production.
 */

/** NUL cannot occur in any hashed input, so `a` + `b` and `ab` can never collide. */
const FIELD_SEPARATOR = '\u0000';

export interface CachingLlmProviderOptions {
  dir: string;
  logger: Logger;
}

interface CacheFile {
  meta: { provider: string; model: string; createdAt: string };
  data: unknown;
}

export class CachingLlmProvider implements LlmProvider {
  readonly name: string;

  private readonly inner: LlmProvider;
  private readonly dir: string;
  private readonly logger: Logger;

  constructor(inner: LlmProvider, { dir, logger }: CachingLlmProviderOptions) {
    this.inner = inner;
    this.dir = dir;
    this.logger = logger;
    this.name = `${inner.name}+disk-cache`;
  }

  async completeJson<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const key = this.fingerprint(request);
    const file = join(this.dir, `${key}.json`);

    const hit = await this.read(file);
    if (hit) {
      // Re-validate rather than trusting the file: a schema edit mid-session would otherwise hand
      // the pipeline a stale shape that never passes through Zod again.
      const parsed = request.schema.zod.safeParse(hit.data);
      if (parsed.success) {
        this.logger.debug('LLM disk cache hit', { key, model: request.model });
        return {
          data: parsed.data,
          model: hit.meta.model,
          cached: true,
          // No tokens were spent, so returning the original usage would inflate the cost summary.
          usage: EMPTY_USAGE,
        };
      }
      this.logger.warn('LLM disk cache entry no longer matches the schema; refetching', { key });
    }

    const result = await this.inner.completeJson(request);
    await this.write(file, {
      meta: { provider: this.inner.name, model: result.model, createdAt: new Date().toISOString() },
      data: result.data,
    });

    return result;
  }

  /**
   * Covers everything that could change the response, including the *shape* of the schema rather
   * than merely its name — otherwise a schema edit would silently replay the old answer.
   */
  private fingerprint(request: LlmJsonRequest<unknown>): string {
    const parts = [
      this.inner.name,
      request.model,
      request.system,
      request.user,
      request.schema.name,
      safeJsonSchema(request.schema.zod, request.schema.name),
    ];

    return createHash('sha256').update(parts.join(FIELD_SEPARATOR)).digest('hex').slice(0, 32);
  }

  private async read(file: string): Promise<CacheFile | null> {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as CacheFile;
    } catch {
      // Missing, unreadable or corrupt all mean the same thing: no usable cache entry.
      return null;
    }
  }

  private async write(file: string, contents: CacheFile): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(file, JSON.stringify(contents, null, 2), 'utf8');
    } catch (error) {
      // A cache that cannot be written is an inconvenience, never a failed import.
      this.logger.warn('Could not write LLM cache entry', {
        file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function safeJsonSchema(schema: z.ZodType, fallback: string): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema));
  } catch {
    return fallback;
  }
}
