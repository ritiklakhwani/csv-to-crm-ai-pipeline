'use client';

import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import type { ImportState } from '@/hooks/useImport';
import { CRM_COLUMNS } from '@/components/crm-columns';
import { MappingPanel } from '@/components/MappingPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { VirtualTable } from '@/components/VirtualTable';

export function ProcessingStep({
  state,
  onRetry,
  onStartOver,
}: {
  state: ImportState;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  if (state.status === 'error') {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          The import could not finish
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
          {state.error ?? 'Something went wrong.'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="secondary" onClick={onStartOver}>
            Start over
          </Button>
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        </div>
      </Card>
    );
  }

  const progress = state.progress;
  const pct =
    progress && progress.totalBatches > 0
      ? (progress.processedBatches / progress.totalBatches) * 100
      : 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            {state.status === 'uploading' ? 'Uploading and parsing…' : 'Extracting CRM records…'}
          </div>
          {progress && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
            </span>
          )}
        </div>

        <ProgressBar value={pct} className="mt-3" />

        {progress && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Batch {progress.processedBatches} of {progress.totalBatches}
          </p>
        )}

        {state.activityLog.length > 0 && (
          <p className="mt-3 truncate font-mono text-xs text-neutral-400 dark:text-neutral-500">
            {state.activityLog[state.activityLog.length - 1]}
          </p>
        )}
      </Card>

      {state.mappingPlan && <MappingPanel plan={state.mappingPlan} />}

      <Card className="overflow-hidden">
        <div className="border-b border-neutral-200 px-5 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-800 dark:text-neutral-200">
          Records so far — {state.records.length.toLocaleString()}
        </div>
        {state.records.length === 0 ? (
          <SkeletonRows rows={5} cols={6} />
        ) : (
          <VirtualTable
            columns={CRM_COLUMNS}
            rows={state.records}
            getCell={(row, key) => String(row[key as keyof typeof row] ?? '')}
          />
        )}
      </Card>
    </div>
  );
}
