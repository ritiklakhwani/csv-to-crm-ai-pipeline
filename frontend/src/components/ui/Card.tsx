import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-neutral-200 bg-white shadow-sm',
        'dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {value}
      </div>
    </Card>
  );
}
