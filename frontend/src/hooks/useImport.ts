'use client';

import { ApiError, openImportStream, uploadCsv } from '@/lib/api';
import { machineStore } from '@/lib/machine-store';
import { readSseEvents } from '@/lib/sse';

/**
 * Drives one import end to end: upload the file, open the SSE stream, and fold the events into the
 * machine store. This is the proven fold from the original `useImport` hook — the transport, the
 * abort points, and the "swap to the authoritative payload on done" logic are unchanged. The only
 * difference is the sink: events land in `machineStore` (the hot tier) instead of React state, so a
 * batch re-renders only the content that selected the changed slice.
 *
 * The AbortController lifecycle lives in `useImportMachine`, which owns the orchestration.
 */
export async function runImport(file: File, signal: AbortSignal): Promise<void> {
  const uploaded = await uploadCsv(file, signal);
  if (signal.aborted) return;

  machineStore.set((prev) => ({
    ...prev,
    status: 'processing',
    activityLog: [`Uploaded ${uploaded.fileName} — ${uploaded.rowCount} rows detected`],
  }));

  const body = await openImportStream(uploaded.importId, signal);

  for await (const event of readSseEvents(body)) {
    if (signal.aborted) return;

    switch (event.type) {
      case 'mapping_plan':
        machineStore.set((prev) => ({
          ...prev,
          mappingPlan: event.plan,
          activityLog: [...prev.activityLog, 'Detected the column mapping for this file'],
        }));
        break;

      case 'progress':
        machineStore.set((prev) => ({
          ...prev,
          progress: {
            processedBatches: event.processedBatches,
            totalBatches: event.totalBatches,
            processedRows: event.processedRows,
            totalRows: event.totalRows,
          },
        }));
        break;

      case 'batch_complete':
        machineStore.set((prev) => ({
          ...prev,
          records: [...prev.records, ...event.records],
          skipped: [...prev.skipped, ...event.skipped],
          activityLog: [
            ...prev.activityLog,
            `Batch ${event.batchIndex + 1} extracted — ${event.records.length} records, ${event.skipped.length} skipped`,
          ],
        }));
        break;

      case 'done':
        // Swap to the authoritative payload: batches finish out of order, so `result.records` is
        // the correctly source-ordered version of what we accumulated live.
        machineStore.set((prev) => ({
          ...prev,
          status: 'done',
          result: event.result,
          records: event.result.records,
          skipped: event.result.skipped,
          progress: {
            processedBatches: event.result.summary.batches.total,
            totalBatches: event.result.summary.batches.total,
            processedRows: event.result.summary.totalRows,
            totalRows: event.result.summary.totalRows,
          },
        }));
        return;

      case 'error':
        machineStore.set((prev) => ({ ...prev, status: 'error', error: event.error.message }));
        return;
    }
  }
}

export { ApiError };
