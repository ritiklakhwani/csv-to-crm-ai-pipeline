'use client';

import type { ImportResult, SkippedRecord } from '@groweasy/shared';
import { Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { CRM_COLUMNS } from '@/components/crm-columns';
import { Button } from '@/components/ui/Button';
import { VirtualTable, type Column } from '@/components/VirtualTable';
import { useToast } from '@/components/ui/Toast';
import { useMachine } from '@/hooks/machine-context';
import { useMachineSelector } from '@/lib/machine-store';
import { downloadCsv } from '@/lib/csv-export';
import { cn, formatMs } from '@/lib/utils';

type Tab = 'imported' | 'skipped';

const SKIPPED_COLUMNS: Column<SkippedRecord>[] = [
  { key: 'rowIndex', label: 'Row', width: 64, render: (row) => <span>{row.rowIndex}</span> },
  {
    key: 'raw',
    label: 'Raw data',
    width: 460,
    render: (row) => (
      <span className="truncate font-mono text-xs text-[var(--text-muted)]">
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
    width: 240,
    render: (row) => (
      <span className="text-sm text-amber-700 dark:text-amber-400">{row.skip_reason}</span>
    ),
  },
];

export function ResultsNodeContent() {
  const machine = useMachine();
  const result = useMachineSelector((s) => s.result);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('imported');

  if (!result) {
    return (
      <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
        Your cleaned CRM records will land here once the import finishes.
      </div>
    );
  }

  return <ResultsBody result={result} tab={tab} setTab={setTab} machineReset={machine.reset} fileName={machine.file?.name ?? 'import.csv'} toastError={toast.error} toastSuccess={toast.success} />;
}

function ResultsBody({
  result,
  tab,
  setTab,
  machineReset,
  fileName,
  toastError,
  toastSuccess,
}: {
  result: ImportResult;
  tab: Tab;
  setTab: (tab: Tab) => void;
  machineReset: () => void;
  fileName: string;
  toastError: (message: string) => void;
  toastSuccess: (message: string) => void;
}) {
  const { summary } = result;
  const exportName = fileName.replace(/\.csv$/i, '') + '_groweasy.csv';

  const handleExport = () => {
    if (result.records.length === 0) {
      toastError('There are no records to export.');
      return;
    }
    downloadCsv(result.records, exportName);
    toastSuccess(`Exported ${result.records.length} records.`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-4 gap-2 p-4">
        <Stat label="Total" value={summary.totalRows.toLocaleString()} />
        <Stat label="Imported" value={summary.imported.toLocaleString()} />
        <Stat label="Skipped" value={summary.skipped.toLocaleString()} />
        <Stat label="Time" value={formatMs(summary.processingTimeMs)} />
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <TabButton active={tab === 'imported'} onClick={() => setTab('imported')}>
            Imported ({summary.imported})
          </TabButton>
          <TabButton active={tab === 'skipped'} onClick={() => setTab('skipped')}>
            Skipped ({summary.skipped})
          </TabButton>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="nodrag" onClick={machineReset}>
            <RotateCcw className="h-4 w-4" /> Import another
          </Button>
          <Button className="nodrag" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="nowheel min-h-[220px] flex-1 border-t border-neutral-200 dark:border-neutral-800">
        {tab === 'imported' ? (
          <VirtualTable
            columns={CRM_COLUMNS}
            rows={result.records}
            getCell={(row, key) => String(row[key as keyof typeof row] ?? '')}
            fill
            emptyMessage="No records were imported."
          />
        ) : (
          <VirtualTable
            columns={SKIPPED_COLUMNS}
            rows={result.skipped}
            getCell={() => ''}
            fill
            emptyMessage="Nothing was skipped — every row had contact details."
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-800/30">
      <div className="text-[10px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        {value}
      </div>
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
        'nodrag rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
          : 'text-[var(--text-muted)] hover:text-neutral-700 dark:hover:text-neutral-200',
      )}
    >
      {children}
    </button>
  );
}
