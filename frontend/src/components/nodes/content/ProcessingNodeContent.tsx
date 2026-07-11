'use client';

import { AlertTriangle, ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { CRM_COLUMNS } from '@/components/crm-columns';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { VirtualTable } from '@/components/VirtualTable';
import { useMachine } from '@/hooks/machine-context';
import { useMachineSelector } from '@/lib/machine-store';

export function ProcessingNodeContent() {
  const machine = useMachine();
  const status = useMachineSelector((s) => s.status);
  const progress = useMachineSelector((s) => s.progress);
  const mappingPlan = useMachineSelector((s) => s.mappingPlan);
  const records = useMachineSelector((s) => s.records);
  const lastActivity = useMachineSelector((s) =>
    s.activityLog.length > 0 ? s.activityLog[s.activityLog.length - 1] : null,
  );
  const error = useMachineSelector((s) => s.error);

  if (status === 'error') {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          The import could not finish
        </p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-[var(--text-muted)]">
          {error ?? 'Something went wrong.'}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="secondary" className="nodrag" onClick={() => machine.reset()}>
            Start over
          </Button>
          <Button className="nodrag" onClick={() => machine.retry()}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="flex h-32 items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
        Confirm the preview to start extracting CRM records.
      </div>
    );
  }

  const pct =
    progress && progress.totalBatches > 0
      ? (progress.processedBatches / progress.totalBatches) * 100
      : 0;

  const mapped = mappingPlan
    ? mappingPlan.mappings.filter((m) => m.targetField !== 'ignore').slice(0, 6)
    : [];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-50">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          {status === 'uploading' ? 'Uploading and parsing…' : 'Extracting records…'}
        </span>
        {progress && (
          <span className="text-xs text-[var(--text-muted)]">
            {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
          </span>
        )}
      </div>

      <ProgressBar value={pct} />

      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        {progress ? (
          <span>
            Batch {progress.processedBatches} of {progress.totalBatches}
          </span>
        ) : (
          <span>Starting…</span>
        )}
        {lastActivity && <span className="ml-3 truncate font-mono">{lastActivity}</span>}
      </div>

      {mapped.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          {mapped.map((mapping) => (
            <span
              key={mapping.sourceColumn}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <span className="font-medium">{mapping.sourceColumn}</span>
              <ArrowRight className="h-2.5 w-2.5 opacity-60" />
              <span className="font-mono">{mapping.targetField}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 dark:border-neutral-800 dark:text-neutral-200">
          Records so far — {records.length.toLocaleString()}
        </div>
        {records.length === 0 ? (
          <SkeletonRows rows={3} cols={5} />
        ) : (
          <div className="nowheel min-h-[160px] flex-1">
            <VirtualTable
              columns={CRM_COLUMNS}
              rows={records}
              getCell={(row, key) => String(row[key as keyof typeof row] ?? '')}
              fill
            />
          </div>
        )}
      </div>
    </div>
  );
}
