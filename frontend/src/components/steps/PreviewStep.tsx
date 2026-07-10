'use client';

import { ArrowLeft, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import type { ParsedPreview } from '@/hooks/useCsvParser';
import type { CsvRow } from '@groweasy/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VirtualTable, type Column } from '@/components/VirtualTable';

const MONO_HINT = /(phone|mobile|date|time|created|number|no\.?|contact)/i;

export function PreviewStep({
  preview,
  fileName,
  onConfirm,
  onBack,
}: {
  preview: ParsedPreview;
  fileName: string;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const columns = useMemo<Column<CsvRow>[]>(
    () =>
      preview.headers.map((header) => ({
        key: header,
        label: header,
        mono: MONO_HINT.test(header),
      })),
    [preview.headers],
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Preview — {fileName}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {preview.rowCount.toLocaleString()} rows · {preview.headers.length} columns · nothing
            has been sent anywhere yet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Different file
          </Button>
          <Button onClick={onConfirm}>
            <Sparkles className="h-4 w-4" /> Confirm import
          </Button>
        </div>
      </div>

      <VirtualTable
        columns={columns}
        rows={preview.rows}
        getCell={(row, key) => row[key] ?? ''}
        emptyMessage="This file has no data rows."
      />
    </Card>
  );
}
