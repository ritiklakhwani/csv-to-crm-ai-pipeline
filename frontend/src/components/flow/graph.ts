import { MarkerType, type Edge, type Node, type XYPosition } from '@xyflow/react';
import type { Phase } from '@/hooks/useImportMachine';

export type NodeKind = 'upload' | 'preview' | 'processing' | 'results';

export const NODE_ORDER: NodeKind[] = ['upload', 'preview', 'processing', 'results'];

export interface Size {
  width: number;
  height: number;
}

/** The corner pinned to the node's anchor. Each node anchors the corner nearest the workspace edge
 *  so it grows inward toward the open centre, never off the frame. */
type Corner = 'top-left' | 'top-center' | 'top-right' | 'bottom-right';

interface NodeLayout {
  /** A fixed point the anchored corner always sits on — constant across every focus state. */
  anchor: XYPosition;
  corner: Corner;
  focused: Size;
  compact: Size;
}

const COMPACT: Size = { width: 340, height: 200 };

/** How far Preview slides left to open a clear gap when the right column (Processing/Results,
 *  which grow inward toward centre) is focused. */
const PREVIEW_SHIFT = 170;

/**
 * The spotlight layout. Exactly one node is focused (large, full content) at a time; the other three
 * are compact summary cards. Each node keeps a permanent anchor corner and its React Flow position is
 * *derived* from that anchor + its current size, so growing/shrinking happens in place — the node
 * never drifts or re-clusters. Anchors + sizes are tuned so every focus state keeps a ~100px gap
 * between the focused node and its neighbours, with no overlap anywhere (Upload left · Preview
 * centre · Processing top-right · Results bottom-right).
 */
export const NODE_LAYOUT: Record<NodeKind, NodeLayout> = {
  upload: {
    anchor: { x: 50, y: 260 },
    corner: 'top-left',
    focused: { width: 340, height: 720 },
    compact: COMPACT,
  },
  preview: {
    anchor: { x: 820, y: 520 },
    corner: 'top-center',
    // Bottom aligned with Upload's; both centred so the composition stays balanced.
    focused: { width: 660, height: 460 },
    compact: COMPACT,
  },
  // Processing and Results hold the most data, so their focused cards are the largest — wide enough
  // for more columns and tall enough for many rows. They sit far apart when compact because each,
  // when focused and tall, must clear the other's compact card by ~90px.
  processing: {
    anchor: { x: 1770, y: 155 },
    corner: 'top-right',
    focused: { width: 840, height: 620 },
    compact: COMPACT,
  },
  results: {
    anchor: { x: 1770, y: 1085 },
    corner: 'bottom-right',
    focused: { width: 860, height: 640 },
    compact: COMPACT,
  },
};

/** Which node is focused (large) for a given flow state; the other three go compact. */
export function focusedKind(phase: Phase): NodeKind {
  if (phase === 'idle') return 'upload';
  if (phase === 'uploaded') return 'preview';
  if (phase === 'done') return 'results';
  return 'processing'; // processing + error both spotlight the Processing node
}

export function sizeFor(kind: NodeKind, focused: NodeKind): Size {
  return focused === kind ? NODE_LAYOUT[kind].focused : NODE_LAYOUT[kind].compact;
}

/** The anchor point for `kind`, accounting for Preview's leftward slide when the right column
 *  (Processing/Results) is the focused node — that's what opens the make-room gap. */
function anchorFor(kind: NodeKind, focused: NodeKind): XYPosition {
  const { anchor } = NODE_LAYOUT[kind];
  if (kind === 'preview' && (focused === 'processing' || focused === 'results')) {
    return { x: anchor.x - PREVIEW_SHIFT, y: anchor.y };
  }
  return anchor;
}

/** The React Flow top-left position that keeps `kind`'s anchor corner fixed at its current size,
 *  given which node is currently focused (so Preview can slide to make room). */
export function derivePosition(kind: NodeKind, size: Size, focused: NodeKind): XYPosition {
  const anchor = anchorFor(kind, focused);
  switch (NODE_LAYOUT[kind].corner) {
    case 'top-left':
      return { x: anchor.x, y: anchor.y };
    case 'top-center':
      return { x: anchor.x - size.width / 2, y: anchor.y };
    case 'top-right':
      return { x: anchor.x - size.width, y: anchor.y };
    case 'bottom-right':
      return { x: anchor.x - size.width, y: anchor.y - size.height };
  }
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The box that contains every node at its focused size at once. The initial fit frames this, so the
 * viewport never has to move when focus (and therefore sizes) change — only the cards animate within
 * a stable frame.
 */
export function focusUnionBounds(): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const kind of NODE_ORDER) {
    const size = NODE_LAYOUT[kind].focused;
    // Each node at its own focused size; that extent contains every compact/shifted position too.
    const p = derivePosition(kind, size, kind);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + size.width);
    maxY = Math.max(maxY, p.y + size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const INITIAL_FOCUS = focusedKind('idle');

export const INITIAL_NODES: Node[] = NODE_ORDER.map((kind) => {
  const size = sizeFor(kind, INITIAL_FOCUS);
  return {
    id: kind,
    type: kind,
    position: derivePosition(kind, size, INITIAL_FOCUS),
    // Size lives on the node itself (not data) so React Flow applies it to the node element and
    // NodeResizer can drive it directly in arrange mode; the guided tween writes the same fields.
    width: size.width,
    height: size.height,
    data: {},
    dragHandle: '.node-drag-handle',
  };
});

interface EdgeSpec {
  id: string;
  source: string;
  target: string;
  /** The edge flows (animated dashes) only while its downstream node is the active one. */
  activeOn: Phase;
}

const EDGE_SPECS: EdgeSpec[] = [
  { id: 'upload-preview', source: 'upload', target: 'preview', activeOn: 'uploaded' },
  { id: 'preview-processing', source: 'preview', target: 'processing', activeOn: 'processing' },
  { id: 'processing-results', source: 'processing', target: 'results', activeOn: 'done' },
];

/**
 * Rebuilds the edge list for a phase. Every edge carries a real arrowhead so the direction is
 * unmistakable; the one edge into the newly-active node animates. Colours are intentionally left off
 * so they come from CSS (`--edge-color`, `.is-active`, and the arrowhead rule in globals.css) — that
 * keeps theme changes purely CSS, with no React re-render of the canvas that could flicker on the
 * dark-mode transition. Edges therefore depend only on `phase`.
 */
export function buildEdges(phase: Phase): Edge[] {
  return EDGE_SPECS.map((spec) => {
    const active = phase === spec.activeOn;
    return {
      id: spec.id,
      source: spec.source,
      target: spec.target,
      type: 'default',
      animated: active,
      ...(active ? { className: 'is-active' } : {}),
      // A clean, minimalist open arrowhead (thin V) rather than the bulky filled triangle. Its colour
      // comes from CSS (context-stroke), so it matches each edge and stays theme-switch-safe.
      markerEnd: {
        type: MarkerType.Arrow,
        width: 20,
        height: 20,
        strokeWidth: 1.6,
      },
    };
  });
}
