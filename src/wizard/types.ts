import type { BaseState } from 'footprint';

// Reuse FlowNode/FlowEdge from debugger (same shape)
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

// ─── Panel Slots ──────────────────────────────────────────────

/** Which content fills each side of the 2-panel carousel */
export type PanelSlot = 'code' | 'flowchart' | 'memory' | 'observe';

// ─── Steps ────────────────────────────────────────────────────

export interface WizardStep {
  id: string;
  label: string;
  explanation: string;
  /** Code to show in CodePanel (when code slot is visible) */
  code?: string;
  highlightLines?: [number, number];
  concept?: { title: string; body: string };
  /** Flowchart state at this step */
  nodes: FlowNode[];
  edges: FlowEdge[];
  newNodeIds?: string[];
  /** Active node during execution replay */
  activeNodeId?: string;
  activeEdgeIds?: string[];
}

// ─── Phases ───────────────────────────────────────────────────

export interface LessonStageDefinition {
  name: string;
  fn: (scope: BaseState) => Promise<unknown>;
  description?: string;
}

interface PhaseBase {
  id: string;
  title: string;
  left: PanelSlot;
  right: PanelSlot;
  transition: 'none' | 'slide-left' | 'fade';
}

export interface StaticPhase extends PhaseBase {
  kind: 'static';
  steps: WizardStep[];
}

export interface RunPhase extends PhaseBase {
  kind: 'run';
  stages: LessonStageDefinition[];
  enableNarrative?: boolean;
  steps: WizardStep[]; // Populated from execution results
}

export type WizardPhase = StaticPhase | RunPhase;

// ─── Chapters ─────────────────────────────────────────────────

export interface WizardChapter {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: 'accent' | 'green' | 'orange' | 'cyan';
  phases: WizardPhase[];
}

// ─── Execution Result ─────────────────────────────────────────

export interface CapturedStageState {
  stageName: string;
  stepNumber: number;
  scopeState: Record<string, unknown>;
  stageOutput: unknown;
  historyIndex: number;
}

export interface ExecutionResult {
  stageSnapshots: CapturedStageState[];
  narrativeSentences: string[];
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
}
