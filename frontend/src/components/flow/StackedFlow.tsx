'use client';

import { ArrowDown } from 'lucide-react';
import { Fragment } from 'react';
import { NODE_ORDER } from '@/components/flow/graph';
import { FlowNodeCard } from '@/components/nodes/nodeCatalog';

/**
 * The mobile shell (<768px). Same four nodes, same content, same state machine — but rendered as
 * full-width cards stacked in flow order instead of a pannable canvas. No drag, no tiny nodes, no
 * horizontal page scroll (each table scrolls inside its own card). A small arrow between cards keeps
 * the flow direction legible without the edges.
 */
export function StackedFlow() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6">
      {NODE_ORDER.map((kind, index) => (
        <Fragment key={kind}>
          <FlowNodeCard kind={kind} />
          {index < NODE_ORDER.length - 1 && (
            <div className="flex justify-center" aria-hidden>
              <ArrowDown className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
