'use client';

// Import React Flow's stylesheet from the client chunk, after Tailwind, so its `.react-flow__*`
// rules and our overrides in globals.css win.
import '@xyflow/react/dist/style.css';

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Node,
  type XYPosition,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_NODES,
  NODE_ORDER,
  buildEdges,
  derivePosition,
  focusUnionBounds,
  focusedKind,
  sizeFor,
  type NodeKind,
  type Size,
} from '@/components/flow/graph';
import { resolveArrangeCollisions, type CardRect, type Extent } from '@/components/flow/arrange';
import { FocusProvider, type FocusValue } from '@/components/flow/focus-context';
import { useLayoutActions } from '@/components/flow/layout-actions';
import { nodeTypes } from '@/components/flow/nodes';
import { useMachine } from '@/hooks/machine-context';

const FIT_OPTIONS = { padding: 0.06, duration: 0 } as const;
const RESIZE_MS = 350;

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

// A slight overshoot on the return so it reads as a magnetic spring, not a linear glide.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function nodeSize(node: Node, fallback: Size): Size {
  return { width: node.width ?? fallback.width, height: node.height ?? fallback.height };
}

function FlowInner() {
  const machine = useMachine();
  const { phase } = machine;
  const { fitBounds } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodesInitialized = useNodesInitialized();
  // The container dimensions React Flow measured. Reading them from the store makes the fit fully
  // reactive: it re-runs whenever RF learns/updates its size, so it never fits against a stale size.
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  // The live viewport transform (pan + zoom) — used to widen the drag extent to exactly what is
  // visible. Read as scalars so this only re-renders when the fit actually changes.
  const panX = useStore((state) => state.transform[0]);
  const panY = useStore((state) => state.transform[1]);
  const zoom = useStore((state) => state.transform[2]);

  // Arrange mode: once the flow completes the guided spotlight is released and the user freely moves
  // and resizes all four cards (which repel each other). Everything before completion is unchanged.
  const arrangeMode = phase === 'done';

  // Focus auto-follows the flow state, but the user can click a completed card to re-open it. A new
  // flow step clears the override so the current step takes the spotlight; the user can then click
  // back. Once the flow settles (phase stops changing), the override sticks and cards behave as tabs.
  const [focusOverride, setFocusOverride] = useState<NodeKind | null>(null);
  useEffect(() => {
    setFocusOverride(null);
  }, [phase]);

  const canFocus = useCallback(
    (kind: NodeKind): boolean => {
      switch (kind) {
        case 'upload':
          return machine.file != null;
        case 'preview':
          return machine.preview != null;
        case 'processing':
          return phase === 'processing' || phase === 'done' || phase === 'error';
        case 'results':
          return phase === 'done';
      }
    },
    [machine.file, machine.preview, phase],
  );

  const focus = focusOverride ?? focusedKind(phase);

  const onNodeClick = useCallback(
    (event: unknown, node: Node) => {
      const kind = node.id as NodeKind;
      if (!canFocus(kind)) return;
      // Let interactive controls (buttons, links, inputs, the Imported/Skipped tabs) do their own
      // thing — a click on one of those must not also toggle the card.
      const target = (event as { target?: HTMLElement | null }).target;
      if (target && target.closest('button, a, input, select, textarea')) return;
      // Toggle: click a compact card to spotlight (expand) it; click it again to collapse back to the
      // flow's default focus. Works during the guided flow and after completion (arrange mode) alike.
      setFocusOverride((cur) => (cur === kind ? null : kind));
    },
    [canFocus],
  );

  const initial = useMemo<Node[]>(
    () => INITIAL_NODES.map((node) => ({ ...node, position: { ...node.position } })),
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial);
  // Always-current snapshot of the nodes so the layout tween and collision resolver can read live
  // sizes/positions without being wired through effect dependencies.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Edges depend only on the phase; their colours come from CSS so a theme switch never re-renders
  // the canvas (which would flicker the dark-mode transition).
  const edges = useMemo(() => buildEdges(phase), [phase]);

  // Frame the union of every node's *focused* size, not the current arrangement — so the viewport
  // never has to zoom or jump when focus (and therefore sizes) changes. Fit once the nodes are
  // measured and RF knows its container size, and again only when the panel resizes.
  const bounds = useMemo(() => focusUnionBounds(), []);

  // Guided drag extent: keep dragging inside the workspace (nodes spring back anyway). Vertically the
  // framed union already fills the panel; horizontally the union is narrower than the panel, so widen
  // to exactly the visible flow width so cards roam the full width without leaving the panel.
  const guidedExtent = useMemo<Extent>(() => {
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const top = bounds.y;
    const bottom = bounds.y + bounds.height;
    if (!(width > 0 && zoom > 0)) {
      return [
        [left, top],
        [right, bottom],
      ];
    }
    const margin = 28;
    const visibleLeft = -panX / zoom;
    const visibleRight = (width - panX) / zoom;
    return [
      [Math.min(left, visibleLeft + margin), top],
      [Math.max(right, visibleRight - margin), bottom],
    ];
  }, [bounds, width, panX, zoom]);

  // Arrange extent: the whole visible workspace in flow coordinates, so free-moved/resized cards can
  // use the full panel yet never cross its carved edge. Collision clamping uses the same box.
  const arrangeExtent = useMemo<Extent>(() => {
    if (!(width > 0 && height > 0 && zoom > 0)) {
      return [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y + bounds.height],
      ];
    }
    const m = 24;
    return [
      [-panX / zoom + m, -panY / zoom + m],
      [(width - panX) / zoom - m, (height - panY) / zoom - m],
    ];
  }, [bounds, width, height, panX, panY, zoom]);

  const effectiveExtent = arrangeMode ? arrangeExtent : guidedExtent;

  // Latest-value refs for the rapid drag/resize handlers, so they stay stable yet never read stale
  // mode/extent.
  const arrangeModeRef = useRef(arrangeMode);
  arrangeModeRef.current = arrangeMode;
  const arrangeExtentRef = useRef(arrangeExtent);
  arrangeExtentRef.current = arrangeExtent;

  useEffect(() => {
    if (nodesInitialized && width > 0 && height > 0) {
      fitBounds(bounds, FIT_OPTIONS);
    }
  }, [nodesInitialized, width, height, fitBounds, bounds]);

  // posRef holds each node's current settled slot — the spring-back home in guided mode, and the
  // `from` for the next layout tween.
  const posRef = useRef<Record<NodeKind, XYPosition>>(
    Object.fromEntries(
      NODE_ORDER.map((k) => [k, derivePosition(k, sizeFor(k, focus), focus)]),
    ) as Record<NodeKind, XYPosition>,
  );

  // --- Shared layout tween. Animates every node's size AND position together, frame by frame, from
  // wherever they are now (read live) to a target layout, re-anchoring handles each frame so the
  // arrows stay glued. Used for the guided spotlight and for the one-shot slide into the arrange
  // grid. Returns a cleanup that cancels the animation. ---
  const tweenTo = useCallback(
    (toSize: Record<NodeKind, Size>, toPos: Record<NodeKind, XYPosition>) => {
      const fromSize = {} as Record<NodeKind, Size>;
      const fromPos = {} as Record<NodeKind, XYPosition>;
      for (const n of nodesRef.current) {
        const k = n.id as NodeKind;
        fromSize[k] = nodeSize(n, toSize[k]);
        fromPos[k] = { ...n.position };
      }
      const changed = NODE_ORDER.some(
        (k) =>
          fromSize[k].width !== toSize[k].width ||
          fromSize[k].height !== toSize[k].height ||
          fromPos[k].x !== toPos[k].x ||
          fromPos[k].y !== toPos[k].y,
      );

      const apply = (e: number) => {
        const sizes = {} as Record<NodeKind, Size>;
        const poss = {} as Record<NodeKind, XYPosition>;
        for (const k of NODE_ORDER) {
          sizes[k] = {
            width: lerp(fromSize[k].width, toSize[k].width, e),
            height: lerp(fromSize[k].height, toSize[k].height, e),
          };
          poss[k] = { x: lerp(fromPos[k].x, toPos[k].x, e), y: lerp(fromPos[k].y, toPos[k].y, e) };
        }
        posRef.current = poss;
        setNodes((current) =>
          current.map((n) => {
            const k = n.id as NodeKind;
            const s = sizes[k];
            const p = poss[k];
            if (!s || !p) return n;
            return { ...n, position: p, width: s.width, height: s.height };
          }),
        );
        for (const k of NODE_ORDER) updateNodeInternals(k);
      };

      let raf = 0;
      // A final re-anchor after React commits the last size, so the edges/arrowheads snap to the
      // fully-grown card edges (the in-loop updateNodeInternals reads the pre-commit DOM).
      const settleEdges = () => {
        for (const k of NODE_ORDER) updateNodeInternals(k);
        raf = requestAnimationFrame(() => {
          for (const k of NODE_ORDER) updateNodeInternals(k);
        });
      };

      if (!changed || prefersReducedMotion()) {
        apply(1);
        raf = requestAnimationFrame(settleEdges);
        return () => cancelAnimationFrame(raf);
      }

      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / RESIZE_MS);
        apply(easeOutCubic(t));
        if (t < 1) raf = requestAnimationFrame(frame);
        else settleEdges();
      };
      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    },
    [setNodes, updateNodeInternals],
  );

  // Guided spotlight. On a focus change the focused node grows, the previous one shrinks, and Preview
  // may slide to make room. This runs for every phase — including the Processing → Results handoff on
  // completion — so the done state is the natural spotlight layout (Results focused, others compact).
  // Arrange mode adds NO layout pass on top of it; in `done` the focus is fixed (clicks are ignored),
  // so after that handoff this never re-runs and the cards stay exactly where they are.
  useEffect(() => {
    const toSize = {} as Record<NodeKind, Size>;
    const toPos = {} as Record<NodeKind, XYPosition>;
    for (const k of NODE_ORDER) {
      toSize[k] = sizeFor(k, focus);
      toPos[k] = derivePosition(k, toSize[k], focus);
    }
    return tweenTo(toSize, toPos);
  }, [focus, tweenTo]);

  // --- Reset Layout (the navbar "Arrange" button). Glides every card back to its canonical default
  // slot/size, undoing any dragging or resizing done in arrange mode, reusing the same smooth tween
  // as the spotlight (edges re-anchor each frame). If a card was click-spotlighted, clear that so the
  // guided tween restores the default focus layout; otherwise tween the current layout home directly. ---
  const resetLayout = useCallback(() => {
    if (focusOverride !== null) {
      setFocusOverride(null);
      return;
    }
    const toSize = {} as Record<NodeKind, Size>;
    const toPos = {} as Record<NodeKind, XYPosition>;
    for (const k of NODE_ORDER) {
      toSize[k] = sizeFor(k, focus);
      toPos[k] = derivePosition(k, toSize[k], focus);
    }
    tweenTo(toSize, toPos);
  }, [focusOverride, focus, tweenTo]);

  // Publish the reset to the button bridge via a stable wrapper (reads the latest reset through a ref
  // so we register once, not on every focus change).
  const resetLayoutRef = useRef(resetLayout);
  resetLayoutRef.current = resetLayout;
  const layoutActions = useLayoutActions();
  useEffect(() => {
    if (!layoutActions) return;
    const run = () => resetLayoutRef.current();
    layoutActions.registerReset(run);
    return () => layoutActions.registerReset(null);
  }, [layoutActions]);

  // --- Collision repulsion (arrange mode). On drag/resize, push overlapping neighbours to their
  // nearest clear spot, keep them inside the workspace, and re-anchor the edges. The active card
  // (under the user's control) never moves. ---
  const resolveAndApply = useCallback(
    (activeId: NodeKind) => {
      setNodes((current) => {
        const rects = {} as Record<NodeKind, CardRect>;
        for (const n of current) {
          const s = nodeSize(n, { width: 300, height: 150 });
          rects[n.id as NodeKind] = { x: n.position.x, y: n.position.y, ...s };
        }
        const resolved = resolveArrangeCollisions(rects, activeId, arrangeExtentRef.current);
        return current.map((n) => {
          const r = resolved[n.id as NodeKind];
          if (!r || (r.x === n.position.x && r.y === n.position.y)) return n;
          return { ...n, position: { x: r.x, y: r.y } };
        });
      });
      for (const k of NODE_ORDER) updateNodeInternals(k);
    },
    [setNodes, updateNodeInternals],
  );

  const onCardResize = useCallback(
    (kind: NodeKind) => {
      if (arrangeModeRef.current) resolveAndApply(kind);
    },
    [resolveAndApply],
  );

  const focusValue = useMemo<FocusValue>(
    () => ({ focus, canFocus, arrangeMode, onCardResize }),
    [focus, canFocus, arrangeMode, onCardResize],
  );

  // --- Drag. Guided mode springs the card back home (tweened so its edges follow the whole way).
  // Arrange mode leaves it where dropped and just resolves collisions. ---
  const rafByNode = useRef<Map<string, number>>(new Map());

  const cancelTween = useCallback((id: string) => {
    const raf = rafByNode.current.get(id);
    if (raf != null) {
      cancelAnimationFrame(raf);
      rafByNode.current.delete(id);
    }
  }, []);

  const onNodeDragStart = useCallback(
    (_event: unknown, node: Node) => cancelTween(node.id),
    [cancelTween],
  );

  const onNodeDrag = useCallback(
    (_event: unknown, node: Node) => {
      if (arrangeModeRef.current) resolveAndApply(node.id as NodeKind);
    },
    [resolveAndApply],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (arrangeModeRef.current) {
        // Free move: keep it where dropped, just settle any overlap and re-anchor edges.
        resolveAndApply(node.id as NodeKind);
        return;
      }

      // Home is the node's current spotlight slot (the last position the layout tween settled it at),
      // so it springs back to where it belongs rather than a stale fixed point.
      const home = posRef.current[node.id as NodeKind];
      if (!home) return;

      const settle = () =>
        setNodes((current) =>
          current.map((n) => (n.id === node.id ? { ...n, position: { ...home } } : n)),
        );

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const from = { ...node.position };
      const dx = home.x - from.x;
      const dy = home.y - from.y;
      if (reduce || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) {
        settle();
        return;
      }

      const duration = 360;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeOutBack(t);
        const x = from.x + dx * e;
        const y = from.y + dy * e;
        setNodes((current) =>
          current.map((n) => (n.id === node.id ? { ...n, position: { x, y } } : n)),
        );
        if (t < 1) {
          rafByNode.current.set(node.id, requestAnimationFrame(tick));
        } else {
          rafByNode.current.delete(node.id);
          settle();
        }
      };
      rafByNode.current.set(node.id, requestAnimationFrame(tick));
    },
    [setNodes, resolveAndApply],
  );

  useEffect(() => {
    const map = rafByNode.current;
    return () => {
      for (const raf of map.values()) cancelAnimationFrame(raf);
      map.clear();
    };
  }, []);

  return (
    <div className="relative h-full w-full" data-arrange={arrangeMode ? 'true' : 'false'}>
      <FocusProvider value={focusValue}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={1.5}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          panOnDrag={false}
          panOnScroll={false}
          autoPanOnNodeDrag={false}
          nodeExtent={effectiveExtent}
          nodesDraggable
          // A few pixels of slop so a plain click re-focuses a card while a real drag still moves it.
          nodeDragThreshold={6}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          nodesFocusable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          proOptions={{ hideAttribution: true }}
          style={{ width: '100%', height: '100%' }}
        >
          {/* No color prop: the dot colour comes from --xy-background-pattern-color (globals.css), so
              it flips with the theme via CSS instead of a React re-render. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={2.2} />
        </ReactFlow>
      </FocusProvider>
    </div>
  );
}

/**
 * The desktop showpiece: the fixed, spring-back node dashboard during the guided flow, which becomes
 * a free-arrange workspace once the import completes. Scoped to the carved workspace panel; mounted
 * via `dynamic(ssr:false)` because React Flow measures the DOM. User zoom and pan are always disabled;
 * fitView frames the whole composition into the panel and re-fits on resize.
 */
export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowInner />
    </ReactFlowProvider>
  );
}
