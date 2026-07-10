'use client';

import type { ImportResult } from '@groweasy/shared';
import { Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { CRM_COLUMNS } from '@/components/crm-columns';
import { MappingPanel } from '@/components/MappingPanel';
import { Button } from '@/components/ui/Button';
import { Card, StatCard } from '@/components/ui/Card';
import { VirtualTable, type Column } from '@/components/VirtualTable';
import { useToast } from '@/components/ui/Toast';
import { downloadCsv } from '@/lib/csv-export';
import { cn, formatMs } from '@/lib/utils';
import type { SkippedRecord } from '@groweasy/shared';

type Tab = 'imported' | 'skipped';

const SKIPPED_COLUMNS: Column<SkippedRecord>[] = [
  { key: 'rowIndex', label: 'Row', width: 70, render: (row) => <span>{row.rowIndex}</span> },
  {
    key: 'raw',
    label: 'Raw data',
    width: 520,
    render: (row) => (
      <span className="truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">
        {Object.entries(row.raw)
          .filter(([, value]) => value)
          .map(([key, value]) => `${key}: ${value}`)
          .join('  ·  ')}
      </span>
    ),
  },
  {
    key: 'skip_reason',
    label: 'Reason',
    width: 260,
    render: (row) => (
      <span className="text-sm text-amber-700 dark:text-amber-400">{row.skip_reason}</span>
    ),
  },
];

export function ResultsStep({
  result,
  fileName,
  onStartOver,
}: {
  result: ImportResult;
  fileName: string;
  onStartOver: () => void;
}) {
  const [tab, setTab] = useState<Tab>('imported');
  const toast = useToast();
  const { summary } = result;

  const exportName = fileName.replace(/\.csv$/i, '') + '_groweasy.csv';

  const handleExport = () => {
    if (result.records.length === 0) {
      toast.error('There are no records to export.');
      return;
    }
    downloadCsv(result.records, exportName);
    toast.success(`Exported ${result.records.length} records.`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Rows" value={summary.totalRows.toLocaleString()} />
        <StatCard label="Imported" value={summary.imported.toLocaleString()} />
        <StatCard label="Skipped" value={summary.skipped.toLocaleString()} />
        <StatCard label="Time Taken" value={formatMs(summary.processingTimeMs)} />
      </div>

      <MappingPanel plan={result.mappingPlan} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
            <TabButton active={tab === 'imported'} onClick={() => setTab('imported')}>
              Imported ({summary.imported})
            </TabButton>
            <TabButton active={tab === 'skipped'} onClick={() => setTab('skipped')}>
              Skipped ({summary.skipped})
            </TabButton>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onStartOver}>
              <RotateCcw className="h-4 w-4" /> Import another
            </Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        {tab === 'imported' ? (
          <VirtualTable
            columns={CRM_COLUMNS}
            rows={result.records}
            getCell={(row, key) => String(row[key as keyof typeof row] ?? '')}
            emptyMessage="No records were imported."
          />
        ) : (
          <VirtualTable
            columns={SKIPPED_COLUMNS}
            rows={result.skipped}
            getCell={() => ''}
            emptyMessage="Nothing was skipped — every row had contact details."
          />
        )}
      </Card>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
      )}
    >
      {children}
    </button>
  );
}
