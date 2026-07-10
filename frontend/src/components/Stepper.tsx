import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Step = 'upload' | 'preview' | 'processing' | 'results';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Preview' },
  { key: 'processing', label: 'Processing' },
  { key: 'results', label: 'Results' },
];

export function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-4">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step.key} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  active && 'bg-orange-500 text-white',
                  done && 'bg-emerald-500 text-white',
                  !active &&
                    !done &&
                    'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden text-sm font-medium sm:inline',
                  active
                    ? 'text-neutral-900 dark:text-neutral-50'
                    : 'text-neutral-500 dark:text-neutral-400',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={cn(
                  'h-px w-6 sm:w-10',
                  index < currentIndex ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
