'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-white dark:bg-white dark:text-neutral-900">
          G
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">GrowEasy</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">CSV Importer</p>
        </div>
      </div>

      <button
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </header>
  );
}
