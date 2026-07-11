'use client';

import { Handle, NodeResizer, Position, type NodeTypes } from '@xyflow/react';
import { memo } from 'react';
import { FlowNodeCard } from '@/components/nodes/nodeCatalog';
import { useFocusContext } from '@/components/flow/focus-context';
import { ARRANGE_MAX, ARRANGE_MIN } from '@/components/flow/arrange';
import type { NodeKind } from '@/components/flow/graph';

/**
 * React Flow node wrappers. Each renders the shared `FlowNodeCard` (which fills the node element,
 * sized by node.width/height) plus fixed, non-connectable handles positioned so the arrows read
 * cleanly: Upload → Preview horizontal, Preview → Processing angling right, Processing → Results down
 * the right column. Handles are hidden (opacity 0).
 *
 * In the guided flow the size is tweened by FlowCanvas (writing node.width/height). Once the flow
 * completes, arrange mode turns on a `NodeResizer` so the user can resize each card by its corners
 * and edges; its `onResize` asks the canvas to resolve collisions and re-anchor edges.
 */

const HANDLE_STYLE = { opacity: 0 } as const;

/** The corner/edge resize control, shown only in arrange mode. */
function Resizer({ kind }: { kind: NodeKind }) {
  const ctx = useFocusContext();
  const arrangeMode = ctx?.arrangeMode ?? false;
  return (
    <NodeResizer
      isVisible={arrangeMode}
      minWidth={ARRANGE_MIN.width}
      minHeight={ARRANGE_MIN.height}
      maxWidth={ARRANGE_MAX.width}
      maxHeight={ARRANGE_MAX.height}
      onResize={() => ctx?.onCardResize(kind)}
      // Invisible handles/lines: nothing is drawn (no dots, no box), but the 14px hit-areas stay
      // grabbable and the resize cursor still appears on hover.
      handleStyle={{ opacity: 0, border: 'none', background: 'transparent', width: 14, height: 14 }}
      lineStyle={{ opacity: 0, border: 'none' }}
    />
  );
}

const UploadNode = memo(function UploadNode() {
  return (
    <>
      <Resizer kind="upload" />
      <FlowNodeCard kind="upload" draggable />
      <Handle type="source" position={Position.Right} isConnectable={false} style={HANDLE_STYLE} />
    </>
  );
});

const PreviewNode = memo(function PreviewNode() {
  return (
    <>
      <Resizer kind="preview" />
      <Handle type="target" position={Position.Left} isConnectable={false} style={HANDLE_STYLE} />
      <FlowNodeCard kind="preview" draggable />
      <Handle type="source" position={Position.Right} isConnectable={false} style={HANDLE_STYLE} />
    </>
  );
});

const ProcessingNode = memo(function ProcessingNode() {
  return (
    <>
      <Resizer kind="processing" />
      <Handle type="target" position={Position.Left} isConnectable={false} style={HANDLE_STYLE} />
      <FlowNodeCard kind="processing" draggable />
      <Handle type="source" position={Position.Bottom} isConnectable={false} style={HANDLE_STYLE} />
    </>
  );
});

const ResultsNode = memo(function ResultsNode() {
  return (
    <>
      <Resizer kind="results" />
      <Handle type="target" position={Position.Top} isConnectable={false} style={HANDLE_STYLE} />
      <FlowNodeCard kind="results" draggable />
    </>
  );
});

export const nodeTypes: NodeTypes = {
  upload: UploadNode,
  preview: PreviewNode,
  processing: ProcessingNode,
  results: ResultsNode,
};
