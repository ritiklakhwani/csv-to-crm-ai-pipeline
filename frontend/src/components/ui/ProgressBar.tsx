import { cn } from '@/lib/utils';

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800',
        className,
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-orange-500 transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
