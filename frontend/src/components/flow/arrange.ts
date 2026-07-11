import { NODE_ORDER, type NodeKind, type Size } from '@/components/flow/graph';

/**
 * Free-arrange mode (active only after the flow completes, `phase === 'done'`). Activation is a silent
 * no-op — the completed spotlight layout is preserved untouched; only move + resize get unlocked.
 * This module holds the pure geometry — the resize limits and the collision resolver, which runs
 * *only* in response to a user drag/resize — so it can be unit-tested in isolation from React Flow.
 */

/** Breathing room the collision push keeps between cards. */
export const ARRANGE_GAP = 16;

/** NodeResizer limits — min keeps content legible; max is capped so a card grown to full size still
 *  leaves room for the other three moderate cards to sit around it without overlap. */
export const ARRANGE_MIN: Size = { width: 300, height: 180 };
export const ARRANGE_MAX: Size = { width: 820, height: 640 };

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** React Flow's `nodeExtent` shape: [[minX, minY], [maxX, maxY]]. */
export type Extent = [[number, number], [number, number]];

/** Two rects overlap when their gap-inflated boxes intersect — so resolving leaves ≥ gap between them. */
function overlaps(a: CardRect, b: CardRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/**
 * Moves `mover` clear of `fixed` (keeping `ARRANGE_GAP` between them). It tries all four exits —
 * left, right, up, down — clamps each to `extent`, and picks the shortest that *actually* separates
 * the two, so a wall-blocked short exit is skipped for a longer one that works. If the workspace is
 * too tight for any exit to clear (e.g. `fixed` sits dead-centre and there's no room for another
 * card beside it), it takes the shortest move as best effort. Mutates `mover`; returns whether it moved.
 */
function pushCardOut(fixed: CardRect, mover: CardRect, extent: Extent): boolean {
  const [[minX, minY], [maxX, maxY]] = extent;
  const clampX = (x: number): number =>
    Math.max(minX, Math.min(x, Math.max(minX, maxX - mover.width)));
  const clampY = (y: number): number =>
    Math.max(minY, Math.min(y, Math.max(minY, maxY - mover.height)));
  const candidates: CardRect[] = [
    { ...mover, x: clampX(fixed.x - ARRANGE_GAP - mover.width) }, // left of fixed
    { ...mover, x: clampX(fixed.x + fixed.width + ARRANGE_GAP) }, // right of fixed
    { ...mover, y: clampY(fixed.y - ARRANGE_GAP - mover.height) }, // above fixed
    { ...mover, y: clampY(fixed.y + fixed.height + ARRANGE_GAP) }, // below fixed
  ];

  // Prefer an exit that fully clears (shortest such move). If none clears — the workspace is too
  // tight for a clean arrangement — take the shortest move, which keeps a jammed card near where it
  // was rather than letting several cards converge and stack on one open spot.
  let best = mover;
  let bestScore = Infinity;
  for (const c of candidates) {
    const move = Math.abs(c.x - mover.x) + Math.abs(c.y - mover.y);
    const score = (overlaps(fixed, c, ARRANGE_GAP) ? 1_000_000 : 0) + move;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  const moved = best.x !== mover.x || best.y !== mover.y;
  mover.x = best.x;
  mover.y = best.y;
  return moved;
}

/**
 * Collision repulsion, run on every drag/resize frame. The active card (under the user's control)
 * stays pinned; every overlapping neighbour is pushed to its nearest clear spot and kept inside
 * `extent`. It relaxes all pairs over several passes so chained overlaps settle — when a neighbour is
 * shoved into a third card, the next pass separates those too. If the workspace is genuinely too
 * tight for a clean arrangement (a big card dragged dead-centre), it degrades to least-overlap rather
 * than shoving a card off-canvas. Pure: copies the input and returns new rects.
 */
export function resolveArrangeCollisions(
  input: Record<NodeKind, CardRect>,
  activeId: NodeKind,
  extent: Extent,
  passes = 12,
): Record<NodeKind, CardRect> {
  const rects = {} as Record<NodeKind, CardRect>;
  for (const k of NODE_ORDER) rects[k] = { ...input[k] };

  for (let pass = 0; pass < passes; pass++) {
    let anyOverlap = false;
    for (let i = 0; i < NODE_ORDER.length; i++) {
      for (let j = i + 1; j < NODE_ORDER.length; j++) {
        const ka = NODE_ORDER[i];
        const kb = NODE_ORDER[j];
        if (!ka || !kb) continue;
        const a = rects[ka];
        const b = rects[kb];
        if (!overlaps(a, b, ARRANGE_GAP)) continue;
        anyOverlap = true;
        // Keep the active card fixed and move the other; if neither is active, move b out of a.
        if (kb === activeId) pushCardOut(b, a, extent);
        else pushCardOut(a, b, extent);
      }
    }
    if (!anyOverlap) break;
  }
  return rects;
}
