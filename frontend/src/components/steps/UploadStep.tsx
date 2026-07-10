'use client';

import { Download, FileText, UploadCloud, X } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn, formatBytes } from '@/lib/utils';

const MAX_BYTES = 5 * 1024 * 1024;

const SAMPLES = [
  { file: 'messy_manual_sheet.csv', label: 'Messy manual sheet' },
  { file: 'real_estate_crm.csv', label: 'Real-estate CRM' },
  { file: 'facebook_leads_export.csv', label: 'Facebook leads' },
  { file: 'google_ads_export.csv', label: 'Google Ads' },
];

function validate(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Please choose a .csv file.';
  if (file.size > MAX_BYTES) return `That file is ${formatBytes(file.size)}. The limit is 5 MB.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

export function UploadStep({ onFileSelected }: { onFileSelected: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((file: File | undefined) => {
    if (!file) return;
    const problem = validate(file);
    if (problem) {
      setError(problem);
      setSelected(null);
      return;
    }
    setError(null);
    setSelected(file);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      accept(event.dataTransfer.files[0]);
    },
    [accept],
  );

  return (
    <Card className="p-6 sm:p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors',
          dragging
            ? 'border-orange-400 bg-orange-50 dark:bg-orange-500/10'
            : 'border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600',
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Drop your CSV file here
        </p>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          or click to browse — any column layout works
        </p>
        <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
          Supported: .csv, max 5 MB
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <X className="h-4 w-4" /> {error}
        </p>
      )}

      {selected && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {selected.name}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {formatBytes(selected.size)}
            </p>
          </div>
          <button
            onClick={() => setSelected(null)}
            className="text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
            aria-label="Remove file"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <Download className="h-3.5 w-3.5" /> Try a sample:
          </span>
          {SAMPLES.map((sample) => (
            <a
              key={sample.file}
              href={`/samples/${sample.file}`}
              download
              className="text-orange-600 hover:underline dark:text-orange-400"
            >
              {sample.label}
            </a>
          ))}
        </div>
        <Button disabled={!selected} onClick={() => selected && onFileSelected(selected)}>
          Preview file
        </Button>
      </div>
    </Card>
  );
}
