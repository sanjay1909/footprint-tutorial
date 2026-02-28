/**
 * DeciderHandler.ts
 *
 * WHY: Handles decider evaluation and branching for the Pipeline.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of decider handling from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Execute decider nodes (stage → commit → decider → chosen child)
 * - Create decider scope context when stage function exists
 * - Log flow control decisions for decider branches
 * - Use NodeResolver.getNextNode to pick chosen child
 *
 * DESIGN DECISIONS:
 * - Decider evaluation happens AFTER stage execution (if present)
 * - Decider context is created right before invoking the decider for proper scoping
 * - Flow control messages include rationale when available for debugging
 *
 * DOES NOT HANDLE:
 * - Stage execution (uses runStage callback)
 * - Commit logic (caller handles via context.commitPatch())
 * - Extractor calls (caller handles via callExtractor())
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates when deciders are evaluated
 * - {@link NodeResolver} - Used to pick the chosen child via getNextNode
 * - {@link StageContext} - Used for debug info and context creation
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
 */
import { StageContext } from '../../memory/StageContext';
import type { StageNode } from '../Pipeline';
import type { NodeResolver } from './NodeResolver';
import type { PipelineContext, PipelineStageFunction } from '../types';
/**
 * Callback type for running a stage with commit and extractor.
 *
 * WHY: Used by DeciderHandler to run the optional stage before decider evaluation.
 * This avoids circular dependency with Pipeline.
 */
export type RunStageFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>, stageFunc: PipelineStageFunction<TOut, TScope>, context: StageContext, breakFn: () => void) => Promise<TOut>;
/**
 * Callback type for executing a node.
 *
 * WHY: Used by DeciderHandler to continue execution after choosing a branch.
 * This avoids circular dependency with Pipeline.
 */
export type ExecuteNodeFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>, context: StageContext, breakFlag: {
    shouldBreak: boolean;
}, branchPath?: string) => Promise<any>;
/**
 * Callback type for calling the extractor.
 *
 * WHY: Used by DeciderHandler to call the extractor after stage execution.
 * This avoids circular dependency with Pipeline.
 *
 * @param node - The stage node
 * @param context - The stage context (after commit)
 * @param stagePath - The full path to this stage
 * @param stageOutput - The stage function's return value (undefined on error or no-function nodes)
 *   _Requirements: single-pass-debug-structure 1.3_
 * @param errorInfo - Error details when the stage threw during execution
 *   _Requirements: single-pass-debug-structure 1.4_
 */
export type CallExtractorFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>, context: StageContext, stagePath: string, stageOutput?: unknown, errorInfo?: {
    type: string;
    message: string;
}) => void;
/**
 * Callback type for getting the stage path.
 *
 * WHY: Used by DeciderHandler to generate the stage path for extractor.
 * This avoids circular dependency with Pipeline.
 *
 * @param node - The stage node
 * @param branchPath - The branch path prefix
 * @param contextStageName - Optional stage name from StageContext (includes iteration suffix)
 */
export type GetStagePathFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>, branchPath?: string, contextStageName?: string) => string;
/**
 * DeciderHandler
 * ------------------------------------------------------------------
 * Handles decider evaluation and branching.
 *
 * WHY: Deciders are a common pattern in pipelines for conditional branching.
 * This class centralizes all decider-related logic in one place.
 *
 * DESIGN: Uses callbacks for stage execution and node execution to avoid
 * circular dependencies with Pipeline.
 *
 * @template TOut - The output type of stage functions
 * @template TScope - The scope type passed to stage functions
 *
 * @example
 * ```typescript
 * const handler = new DeciderHandler(pipelineContext, nodeResolver);
 * const result = await handler.handle(node, stageFunc, context, breakFlag, branchPath, ...callbacks);
 * ```
 */
export declare class DeciderHandler<TOut = any, TScope = any> {
    private readonly ctx;
    private readonly nodeResolver;
    constructor(ctx: PipelineContext<TOut, TScope>, nodeResolver: NodeResolver<TOut, TScope>);
    /**
     * Handle a decider node.
     *
     * WHY: Decider nodes need special handling because they:
     * 1. May have an optional stage function that runs first
     * 2. Evaluate a decider function to pick exactly one child
     * 3. Continue execution with only the chosen child
     *
     * DESIGN: Execution order: stage (optional) → commit → decider → chosen child
     *
     * @param node - The decider node (has nextNodeDecider)
     * @param stageFunc - The stage function (may be undefined)
     * @param context - The stage context
     * @param breakFlag - Break flag for propagation
     * @param branchPath - Branch path for logging
     * @param runStage - Callback to run the stage function
     * @param executeNode - Callback to execute the chosen child
     * @param callExtractor - Callback to call the extractor
     * @param getStagePath - Callback to get the stage path
     * @returns The result of executing the chosen child
     *
     * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
     */
    handle(node: StageNode<TOut, TScope>, stageFunc: PipelineStageFunction<TOut, TScope> | undefined, context: StageContext, breakFlag: {
        shouldBreak: boolean;
    }, branchPath: string | undefined, runStage: RunStageFn<TOut, TScope>, executeNode: ExecuteNodeFn<TOut, TScope>, callExtractor: CallExtractorFn<TOut, TScope>, getStagePath: GetStagePathFn<TOut, TScope>): Promise<any>;
    /**
     * Handle a scope-based decider node (created via `addDeciderFunction`).
     *
     * WHY: Scope-based deciders are first-class stage functions — the decider IS the stage.
     * Unlike legacy deciders where the stage and decider are separate invocations,
     * here the stage function receives (scope, breakFn) and returns a branch ID string.
     * This aligns with how LangGraph reads from state and Airflow reads from XCom.
     *
     * DESIGN: Execution order: runStage(fn) → commit → callExtractor → resolve child → log → executeNode(child)
     *
     * Key differences from `handle()`:
     * 1. Stage function is required (it IS the decider)
     * 2. Stage output (string) IS the branch ID — no separate decider invocation
     * 3. Child resolution is direct ID matching against `node.children` with default fallback
     * 4. No `NodeResolver.getNextNode()` call needed
     * 5. No separate `createDecider()` context — the stage context IS the decider context
     *
     * @param node - The decider node (has `deciderFn = true`, `fn` defined, `children` defined)
     * @param stageFunc - The stage function that returns a branch ID string (required)
     * @param context - The stage context
     * @param breakFlag - Break flag for propagation
     * @param branchPath - Branch path for logging
     * @param runStage - Callback to run the stage function
     * @param executeNode - Callback to execute the chosen child
     * @param callExtractor - Callback to call the extractor
     * @param getStagePath - Callback to get the stage path
     * @returns The result of executing the chosen child
     *
     * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5_
     */
    handleScopeBased(node: StageNode<TOut, TScope>, stageFunc: PipelineStageFunction<TOut, TScope>, context: StageContext, breakFlag: {
        shouldBreak: boolean;
    }, branchPath: string | undefined, runStage: RunStageFn<TOut, TScope>, executeNode: ExecuteNodeFn<TOut, TScope>, callExtractor: CallExtractorFn<TOut, TScope>, getStagePath: GetStagePathFn<TOut, TScope>): Promise<any>;
}
