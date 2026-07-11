# GrowEasy CSV Importer — UI / Frontend Design Specification

> **Scope:** This document governs the **frontend/UI only**. The backend, the two-phase AI
> extraction pipeline, the API contracts, validation, and all business rules from the main
> build spec are UNCHANGED — do not touch them. This spec replaces and upgrades the
> "Frontend Specification" section of the main spec with a node-based canvas UI.
>
> **Design goal:** A node-based, flow-canvas interface inspired by n8n / agentic-builder
> tools — where each stage of the import (Upload → Preview → Processing → Results) is a
> draggable node connected by animated arrows — while remaining a clean, guided,
> fully responsive product that a reviewer understands in five seconds.

---

## 0. The one rule that makes this work

The canvas must be a **state-driven guided flow, not a free sandbox.** There is a single
import state machine:

```
idle → uploaded → previewing → confirmed → processing → done   (and → error from any state)
```

Every node reads from this machine and enables/disables itself accordingly:
- On load, only the **Upload** node is active and visually highlighted ("Start here" affordance).
- **Preview** node is dimmed/locked until `uploaded`.
- **Processing** node is dimmed/locked until `confirmed`.
- **Results** node is dimmed/locked until `done`.
- Edges between nodes animate (flowing dashes) only when the downstream step is active.

Nodes are draggable and repositionable (the arrows follow them, n8n-style), but the
*path* is always unambiguous. This is what keeps the wow-factor from becoming confusing UX.

---

## 1. Responsive strategy (non-negotiable — it's a graded criterion)

- **Desktop / tablet (≥768px):** full React Flow canvas with draggable nodes + animated edges.
- **Mobile (<768px):** DO NOT render the canvas. Render the exact same four nodes as
  full-width cards **stacked vertically** in flow order, driven by the same state machine,
  with the same loaders and content. No horizontal panning, no drag, no tiny nodes.
- Use a single `useMediaQuery`/viewport hook to switch between `<FlowCanvas>` and
  `<StackedFlow>`. Both consume the same state and the same node content components, so
  there is no logic duplication — only the layout shell differs.
- Test at 375px. Tables inside nodes scroll horizontally within their card; nothing overflows the viewport.

---

## 2. Tech

- **React Flow** — current package **`@xyflow/react`** (v12), `import '@xyflow/react/dist/style.css'`.
  Use `useNodesState`, `useEdgesState`, custom `nodeTypes`, custom animated `edgeTypes`,
  `<Background>`, and `<Controls>` (zoom/fit) on desktop.
- Custom nodes: `UploadNode`, `PreviewNode`, `ProcessingNode`, `ResultsNode`.
- Nodes connect via `<Handle type="source" position={Position.Right}>` /
  `type="target" position={Position.Left}>`. Edges are pre-wired in flow order and
  **not user-editable** (connections are fixed; users can move nodes, not rewire them).
- Everything else stays on the main-spec stack: Next.js 14 App Router, TypeScript strict,
  Tailwind, TanStack Table + Virtual (inside the Preview/Results nodes), PapaParse client-side.

---

## 3. Theme system

Two fully-designed themes via CSS variables + a `class="dark"` strategy. All colors,
node surfaces, borders, and the canvas background are theme-tokenized — nothing hardcoded.

**Light theme — mirror GrowEasy's real product exactly:**
- Clean white node surfaces, soft gray borders, `rounded-xl` corners, generous padding.
- Mint/teal accent chips for info/status; **warm orange primary CTA** (`~#F0824F`), white text.
- Canvas background: near-white with a very faint dot grid.
- Geometric sans (Poppins or similar) via `next/font`.

**Dark theme — the attached dotted-canvas aesthetic:**
- Deep near-black canvas (`~#0A0A0B`) with a subtle **dot grid** background
  (`<Background variant={BackgroundVariant.Dots} gap={22} size={1} />`, low-opacity dots).
- Node surfaces: elevated dark cards (`~#141416`) with a 1px subtle light border and soft
  shadow so they read as floating above the grid. Accent stays orange; text high-contrast.
- Badges/statuses must be legible in dark (recompute the status-badge palette for dark mode,
  don't just reuse the light colors).

Both themes must look *intentional* — the dark mode is not a filter on the light mode.

---

## 4. Dark-mode toggle — circular clip-path reveal (View Transitions API)

The toggle animates the theme change as a **circle expanding from the toggle button's
position** (going out) and contracting on toggle back (coming in). Implement with the
**View Transitions API**, not a CSS overlay hack:

```ts
function toggleTheme(e: React.MouseEvent) {
  const x = e.clientX;
  const y = e.clientY;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  // Graceful fallback for browsers without support
  if (!document.startViewTransition) { applyTheme(); return; }

  const transition = document.startViewTransition(() => applyTheme());
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      { duration: 500, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
    );
  });
}
```

```css
/* Disable the default cross-fade so only the clip-path circle plays */
::view-transition-old(root),
::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
```

Reverse the direction (contract to a point) when toggling back to light. Respect
`prefers-reduced-motion`: if set, skip the animation and switch instantly. Persist the
chosen theme (in-memory + a cookie/`next-themes`-style approach — no `localStorage` in
Artifacts, but this is a real Next.js app so `next-themes` or a cookie is fine here).

---

## 5. The navbar — elevated "3D" bar

A top navigation bar with real depth (not a flat strip):
- Layered shadow + subtle top highlight so it reads as a raised glass/elevated surface;
  a very slight `perspective`/`translateZ` or a soft 3D bevel on hover. Tasteful, not gaudy.
- Contents: left = GrowEasy-style wordmark/logo; right = **Docs**, **About**, and the
  **dark-mode toggle** (the toggle triggers §4).
- **Docs** opens a slide-over / modal with the API reference + how-it-works (pull from README).
- **About** opens a small modal: what this is, the tech, a link to the GitHub repo + your portfolio.
- Sticky, blurred backdrop, theme-aware.

---

## 6. The nodes (content + behavior)

Each node is a themed card (`~340–420px` wide on canvas) with a title bar, a body, and
source/target handles. All four share a consistent header style (icon + title + a small
status pill reflecting the state machine).

**UploadNode**
- Drag & drop zone + click-to-browse. States: idle, drag-over (accent highlight),
  file-selected (file card: name, size, remove ×), error (inline, themed).
- Client guards: `.csv` only, ≤5MB, friendly inline errors.
- "Download sample CSV" link (wires to the shipped sample files).
- On successful file read → transitions state to `uploaded`, its output edge to PreviewNode
  begins animating, PreviewNode un-dims.

**PreviewNode**
- Locked/dimmed until `uploaded`. Shows a virtualized preview table (TanStack Virtual):
  sticky header, horizontal + vertical scroll inside the node, zebra rows, monospace for
  phone/date-looking columns, total row count. **No AI call happens here.**
- Primary **"Confirm Import"** button (orange). Secondary "Choose different file".
- On confirm → state `confirmed` → edge to ProcessingNode animates → processing begins.

**ProcessingNode**
- Locked/dimmed until `confirmed`. Connects to the backend SSE endpoint.
- Shows: overall progress bar (batches done / total), rows-processed counter, a subtle
  activity log line ("Batch 4/12 · 20 records"), and the animated border loader (§7) on
  its perimeter while active.
- Results fill into ResultsNode live as `batch_complete` SSE events arrive.
- On `done` → state `done` → ResultsNode un-dims.

**ResultsNode**
- Locked/dimmed until `done`. Four stat chips: Total Rows · Imported · Skipped · Time.
- Tabs: **Imported** (virtualized table of all 15 CRM fields; `crm_status` rendered as
  themed colored badges — green `SALE_DONE`, teal `GOOD_LEAD_FOLLOW_UP`, gray
  `DID_NOT_CONNECT`, red `BAD_LEAD`) and **Skipped** (row #, raw data, skip reason).
- **Export CSV** button for cleaned records (respects the selective formula-injection
  escaping rule from the main spec). "Import another file" resets the whole machine to `idle`.

---

## 7. Loaders — animated node-perimeter loader

When a node is in an active/working state (Upload reading a large file, Processing running
batches), animate a **loader that runs around the node's border**, in the spirit of the
square-circle loaders at css-loaders.com. Implementation options (pick the cleanest):

- A rotating **conic-gradient border** using `@property --angle` for a smooth 360° sweep, e.g.
  a pseudo-element at `inset:-2px`, `border-radius:inherit`, `background: conic-gradient(...)`,
  masked to a thin ring, animated `--angle: 0→360deg`.
- Or an SVG `rect` outline with animated `stroke-dashoffset` tracing the perimeter.

The loader color is the orange accent in both themes. Idle nodes show a static 1px border.
Keep it smooth (GPU-friendly transform/opacity where possible) and honor
`prefers-reduced-motion` (fall back to a simple pulsing border).

Also include tasteful micro-states everywhere: skeletons while the first batch is in flight,
toast notifications for errors, 150ms hover/focus transitions, visible focus rings.

---

## 8. Edges

- Fixed, pre-wired edges in flow order (Upload→Preview→Processing→Results).
- Style: smooth/bezier, theme-aware color, with **`animated: true` flowing dashes** only when
  the downstream node is active (mirrors n8n's live-data feel). Inactive edges are static/dimmed.
- Edges follow nodes when dragged (default React Flow behavior — just don't disable it).

---

## 9. Architecture / code quality (still graded)

- One `useImportMachine` hook (or a tiny reducer/xstate-lite) owns the state machine; both
  `FlowCanvas` and `StackedFlow` consume it. Node *content* lives in shared components
  (`UploadNodeContent`, etc.) rendered inside either a React Flow node wrapper or a mobile card.
- TypeScript strict, no `any`. Shared types mirror the backend contracts.
- No `localStorage` misuse; theme persistence via cookie/`next-themes`.
- Accessibility: every interactive control (buttons, dropzone, tabs, toggle) is keyboard-
  reachable with ARIA labels; the mobile stacked layout is the accessible/touch path.
- Performance: memoize node components, avoid re-rendering the whole canvas on every SSE
  tick (update only the affected node's state), virtualize both tables.

---

## 10. Preserve from the main spec (do not regress)

- The 4-step flow semantics (no AI on preview; AI only after Confirm).
- SSE progress with live-filling results.
- All CRM business rules, enum whitelists, skip logic, selective CSV formula-injection escaping.
- Deployed-endpoint guards (5MB, MAX_ROWS, rate limit).
- Dark mode, drag & drop, loading states, toasts remain checked bonus items.

---

## 11. Acceptance checks

- [ ] Desktop shows the draggable node canvas; dragging a node moves its connected edges.
- [ ] Mobile (<768px) shows the stacked linear flow — no canvas, no horizontal scroll, fully usable at 375px.
- [ ] On load, Upload node is highlighted; downstream nodes are visibly locked until their step is reachable.
- [ ] Dark-mode toggle plays the circular clip-path reveal from the button's position; reverses on toggle back; instant + no-animation under `prefers-reduced-motion`.
- [ ] Dark theme uses the dotted-grid canvas; light theme mirrors GrowEasy (white/mint/orange).
- [ ] Active nodes show the animated perimeter loader; idle nodes show a static border.
- [ ] Edges animate (flowing dashes) only while their downstream step is active.
- [ ] 3D navbar with working Docs modal, About modal, and theme toggle.
- [ ] A reviewer can complete Upload → Preview → Confirm → Results without instruction.
- [ ] Full flow works end-to-end against the deployed backend, in both themes.

my raw prompt to claude to make a spec file for you- 
some skills for the claude code to design better 
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines

npx skills add https://github.com/anthropics/skills --skill frontend-design

npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max

now lets move to the ui design part i want to upgrade the ui completely so first tell me what skills should i add from skils.sh site i have added some examples for better design and i am thinking to give it a ui like n8n or usuals ai i have attached screenshots for it and for the light theme we will keep the theme as it is like in grow easy and for the dark mode we need clip path css property in the dark mode toggle which the the circular going out and coming in animation is there and for the project i have attached the darkmode background i need and the nav bar i want is like this 3d nav bar i want in which there will be docs about and the dark mode toggle and ever part like uploading, preview, processing part and the export csv part should all be components that should be connected with arrows and these components should be dragable movabel and the arrows connected to them should also move when the move for this we will be going to use a library of react called react flow and i want something like if i upload something on the upload componenet a loader occurs on the border/boundry of the component curly border loader kind of thing or some cool loader i can get from https://css-loaders.com/square-circle/ and then after uploading when we click on the preview button which is connected to the upload componenet with a arrow etc etc like n8n 

i want all this so make a good prompt for me for specifically only ui design so that i can give it to claude