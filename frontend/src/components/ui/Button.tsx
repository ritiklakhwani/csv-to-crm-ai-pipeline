import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // The warm orange primary CTA is GrowEasy's own; the rest stay neutral.
  primary:
    'bg-orange-500 text-white hover:bg-orange-600 disabled:bg-orange-300 dark:disabled:bg-orange-500/40',
  secondary:
    'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
  ghost: 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
