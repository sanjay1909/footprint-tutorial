/**
 * StageRunner.ts
 *
 * WHY: Executes individual stage functions with scope protection and streaming support.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of stage execution from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Create scope via ScopeFactory for each stage
 * - Apply scope protection (createProtectedScope) to intercept direct property assignments
 * - Handle streaming stages (onStart, onToken, onEnd lifecycle)
 * - Handle sync+async safety (only await real Promises to avoid thenable assimilation)
 *
 * DESIGN DECISIONS:
 * - Scope protection is applied at the stage level, not globally, to allow per-stage configuration
 * - Streaming callbacks are created lazily only for streaming stages to minimize overhead
 * - Sync+async safety uses `instanceof Promise` rather than duck-typing to avoid side effects
 *
 * DOES NOT HANDLE:
 * - Commit logic (caller handles via context.commitPatch())
 * - Extractor calls (caller handles via callExtractor())
 * - Break flag propagation (caller checks breakFlag after run)
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates stage execution order and calls StageRunner
 * - {@link StageContext} - Provides stage-scoped state access
 * - {@link createProtectedScope} - Wraps scope to intercept direct assignments
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
 */
import { StageContext } from '../../memory/StageContext';
import type { StageNode } from '../Pipeline';
import type { PipelineContext, PipelineStageFunction } from '../types';
/**
 * StageRunner
 * ------------------------------------------------------------------
 * Runs a single stage function with scope protection and streaming support.
 *
 * WHY: Isolates the complexity of stage execution (scope creation, protection,
 * streaming) from the pipeline traversal logic. This makes both Pipeline and
 * StageRunner easier to test and maintain.
 *
 * DESIGN: Uses PipelineContext for shared state access rather than direct
 * field access, enabling dependency injection for testing.
 *
 * @template TOut - The output type of stage functions
 * @template TScope - The scope type passed to stage functions
 *
 * @example
 * ```typescript
 * const runner = new StageRunner(pipelineContext);
 * const output = await runner.run(node, stageFunc, context, breakFn);
 * ```
 */
export declare class StageRunner<TOut = any, TScope = any> {
    private readonly ctx;
    constructor(ctx: PipelineContext<TOut, TScope>);
    /**
     * Run a single stage function.
     *
     * WHY: Centralizes the stage execution logic including scope creation,
     * protection, and streaming support in one place.
     *
     * DESIGN: The method handles both sync and async stages uniformly by
     * only awaiting real Promises (using instanceof check). This avoids
     * "thenable assimilation" side-effects on arbitrary objects.
     *
     * @param node - The stage node to execute
     * @param stageFunc - The stage function to run
     * @param context - The stage context for state access
     * @param breakFn - Function to call to trigger break (early termination)
     * @returns The stage output (may be undefined for void stages)
     *
     * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
     */
    run(node: StageNode<TOut, TScope>, stageFunc: PipelineStageFunction<TOut, TScope>, context: StageContext, breakFn: () => void): Promise<TOut>;
}
