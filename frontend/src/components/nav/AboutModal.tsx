'use client';

import { Code2, Globe, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

const REPO_URL = 'https://github.com/ritiklakhwani/csv-to-crm-ai-pipeline';
const PORTFOLIO_URL = 'https://oceandev.xyz/';

const STACK = ['React 19', 'TypeScript 5', 'Tailwind CSS Engine', 'React Flow Core'];

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Info className="h-4.5 w-4.5" />}
      title="About"
      subtitle="GrowEasy CSV Importer"
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Engineered for Predictable Scale.
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            This workbench was designed to bridge the gap between complex data transformation
            pipelines and clean, accessible user experiences. Built with a strict focus on visual
            predictability, high-fidelity micro-interactions, and resilient state synchronization, it
            demonstrates how frontend topology can turn heavy multi-step data manipulation into a
            deterministic, seamless flow.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-black/5 dark:border-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
          >
            <Code2 className="h-4 w-4" /> GitHub repo
          </a>
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-black/5 dark:border-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
          >
            <Globe className="h-4 w-4" /> Portfolio
          </a>
        </div>

        <div className="border-t border-zinc-200 pt-4 dark:border-white/[0.06]">
          <p className="font-mono text-[11px] tracking-tight text-zinc-500">
            {STACK.join('  •  ')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
