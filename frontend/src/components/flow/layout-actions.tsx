'use client';

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';

/**
 * A tiny bridge so the standalone "Arrange" button (which lives outside React Flow's provider, next
 * to the navbar) can trigger a node-layout reset that only the canvas knows how to perform. The
 * canvas registers its reset function; the button calls `resetLayout`. No canvas mounted (mobile) →
 * no-op.
 */
type ResetFn = () => void;

interface LayoutActions {
  registerReset: (fn: ResetFn | null) => void;
  resetLayout: () => void;
}

const LayoutActionsContext = createContext<LayoutActions | null>(null);

export function LayoutActionsProvider({ children }: { children: ReactNode }) {
  const resetRef = useRef<ResetFn | null>(null);
  const registerReset = useCallback((fn: ResetFn | null) => {
    resetRef.current = fn;
  }, []);
  const resetLayout = useCallback(() => resetRef.current?.(), []);
  return (
    <LayoutActionsContext.Provider value={{ registerReset, resetLayout }}>
      {children}
    </LayoutActionsContext.Provider>
  );
}

export function useLayoutActions(): LayoutActions | null {
  return useContext(LayoutActionsContext);
}
