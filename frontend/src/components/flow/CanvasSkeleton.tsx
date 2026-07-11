/**
 * Shown while the React Flow canvas chunk loads (dynamically imported, SSR off). It sits inside the
 * carved workspace panel, which supplies the dotted background, so this only echoes a few floating
 * placeholder cards to keep the swap to the real canvas calm.
 */
export function CanvasSkeleton() {
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden" aria-hidden>
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-10">
        {[300, 220, 260].map((height, index) => (
          <div key={index} className="node-shell animate-pulse" style={{ width: 240, height }} />
        ))}
      </div>
    </div>
  );
}
