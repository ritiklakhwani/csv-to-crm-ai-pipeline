/**
 * A loader that runs around a node's border while it works (Upload parsing a file, Processing
 * running batches). It is a conic-gradient ring masked to the node's rounded border; the animation
 * and the reduced-motion fallback live in globals.css (`.node-perimeter-loader`). Purely decorative,
 * so it is hidden from assistive tech — the node's status pill carries the meaning.
 */
export function PerimeterLoader({ active }: { active: boolean }) {
  if (!active) return null;
  return <span aria-hidden className="node-perimeter-loader" />;
}
