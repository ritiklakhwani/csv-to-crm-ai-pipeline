'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, runImport } from '@/hooks/useImport';
import { parseCsvPreview, type ParsedPreview } from '@/hooks/useCsvParser';
import { INITIAL_MACHINE_STATE, machineStore, useMachineSelector } from '@/lib/machine-store';

/**
 * The one import state machine every node reads from (see ui-reference-file.md §0). The reference
 * enum is `idle → uploaded → previewing → confirmed → processing → done (→ error)`; we collapse the
 * transient states that never differ in the UI so a node can gate on a single value:
 *
 *   idle      — only Upload is live; downstream nodes are locked.
 *   uploaded  — a file is parsed and Preview un-dims (covers "previewing" too).
 *   processing — the import is running; covers "confirmed" (which flips to processing at once).
 *   done      — Results un-dims.
 *   error     — surfaced from any state.
 */
export type Phase = 'idle' | 'uploaded' | 'processing' | 'done' | 'error';

export interface ImportMachine {
  phase: Phase;
  file: File | null;
  preview: ParsedPreview | null;
  /** True while the picked CSV is being parsed for the preview — drives the Upload perimeter loader. */
  parsing: boolean;
  selectFile: (file: File) => Promise<void>;
  confirm: () => void;
  retry: () => void;
  reset: () => void;
}

/**
 * The cold tier: file, preview, and the pre-processing phase live in React state (they change
 * rarely). Once an import starts, the store's `status` is authoritative, so `phase` is derived from
 * it — no effect syncing the two. The store's live slice (records/progress) is never read here, so
 * this hook does not re-render on SSE ticks and the node context above it stays stable.
 */
export function useImportMachine(): ImportMachine {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [localPhase, setLocalPhase] = useState<'idle' | 'uploaded'>('idle');

  const controllerRef = useRef<AbortController | null>(null);
  const status = useMachineSelector((state) => state.status);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => abort, [abort]);

  const phase: Phase =
    status === 'done'
      ? 'done'
      : status === 'error'
        ? 'error'
        : status === 'processing' || status === 'uploading'
          ? 'processing'
          : localPhase;

  const selectFile = useCallback(
    async (selected: File) => {
      // A new pick supersedes anything in flight and clears the previous run's live slice.
      abort();
      machineStore.reset();
      setLocalPhase('idle');
      setPreview(null);
      setFile(selected);
      setParsing(true);

      try {
        const parsed = await parseCsvPreview(selected);
        if (parsed.rowCount === 0) {
          setFile(null);
          throw new Error('That file has no data rows.');
        }
        setPreview(parsed);
        setLocalPhase('uploaded');
      } catch (error) {
        throw error instanceof Error && error.message === 'That file has no data rows.'
          ? error
          : new Error('Could not parse that CSV. Is it a valid file?');
      } finally {
        setParsing(false);
      }
    },
    [abort],
  );

  const confirm = useCallback(() => {
    if (!file) return;
    abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    machineStore.set({ ...INITIAL_MACHINE_STATE, status: 'uploading' });

    void runImport(file, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      machineStore.set((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof ApiError ? error.message : 'The import failed unexpectedly.',
      }));
    });
  }, [file, abort]);

  const reset = useCallback(() => {
    abort();
    machineStore.reset();
    setFile(null);
    setPreview(null);
    setParsing(false);
    setLocalPhase('idle');
  }, [abort]);

  return { phase, file, preview, parsing, selectFile, confirm, retry: confirm, reset };
}
