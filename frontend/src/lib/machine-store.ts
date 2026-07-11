'use client';

import { useSyncExternalStore } from 'react';
import type { CrmRecord, ImportResult, MappingPlan, SkippedRecord } from '@groweasy/shared';

/**
 * The hot tier of the import state (see claude-ui-plan.md). Everything that changes on an SSE tick —
 * progress, the growing records/skipped arrays, the activity log — lives here in a tiny external
 * store rather than in React state. Content that needs a slice subscribes to just that slice via
 * `useMachineSelector`, so a `batch_complete` event re-renders only the Processing/Results body that
 * read the changed slice. The canvas, edges, and the other nodes never see the tick.
 */

export type ImportStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface ImportProgress {
  processedBatches: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
}

export interface MachineState {
  status: ImportStatus;
  progress: ImportProgress | null;
  mappingPlan: MappingPlan | null;
  /** Filled live as batch_complete events arrive, so the results table renders incrementally. */
  records: CrmRecord[];
  skipped: SkippedRecord[];
  /** The authoritative, source-ordered payload; only set once the import is done. */
  result: ImportResult | null;
  error: string | null;
  activityLog: string[];
}

export const INITIAL_MACHINE_STATE: MachineState = {
  status: 'idle',
  progress: null,
  mappingPlan: null,
  records: [],
  skipped: [],
  result: null,
  error: null,
  activityLog: [],
};

type Updater = MachineState | ((prev: MachineState) => MachineState);

let current: MachineState = INITIAL_MACHINE_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * A zero-dependency external store. One import runs at a time, so a module singleton is the simplest
 * correct model; `reset` returns it to the initial slice between imports.
 */
export const machineStore = {
  get(): MachineState {
    return current;
  },
  set(updater: Updater): void {
    current = typeof updater === 'function' ? updater(current) : updater;
    emit();
  },
  reset(): void {
    current = INITIAL_MACHINE_STATE;
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Subscribe a component to one slice of the store. The selector MUST return a primitive or a
 * referentially stable value (the store updates immutably, so returning `s.records` etc. is stable);
 * returning a freshly-built object every call would defeat `useSyncExternalStore`'s bail-out.
 */
export function useMachineSelector<T>(selector: (state: MachineState) => T): T {
  return useSyncExternalStore(
    machineStore.subscribe,
    () => selector(machineStore.get()),
    () => selector(INITIAL_MACHINE_STATE),
  );
}
