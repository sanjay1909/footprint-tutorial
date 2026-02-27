import type { BaseState } from 'footprint';

export type NodeType = 'stage' | 'decider' | 'fork';

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

export interface LessonStageDefinition {
  name: string;
  fn: (scope: BaseState) => Promise<unknown>;
  description?: string;
}

export interface CodeSnippet {
  id: string;
  label: string;
  explanation: string;
  code: string;
  highlightLines?: [number, number];
  concept?: { title: string; body: string };
  /** Cumulative nodes visible at this build step */
  nodes: FlowNode[];
  edges: FlowEdge[];
  newNodeIds?: string[];
}

export interface DebuggerLessonConfig {
  id: string;
  title: string;
  subtitle: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  stages: LessonStageDefinition[];
  buildSteps: CodeSnippet[];
  enableNarrative?: boolean;
}

export interface CapturedStageState {
  stageName: string;
  stepNumber: number;
  scopeState: Record<string, unknown>;
  stageOutput: unknown;
  historyIndex: number;
}

export interface LessonExecution {
  stageSnapshots: CapturedStageState[];
  narrativeSentences: string[];
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
}

export type Phase = 'build' | 'execute';
