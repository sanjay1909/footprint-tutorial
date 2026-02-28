/**
 * PipelineRuntime - The top-level runtime container for pipeline execution
 * ----------------------------------------------------------------------------
 *  The main entry point for creating and managing a pipeline's execution context.
 *
 *  Think of it like a compiler's runtime environment or a VM instance - it holds:
 *    - The global store (shared state)
 *    - The root stage context (entry point for execution)
 *    - The execution history (for time-travel debugging)
 *
 *  This is what you instantiate when you want to run a pipeline.
 */
import { CommitBundle, ExecutionHistory } from '../../internal/history/ExecutionHistory';
import { GlobalStore } from './GlobalStore';
import { StageContext, StageSnapshot } from './StageContext';
import type { FlowMessage } from '../executor/types';
/**
 * NarrativeEntry - A single entry in the execution narrative
 *
 * Combines stage messages (bullet points) with flow messages (headings)
 * to create a complete storytelling view of the execution.
 *
 * _Requirements: flow-control-narrative REQ-7, REQ-10_
 */
export interface NarrativeEntry {
    /** Unique identifier for linking to flowchart */
    stageId: string;
    /** Stage name */
    stageName: string;
    /** Human-readable display name */
    displayName?: string;
    /** Stage messages (bullet points) */
    stageMessages: string[];
    /** Flow control message (heading) */
    flowMessage?: FlowMessage;
    /** Position in time-traveler */
    timeIndex: number;
}
/**
 * RuntimeSnapshot - Complete snapshot of the pipeline runtime state
 *
 * Used for debugging, visualization, and serialization.
 */
export type RuntimeSnapshot = {
    globalContext: Record<string, unknown>;
    stageContexts: StageSnapshot;
    history: CommitBundle[];
};
/**
 * PipelineRuntime - Top-level container for pipeline execution
 *
 * Creates and manages the global store, root stage context, and execution history.
 * This is the main class you instantiate to run a pipeline.
 */
export declare class PipelineRuntime {
    /** The shared state container */
    globalStore: GlobalStore;
    /** The root stage context (entry point) */
    rootStageContext: StageContext;
    /** The execution history for time-travel */
    executionHistory: ExecutionHistory;
    constructor(rootName: string, defaultValuesForContext?: unknown, initialContext?: unknown);
    /**
     * getPipelines() - Get all pipeline namespaces from the global store
     */
    getPipelines(): any;
    /**
     * setRootObject() - Set a value at the root level
     */
    setRootObject(path: string[], key: string, value: unknown): void;
    /**
     * getSnapshot() - Get a complete snapshot of the runtime state
     *
     * Returns the global state, stage tree, and execution history.
     */
    getSnapshot(): RuntimeSnapshot;
    /**
     * getFullNarrative() - Extract the complete execution narrative in order
     *
     * Walks the stage context tree in execution order and combines:
     * - Stage messages (bullet points from addDebugMessage)
     * - Flow messages (headings from addFlowDebugMessage)
     *
     * This creates a complete storytelling view of the execution that can be:
     * - Displayed in the Semantic View as a progressive story
     * - Sent to LLM as context history
     * - Exported for documentation/debugging
     *
     * _Requirements: flow-control-narrative REQ-7_
     */
    getFullNarrative(): NarrativeEntry[];
    /**
     * walkContextTree() - Walk the stage context tree in execution order
     *
     * Visits nodes in the order they were executed:
     * 1. Visit current node
     * 2. Visit children (parallel branches)
     * 3. Visit next (linear continuation)
     *
     * @param context - The current stage context
     * @param visitor - Callback function for each context
     */
    private walkContextTree;
}
export { PipelineRuntime as TreePipelineContext };
