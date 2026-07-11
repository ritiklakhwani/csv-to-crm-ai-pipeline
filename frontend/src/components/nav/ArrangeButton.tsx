'use client';

import { LayoutGrid } from 'lucide-react';
import { useLayoutActions } from '@/components/flow/layout-actions';
import { useMediaQuery, useMounted } from '@/hooks/useMediaQuery';

/**
 * A standalone pill button that sits to the right of the navbar and snaps all four cards back to
 * their default layout. It matches the navbar's floating pill (`.navbar-3d`) with the same glass
 * hover, but is a distinct control. Only shown once free drag/resize is enabled (arrange mode, after
 * completion) and only on the canvas (desktop) — where a "reset to default" is actually useful.
 */
export function ArrangeButton() {
  const layoutActions = useLayoutActions();
  const mounted = useMounted();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Always visible on desktop so it's there whenever you want a clean slate. It only does meaningful
  // work in arrange mode (after completion); during the guided flow the cards are already home, so a
  // click is a harmless no-op.
  if (!mounted || !isDesktop) return null;

  return (
    <button
      onClick={() => layoutActions?.resetLayout()}
      className="navbar-3d nav-arrange relative flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-medium text-[var(--text-strong)]"
      aria-label="Reset the cards to the default layout"
    >
      <span className="relative z-[1] flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-[var(--accent-strong)]" />
        Arrange
      </span>
    </button>
  );
}
