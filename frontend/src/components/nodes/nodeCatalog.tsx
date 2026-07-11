'use client';

import { memo, type ReactNode } from 'react';
import { CheckCircle2, Cpu, Table2, UploadCloud } from 'lucide-react';
import { NodeShell, type PillTone } from '@/components/nodes/NodeShell';
import { UploadNodeContent } from '@/components/nodes/content/UploadNodeContent';
import { PreviewNodeContent } from '@/components/nodes/content/PreviewNodeContent';
import { ProcessingNodeContent } from '@/components/nodes/content/ProcessingNodeContent';
import { ResultsNodeContent } from '@/components/nodes/content/ResultsNodeContent';
import { focusedKind, type NodeKind } from '@/components/flow/graph';
import { useFocusContext } from '@/components/flow/focus-context';
import { useMachine } from '@/hooks/machine-context';
import { useMachineSelector } from '@/lib/machine-store';
import type { Phase } from '@/hooks/useImportMachine';

interface NodeMeta {
  title: string;
  icon: ReactNode;
}

export const NODE_META: Record<NodeKind, NodeMeta> = {
  upload: { title: 'Upload', icon: <UploadCloud className="h-4 w-4" /> },
  preview: { title: 'Preview', icon: <Table2 className="h-4 w-4" /> },
  processing: { title: 'Processing', icon: <Cpu className="h-4 w-4" /> },
  results: { title: 'Results', icon: <CheckCircle2 className="h-4 w-4" /> },
};

interface NodeUi {
  locked: boolean;
  loading: boolean;
  pill: { label: string; tone: PillTone };
}

/** Translates the single import phase into each node's lock / loader / pill. */
function deriveNodeUi(kind: NodeKind, phase: Phase, parsing: boolean): NodeUi {
  switch (kind) {
    case 'upload':
      return {
        locked: false,
        loading: parsing,
        pill:
          phase === 'idle'
            ? { label: 'Start here', tone: 'active' }
            : { label: 'File ready', tone: 'done' },
      };
    case 'preview':
      return {
        locked: phase === 'idle',
        loading: false,
        pill:
          phase === 'uploaded'
            ? { label: 'Review', tone: 'active' }
            : { label: 'Confirmed', tone: 'done' },
      };
    case 'processing':
      return {
        locked: phase === 'idle' || phase === 'uploaded',
        loading: phase === 'processing',
        pill:
          phase === 'error'
            ? { label: 'Failed', tone: 'error' }
            : phase === 'done'
              ? { label: 'Complete', tone: 'done' }
              : { label: 'Working', tone: 'working' },
      };
    case 'results':
      return {
        locked: phase !== 'done',
        loading: false,
        pill: { label: 'Complete', tone: 'done' },
      };
  }
}

function NodeContent({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case 'upload':
      return <UploadNodeContent />;
    case 'preview':
      return <PreviewNodeContent />;
    case 'processing':
      return <ProcessingNodeContent />;
    case 'results':
      return <ResultsNodeContent />;
  }
}

// --- Compact summaries: one status line each. Split per kind so a card only subscribes to the store
// slice it needs (the Processing/Results counts) and doesn't re-render on every SSE tick. ---

function CompactLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center px-5 py-4">
      <p className="truncate text-sm text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

function UploadCompact() {
  const machine = useMachine();
  return (
    <CompactLine>
      {machine.file
        ? `${machine.file.name}${machine.preview ? ` · ${machine.preview.rowCount.toLocaleString()} rows` : ''}`
        : 'Ready to upload'}
    </CompactLine>
  );
}

function PreviewCompact() {
  const machine = useMachine();
  return (
    <CompactLine>
      {machine.preview
        ? `${machine.preview.rowCount.toLocaleString()} rows · ${machine.preview.headers.length} columns`
        : 'Waiting for a file'}
    </CompactLine>
  );
}

function ProcessingCompact() {
  const machine = useMachine();
  const records = useMachineSelector((s) => s.records.length);
  return (
    <CompactLine>
      {machine.phase === 'done'
        ? `Extracted ${records.toLocaleString()} records`
        : machine.phase === 'error'
          ? 'Import failed'
          : 'Waiting to process'}
    </CompactLine>
  );
}

function ResultsCompact() {
  const result = useMachineSelector((s) => s.result);
  return (
    <CompactLine>
      {result
        ? `Imported ${result.summary.imported.toLocaleString()} · Skipped ${result.summary.skipped.toLocaleString()}`
        : 'Waiting for results'}
    </CompactLine>
  );
}

function CompactContent({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case 'upload':
      return <UploadCompact />;
    case 'preview':
      return <PreviewCompact />;
    case 'processing':
      return <ProcessingCompact />;
    case 'results':
      return <ResultsCompact />;
  }
}

/**
 * The card body — memoized on (kind, focused) only, so the per-frame size tween (which re-renders the
 * shell every animation frame) never re-renders the heavy content. The content swaps immediately on
 * focus change and crossfades in, while the shell animates size around it.
 */
const NodeBody = memo(function NodeBody({ kind, focused }: { kind: NodeKind; focused: boolean }) {
  return (
    <div key={focused ? 'full' : 'compact'} className="node-content-fade h-full">
      {focused ? <NodeContent kind={kind} /> : <CompactContent kind={kind} />}
    </div>
  );
});

/**
 * The reusable node card. Exactly one node is focused per flow state: the focused card is large and
 * renders full content (its table); the rest are compact and render a one-line summary. The heavy
 * content only mounts when focused. On the canvas the size is passed in (FlowCanvas tweens it and the
 * derived position together so the anchor corner stays put); the mobile stack passes no size, so
 * "focus" just means the active card is tall (full content) and the rest short.
 */
export function FlowNodeCard({ kind, draggable = false }: { kind: NodeKind; draggable?: boolean }) {
  const machine = useMachine();
  const meta = NODE_META[kind];
  const ui = deriveNodeUi(kind, machine.phase, machine.parsing);

  // On the canvas the focus (and which cards are clickable to re-open) comes from context; the mobile
  // stack has no provider, so fall back to the automatic, flow-state-driven focus with no clicking.
  const focusCtx = useFocusContext();
  const focus = focusCtx?.focus ?? focusedKind(machine.phase);
  const focused = focus === kind;
  // Content is always spotlight-driven: the focused card shows full content, the rest a one-line
  // summary. Any non-focused card the user can open (has data / been reached) is clickable to
  // spotlight it — during the guided flow and in arrange mode alike.
  const clickable = !focused && (focusCtx?.canFocus(kind) ?? false);

  return (
    <NodeShell
      title={meta.title}
      icon={meta.icon}
      status={ui.pill}
      locked={ui.locked}
      active={focused}
      loading={ui.loading}
      clickable={clickable}
      fill={draggable}
      draggable={draggable}
    >
      <NodeBody kind={kind} focused={focused} />
    </NodeShell>
  );
}
