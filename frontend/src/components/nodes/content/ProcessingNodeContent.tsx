'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
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

  // Once the run is complete, the whole header/bar/status block is derived purely from `status ===
  // 'done'` — a stable store value — so re-focusing the card (a click) never flips it back into the
  // "extracting" state or restarts any animation.
  const done = status === 'done';

  const pct = done
    ? 100
    : progress && progress.totalBatches > 0
      ? (progress.processedBatches / progress.totalBatches) * 100
      : 0;

  const mapped = mappingPlan
    ? mappingPlan.mappings.filter((m) => m.targetField !== 'ignore').slice(0, 6)
    : [];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-50">
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          )}
          {done
            ? 'All records extracted successfully'
            : status === 'uploading'
              ? 'Uploading and parsing…'
              : 'Extracting records…'}
        </span>
        {progress && (
          <span className="text-xs text-[var(--text-muted)]">
            {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* Complete: a static bar locked at 100% in success green (no shimmer). In progress: the live
          brand-orange batch bar. */}
      {done ? (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-500/15"
          role="progressbar"
          aria-valuenow={100}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full w-full rounded-full bg-emerald-500" />
        </div>
      ) : (
        <ProgressBar value={pct} />
      )}

      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        {done ? (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Completed — {records.length.toLocaleString()} records extracted
          </span>
        ) : progress ? (
          <span>
            Batch {progress.processedBatches} of {progress.totalBatches}
          </span>
        ) : (
          <span>Starting…</span>
        )}
        {!done && lastActivity && <span className="ml-3 truncate font-mono">{lastActivity}</span>}
      </div>

      {mapped.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          {mapped.map((mapping) => (
            <span
              key={mapping.sourceColumn}
              title={`${mapping.sourceColumn} → ${mapping.targetField}`}
              className="inline-flex w-full min-w-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <span className="truncate font-medium">{mapping.sourceColumn}</span>
              <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-60" />
              <span className="truncate font-mono">{mapping.targetField}</span>
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

        {/* Gooey "liquid" loader in the empty space at the foot of the dashboard while extraction is
            actively running — under the skeleton at first, under the streaming table after. Purely
            derived from `!done`, so it unmounts the instant the run completes. The inline SVG "goo"
            filter melts the CSS blob wave into liquid metaballs while keeping it transparent and
            brand-orange on the glass card (a blur()+contrast() filter would box it and turn it red). */}
        {!done && (
          <div className="flex w-full items-center justify-center py-8">
            <svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
              <defs>
                <filter id="fluid-goo">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                  <feColorMatrix
                    in="blur"
                    mode="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -4"
                    result="goo"
                  />
                  <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                </filter>
              </defs>
            </svg>
            <div className="data-fluid-loader" />
          </div>
        )}
      </div>
    </div>
  );
}
