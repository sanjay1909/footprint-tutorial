/**
 * FlowChartExecutor.ts
 *
 * Runtime engine that executes a compiled FlowChart.
 * This is the public API wrapper around the internal Pipeline class.
 *
 * FlowChartExecutor provides a cleaner API by accepting a FlowChart object
 * (output of FlowChartBuilder.build()) instead of separate root/stageMap parameters.
 *
 * Usage:
 *   const chart = flowChart('entry', entryFn)
 *     .addFunction('process', processFn)
 *     .build();
 *
 *   const executor = new FlowChartExecutor(chart, scopeFactory);
 *   const result = await executor.run();
 */
import { StageNode, Decider, Selector, isStageNodeReturn } from './Pipeline';
import type { PipelineStageFunction, StreamHandlers, TreeOfFunctionsResponse, TraversalExtractor, SubflowResult, ExtractorError } from './types';
import type { ScopeFactory } from '../memory/types';
import type { PipelineRuntime, RuntimeSnapshot } from '../memory/PipelineRuntime';
import type { ScopeProtectionMode } from '../../scope/protection/types';
import type { SerializedPipelineStructure } from '../builder/FlowChartBuilder';
/**
 * Compiled flowchart ready for execution.
 * This is the output of FlowChartBuilder.build().
 */
export type FlowChart<TOut = any, TScope = any> = {
    /** Root node of the flowchart tree */
    root: StageNode<TOut, TScope>;
    /** Map of stage names to their functions */
    stageMap: Map<string, PipelineStageFunction<TOut, TScope>>;
    /** Optional traversal extractor for data extraction */
    extractor?: TraversalExtractor;
    /** Memoized subflow definitions (key → subflow root). Used for reference-based subflows. */
    subflows?: Record<string, {
        root: StageNode<TOut, TScope>;
    }>;
    /**
     * Whether to enrich StageSnapshots with scope state, debug metadata,
     * stage output, and history index during traversal.
     *
     * WHY: When enabled, the extractor receives full stage data during traversal,
     * eliminating the need for a redundant post-traversal walk via
     * PipelineRuntime.getSnapshot().
     *
     * DESIGN: Opt-in at build time so FlowChartBuilder can set this flag.
     * FlowChartExecutor reads this value and passes it through to Pipeline.
     *
     * _Requirements: single-pass-debug-structure 4.1, 4.4_
     */
    enrichSnapshots?: boolean;
    /**
     * Whether narrative generation is enabled at build time.
     *
     * WHY: Allows consumers to enable narrative at build time via FlowChartBuilder,
     * so the FlowChartExecutor can respect it as a default without requiring
     * an explicit enableNarrative() call.
     *
     * DESIGN: FlowChartExecutor reads this as a default for narrativeEnabled.
     * An explicit enableNarrative() call on the executor takes precedence.
     *
     * _Requirements: pipeline-narrative-generation 1.4_
     */
    enableNarrative?: boolean;
    /**
     * Static build-time pipeline structure from FlowChartBuilder.
     *
     * WHY: Passed through to Pipeline so it can deep-clone into
     * runtimePipelineStructure for runtime structure tracking.
     *
     * _Requirements: runtime-pipeline-structure 1.1_
     */
    buildTimeStructure?: SerializedPipelineStructure;
};
/**
 * FlowChartExecutor
 * ------------------------------------------------------------------
 * Runtime engine that executes a compiled FlowChart.
 * Renamed from Pipeline for API consistency with FlowChartBuilder.
 *
 * The executor accepts a FlowChart object (from FlowChartBuilder.build())
 * and provides methods to run the flowchart and inspect results.
 *
 * @example
 * ```typescript
 * // Build a flowchart
 * const chart = flowChart('entry', entryFn)
 *   .addFunction('process', processFn)
 *   .build();
 *
 * // Create executor and run
 * const executor = new FlowChartExecutor(chart, scopeFactory);
 * const result = await executor.run();
 *
 * // Access execution data
 * const contextTree = executor.getContextTree();
 * const extractedData = executor.getExtractedResults();
 * ```
 */
export declare class FlowChartExecutor<TOut = any, TScope = any> {
    private pipeline;
    /**
     * Whether narrative generation is enabled for the next run.
     *
     * WHY: Opt-in flag so production pipelines pay zero cost when narrative
     * is not needed. Debug/agent contexts call enableNarrative() before run().
     *
     * DESIGN: Stored as a field so enableNarrative() can be called after
     * construction but before run(). The flag is passed to the Pipeline
     * constructor when run() creates the execution engine.
     *
     * _Requirements: 1.1, 1.2_
     */
    private narrativeEnabled;
    /**
     * Stored constructor arguments for pipeline recreation.
     *
     * WHY: enableNarrative() is called after construction but before run().
     * We need to recreate the Pipeline with the narrative flag when run()
     * is called. These stored args allow that recreation.
     */
    private readonly flowChartArgs;
    /**
     * Create a new FlowChartExecutor.
     *
     * @param flowChart - Compiled flowchart from FlowChartBuilder.build()
     * @param scopeFactory - Factory function to create scope instances for each stage
     * @param defaultValuesForContext - Optional default values for the context
     * @param initialContext - Optional initial context values
     * @param readOnlyContext - Optional read-only context values
     * @param throttlingErrorChecker - Optional function to detect throttling errors
     * @param streamHandlers - Optional handlers for streaming stages
     * @param scopeProtectionMode - Optional protection mode for scope access ('error' | 'warn' | 'off', default: 'error')
     * @param enrichSnapshots - Optional flag to enrich StageSnapshots with scope state,
     *   debug metadata, stage output, and history index during traversal. When enabled,
     *   the extractor receives full stage data, eliminating the need for a redundant
     *   post-traversal walk via PipelineRuntime.getSnapshot(). Overrides
     *   flowChart.enrichSnapshots if both are set.
     *
     *   _Requirements: single-pass-debug-structure 4.4_
     */
    constructor(flowChart: FlowChart<TOut, TScope>, scopeFactory: ScopeFactory<TScope>, defaultValuesForContext?: unknown, initialContext?: unknown, readOnlyContext?: unknown, throttlingErrorChecker?: (error: unknown) => boolean, streamHandlers?: StreamHandlers, scopeProtectionMode?: ScopeProtectionMode, enrichSnapshots?: boolean);
    /**
     * Creates a Pipeline instance from stored constructor arguments.
     *
     * WHY: Extracted to a helper so both the constructor and run() can
     * create a pipeline. run() recreates the pipeline when enableNarrative()
     * was called after construction, ensuring the narrative flag is passed
     * to the Pipeline constructor.
     */
    private createPipeline;
    /**
     * Enable narrative generation for the next run.
     *
     * WHY: Opt-in to avoid runtime cost in production pipelines.
     * Debug/agent contexts turn it on for LLM context engineering.
     * When enabled, the pipeline produces a human-readable story
     * as a first-class output alongside execution data.
     *
     * DESIGN: Sets a flag that is passed to the Pipeline constructor
     * when run() is called. The Pipeline then creates a real
     * NarrativeGenerator instead of the no-op NullNarrativeGenerator.
     *
     * @example
     * ```typescript
     * const executor = new FlowChartExecutor(chart, scopeFactory);
     * executor.enableNarrative();
     * await executor.run();
     * const story = executor.getNarrative();
     * // → ["The process began with validate input.", "Next, it moved on to process data.", ...]
     * ```
     *
     * _Requirements: 1.1_
     */
    enableNarrative(): void;
    /**
     * Returns the narrative sentences from the last execution.
     *
     * WHY: Provides access to the human-readable execution story
     * for LLM context, logging, or display. Returns empty array
     * when narrative was not enabled — zero cost for production.
     *
     * @returns Ordered array of narrative sentences, or empty array if disabled
     *
     * @example
     * ```typescript
     * executor.enableNarrative();
     * await executor.run();
     * const sentences = executor.getNarrative();
     * // → ["The process began with validate input.", ...]
     * ```
     *
     * _Requirements: 2.1, 2.3_
     */
    getNarrative(): string[];
    /**
     * Execute the flowchart and return results.
     * This is the primary method for running a flowchart.
     *
     * WHY: Recreates the pipeline before execution to ensure the
     * narrativeEnabled flag (set via enableNarrative()) is passed
     * to the Pipeline constructor.
     *
     * @returns Promise resolving to the execution result
     */
    run(): Promise<TreeOfFunctionsResponse>;
    /**
     * Returns the full context tree (global + stage contexts) for observability panels.
     *
     * WHY: This is the legacy introspection API that walks the StageContext linked
     * list after execution to reconstruct scope and debug data for each stage.
     *
     * DESIGN: This performs a post-traversal walk (Pass 2) of the StageContext
     * linked list built during execution. For new integrations that need per-stage
     * scope state and debug metadata, prefer enabling `enrichSnapshots: true` and
     * using {@link getEnrichedResults} instead — it captures the same data
     * incrementally during traversal (Pass 1), eliminating the redundant walk.
     *
     * @returns RuntimeSnapshot containing global context and per-stage data
     *
     * @see {@link getEnrichedResults} for the single-pass alternative
     */
    getContextTree(): RuntimeSnapshot;
    /**
     * Returns the PipelineRuntime (root holder of StageContexts).
     */
    getContext(): PipelineRuntime;
    /**
     * Sets a root object value into the global context (utility).
     */
    setRootObject(path: string[], key: string, value: unknown): void;
    /**
     * Returns pipeline ids inherited under this root (for debugging fan-out).
     */
    getInheritedPipelines(): string[];
    /**
     * Returns the current pipeline root node (including runtime modifications).
     *
     * This is useful for serializing the pipeline structure after execution,
     * which includes any dynamic children or loop targets added at runtime.
     */
    getRuntimeRoot(): StageNode;
    /**
     * Returns the complete runtime pipeline structure including dynamic updates.
     *
     * WHY: This is the authoritative structure for visualization — no external
     * reconstruction needed. Delegates to Pipeline.getRuntimePipelineStructure().
     *
     * _Requirements: runtime-pipeline-structure 6.1_
     */
    getRuntimePipelineStructure(): SerializedPipelineStructure | undefined;
    /**
     * Returns the collected SubflowResultsMap after execution.
     * Used by the service layer to include subflow data in API responses.
     */
    getSubflowResults(): Map<string, SubflowResult>;
    /**
     * Returns the collected extracted results after execution.
     * Map keys are stage paths (e.g., "root.child.grandchild").
     */
    getExtractedResults<TResult = unknown>(): Map<string, TResult>;
    /**
     * Returns the enriched extracted results after execution.
     * Convenience method that returns getExtractedResults() with a type hint.
     *
     * WHY: Provides a semantic API for consumers who enabled enrichSnapshots
     * and want to access the incrementally-built debug structure. Under the hood,
     * this is the same Map as getExtractedResults() — the enrichment data is
     * included in the extractor results when enrichSnapshots is enabled.
     *
     * DESIGN: This is a thin delegation to pipeline.getExtractedResults().
     * The enrichment data (scopeState, debugInfo, stageOutput, historyIndex)
     * is captured during traversal by callExtractor() when enrichSnapshots
     * is true, and stored in the same extractedResults Map. This method
     * simply provides a clearer name and type hint for that use case.
     *
     * @typeParam TResult - The expected shape of each enriched result entry.
     *   Defaults to `unknown`. Consumers typically narrow this to their
     *   extractor's return type which includes enrichment fields.
     * @returns Map of stage paths to enriched result entries
     *
     * @example
     * ```typescript
     * const executor = new FlowChartExecutor(chart, scopeFactory, undefined, undefined, undefined, undefined, undefined, undefined, true);
     * await executor.run();
     * const enriched = executor.getEnrichedResults<MyEnrichedType>();
     * ```
     *
     * _Requirements: single-pass-debug-structure 5.1, 5.2_
     */
    getEnrichedResults<TResult = unknown>(): Map<string, TResult>;
    /**
     * Returns any errors that occurred during extraction.
     * Useful for debugging extractor issues.
     */
    getExtractorErrors(): ExtractorError[];
}
export { StageNode, Decider, Selector, isStageNodeReturn };
