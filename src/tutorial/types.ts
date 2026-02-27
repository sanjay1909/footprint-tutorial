export type NodeType = 'stage' | 'decider' | 'fork' | 'start' | 'end';

export interface FlowNode {
  id: string;
  label: string;
  type: NodeType;
  description?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface BuildStep {
  id: string;
  label: string;
  explanation: string;
  code: string;
  highlightLines?: [number, number];
  nodes: FlowNode[];
  edges: FlowEdge[];
  newNodeIds?: string[];
  concept?: { title: string; body: string };
}

export interface ExecuteStep {
  id: string;
  label: string;
  activeNodeId: string;
  activeEdgeIds?: string[];
  narrativeLine: string;
  stageOutput?: string;
}

export interface TutorialLesson {
  id: string;
  title: string;
  subtitle: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  buildSteps: BuildStep[];
  executeSteps: ExecuteStep[];
}

export type Phase = 'build' | 'execute';
