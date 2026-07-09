import type { ApiError, ImportResult, SkippedRecord } from './api';
import type { CrmRecord } from './crm';
import type { MappingPlan } from './mapping';

/**
 * The Server-Sent Events contract for `POST /api/v1/imports/:id/process`.
 *
 * The client cannot use the browser's `EventSource` here, because `EventSource` only issues GET
 * requests. It reads the POST response body as a stream and parses frames by hand — see
 * `frontend/src/hooks/useImport.ts`.
 */
export type SseEvent =
  /** Emitted once, as soon as Phase 1 finishes. Powers the "Detected mappings" panel. */
  | { type: 'mapping_plan'; plan: MappingPlan }
  | {
      type: 'progress';
      processedBatches: number;
      totalBatches: number;
      processedRows: number;
      totalRows: number;
    }
  /** Emitted per batch so the results table fills in live rather than all at once at the end. */
  | {
      type: 'batch_complete';
      batchIndex: number;
      records: CrmRecord[];
      skipped: SkippedRecord[];
    }
  | { type: 'done'; result: ImportResult }
  | { type: 'error'; error: ApiError };

export type SseEventType = SseEvent['type'];

/** Serialise one event as an SSE frame. Named events let the client switch on `event:`. */
export function formatSseFrame(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * A comment frame. Proxies (Render, Railway, nginx) close connections that go quiet, and a slow
 * batch can easily exceed their idle timeout, so we send one of these every few seconds.
 */
export const SSE_HEARTBEAT = ': ping\n\n';
