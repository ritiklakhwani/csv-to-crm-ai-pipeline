'use client';

import { Code2, Globe, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

// TODO: point these at the real repository and portfolio before submitting.
const REPO_URL = 'https://github.com/ritiklakhwani/csv-to-crm-ai-pipeline';
const PORTFOLIO_URL = '#';

const TECH = [
  'Next.js (App Router)',
  'React Flow',
  'TypeScript strict',
  'Tailwind CSS',
  'TanStack Table + Virtual',
  'Server-Sent Events',
];

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Info className="h-4.5 w-4.5" />}
      title="About"
      subtitle="GrowEasy CSV Importer"
    >
      <div className="space-y-5">
        <p className="text-[var(--text-muted)]">
          A node-based importer that turns any messy lead CSV into clean, validated GrowEasy CRM
          records. Each stage of the flow — upload, preview, processing, results — is a draggable node
          on the canvas, connected by edges that light up as the work moves downstream.
        </p>

        <section>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">Built with</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TECH.map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-[var(--text-muted)] dark:border-neutral-800"
              >
                {tech}
              </span>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-black/5 dark:border-neutral-700 dark:hover:bg-white/5"
          >
            <Code2 className="h-4 w-4" /> GitHub repo
          </a>
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-black/5 dark:border-neutral-700 dark:hover:bg-white/5"
          >
            <Globe className="h-4 w-4" /> Portfolio
          </a>
        </div>
      </div>
    </Modal>
  );
}
