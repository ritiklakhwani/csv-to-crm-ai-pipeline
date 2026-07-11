'use client';

import { Download, FileText, UploadCloud, X } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { useMachine } from '@/hooks/machine-context';
import { useToast } from '@/components/ui/Toast';
import { cn, formatBytes } from '@/lib/utils';

const MAX_BYTES = 5 * 1024 * 1024;

const SAMPLES = [
  { file: 'messy_manual_sheet.csv', label: 'Messy sheet' },
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

export function UploadNodeContent() {
  const machine = useMachine();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const problem = validate(file);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      machine.selectFile(file).catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : 'Could not read that file.';
        setError(message);
        toast.error(message);
      });
    },
    [machine, toast],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      accept(event.dataTransfer.files[0]);
    },
    [accept],
  );

  const selected = machine.file;

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      {/* The drop target fills the bulk of the tall bar so it reads as a big, inviting zone. */}
      <div className="min-h-0 flex-1">
        {selected ? (
          <div className="flex h-full flex-col justify-center gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {selected.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatBytes(selected.size)}
                  {machine.parsing ? ' · reading…' : ' · ready to preview'}
                </p>
              </div>
              <button
                onClick={() => machine.reset()}
                className="nodrag shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                aria-label="Remove file"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-center text-xs text-[var(--text-muted)]">
              Review the rows in Preview, then confirm the import.
            </p>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              'nodrag flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none',
              dragging
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600',
            )}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <UploadCloud className="h-8 w-8" />
            </div>
            <p className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Drop your CSV here
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              or click to browse — any column layout works
            </p>
            <p className="mt-3 rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-neutral-500 dark:bg-white/5 dark:text-neutral-400">
              .csv · max 5 MB
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => accept(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <X className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]">
          <Download className="h-3 w-3" /> Try a sample
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {SAMPLES.map((sample) => (
            <a
              key={sample.file}
              href={`/samples/${sample.file}`}
              download
              className="nodrag rounded-lg border border-neutral-200 px-2.5 py-1.5 text-center text-[11px] text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] dark:border-neutral-800"
            >
              {sample.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
