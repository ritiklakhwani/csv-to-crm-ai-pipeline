'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { NodeKind } from '@/components/flow/graph';

/**
 * Which node is currently spotlighted, and which nodes the user may click to spotlight. Provided by
 * the canvas (FlowCanvas) so the React-Flow-rendered nodes can read it. The mobile stack renders the
 * same cards without this provider, so `useFocusContext` returns null there and callers fall back to
 * the automatic, flow-state-driven focus.
 */
export interface FocusValue {
  focus: NodeKind;
  /** True for a node the user can click to re-open (it has data / has been reached). */
  canFocus: (kind: NodeKind) => boolean;
  /** Free-arrange mode — active after the flow completes. Cards show full content and are freely
   *  movable/resizable; the guided spotlight is released. */
  arrangeMode: boolean;
  /** Called by a card's NodeResizer while it is being resized, so the canvas can resolve collisions
   *  and re-anchor edges. No-op outside arrange mode. */
  onCardResize: (kind: NodeKind) => void;
}

const FocusContext = createContext<FocusValue | null>(null);

export function FocusProvider({ value, children }: { value: FocusValue; children: ReactNode }) {
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocusContext(): FocusValue | null {
  return useContext(FocusContext);
}
