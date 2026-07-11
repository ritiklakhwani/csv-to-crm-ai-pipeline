'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'groweasy-theme';

function persist(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage can be unavailable (private mode); the toggle still works for the session.
  }
}

/** Flips the `.dark` class synchronously. Must run inside the View Transition callback so the
 *  snapshot the browser animates is the *new* theme, not the old one. */
function applyThemeClass(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Owns the theme and animates the switch as a circle that grows from the toggle's position (out to
 * dark) or contracts back to it (in to light), using the View Transitions API. Browsers without the
 * API, and users who ask for reduced motion, get an instant switch instead. The `.dark` class is
 * mutated synchronously inside the transition callback; the React `theme` state (which only drives
 * the icon) is updated alongside it.
 */
export function useTheme(): { theme: Theme; toggle: (event: MouseEvent) => void } {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = useCallback((event: MouseEvent) => {
    const goingDark = !document.documentElement.classList.contains('dark');
    const next: Theme = goingDark ? 'dark' : 'light';

    const apply = () => {
      // flushSync commits the class flip and the React state (the toggle icon) synchronously, so the
      // View Transition captures a snapshot of the fully-updated DOM. Without it, React commits after
      // the snapshot is taken and the live DOM differs — that mismatch is the flicker on transition
      // end. All theme-driven colours (canvas dots, edges) are CSS-variable driven, so they flip with
      // the class here too and nothing re-renders asynchronously afterwards.
      flushSync(() => {
        applyThemeClass(next);
        persist(next);
        setTheme(next);
      });
    };

    if (!document.startViewTransition || prefersReducedMotion()) {
      apply();
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const root = document.documentElement;
    // The growing-circle reveal plays when switching TO light (the new light theme grows in on top);
    // switching TO dark plays the reverse (the old light theme shrinks out on top, revealing dark
    // beneath). The `vt-contract` flag flips the CSS z-index so the shrinking layer stays on top and
    // the reveal is actually visible.
    const expanding = !goingDark;
    root.classList.toggle('vt-contract', !expanding);

    const transition = document.startViewTransition(apply);
    void transition.ready.then(() => {
      const grow = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];
      root.animate(
        { clipPath: expanding ? grow : [...grow].reverse() },
        {
          duration: 500,
          easing: 'ease-in-out',
          // `forwards` holds the final clip until the snapshot is removed. Without it the clip reverts
          // to its base (unclipped) for one frame at the end, flashing the full old layer — visible on
          // the contract (light→dark) direction, where the final state (circle 0) differs from base.
          fill: 'forwards',
          pseudoElement: expanding
            ? '::view-transition-new(root)'
            : '::view-transition-old(root)',
        },
      );
    });
  }, []);

  return { theme, toggle };
}

/**
 * Reactively reports whether the `.dark` class is present, by observing the class attribute on
 * <html>. The clip-path toggle mutates that class directly (outside React), so consumers that need
 * to follow the theme — e.g. the canvas dot colour, which can't use a CSS variable in an SVG fill —
 * subscribe here rather than to a local `useTheme` copy that never hears about the change.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
