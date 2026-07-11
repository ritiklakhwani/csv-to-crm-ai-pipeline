'use client';

import { getBezierPath, Position, type EdgeProps, type EdgeTypes } from '@xyflow/react';

/** Data carried by a pipeline edge — `active` lights the neon core, the marching flow and a
 *  travelling data frame while the downstream node is the current step. */
export interface PipelineEdgeData {
  active?: boolean;
  [key: string]: unknown;
}

/** Unit direction the pipe travels as it enters the target node, taken from the handle side it docks
 *  on (a Left handle is entered moving right, a Top handle moving down, etc.). Used both to pull the
 *  line back from the tip and to orient the arrowhead. */
const ENTRY_DIR: Record<Position, { x: number; y: number }> = {
  [Position.Left]: { x: 1, y: 0 },
  [Position.Right]: { x: -1, y: 0 },
  [Position.Top]: { x: 0, y: 1 },
  [Position.Bottom]: { x: 0, y: -1 },
};

/** Arrowhead geometry, in flow units. Length tip→base and half its base height. */
const ARROW_LEN = 9;
const ARROW_HALF = 3.75;
/** How far short of the target the thick line stops, so the rails/glow terminate at the arrowhead's
 *  base instead of running over its tip. Just under ARROW_LEN so the base tucks under the solid head
 *  (drawn on top) with no seam. */
const LINE_BACKOFF = 8;

/**
 * A futuristic "data pipe" edge. Instead of one line, the same Bezier path is stroked several times to
 * build the effect (all colours/widths/animation live in globals.css so a theme switch stays pure-CSS
 * and never re-renders the canvas):
 *   1. glow  — a wide, blurred halo filling the pipe.
 *   2. rails — a thick band whose exposed edges read as the two outer parallel lines.
 *   3. core  — a thinner neon line down the channel between the rails (marches when active).
 *   4. pulse — a small glowing frame that animates along the path when active.
 *   5. head  — a solid arrowhead drawn LAST, as its own <path> at the true target, so it sits on the
 *              absolute top layer untouched by the line styles beneath it.
 * To keep the thick line off the tip, the stroked layers are built to a Bezier that ends LINE_BACKOFF
 * px short of the target (pulled straight back along the entry direction); the arrowhead then spans
 * that gap up to the real target point.
 */
export function PipelineEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const dir = ENTRY_DIR[targetPosition] ?? ENTRY_DIR[Position.Left];

  // The line stops short of the target; the arrowhead covers the remaining stretch to the tip.
  const [linePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX: targetX - dir.x * LINE_BACKOFF,
    targetY: targetY - dir.y * LINE_BACKOFF,
    sourcePosition,
    targetPosition,
  });

  const active = Boolean((data as PipelineEdgeData | undefined)?.active);

  // Solid triangle pointing +x in local space (tip at origin, base behind it), then rotated to face
  // the entry direction and translated onto the target. Drawn after every stroke so nothing overlays it.
  const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  const headPath = `M 0 0 L ${-ARROW_LEN} ${-ARROW_HALF} L ${-ARROW_LEN} ${ARROW_HALF} Z`;

  return (
    <g className={active ? 'pipe-edge is-active' : 'pipe-edge'}>
      <path d={linePath} className="pipe-glow" fill="none" />
      <path d={linePath} className="pipe-rails" fill="none" />
      <path d={linePath} className="pipe-core" fill="none" />

      {active && (
        <circle className="pipe-pulse" r={2.2}>
          <animateMotion dur="1.3s" repeatCount="indefinite" path={linePath} />
        </circle>
      )}

      {/* Top layer: the arrowhead, immune to the line styles above. */}
      <path
        className="pipe-arrowhead"
        d={headPath}
        transform={`translate(${targetX} ${targetY}) rotate(${angle})`}
      />
    </g>
  );
}

/** Register on <ReactFlow edgeTypes={edgeTypes} />. Stable module-level reference (no re-creation). */
export const edgeTypes: EdgeTypes = {
  pipeline: PipelineEdge,
};
