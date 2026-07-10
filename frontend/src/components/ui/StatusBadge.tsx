import type { CrmStatus } from '@groweasy/shared';
import { cn } from '@/lib/utils';

/**
 * Colours follow GrowEasy's real product (from their Manage Leads screen), not the build spec's
 * suggestion: Good Lead is green, Sale Done is blue, Not Connected is grey. Bad Lead is red.
 */
const STYLES: Record<CrmStatus, { label: string; className: string }> = {
  GOOD_LEAD_FOLLOW_UP: {
    label: 'Good Lead',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  SALE_DONE: {
    label: 'Sale Done',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
  DID_NOT_CONNECT: {
    label: 'Not Connected',
    className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  },
  BAD_LEAD: {
    label: 'Bad Lead',
    className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
};

export function StatusBadge({ status }: { status: string }) {
  if (status === '') return <span className="text-neutral-400 dark:text-neutral-600">—</span>;

  const style = STYLES[status as CrmStatus];
  if (!style) {
    return <span className="text-neutral-500">{status}</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}
