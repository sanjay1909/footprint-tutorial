import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { StageNode } from './CustomNode';

const nodeTypes = { stageNode: StageNode };

interface FlowchartInnerProps {
  nodes: Node[];
  edges: Edge[];
}

function FlowchartInner({ nodes, edges }: FlowchartInnerProps) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    // Small delay to let nodes render before fitting
    const t = setTimeout(() => fitView({ padding: 0.3, duration: 400 }), 50);
    return () => clearTimeout(t);
  }, [nodes.length, fitView]);

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-30">{ }</div>
          <p>Flowchart will appear as you add stages</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="#1a1d27" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

interface FlowchartPanelProps {
  nodes: Node[];
  edges: Edge[];
}

export function FlowchartPanel({ nodes, edges }: FlowchartPanelProps) {
  return (
    <div className="flex-1 bg-bg">
      <ReactFlowProvider>
        <FlowchartInner nodes={nodes} edges={edges} />
      </ReactFlowProvider>
    </div>
  );
}
