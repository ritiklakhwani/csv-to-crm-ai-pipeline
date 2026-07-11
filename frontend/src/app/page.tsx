'use client';

import dynamic from 'next/dynamic';
import { CanvasSkeleton } from '@/components/flow/CanvasSkeleton';
import { LayoutActionsProvider } from '@/components/flow/layout-actions';
import { StackedFlow } from '@/components/flow/StackedFlow';
import { ArrangeButton } from '@/components/nav/ArrangeButton';
import { Navbar } from '@/components/nav/Navbar';
import { MachineProvider } from '@/hooks/machine-context';
import { useImportMachine } from '@/hooks/useImportMachine';
import { useMediaQuery, useMounted } from '@/hooks/useMediaQuery';

// The canvas is client-only (React Flow measures the DOM) and heavy, so it is code-split and never
// ships to mobile, which renders the stacked shell instead.
const FlowCanvas = dynamic(() => import('@/components/flow/FlowCanvas'), {
  ssr: false,
  loading: () => <CanvasSkeleton />,
});

export default function Page() {
  const machine = useImportMachine();
  const mounted = useMounted();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <MachineProvider machine={machine}>
      {/* LayoutActionsProvider bridges the standalone Arrange button to the canvas's layout reset. */}
      <LayoutActionsProvider>
        {/* Raised navbar over a carved-in workspace. On desktop the page is a fixed-height flex column
            so the workspace fills the remaining space and the canvas auto-fits into it. */}
        <div className="relative flex min-h-[100dvh] flex-col gap-3 p-3 md:h-[100dvh] md:gap-4 md:overflow-hidden md:p-4">
          <div className="sticky top-3 z-40 md:static">
            {/* Navbar + its companion Arrange pill, grouped and centred (w-fit ⇒ the navbar's own
                mx-auto is a no-op inside, so they sit side by side). */}
            <div className="mx-auto flex w-fit items-center gap-3">
              <Navbar />
              <ArrangeButton />
            </div>
          </div>

          {!mounted ? (
            <div className="workspace-panel workspace-dots relative min-h-0 flex-1 overflow-hidden">
              <CanvasSkeleton />
            </div>
          ) : isDesktop ? (
            <div className="workspace-panel relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-0">
                <FlowCanvas />
              </div>
            </div>
          ) : (
            <div className="workspace-panel workspace-dots min-h-0 flex-1">
              <StackedFlow />
            </div>
          )}
        </div>
      </LayoutActionsProvider>
    </MachineProvider>
  );
}
