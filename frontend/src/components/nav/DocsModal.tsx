'use client';

import { BookOpen } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export function DocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<BookOpen className="h-4.5 w-4.5" />}
      title="Docs"
      subtitle="How the importer works and the API behind it"
    >
      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">How it works</h3>
          <p className="mt-1 text-[var(--text-muted)]">
            Upload any lead CSV — whatever the column names or layout. Two AI phases run after you
            confirm the preview:
          </p>
          <ol className="mt-2 space-y-1.5 text-[var(--text-muted)]">
            <li>
              <span className="font-medium text-[var(--text-strong)]">1 · Mapping.</span> The whole
              file is read once to detect how its columns map to the CRM schema, the date format, and
              the default country code. You see this plan before any row is extracted.
            </li>
            <li>
              <span className="font-medium text-[var(--text-strong)]">2 · Extraction.</span> Rows are
              cleaned and validated in batches, streamed back live so the results table fills in as it
              goes. Rows without contact details are skipped with a reason.
            </li>
          </ol>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">API</h3>
          <div className="mt-2 space-y-2">
            <ApiRow
              method="POST"
              path="/api/v1/imports"
              desc="Upload and parse the file server-side. No AI runs. Returns an import id, file name, and row count. Guards: .csv only, 5 MB max."
            />
            <ApiRow
              method="POST"
              path="/api/v1/imports/:id/process"
              desc="Opens a Server-Sent Events stream. Emits mapping_plan, then progress and batch_complete as batches finish, then a final done with the source-ordered result — or error."
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">CRM schema</h3>
          <p className="mt-1 text-[var(--text-muted)]">
            Every row is mapped to 15 fields including name, email, split country code + mobile,
            company, location, lead owner, and a status. <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">crm_status</code>{' '}
            is one of four values — Good Lead, Sale Done, Not Connected, Bad Lead — or blank when
            confidence is low. Export respects selective formula-injection escaping so the CSV is safe
            to open in a spreadsheet.
          </p>
        </section>
      </div>
    </Modal>
  );
}

function ApiRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-strong)]">
          {method}
        </span>
        <code className="font-mono text-xs text-[var(--text-strong)]">{path}</code>
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">{desc}</p>
    </div>
  );
}
