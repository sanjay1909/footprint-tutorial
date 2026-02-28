/**
 * ChildrenExecutor.ts
 *
 * WHY: Handles parallel children execution and selector-based branching for the Pipeline.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of parallel execution from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Execute all children in parallel using Promise.allSettled
 * - Execute selected children based on selector output (multi-choice branching)
 * - Handle throttling error flagging for rate-limited operations
 * - Aggregate results into { childId: { result, isError } } structure
 *
 * DESIGN DECISIONS:
 * - Uses Promise.allSettled to ensure all children complete even if some fail
 * - Throttling errors are flagged in context rather than thrown, allowing graceful degradation
 * - Selector validation happens before execution to fail fast on invalid IDs
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates when children are executed
 * - {@link StageContext} - Provides child context creation and patch management
 * - {@link NodeResolver} - Used for node lookup in selector scenarios
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
 */
import { StageContext } from '../../memory/StageContext';
import { PipelineContext, NodeResultType } from '../types';
import type { StageNode, Selector } from '../Pipeline';
/**
 * ExecuteNodeFn
 * ------------------------------------------------------------------
 * Callback type for executing a single node.
 *
 * WHY: Passed from Pipeline to avoid circular dependency. This allows
 * ChildrenExecutor to recursively execute child nodes without importing Pipeline.
 */
export type ExecuteNodeFn<TOut = any, TScope = any> = (node: StageNode<TOut, TScope>, context: StageContext, breakFlag: {
    shouldBreak: boolean;
}, branchPath?: string) => Promise<any>;
/**
 * ChildrenExecutor
 * ------------------------------------------------------------------
 * Handles parallel children execution and selector-based branching.
 *
 * WHY: Centralizes all parallel execution logic in one place, making it easier
 * to understand and test how children are executed during fork operations.
 *
 * DESIGN: Uses PipelineContext for access to throttling checker, enabling
 * dependency injection for testing.
 *
 * @template TOut - Output type of pipeline stages
 * @template TScope - Scope type passed to stages
 *
 * @example
 * ```typescript
 * const executor = new ChildrenExecutor(pipelineContext, executeNodeFn);
 * const results = await executor.executeNodeChildren(node, context);
 * ```
 */
export declare class ChildrenExecutor<TOut = any, TScope = any> {
    private ctx;
    private executeNode;
    constructor(ctx: PipelineContext<TOut, TScope>, executeNode: ExecuteNodeFn<TOut, TScope>);
    /**
     * Execute all children in parallel; always commit each child patch on settle.
     *
     * WHY: Fork nodes need to execute all children concurrently for performance.
     * Using Promise.allSettled ensures all children complete even if some fail,
     * allowing the pipeline to continue with partial results.
     *
     * DESIGN: Aggregates a `{ childId: { result, isError } }` object (similar to
     * `Promise.allSettled`). If `throttlingErrorChecker` is provided, we flag
     * `monitor.isThrottled = true` in the child context when it matches the thrown error.
     *
     * @param node - Parent node containing children to execute
     * @param context - Parent stage context
     * @param parentBreakFlag - Optional break flag to propagate when all children break
     * @param pipelineId - Pipeline ID for child context creation
     * @returns Object mapping child IDs to their results
     *
     * _Requirements: 2.1, 2.3_
     */
    executeNodeChildren(node: StageNode<TOut, TScope>, context: StageContext, parentBreakFlag?: {
        shouldBreak: boolean;
    }, pipelineId?: string): Promise<Record<string, NodeResultType>>;
    /**
     * Execute selected children based on selector result.
     *
     * WHY: Selector enables multi-choice branching where only a subset of children
     * are executed based on runtime conditions. This is more flexible than decider
     * (which picks exactly one) or fork (which executes all).
     *
     * DESIGN: Unlike executeNodeChildren (which executes ALL children), this method:
     * 1. Invokes the selector to determine which children to execute
     * 2. Validates all returned IDs exist in the children array (fail fast)
     * 3. Executes only the selected children in parallel
     * 4. Records selection info in context debug info for visualization
     *
     * @param selector - Function that returns selected child ID(s)
     * @param children - Array of child nodes to select from
     * @param input - Input to pass to the selector function
     * @param context - Current stage context
     * @param branchPath - Pipeline branch path for logging
     * @returns Object mapping child IDs to their results
     *
     * _Requirements: 2.2_
     */
    executeSelectedChildren(selector: Selector, children: StageNode<TOut, TScope>[], input: any, context: StageContext, branchPath: string): Promise<Record<string, NodeResultType>>;
}
