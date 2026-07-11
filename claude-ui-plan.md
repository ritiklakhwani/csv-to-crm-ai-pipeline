# UI Upgrade — node-canvas flow (React Flow), 3D navbar, clip-path dark toggle

## Context

The backend and the frontend *logic* are done, tested (233 tests green), and committed. This task is
a **UI-only transformation**: replace the current plain four-step stepper with an **n8n-style node
canvas** — four draggable nodes (Upload → Preview → Processing → Results) connected by animated
edges — per the user's spec at `ui-reference-file.md`. No backend change; no change to the SSE, CSV,
or business-rule logic.

**Decisions the user made:** build the node canvas first and deploy once at the end (single deploy);
within the build, do the canvas first and layer polish after. **Standing risk I flagged and will
mitigate:** a public hosted URL is a hard submission item and the deadline is tomorrow — so every
milestone below stays independently committable and deployable, and we deploy the moment the canvas
is solid rather than only at the very end.

**Skills to add (answer to the user's question):** `anthropics/skills → frontend-design` and
`vercel-labs/agent-skills → web-design-guidelines` are the two worth adding for this task;
`ui-ux-pro-max` is optional/heavier. They load as guidance, not code.

## Locked implementation decisions

- **Only one new dependency: `@xyflow/react`** (v12.11.2, React-19 compatible). No `next-themes` (keep
  the working no-flash localStorage + boot-script theme), no `framer-motion` (modals via native
  `<dialog>`, nav/loaders via CSS).
- **Keep the proven SSE/parse/export code verbatim** (`lib/sse.ts`, `lib/api.ts`, `lib/csv-export.ts`,
  `hooks/useCsvParser.ts`, `components/VirtualTable.tsx`, `crm-columns.tsx`, `MappingPanel.tsx`, all
  `ui/*`). Do **not** touch `csv-export.ts` — the 19 frontend tests depend on it.
- **Poppins via `next/font/google`** (works on Vercel and in networked Docker builds); switch to
  `next/font/local` only if an offline build actually fails.
- Results node is wider than the spec's 340–420px (a 15-column table needs room).

## Architecture — two-tier state (this is also the performance fix)

The naive wiring (push SSE data through `nodes[].data` + `setNodes` every batch) re-renders the whole
canvas per tick. Split state:

- **Cold tier — `hooks/useImportMachine.ts` (React state).** Owns `phase`
  (`idle→uploaded→previewing→confirmed→processing→done→error`), `file`, `preview`. Subsumes today's
  `page.tsx` step state. Actions: `selectFile` (runs `parseCsvPreview` → `uploaded`), `confirm`
  (→ `confirmed`, starts the import), `reset`, `retry`. `phase` changes rarely → drives each node's
  `locked`/`active` flags and which edge animates.
- **Hot tier — `lib/machine-store.ts` (`useSyncExternalStore`, zero-dep).** Owns the live SSE slice
  (`status`, `progress`, `records`, `skipped`, `activityLog`, `mappingPlan`, `result`, `error`).
  Content reads it via `useMachineSelector(selector)`, so **only the Processing/Results content that
  selected the changed slice re-renders** — the canvas, edges, and other nodes stay inert per tick.
- **Reuse the existing SSE fold:** keep `run()` + `readSseEvents()` + the `AbortController`
  unmount/abort logic from `useImport.ts` exactly as-is; change only its sink from React `setState`
  to `store.setState`.

## React Flow integration specifics (v12, App Router)

- **Mount via `dynamic(() => import('.../FlowCanvas'), { ssr:false, loading: <CanvasSkeleton/> })`** —
  React Flow measures the DOM and must not render server-side. This also keeps the canvas JS off
  mobile (which renders `StackedFlow`).
- **`import '@xyflow/react/dist/style.css'` at the top of `FlowCanvas.tsx`** (the client chunk), so it
  loads after Tailwind and RF's own `.react-flow__*` rules win.
- **Stable `nodeTypes`/`edgeTypes` as module-level `const`** (never inline / never `useMemo` in
  render) or every node remounts. Each node component `React.memo`.
- **Height under the sticky navbar:** page root `flex min-h-[100dvh] flex-col`; navbar `sticky top-0`;
  canvas wrapper `flex-1 min-h-0 relative`; `<ReactFlow style={{width:'100%',height:'100%'}}>`. Wrap
  in `<ReactFlowProvider>`.
- **Draggable but not rewireable:** `nodesConnectable={false}`, `edgesReconnectable={false}`,
  `edgesFocusable={false}`, `deleteKeyCode={null}`, `<Handle isConnectable={false}>`; leave
  `nodesDraggable` default so edges follow drags.
- **Edges:** pre-wired in `graph.ts`; use the built-in **`animated: true`** boolean (RF ships the
  dash animation) toggled per `phase` so only the edge into the active node animates. Optional n8n
  moving-dot = one custom edge type (`getBezierPath` + `<BaseEdge>` + `<animateMotion><mpath>`).
- **Drag-vs-scroll (critical):** `dragHandle=".node-drag-handle"` on each node, that class **only on
  the `NodeShell` header** → the body (tables, buttons, dropzone) is free. Add **`nowheel`** to the
  `VirtualTable` scroll container and **`nodrag`** to every interactive control (buttons, tabs,
  dropzone onClick, file input, remove ×) or the drag gesture swallows clicks.

## Dark-mode clip-path toggle (View Transitions)

- `useTheme.toggle(e)` reads `e.clientX/Y`, computes `endRadius = hypot(max(x,innerW-x),
  max(y,innerH-y))`, calls `document.startViewTransition(() => applyThemeAndPersist(next))`, then in
  `.ready` animates `clipPath: circle(0 → endRadius at x,y)` on `::view-transition-new(root)`.
- **Mutate `.dark` synchronously inside the callback** (React state is async — update the icon state
  separately). Add `types/view-transitions.d.ts` augmenting `Document.startViewTransition` (strict TS,
  no `any`). Fallback: `if (!document.startViewTransition || prefers-reduced-motion) applyTheme(next)`.
- `globals.css`: disable the default crossfade (`::view-transition-old/new(root){animation:none}`),
  and put `::view-transition-new(root){z-index:9999}`.

## Files

**New:** `components/flow/{FlowCanvas,StackedFlow,graph}.ts(x)`,
`components/flow/nodes/{nodeTypes.ts, UploadNode,PreviewNode,ProcessingNode,ResultsNode}.tsx`,
`components/nodes/{NodeShell,PerimeterLoader}.tsx`,
`components/nodes/content/{Upload,Preview,Processing,Results}NodeContent.tsx` (extracted from
`steps/*`, Card stripped), `components/nav/{Navbar,DocsModal,AboutModal}.tsx`, `components/ui/Modal.tsx`
(native `<dialog>`), `hooks/{useImportMachine,useMediaQuery}.ts`, `lib/machine-store.ts`,
`types/view-transitions.d.ts`.

**Modified:** `app/page.tsx` (thin: mount-gate + media switch), `app/layout.tsx` (Poppins),
`app/globals.css` (CSS-var theme tokens light/dark incl. dark badge palette + `--edge-color`,
`@property --angle`, loader keyframes, View-Transition CSS, `.react-flow` `--xy-*` overrides,
`@theme { --font-sans }`), `hooks/useTheme.ts`, `hooks/useImport.ts` (sink→store),
`components/ui/StatusBadge.tsx` (dark palette).

**Removed:** `components/Stepper.tsx`, `components/Header.tsx` (→ Navbar), `components/steps/*`
(→ `nodes/content/*`).

**Untouched:** everything in the "keep verbatim" list above, `tests/*`, `@groweasy/shared`,
`public/samples/*`, `next.config.ts`.

## Milestones (canvas-first; each ends green + deployable)

- **M0 — Prove React Flow SSR.** Add `@xyflow/react`; throwaway 2-node/1-edge canvas behind
  `dynamic(ssr:false)`, gated by `?canvas=1` so the live app is untouched. Verify `next build`
  (standalone) succeeds, zero hydration warnings, correct height under a sticky bar.
- **M1 — State machine.** Add `useImportMachine` + store around the existing SSE logic; `page.tsx`
  consumes it but still renders today's step components. Behaviour identical.
- **M2 — Content extraction + NodeShell + mobile shell.** Split `steps/*` → `content/*`; build
  `NodeShell` and `StackedFlow`; render stacked on both breakpoints temporarily.
- **M3 — Desktop canvas.** Real 4 nodes + fixed edges + `Background` dots + `Controls`, memoized,
  store-selector wiring (no `setNodes` on ticks), drag-handle/`nowheel`/`nodrag`; `useMediaQuery`
  switches shells. **← the showpiece; deploy candidate.**
- **M4 — Theme + navbar.** CSS-var tokens + dark badge palette, Poppins, 3D `Navbar`, Docs/About
  modals, clip-path toggle (+ reduced-motion + fallback + TS augmentation).
- **M5 — Loaders + polish.** Conic-gradient perimeter loader (+ reduced-motion pulse), edge-animation
  gating, focus rings, skeleton/toast, 375px + a11y pass.

## Pitfalls to pre-empt

Tailwind-4 Preflight vs RF control buttons (import RF CSS after Tailwind; theme via `--xy-*`);
`next/font` Poppins needs weights + build-time network; `noUncheckedIndexedAccess`/`no-non-null-
assertion`/`no-console` in all new code; `useMediaQuery` returns a stable value on server + first
client render then updates in `useEffect` (mount gate).

## Verification

Per milestone: `pnpm -r typecheck && pnpm lint && pnpm --filter @groweasy/frontend test && pnpm --filter @groweasy/frontend build` all green. Then drive the flow in a browser:
1. **Desktop:** upload a sample → canvas shows 4 nodes, downstream locked/dimmed; drag a node and its
   edges follow; confirm → Processing node shows the perimeter loader and its incoming edge animates;
   results fill live; Export CSV still applies selective formula-injection escaping.
2. **375px:** stacked cards, no canvas, no horizontal page scroll, tables scroll inside their card.
3. **Both themes:** clip-path reveal plays from the toggle position and reverses; instant under
   `prefers-reduced-motion`; dark badges legible.
4. Docs and About modals open, trap focus, close on Esc.

After M5: single deploy (Vercel frontend + Render backend), then Docker/compose + README — separate
follow-on phase.
