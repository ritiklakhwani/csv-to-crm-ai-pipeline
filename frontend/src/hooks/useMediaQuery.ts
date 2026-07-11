'use client';

import { useEffect, useState } from 'react';

/**
 * Reports whether a media query currently matches. It returns `false` on the server and on the first
 * client render, then updates in an effect — so SSR markup and the hydration pass agree, and the
 * real value lands right after mount. The page pairs this with a mount gate before it decides
 * between the canvas and the stacked layout, so the switch never causes a hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True once the component has mounted on the client. Gates layout that must not run during SSR. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
