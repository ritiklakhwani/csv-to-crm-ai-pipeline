'use client';

import { ArrowLeft, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import type { CsvRow } from '@groweasy/shared';
import { useMachine } from '@/hooks/machine-context';
import { Button } from '@/components/ui/Button';
import { VirtualTable, type Column } from '@/components/VirtualTable';

const MONO_HINT = /(phone|mobile|date|time|created|number|no\.?|contact)/i;

export function PreviewNodeContent() {
  const machine = useMachine();
  const preview = machine.preview;

  const columns = useMemo<Column<CsvRow>[]>(
    () =>
      (preview?.headers ?? []).map((header) => ({
        key: header,
        label: header,
        mono: MONO_HINT.test(header),
      })),
    [preview?.headers],
  );

  if (!preview) {
    return (
      <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
        Upload a file to preview its rows here — nothing is sent anywhere yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <p className="text-xs text-[var(--text-muted)]">
          {preview.rowCount.toLocaleString()} rows · {preview.headers.length} columns · no AI yet
        </p>
      </div>

      <div className="nowheel min-h-[220px] flex-1">
        <VirtualTable
          columns={columns}
          rows={preview.rows}
          getCell={(row, key) => row[key] ?? ''}
          fill
          emptyMessage="This file has no data rows."
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Button variant="secondary" className="nodrag" onClick={() => machine.reset()}>
          <ArrowLeft className="h-4 w-4" /> Different file
        </Button>
        <Button className="nodrag" onClick={() => machine.confirm()}>
          <Sparkles className="h-4 w-4" /> Confirm import
        </Button>
      </div>
    </div>
  );
}
