import { useMemo } from 'react';
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { FlowNode, FlowEdge } from '../tutorial/types';
import type { StageNodeData } from './CustomNode';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

export function useFlowLayout(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  newNodeIds: string[] = [],
  activeNodeId?: string,
  activeEdgeIds: string[] = [],
  isDimmed = false,
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    if (flowNodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 50, marginx: 40, marginy: 40 });

    for (const node of flowNodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of flowEdges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const activeEdgeSet = new Set(activeEdgeIds);
    const newNodeSet = new Set(newNodeIds);

    const nodes: Node[] = flowNodes.map(fn => {
      const pos = g.node(fn.id);
      return {
        id: fn.id,
        type: 'stageNode',
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
        data: {
          label: fn.label,
          nodeType: fn.type,
          description: fn.description,
          isNew: newNodeSet.has(fn.id),
          isActive: activeNodeId === fn.id,
          isDimmed: isDimmed && activeNodeId !== fn.id,
        } satisfies StageNodeData,
      };
    });

    const edges: Edge[] = flowEdges.map(fe => ({
      id: fe.id,
      source: fe.source,
      target: fe.target,
      label: fe.label,
      animated: fe.animated || activeEdgeSet.has(fe.id),
      style: {
        stroke: activeEdgeSet.has(fe.id)
          ? '#4ade80'
          : isDimmed
            ? '#2e334880'
            : '#2e3348',
        strokeWidth: activeEdgeSet.has(fe.id) ? 2.5 : 1.5,
      },
      labelStyle: { fill: '#6b7280', fontSize: 10 },
    }));

    return { nodes, edges };
  }, [flowNodes, flowEdges, newNodeIds, activeNodeId, activeEdgeIds, isDimmed]);
}
