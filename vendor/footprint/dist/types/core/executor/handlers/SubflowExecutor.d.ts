/**
 * SubflowExecutor.ts
 *
 * WHY: Handles subflow execution with isolated PipelineRuntime contexts.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of subflow execution from main pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Execute subflows with isolated PipelineRuntime contexts
 * - Handle stage execution within subflow contexts
 * - Execute children within subflow contexts (fork, decider, selector patterns)
 * - Apply input/output mapping for subflows (via SubflowInputMapper)
 *
 * DESIGN DECISIONS:
 * - Each subflow gets its own PipelineRuntime with its own GlobalStore for isolation
 * - Nested subflows are detected and delegated back to executeSubflow for proper isolation
 * - Input mapping seeds the subflow's GlobalStore before execution
 * - Output mapping writes back to parent scope after successful completion
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates when subflows are executed
 * - {@link PipelineRuntime} - Provides isolated context for subflow execution
 * - {@link SubflowInputMapper} - Handles input/output mapping between parent and subflow
 * - {@link NodeResolver} - Resolves subflow references and node lookups
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
 * _Requirements: subflow-input-mapping 8.5_
 */
import { StageContext } from '../../memory/StageContext';
import { PipelineContext, SubflowResult, PipelineStageFunction } from '../types';
import type { StageNode } from '../Pipeline';
import { NodeResolver } from './NodeResolver';
/**
 * ExecuteStageFn
 * ------------------------------------------------------------------
 * Callback type for executing a stage function.
 *
 * WHY: Passed from Pipeline to avoid circular dependency. This allows
 * SubflowExecutor to execute stages without importing Pipeline.
 */
export type ExecuteStageFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>, stageFunc: PipelineStageFunction<TOut, TScope>, context: StageContext, breakFn: () => void) => Promise<TOut>;
/**
 * CallExtractorFn
 * ------------------------------------------------------------------
 * Callback type for calling the traversal extractor.
 *
 * WHY: Passed from Pipeline to avoid circular dependency. This allows
 * SubflowExecutor to call the extractor without importing Pipeline.
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
 * GetStageFnFn
 * ------------------------------------------------------------------
 * Callback type for getting a stage function from the stage map.
 *
 * WHY: Passed from Pipeline to avoid circular dependency. This allows
 * SubflowExecutor to resolve stage functions without importing Pipeline.
 */
export type GetStageFnFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>) => PipelineStageFunction<TOut, TScope> | undefined;
/**
 * SubflowExecutor
 * ------------------------------------------------------------------
 * Handles subflow execution with isolated PipelineRuntime contexts.
 *
 * WHY: Subflows need their own isolated context to prevent state pollution
 * between the parent pipeline and the subflow. This class manages that isolation
 * while still allowing data to flow between parent and subflow via input/output mapping.
 *
 * DESIGN: Uses PipelineContext for access to shared pipeline state, enabling
 * dependency injection for testing.
 *
 * @template TOut - Output type of pipeline stages
 * @template TScope - Scope type passed to stages
 *
 * @example
 * ```typescript
 * const executor = new SubflowExecutor(ctx, nodeResolver, executeStage, callExtractor, getStageFn);
 * const result = await executor.executeSubflow(subflowNode, parentContext, breakFlag, branchPath, resultsMap);
 * ```
 */
export declare class SubflowExecutor<TOut = any, TScope = any> {
    private ctx;
    private nodeResolver;
    private executeStage;
    private callExtractor;
    private getStageFn;
    /**
     * The current subflow's PipelineContext.
     * Set during executeSubflow and used by executeSubflowInternal for stage execution.
     * This ensures stages within the subflow use the subflow's readOnlyContext.
     * _Requirements: subflow-scope-isolation 1.3, 2.2_
     */
    private currentSubflowCtx?;
    constructor(ctx: PipelineContext<TOut, TScope>, nodeResolver: NodeResolver<TOut, TScope>, executeStage: ExecuteStageFn<TOut, TScope>, callExtractor: CallExtractorFn<TOut, TScope>, getStageFn: GetStageFnFn<TOut, TScope>);
    /**
     * Execute a subflow with isolated context.
     *
     * WHY: Subflows need their own PipelineRuntime to prevent state pollution.
     * This method creates the isolated context, applies input mapping, executes
     * the subflow, and applies output mapping.
     *
     * DESIGN: This method:
     * 1. Creates a fresh PipelineRuntime for the subflow
     * 2. Applies input mapping to seed the subflow's GlobalStore
     * 3. Executes the subflow's internal structure using the nested context
     * 4. Applies output mapping to write results back to parent scope
     * 5. Stores the subflow's execution data for debugging/visualization
     *
     * IMPORTANT: The subflow's `next` chain is NOT executed inside the subflow.
     * After executeSubflow returns, the parent's executeNode continues with node.next.
     * This ensures stages after a subflow execute in the parent's context.
     *
     * @param subflowRoot - The subflow root node (has isSubflowRoot: true)
     * @param parentContext - The parent pipeline's StageContext
     * @param breakFlag - Break flag from parent (subflow break doesn't propagate up)
     * @param branchPath - Parent's branch path for logging
     * @param subflowResultsMap - Map to store subflow results (from parent Pipeline)
     * @returns The subflow's final output
     *
     * _Requirements: 1.1, 1.5_
     */
    executeSubflow(node: StageNode<TOut, TScope>, parentContext: StageContext, breakFlag: {
        shouldBreak: boolean;
    }, branchPath: string | undefined, subflowResultsMap: Map<string, SubflowResult>): Promise<any>;
    /**
     * Reference to the current subflow's root node.
     * Used for node resolution within the subflow's structure (e.g., dynamic next loop-back).
     */
    private currentSubflowRoot?;
    /**
     * Internal execution within subflow context.
     *
     * WHY: This method mirrors Pipeline.executeNode but operates within the subflow's
     * isolated PipelineRuntime. It handles all the same patterns (stage execution,
     * children, decider, selector, linear next) but within the subflow's context.
     *
     * DESIGN: Handles:
     * - Nested subflow detection (delegates back to executeSubflow)
     * - Stage function execution
     * - Children execution (fork, decider, selector patterns)
     * - Linear next continuation
     *
     * @param node - The current node to execute within the subflow
     * @param context - The subflow's stage context
     * @param breakFlag - Break flag for the subflow (doesn't propagate to parent)
     * @param branchPath - Branch path for logging
     * @returns Promise resolving to the stage output or children results
     *
     * _Requirements: 1.2_
     */
    private executeSubflowInternal;
    /**
     * Generate the stage path for extractor results.
     * Uses contextStageName (which includes iteration suffix) when it differs from base name.
     */
    private getStagePath;
    /**
     * Reference to the subflow results map from the parent Pipeline.
     */
    private subflowResultsMap?;
    /**
     * Execute children within a subflow's context.
     *
     * WHY: Similar to ChildrenExecutor.executeNodeChildren but uses executeSubflowInternal
     * for recursion, ensuring nested subflows are properly detected.
     *
     * @param node - Parent node containing children to execute
     * @param context - Current stage context within the subflow
     * @param branchPath - Branch path for logging
     * @param breakFlag - Break flag for the subflow
     * @returns Object mapping child IDs to their results
     *
     * _Requirements: 1.3_
     */
    private executeNodeChildrenInternal;
    /**
     * Execute selected children within a subflow's context.
     *
     * WHY: Similar to ChildrenExecutor.executeSelectedChildren but uses executeSubflowInternal
     * for recursion, ensuring nested subflows are properly detected.
     *
     * @param selector - Function that returns selected child ID(s)
     * @param children - Array of child nodes to select from
     * @param input - Input to pass to the selector function
     * @param context - Current stage context within the subflow
     * @param branchPath - Branch path for logging
     * @param breakFlag - Break flag for the subflow
     * @returns Object mapping child IDs to their results
     *
     * _Requirements: 1.4_
     */
    private executeSelectedChildrenInternal;
}
