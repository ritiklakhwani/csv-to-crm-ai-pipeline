import type { ReactNode } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { PerimeterLoader } from '@/components/nodes/PerimeterLoader';
import { cn } from '@/lib/utils';

export type PillTone = 'idle' | 'active' | 'working' | 'done' | 'error';

const PILL_TONES: Record<PillTone, string> = {
  idle: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  active: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  working: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  error: 'bg-red-500/15 text-red-600 dark:text-red-300',
};

export interface NodeShellProps {
  title: string;
  icon: ReactNode;
  status: { label: string; tone: PillTone };
  locked?: boolean;
  active?: boolean;
  loading?: boolean;
  /** A completed card the user can click to re-open it — gets a pointer cursor + hover cue. */
  clickable?: boolean;
  /** Fill the parent (the React Flow node wrapper, which is sized by node.width/height). Off on the
   *  mobile stack, where the card takes its natural height in the scroll column. */
  fill?: boolean;
  /** Whether the header is a React Flow drag handle. Off on the mobile stack. */
  draggable?: boolean;
  children: ReactNode;
}

/**
 * The themed card frame shared by every node, on the canvas and in the mobile stack. The header is
 * the only drag handle (`.node-drag-handle`), so the body — tables, buttons, the dropzone — stays
 * interactive. Locked nodes dim and stop receiving pointer events; the active node gets an accent
 * ring; a working node shows the perimeter loader.
 */
export function NodeShell({
  title,
  icon,
  status,
  locked = false,
  active = false,
  loading = false,
  clickable = false,
  fill = false,
  draggable = false,
  children,
}: NodeShellProps) {
  return (
    <div
      className={cn('node-shell flex flex-col overflow-hidden', fill && 'h-full w-full')}
      data-active={active ? 'true' : 'false'}
      data-clickable={clickable ? 'true' : 'false'}
    >
      <PerimeterLoader active={loading} />

      <header
        className={cn(
          'flex items-center gap-2.5 border-b px-4 py-3',
          draggable && 'node-drag-handle cursor-grab active:cursor-grabbing',
        )}
        style={{ borderColor: 'var(--node-border)', background: 'var(--node-header)' }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          {icon}
        </span>
        <h2 className="flex-1 text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset ring-black/5 dark:ring-white/10',
            locked ? 'bg-black/5 text-[var(--text-muted)] dark:bg-white/5' : PILL_TONES[status.tone],
          )}
        >
          {locked && <Lock className="h-3 w-3" />}
          {locked ? 'Locked' : status.label}
        </span>
        {draggable && (
          <GripVertical className="h-4 w-4 text-[var(--text-muted)] opacity-40" aria-hidden />
        )}
      </header>

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          locked && 'pointer-events-none select-none opacity-45 grayscale-[0.25]',
        )}
        aria-hidden={locked}
      >
        {children}
      </div>
    </div>
  );
}
