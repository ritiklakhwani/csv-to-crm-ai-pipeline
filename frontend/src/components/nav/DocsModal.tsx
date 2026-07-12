'use client';

import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export function DocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<BookOpen className="h-4.5 w-4.5" />}
      title="Docs"
      subtitle="How the extraction pipeline works"
    >
      <div className="space-y-6">
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          Upload any lead CSV — a Facebook or Google Ads export, a real-estate CRM dump, a hand-made
          sheet. The preview parses in the browser; the moment you confirm, the file is handed to a
          server-side, two-phase AI pipeline whose output is re-validated in code before a single
          record is trusted.
        </p>

        <DocSection index="01" title="Two-phase extraction">
          <p className="mb-2">
            <Label>Phase 1 — Schema inference.</Label> One cheap model call reads the header plus a
            representative sample and returns a typed mapping plan: each source column resolved to a
            CRM field with a confidence score, plus the detected date format and default country code.
            That plan is injected into every extraction batch as global context.
          </p>
          <p>
            <Label>Phase 2 — Batched extraction.</Label> Rows are chunked (<Token>25</Token>/batch),
            run <Token>4</Token> at a time under a concurrency limit at temperature <Token>0</Token>,
            each batch carrying the Phase-1 plan and few-shot examples. Decoding is constrained by a
            schema, so the model physically cannot emit a value outside the CRM shape or the{' '}
            <Token>crm_status</Token> / <Token>data_source</Token> whitelists.
          </p>
        </DocSection>

        <DocSection index="02" title="The model is never trusted">
          Constrained decoding guarantees a <em className="not-italic text-zinc-500">structurally</em>{' '}
          valid record; it cannot guarantee a truthful one. So every record is re-validated
          server-side: extracted emails and phone numbers must actually appear in the source row —
          invented values are moved to <Token>crm_note</Token>, never kept; <Token>created_at</Token>{' '}
          must survive <Token>new Date()</Token>; enums are re-checked against the whitelist; the first
          email/mobile wins with the rest appended to the note; and a row with neither email nor phone
          is skipped with a reason rather than silently dropped.
        </DocSection>

        <DocSection index="03" title="Resilience">
          Per-batch retry with exponential backoff — a malformed response is re-prompted with the exact
          parse error. A response that overflows the token budget first asks for more room, then
          recursively halves the batch. Row-count reconciliation re-extracts any rows the model quietly
          omitted. A batch that still fails after <Token>3</Token> attempts turns its rows into skipped
          records: one poisoned batch can never fail the whole import.
        </DocSection>

        <DocSection index="04" title="Cost & providers">
          The pipeline talks to a vendor-agnostic <Token>LlmProvider</Token> interface — an OpenAI
          adapter ships, and adding another is one file. The static system prompt is a cacheable
          prefix, so the first batch is dispatched alone to warm the cache before the rest fan out.
          Columns proven empty in every row are pruned deterministically (never on the model&apos;s
          opinion), and batch size and concurrency are env-tunable.
        </DocSection>

        <section className="border-t border-zinc-200 pt-4 dark:border-white/[0.06]">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">05</span>
            <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              API
            </h3>
          </div>
          <div className="mt-2.5 space-y-2">
            <ApiRow
              method="POST"
              path="/api/v1/imports"
              desc="Multipart upload. Validates .csv, 5 MB cap, non-empty, then parses server-side. No AI runs — returns an import id, header list, and row count."
            />
            <ApiRow
              method="POST"
              path="/api/v1/imports/:id/process"
              desc="Opens a Server-Sent Events stream: mapping_plan, then progress and batch_complete as batches land, then a final done — or error. Disconnecting aborts the run so a closed tab stops spending tokens."
            />
          </div>
        </section>
      </div>
    </Modal>
  );
}

function DocSection({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-zinc-200 pt-4 first:border-t-0 first:pt-0 dark:border-white/[0.06]">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{index}</span>
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
      </div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

/** Bold in-line lead for a labelled clause (e.g. a pipeline phase). */
function Label({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-zinc-800 dark:text-zinc-200">{children}</span>;
}

/** Inline mono chip for a schema field, value, or symbol. */
function Token({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
      {children}
    </code>
  );
}

function ApiRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-white/[0.06]">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-strong)]">
          {method}
        </span>
        <code className="font-mono text-xs text-zinc-800 dark:text-zinc-200">{path}</code>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{desc}</p>
    </div>
  );
}
