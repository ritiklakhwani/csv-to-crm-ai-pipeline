'use client';

import type { CrmRecord, ImportResult, MappingPlan, SkippedRecord } from '@groweasy/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, openImportStream, uploadCsv } from '@/lib/api';
import { readSseEvents } from '@/lib/sse';

export type ImportStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface ImportProgress {
  processedBatches: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
}

export interface ImportState {
  status: ImportStatus;
  progress: ImportProgress | null;
  mappingPlan: MappingPlan | null;
  /** Filled live as batch_complete events arrive, so the results table can render incrementally. */
  records: CrmRecord[];
  skipped: SkippedRecord[];
  /** The authoritative, source-ordered payload; only set once the import is done. */
  result: ImportResult | null;
  error: string | null;
  activityLog: string[];
}

const INITIAL: ImportState = {
  status: 'idle',
  progress: null,
  mappingPlan: null,
  records: [],
  skipped: [],
  result: null,
  error: null,
  activityLog: [],
};

export interface UseImport {
  state: ImportState;
  start: (file: File) => void;
  reset: () => void;
}

/**
 * Drives one import end to end: upload the file, open the SSE stream, and fold the events into
 * render state. The stream is aborted on reset and on unmount so a closed tab or a "start over"
 * click stops the backend burning tokens.
 */
export function useImport(): UseImport {
  const [state, setState] = useState<ImportState>(INITIAL);
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abort();
    setState(INITIAL);
  }, [abort]);

  useEffect(() => abort, [abort]);

  const start = useCallback(
    (file: File) => {
      abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setState({ ...INITIAL, status: 'uploading' });

      void run(file, controller.signal, setState).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: error instanceof ApiError ? error.message : 'The import failed unexpectedly.',
        }));
      });
    },
    [abort],
  );

  return { state, start, reset };
}

async function run(
  file: File,
  signal: AbortSignal,
  setState: React.Dispatch<React.SetStateAction<ImportState>>,
): Promise<void> {
  const uploaded = await uploadCsv(file, signal);
  if (signal.aborted) return;

  setState((prev) => ({
    ...prev,
    status: 'processing',
    activityLog: [`Uploaded ${uploaded.fileName} — ${uploaded.rowCount} rows detected`],
  }));

  const body = await openImportStream(uploaded.importId, signal);

  for await (const event of readSseEvents(body)) {
    if (signal.aborted) return;

    switch (event.type) {
      case 'mapping_plan':
        setState((prev) => ({
          ...prev,
          mappingPlan: event.plan,
          activityLog: [...prev.activityLog, 'Detected the column mapping for this file'],
        }));
        break;

      case 'progress':
        setState((prev) => ({
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
        setState((prev) => ({
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
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: 'error', error: event.error.message }));
        return;
    }
  }
}
