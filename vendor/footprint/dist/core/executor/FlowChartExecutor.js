"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStageNodeReturn = exports.FlowChartExecutor = void 0;
const Pipeline_1 = require("./Pipeline");
Object.defineProperty(exports, "isStageNodeReturn", { enumerable: true, get: function () { return Pipeline_1.isStageNodeReturn; } });
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
class FlowChartExecutor {
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
    constructor(flowChart, scopeFactory, defaultValuesForContext, initialContext, readOnlyContext, throttlingErrorChecker, streamHandlers, scopeProtectionMode, enrichSnapshots) {
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
        this.narrativeEnabled = false;
        // Store constructor args for pipeline recreation when enableNarrative() is called.
        // WHY: enableNarrative() is called after construction but before run().
        // We need these args to recreate the Pipeline with the narrative flag.
        this.flowChartArgs = {
            flowChart,
            scopeFactory,
            defaultValuesForContext,
            initialContext,
            readOnlyContext,
            throttlingErrorChecker,
            streamHandlers,
            scopeProtectionMode,
            enrichSnapshots,
        };
        // Extract components from FlowChart and create internal Pipeline
        // WHY: enrichSnapshots can be set either via the constructor param (runtime override)
        // or via flowChart.enrichSnapshots (build-time default). Constructor param takes precedence.
        this.pipeline = this.createPipeline();
    }
    /**
     * Creates a Pipeline instance from stored constructor arguments.
     *
     * WHY: Extracted to a helper so both the constructor and run() can
     * create a pipeline. run() recreates the pipeline when enableNarrative()
     * was called after construction, ensuring the narrative flag is passed
     * to the Pipeline constructor.
     */
    createPipeline() {
        var _a, _b;
        const args = this.flowChartArgs;
        // Resolve narrative flag: explicit enableNarrative() call takes precedence,
        // otherwise fall back to the build-time flag from FlowChart.
        // WHY: Consumers can enable narrative either at build time (via FlowChartBuilder)
        // or at runtime (via enableNarrative()). Runtime override wins.
        // _Requirements: pipeline-narrative-generation 1.4_
        const narrativeFlag = this.narrativeEnabled || ((_a = args.flowChart.enableNarrative) !== null && _a !== void 0 ? _a : false);
        return new Pipeline_1.Pipeline(args.flowChart.root, args.flowChart.stageMap, args.scopeFactory, args.defaultValuesForContext, args.initialContext, args.readOnlyContext, args.throttlingErrorChecker, args.streamHandlers, args.flowChart.extractor, args.scopeProtectionMode, args.flowChart.subflows, (_b = args.enrichSnapshots) !== null && _b !== void 0 ? _b : args.flowChart.enrichSnapshots, narrativeFlag, args.flowChart.buildTimeStructure);
    }
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
    enableNarrative() {
        this.narrativeEnabled = true;
    }
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
    getNarrative() {
        return this.pipeline.getNarrative();
    }
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
    async run() {
        // Recreate pipeline to pick up any enableNarrative() calls made after construction
        this.pipeline = this.createPipeline();
        return await this.pipeline.execute();
    }
    // ───────────────────────── Introspection Methods ─────────────────────────
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
    getContextTree() {
        return this.pipeline.getContextTree();
    }
    /**
     * Returns the PipelineRuntime (root holder of StageContexts).
     */
    getContext() {
        return this.pipeline.getContext();
    }
    /**
     * Sets a root object value into the global context (utility).
     */
    setRootObject(path, key, value) {
        this.pipeline.setRootObject(path, key, value);
    }
    /**
     * Returns pipeline ids inherited under this root (for debugging fan-out).
     */
    getInheritedPipelines() {
        return this.pipeline.getInheritedPipelines();
    }
    /**
     * Returns the current pipeline root node (including runtime modifications).
     *
     * This is useful for serializing the pipeline structure after execution,
     * which includes any dynamic children or loop targets added at runtime.
     */
    getRuntimeRoot() {
        return this.pipeline.getRuntimeRoot();
    }
    /**
     * Returns the complete runtime pipeline structure including dynamic updates.
     *
     * WHY: This is the authoritative structure for visualization — no external
     * reconstruction needed. Delegates to Pipeline.getRuntimePipelineStructure().
     *
     * _Requirements: runtime-pipeline-structure 6.1_
     */
    getRuntimePipelineStructure() {
        return this.pipeline.getRuntimePipelineStructure();
    }
    /**
     * Returns the collected SubflowResultsMap after execution.
     * Used by the service layer to include subflow data in API responses.
     */
    getSubflowResults() {
        return this.pipeline.getSubflowResults();
    }
    /**
     * Returns the collected extracted results after execution.
     * Map keys are stage paths (e.g., "root.child.grandchild").
     */
    getExtractedResults() {
        return this.pipeline.getExtractedResults();
    }
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
    getEnrichedResults() {
        return this.pipeline.getExtractedResults();
    }
    /**
     * Returns any errors that occurred during extraction.
     * Useful for debugging extractor issues.
     */
    getExtractorErrors() {
        return this.pipeline.getExtractorErrors();
    }
}
exports.FlowChartExecutor = FlowChartExecutor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRmxvd0NoYXJ0RXhlY3V0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9GbG93Q2hhcnRFeGVjdXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7OztBQUVILHlDQUF1RjtBQW1aaEQsa0dBblpVLDRCQUFpQixPQW1aVjtBQWpWeEQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXdCRztBQUNILE1BQWEsaUJBQWlCO0lBb0M1Qjs7Ozs7Ozs7Ozs7Ozs7Ozs7O09Ba0JHO0lBQ0gsWUFDRSxTQUFrQyxFQUNsQyxZQUFrQyxFQUNsQyx1QkFBaUMsRUFDakMsY0FBd0IsRUFDeEIsZUFBeUIsRUFDekIsc0JBQW9ELEVBQ3BELGNBQStCLEVBQy9CLG1CQUF5QyxFQUN6QyxlQUF5QjtRQTdEM0I7Ozs7Ozs7Ozs7O1dBV0c7UUFDSyxxQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFtRC9CLG1GQUFtRjtRQUNuRix3RUFBd0U7UUFDeEUsdUVBQXVFO1FBQ3ZFLElBQUksQ0FBQyxhQUFhLEdBQUc7WUFDbkIsU0FBUztZQUNULFlBQVk7WUFDWix1QkFBdUI7WUFDdkIsY0FBYztZQUNkLGVBQWU7WUFDZixzQkFBc0I7WUFDdEIsY0FBYztZQUNkLG1CQUFtQjtZQUNuQixlQUFlO1NBQ2hCLENBQUM7UUFFRixpRUFBaUU7UUFDakUsc0ZBQXNGO1FBQ3RGLDZGQUE2RjtRQUM3RixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNLLGNBQWM7O1FBQ3BCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7UUFDaEMsNEVBQTRFO1FBQzVFLDZEQUE2RDtRQUM3RCxrRkFBa0Y7UUFDbEYsZ0VBQWdFO1FBQ2hFLG9EQUFvRDtRQUNwRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMs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Rmxvd0NoYXJ0RXhlY3V0b3IudHNcbiAqXG4gKiBSdW50aW1lIGVuZ2luZSB0aGF0IGV4ZWN1dGVzIGEgY29tcGlsZWQgRmxvd0NoYXJ0LlxuICogVGhpcyBpcyB0aGUgcHVibGljIEFQSSB3cmFwcGVyIGFyb3VuZCB0aGUgaW50ZXJuYWwgUGlwZWxpbmUgY2xhc3MuXG4gKlxuICogRmxvd0NoYXJ0RXhlY3V0b3IgcHJvdmlkZXMgYSBjbGVhbmVyIEFQSSBieSBhY2NlcHRpbmcgYSBGbG93Q2hhcnQgb2JqZWN0XG4gKiAob3V0cHV0IG9mIEZsb3dDaGFydEJ1aWxkZXIuYnVpbGQoKSkgaW5zdGVhZCBvZiBzZXBhcmF0ZSByb290L3N0YWdlTWFwIHBhcmFtZXRlcnMuXG4gKlxuICogVXNhZ2U6XG4gKiAgIGNvbnN0IGNoYXJ0ID0gZmxvd0NoYXJ0KCdlbnRyeScsIGVudHJ5Rm4pXG4gKiAgICAgLmFkZEZ1bmN0aW9uKCdwcm9jZXNzJywgcHJvY2Vzc0ZuKVxuICogICAgIC5idWlsZCgpO1xuICpcbiAqICAgY29uc3QgZXhlY3V0b3IgPSBuZXcgRmxvd0NoYXJ0RXhlY3V0b3IoY2hhcnQsIHNjb3BlRmFjdG9yeSk7XG4gKiAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dG9yLnJ1bigpO1xuICovXG5cbmltcG9ydCB7IFBpcGVsaW5lLCBTdGFnZU5vZGUsIERlY2lkZXIsIFNlbGVjdG9yLCBpc1N0YWdlTm9kZVJldHVybiB9IGZyb20gJy4vUGlwZWxpbmUnO1xuaW1wb3J0IHR5cGUge1xuICBQaXBlbGluZVN0YWdlRnVuY3Rpb24sXG4gIFN0cmVhbUhhbmRsZXJzLFxuICBUcmVlT2ZGdW5jdGlvbnNSZXNwb25zZSxcbiAgVHJhdmVyc2FsRXh0cmFjdG9yLFxuICBTdWJmbG93UmVzdWx0LFxuICBFeHRyYWN0b3JFcnJvcixcbn0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFNjb3BlRmFjdG9yeSB9IGZyb20gJy4uL21lbW9yeS90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBpcGVsaW5lUnVudGltZSwgUnVudGltZVNuYXBzaG90IH0gZnJvbSAnLi4vbWVtb3J5L1BpcGVsaW5lUnVudGltZSc7XG5pbXBvcnQgdHlwZSB7IFNjb3BlUHJvdGVjdGlvbk1vZGUgfSBmcm9tICcuLi8uLi9zY29wZS9wcm90ZWN0aW9uL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlIH0gZnJvbSAnLi4vYnVpbGRlci9GbG93Q2hhcnRCdWlsZGVyJztcblxuLyoqXG4gKiBDb21waWxlZCBmbG93Y2hhcnQgcmVhZHkgZm9yIGV4ZWN1dGlvbi5cbiAqIFRoaXMgaXMgdGhlIG91dHB1dCBvZiBGbG93Q2hhcnRCdWlsZGVyLmJ1aWxkKCkuXG4gKi9cbmV4cG9ydCB0eXBlIEZsb3dDaGFydDxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+ID0ge1xuICAvKiogUm9vdCBub2RlIG9mIHRoZSBmbG93Y2hhcnQgdHJlZSAqL1xuICByb290OiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPjtcbiAgLyoqIE1hcCBvZiBzdGFnZSBuYW1lcyB0byB0aGVpciBmdW5jdGlvbnMgKi9cbiAgc3RhZ2VNYXA6IE1hcDxzdHJpbmcsIFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+PjtcbiAgLyoqIE9wdGlvbmFsIHRyYXZlcnNhbCBleHRyYWN0b3IgZm9yIGRhdGEgZXh0cmFjdGlvbiAqL1xuICBleHRyYWN0b3I/OiBUcmF2ZXJzYWxFeHRyYWN0b3I7XG4gIC8qKiBNZW1vaXplZCBzdWJmbG93IGRlZmluaXRpb25zIChrZXkg4oaSIHN1YmZsb3cgcm9vdCkuIFVzZWQgZm9yIHJlZmVyZW5jZS1iYXNlZCBzdWJmbG93cy4gKi9cbiAgc3ViZmxvd3M/OiBSZWNvcmQ8c3RyaW5nLCB7IHJvb3Q6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+IH0+O1xuICAvKipcbiAgICogV2hldGhlciB0byBlbnJpY2ggU3RhZ2VTbmFwc2hvdHMgd2l0aCBzY29wZSBzdGF0ZSwgZGVidWcgbWV0YWRhdGEsXG4gICAqIHN0YWdlIG91dHB1dCwgYW5kIGhpc3RvcnkgaW5kZXggZHVyaW5nIHRyYXZlcnNhbC5cbiAgICpcbiAgICogV0hZOiBXaGVuIGVuYWJsZWQsIHRoZSBleHRyYWN0b3IgcmVjZWl2ZXMgZnVsbCBzdGFnZSBkYXRhIGR1cmluZyB0cmF2ZXJzYWwsXG4gICAqIGVsaW1pbmF0aW5nIHRoZSBuZWVkIGZvciBhIHJlZHVuZGFudCBwb3N0LXRyYXZlcnNhbCB3YWxrIHZpYVxuICAgKiBQaXBlbGluZVJ1bnRpbWUuZ2V0U25hcHNob3QoKS5cbiAgICpcbiAgICogREVTSUdOOiBPcHQtaW4gYXQgYnVpbGQgdGltZSBzbyBGbG93Q2hhcnRCdWlsZGVyIGNhbiBzZXQgdGhpcyBmbGFnLlxuICAgKiBGbG93Q2hhcnRFeGVjdXRvciByZWFkcyB0aGlzIHZhbHVlIGFuZCBwYXNzZXMgaXQgdGhyb3VnaCB0byBQaXBlbGluZS5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDQuMSwgNC40X1xuICAgKi9cbiAgZW5yaWNoU25hcHNob3RzPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIFdoZXRoZXIgbmFycmF0aXZlIGdlbmVyYXRpb24gaXMgZW5hYmxlZCBhdCBidWlsZCB0aW1lLlxuICAgKlxuICAgKiBXSFk6IEFsbG93cyBjb25zdW1lcnMgdG8gZW5hYmxlIG5hcnJhdGl2ZSBhdCBidWlsZCB0aW1lIHZpYSBGbG93Q2hhcnRCdWlsZGVyLFxuICAgKiBzbyB0aGUgRmxvd0NoYXJ0RXhlY3V0b3IgY2FuIHJlc3BlY3QgaXQgYXMgYSBkZWZhdWx0IHdpdGhvdXQgcmVxdWlyaW5nXG4gICAqIGFuIGV4cGxpY2l0IGVuYWJsZU5hcnJhdGl2ZSgpIGNhbGwuXG4gICAqXG4gICAqIERFU0lHTjogRmxvd0NoYXJ0RXhlY3V0b3IgcmVhZHMgdGhpcyBhcyBhIGRlZmF1bHQgZm9yIG5hcnJhdGl2ZUVuYWJsZWQuXG4gICAqIEFuIGV4cGxpY2l0IGVuYWJsZU5hcnJhdGl2ZSgpIGNhbGwgb24gdGhlIGV4ZWN1dG9yIHRha2VzIHByZWNlZGVuY2UuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IHBpcGVsaW5lLW5hcnJhdGl2ZS1nZW5lcmF0aW9uIDEuNF9cbiAgICovXG4gIGVuYWJsZU5hcnJhdGl2ZT86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBTdGF0aWMgYnVpbGQtdGltZSBwaXBlbGluZSBzdHJ1Y3R1cmUgZnJvbSBGbG93Q2hhcnRCdWlsZGVyLlxuICAgKlxuICAgKiBXSFk6IFBhc3NlZCB0aHJvdWdoIHRvIFBpcGVsaW5lIHNvIGl0IGNhbiBkZWVwLWNsb25lIGludG9cbiAgICogcnVudGltZVBpcGVsaW5lU3RydWN0dXJlIGZvciBydW50aW1lIHN0cnVjdHVyZSB0cmFja2luZy5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgMS4xX1xuICAgKi9cbiAgYnVpbGRUaW1lU3RydWN0dXJlPzogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlO1xufTtcblxuXG4vKipcbiAqIEZsb3dDaGFydEV4ZWN1dG9yXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIFJ1bnRpbWUgZW5naW5lIHRoYXQgZXhlY3V0ZXMgYSBjb21waWxlZCBGbG93Q2hhcnQuXG4gKiBSZW5hbWVkIGZyb20gUGlwZWxpbmUgZm9yIEFQSSBjb25zaXN0ZW5jeSB3aXRoIEZsb3dDaGFydEJ1aWxkZXIuXG4gKlxuICogVGhlIGV4ZWN1dG9yIGFjY2VwdHMgYSBGbG93Q2hhcnQgb2JqZWN0IChmcm9tIEZsb3dDaGFydEJ1aWxkZXIuYnVpbGQoKSlcbiAqIGFuZCBwcm92aWRlcyBtZXRob2RzIHRvIHJ1biB0aGUgZmxvd2NoYXJ0IGFuZCBpbnNwZWN0IHJlc3VsdHMuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIC8vIEJ1aWxkIGEgZmxvd2NoYXJ0XG4gKiBjb25zdCBjaGFydCA9IGZsb3dDaGFydCgnZW50cnknLCBlbnRyeUZuKVxuICogICAuYWRkRnVuY3Rpb24oJ3Byb2Nlc3MnLCBwcm9jZXNzRm4pXG4gKiAgIC5idWlsZCgpO1xuICpcbiAqIC8vIENyZWF0ZSBleGVjdXRvciBhbmQgcnVuXG4gKiBjb25zdCBleGVjdXRvciA9IG5ldyBGbG93Q2hhcnRFeGVjdXRvcihjaGFydCwgc2NvcGVGYWN0b3J5KTtcbiAqIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dG9yLnJ1bigpO1xuICpcbiAqIC8vIEFjY2VzcyBleGVjdXRpb24gZGF0YVxuICogY29uc3QgY29udGV4dFRyZWUgPSBleGVjdXRvci5nZXRDb250ZXh0VHJlZSgpO1xuICogY29uc3QgZXh0cmFjdGVkRGF0YSA9IGV4ZWN1dG9yLmdldEV4dHJhY3RlZFJlc3VsdHMoKTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgRmxvd0NoYXJ0RXhlY3V0b3I8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiB7XG4gIHByaXZhdGUgcGlwZWxpbmU6IFBpcGVsaW5lPFRPdXQsIFRTY29wZT47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgbmFycmF0aXZlIGdlbmVyYXRpb24gaXMgZW5hYmxlZCBmb3IgdGhlIG5leHQgcnVuLlxuICAgKlxuICAgKiBXSFk6IE9wdC1pbiBmbGFnIHNvIHByb2R1Y3Rpb24gcGlwZWxpbmVzIHBheSB6ZXJvIGNvc3Qgd2hlbiBuYXJyYXRpdmVcbiAgICogaXMgbm90IG5lZWRlZC4gRGVidWcvYWdlbnQgY29udGV4dHMgY2FsbCBlbmFibGVOYXJyYXRpdmUoKSBiZWZvcmUgcnVuKCkuXG4gICAqXG4gICAqIERFU0lHTjogU3RvcmVkIGFzIGEgZmllbGQgc28gZW5hYmxlTmFycmF0aXZlKCkgY2FuIGJlIGNhbGxlZCBhZnRlclxuICAgKiBjb25zdHJ1Y3Rpb24gYnV0IGJlZm9yZSBydW4oKS4gVGhlIGZsYWcgaXMgcGFzc2VkIHRvIHRoZSBQaXBlbGluZVxuICAgKiBjb25zdHJ1Y3RvciB3aGVuIHJ1bigpIGNyZWF0ZXMgdGhlIGV4ZWN1dGlvbiBlbmdpbmUuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDEuMSwgMS4yX1xuICAgKi9cbiAgcHJpdmF0ZSBuYXJyYXRpdmVFbmFibGVkID0gZmFsc2U7XG5cbiAgLyoqXG4gICAqIFN0b3JlZCBjb25zdHJ1Y3RvciBhcmd1bWVudHMgZm9yIHBpcGVsaW5lIHJlY3JlYXRpb24uXG4gICAqXG4gICAqIFdIWTogZW5hYmxlTmFycmF0aXZlKCkgaXMgY2FsbGVkIGFmdGVyIGNvbnN0cnVjdGlvbiBidXQgYmVmb3JlIHJ1bigpLlxuICAgKiBXZSBuZWVkIHRvIHJlY3JlYXRlIHRoZSBQaXBlbGluZSB3aXRoIHRoZSBuYXJyYXRpdmUgZmxhZyB3aGVuIHJ1bigpXG4gICAqIGlzIGNhbGxlZC4gVGhlc2Ugc3RvcmVkIGFyZ3MgYWxsb3cgdGhhdCByZWNyZWF0aW9uLlxuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBmbG93Q2hhcnRBcmdzOiB7XG4gICAgZmxvd0NoYXJ0OiBGbG93Q2hhcnQ8VE91dCwgVFNjb3BlPjtcbiAgICBzY29wZUZhY3Rvcnk6IFNjb3BlRmFjdG9yeTxUU2NvcGU+O1xuICAgIGRlZmF1bHRWYWx1ZXNGb3JDb250ZXh0PzogdW5rbm93bjtcbiAgICBpbml0aWFsQ29udGV4dD86IHVua25vd247XG4gICAgcmVhZE9ubHlDb250ZXh0PzogdW5rbm93bjtcbiAgICB0aHJvdHRsaW5nRXJyb3JDaGVja2VyPzogKGVycm9yOiB1bmtub3duKSA9PiBib29sZWFuO1xuICAgIHN0cmVhbUhhbmRsZXJzPzogU3RyZWFtSGFuZGxlcnM7XG4gICAgc2NvcGVQcm90ZWN0aW9uTW9kZT86IFNjb3BlUHJvdGVjdGlvbk1vZGU7XG4gICAgZW5yaWNoU25hcHNob3RzPzogYm9vbGVhbjtcbiAgfTtcblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IEZsb3dDaGFydEV4ZWN1dG9yLlxuICAgKlxuICAgKiBAcGFyYW0gZmxvd0NoYXJ0IC0gQ29tcGlsZWQgZmxvd2NoYXJ0IGZyb20gRmxvd0NoYXJ0QnVpbGRlci5idWlsZCgpXG4gICAqIEBwYXJhbSBzY29wZUZhY3RvcnkgLSBGYWN0b3J5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBzY29wZSBpbnN0YW5jZXMgZm9yIGVhY2ggc3RhZ2VcbiAgICogQHBhcmFtIGRlZmF1bHRWYWx1ZXNGb3JDb250ZXh0IC0gT3B0aW9uYWwgZGVmYXVsdCB2YWx1ZXMgZm9yIHRoZSBjb250ZXh0XG4gICAqIEBwYXJhbSBpbml0aWFsQ29udGV4dCAtIE9wdGlvbmFsIGluaXRpYWwgY29udGV4dCB2YWx1ZXNcbiAgICogQHBhcmFtIHJlYWRPbmx5Q29udGV4dCAtIE9wdGlvbmFsIHJlYWQtb25seSBjb250ZXh0IHZhbHVlc1xuICAgKiBAcGFyYW0gdGhyb3R0bGluZ0Vycm9yQ2hlY2tlciAtIE9wdGlvbmFsIGZ1bmN0aW9uIHRvIGRldGVjdCB0aHJvdHRsaW5nIGVycm9yc1xuICAgKiBAcGFyYW0gc3RyZWFtSGFuZGxlcnMgLSBPcHRpb25hbCBoYW5kbGVycyBmb3Igc3RyZWFtaW5nIHN0YWdlc1xuICAgKiBAcGFyYW0gc2NvcGVQcm90ZWN0aW9uTW9kZSAtIE9wdGlvbmFsIHByb3RlY3Rpb24gbW9kZSBmb3Igc2NvcGUgYWNjZXNzICgnZXJyb3InIHwgJ3dhcm4nIHwgJ29mZicsIGRlZmF1bHQ6ICdlcnJvcicpXG4gICAqIEBwYXJhbSBlbnJpY2hTbmFwc2hvdHMgLSBPcHRpb25hbCBmbGFnIHRvIGVucmljaCBTdGFnZVNuYXBzaG90cyB3aXRoIHNjb3BlIHN0YXRlLFxuICAgKiAgIGRlYnVnIG1ldGFkYXRhLCBzdGFnZSBvdXRwdXQsIGFuZCBoaXN0b3J5IGluZGV4IGR1cmluZyB0cmF2ZXJzYWwuIFdoZW4gZW5hYmxlZCxcbiAgICogICB0aGUgZXh0cmFjdG9yIHJlY2VpdmVzIGZ1bGwgc3RhZ2UgZGF0YSwgZWxpbWluYXRpbmcgdGhlIG5lZWQgZm9yIGEgcmVkdW5kYW50XG4gICAqICAgcG9zdC10cmF2ZXJzYWwgd2FsayB2aWEgUGlwZWxpbmVSdW50aW1lLmdldFNuYXBzaG90KCkuIE92ZXJyaWRlc1xuICAgKiAgIGZsb3dDaGFydC5lbnJpY2hTbmFwc2hvdHMgaWYgYm90aCBhcmUgc2V0LlxuICAgKlxuICAgKiAgIF9SZXF1aXJlbWVudHM6IHNpbmdsZS1wYXNzLWRlYnVnLXN0cnVjdHVyZSA0LjRfXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICBmbG93Q2hhcnQ6IEZsb3dDaGFydDxUT3V0LCBUU2NvcGU+LFxuICAgIHNjb3BlRmFjdG9yeTogU2NvcGVGYWN0b3J5PFRTY29wZT4sXG4gICAgZGVmYXVsdFZhbHVlc0ZvckNvbnRleHQ/OiB1bmtub3duLFxuICAgIGluaXRpYWxDb250ZXh0PzogdW5rbm93bixcbiAgICByZWFkT25seUNvbnRleHQ/OiB1bmtub3duLFxuICAgIHRocm90dGxpbmdFcnJvckNoZWNrZXI/OiAoZXJyb3I6IHVua25vd24pID0+IGJvb2xlYW4sXG4gICAgc3RyZWFtSGFuZGxlcnM/OiBTdHJlYW1IYW5kbGVycyxcbiAgICBzY29wZVByb3RlY3Rpb25Nb2RlPzogU2NvcGVQcm90ZWN0aW9uTW9kZSxcbiAgICBlbnJpY2hTbmFwc2hvdHM/OiBib29sZWFuLFxuICApIHtcbiAgICAvLyBTdG9yZSBjb25zdHJ1Y3RvciBhcmdzIGZvciBwaXBlbGluZSByZWNyZWF0aW9uIHdoZW4gZW5hYmxlTmFycmF0aXZlKCkgaXMgY2FsbGVkLlxuICAgIC8vIFdIWTogZW5hYmxlTmFycmF0aXZlKCkgaXMgY2FsbGVkIGFmdGVyIGNvbnN0cnVjdGlvbiBidXQgYmVmb3JlIHJ1bigpLlxuICAgIC8vIFdlIG5lZWQgdGhlc2UgYXJncyB0byByZWNyZWF0ZSB0aGUgUGlwZWxpbmUgd2l0aCB0aGUgbmFycmF0aXZlIGZsYWcuXG4gICAgdGhpcy5mbG93Q2hhcnRBcmdzID0ge1xuICAgICAgZmxvd0NoYXJ0LFxuICAgICAgc2NvcGVGYWN0b3J5LFxuICAgICAgZGVmYXVsdFZhbHVlc0ZvckNvbnRleHQsXG4gICAgICBpbml0aWFsQ29udGV4dCxcbiAgICAgIHJlYWRPbmx5Q29udGV4dCxcbiAgICAgIHRocm90dGxpbmdFcnJvckNoZWNrZXIsXG4gICAgICBzdHJlYW1IYW5kbGVycyxcbiAgICAgIHNjb3BlUHJvdGVjdGlvbk1vZGUsXG4gICAgICBlbnJpY2hTbmFwc2hvdHMsXG4gICAgfTtcblxuICAgIC8vIEV4dHJhY3QgY29tcG9uZW50cyBmcm9tIEZsb3dDaGFydCBhbmQgY3JlYXRlIGludGVybmFsIFBpcGVsaW5lXG4gICAgLy8gV0hZOiBlbnJpY2hTbmFwc2hvdHMgY2FuIGJlIHNldCBlaXRoZXIgdmlhIHRoZSBjb25zdHJ1Y3RvciBwYXJhbSAocnVudGltZSBvdmVycmlkZSlcbiAgICAvLyBvciB2aWEgZmxvd0NoYXJ0LmVucmljaFNuYXBzaG90cyAoYnVpbGQtdGltZSBkZWZhdWx0KS4gQ29uc3RydWN0b3IgcGFyYW0gdGFrZXMgcHJlY2VkZW5jZS5cbiAgICB0aGlzLnBpcGVsaW5lID0gdGhpcy5jcmVhdGVQaXBlbGluZSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBQaXBlbGluZSBpbnN0YW5jZSBmcm9tIHN0b3JlZCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuXG4gICAqXG4gICAqIFdIWTogRXh0cmFjdGVkIHRvIGEgaGVscGVyIHNvIGJvdGggdGhlIGNvbnN0cnVjdG9yIGFuZCBydW4oKSBjYW5cbiAgICogY3JlYXRlIGEgcGlwZWxpbmUuIHJ1bigpIHJlY3JlYXRlcyB0aGUgcGlwZWxpbmUgd2hlbiBlbmFibGVOYXJyYXRpdmUoKVxuICAgKiB3YXMgY2FsbGVkIGFmdGVyIGNvbnN0cnVjdGlvbiwgZW5zdXJpbmcgdGhlIG5hcnJhdGl2ZSBmbGFnIGlzIHBhc3NlZFxuICAgKiB0byB0aGUgUGlwZWxpbmUgY29uc3RydWN0b3IuXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZVBpcGVsaW5lKCk6IFBpcGVsaW5lPFRPdXQsIFRTY29wZT4ge1xuICAgIGNvbnN0IGFyZ3MgPSB0aGlzLmZsb3dDaGFydEFyZ3M7XG4gICAgLy8gUmVzb2x2ZSBuYXJyYXRpdmUgZmxhZzogZXhwbGljaXQgZW5hYmxlTmFycmF0aXZlKCkgY2FsbCB0YWtlcyBwcmVjZWRlbmNlLFxuICAgIC8vIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gdGhlIGJ1aWxkLXRpbWUgZmxhZyBmcm9tIEZsb3dDaGFydC5cbiAgICAvLyBXSFk6IENvbnN1bWVycyBjYW4gZW5hYmxlIG5hcnJhdGl2ZSBlaXRoZXIgYXQgYnVpbGQgdGltZSAodmlhIEZsb3dDaGFydEJ1aWxkZXIpXG4gICAgLy8gb3IgYXQgcnVudGltZSAodmlhIGVuYWJsZU5hcnJhdGl2ZSgpKS4gUnVudGltZSBvdmVycmlkZSB3aW5zLlxuICAgIC8vIF9SZXF1aXJlbWVudHM6IHBpcGVsaW5lLW5hcnJhdGl2ZS1nZW5lcmF0aW9uIDEuNF9cbiAgICBjb25zdCBuYXJyYXRpdmVGbGFnID0gdGhpcy5uYXJyYXRpdmVFbmFibGVkIHx8IChhcmdzLmZsb3dDaGFydC5lbmFibGVOYXJyYXRpdmUgPz8gZmFsc2UpO1xuICAgIHJldHVybiBuZXcgUGlwZWxpbmU8VE91dCwgVFNjb3BlPihcbiAgICAgIGFyZ3MuZmxvd0NoYXJ0LnJvb3QsXG4gICAgICBhcmdzLmZsb3dDaGFydC5zdGFnZU1hcCxcbiAgICAgIGFyZ3Muc2NvcGVGYWN0b3J5LFxuICAgICAgYXJncy5kZWZhdWx0VmFsdWVzRm9yQ29udGV4dCxcbiAgICAgIGFyZ3MuaW5pdGlhbENvbnRleHQsXG4gICAgICBhcmdzLnJlYWRPbmx5Q29udGV4dCxcbiAgICAgIGFyZ3MudGhyb3R0bGluZ0Vycm9yQ2hlY2tlcixcbiAgICAgIGFyZ3Muc3RyZWFtSGFuZGxlcnMsXG4gICAgICBhcmdzLmZsb3dDaGFydC5leHRyYWN0b3IsXG4gICAgICBhcmdzLnNjb3BlUHJvdGVjdGlvbk1vZGUsXG4gICAgICBhcmdzLmZsb3dDaGFydC5zdWJmbG93cyxcbiAgICAgIGFyZ3MuZW5yaWNoU25hcHNob3RzID8/IGFyZ3MuZmxvd0NoYXJ0LmVucmljaFNuYXBzaG90cyxcbiAgICAgIG5hcnJhdGl2ZUZsYWcsXG4gICAgICBhcmdzLmZsb3dDaGFydC5idWlsZFRpbWVTdHJ1Y3R1cmUsXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbmFibGUgbmFycmF0aXZlIGdlbmVyYXRpb24gZm9yIHRoZSBuZXh0IHJ1bi5cbiAgICpcbiAgICogV0hZOiBPcHQtaW4gdG8gYXZvaWQgcnVudGltZSBjb3N0IGluIHByb2R1Y3Rpb24gcGlwZWxpbmVzLlxuICAgKiBEZWJ1Zy9hZ2VudCBjb250ZXh0cyB0dXJuIGl0IG9uIGZvciBMTE0gY29udGV4dCBlbmdpbmVlcmluZy5cbiAgICogV2hlbiBlbmFibGVkLCB0aGUgcGlwZWxpbmUgcHJvZHVjZXMgYSBodW1hbi1yZWFkYWJsZSBzdG9yeVxuICAgKiBhcyBhIGZpcnN0LWNsYXNzIG91dHB1dCBhbG9uZ3NpZGUgZXhlY3V0aW9uIGRhdGEuXG4gICAqXG4gICAqIERFU0lHTjogU2V0cyBhIGZsYWcgdGhhdCBpcyBwYXNzZWQgdG8gdGhlIFBpcGVsaW5lIGNvbnN0cnVjdG9yXG4gICAqIHdoZW4gcnVuKCkgaXMgY2FsbGVkLiBUaGUgUGlwZWxpbmUgdGhlbiBjcmVhdGVzIGEgcmVhbFxuICAgKiBOYXJyYXRpdmVHZW5lcmF0b3IgaW5zdGVhZCBvZiB0aGUgbm8tb3AgTnVsbE5hcnJhdGl2ZUdlbmVyYXRvci5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBleGVjdXRvciA9IG5ldyBGbG93Q2hhcnRFeGVjdXRvcihjaGFydCwgc2NvcGVGYWN0b3J5KTtcbiAgICogZXhlY3V0b3IuZW5hYmxlTmFycmF0aXZlKCk7XG4gICAqIGF3YWl0IGV4ZWN1dG9yLnJ1bigpO1xuICAgKiBjb25zdCBzdG9yeSA9IGV4ZWN1dG9yLmdldE5hcnJhdGl2ZSgpO1xuICAgKiAvLyDihpIgW1wiVGhlIHByb2Nlc3MgYmVnYW4gd2l0aCB2YWxpZGF0ZSBpbnB1dC5cIiwgXCJOZXh0LCBpdCBtb3ZlZCBvbiB0byBwcm9jZXNzIGRhdGEuXCIsIC4uLl1cbiAgICogYGBgXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDEuMV9cbiAgICovXG4gIGVuYWJsZU5hcnJhdGl2ZSgpOiB2b2lkIHtcbiAgICB0aGlzLm5hcnJhdGl2ZUVuYWJsZWQgPSB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG5hcnJhdGl2ZSBzZW50ZW5jZXMgZnJvbSB0aGUgbGFzdCBleGVjdXRpb24uXG4gICAqXG4gICAqIFdIWTogUHJvdmlkZXMgYWNjZXNzIHRvIHRoZSBodW1hbi1yZWFkYWJsZSBleGVjdXRpb24gc3RvcnlcbiAgICogZm9yIExMTSBjb250ZXh0LCBsb2dnaW5nLCBvciBkaXNwbGF5LiBSZXR1cm5zIGVtcHR5IGFycmF5XG4gICAqIHdoZW4gbmFycmF0aXZlIHdhcyBub3QgZW5hYmxlZCDigJQgemVybyBjb3N0IGZvciBwcm9kdWN0aW9uLlxuICAgKlxuICAgKiBAcmV0dXJucyBPcmRlcmVkIGFycmF5IG9mIG5hcnJhdGl2ZSBzZW50ZW5jZXMsIG9yIGVtcHR5IGFycmF5IGlmIGRpc2FibGVkXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogZXhlY3V0b3IuZW5hYmxlTmFycmF0aXZlKCk7XG4gICAqIGF3YWl0IGV4ZWN1dG9yLnJ1bigpO1xuICAgKiBjb25zdCBzZW50ZW5jZXMgPSBleGVjdXRvci5nZXROYXJyYXRpdmUoKTtcbiAgICogLy8g4oaSIFtcIlRoZSBwcm9jZXNzIGJlZ2FuIHdpdGggdmFsaWRhdGUgaW5wdXQuXCIsIC4uLl1cbiAgICogYGBgXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDIuMSwgMi4zX1xuICAgKi9cbiAgZ2V0TmFycmF0aXZlKCk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gdGhpcy5waXBlbGluZS5nZXROYXJyYXRpdmUoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIHRoZSBmbG93Y2hhcnQgYW5kIHJldHVybiByZXN1bHRzLlxuICAgKiBUaGlzIGlzIHRoZSBwcmltYXJ5IG1ldGhvZCBmb3IgcnVubmluZyBhIGZsb3djaGFydC5cbiAgICpcbiAgICogV0hZOiBSZWNyZWF0ZXMgdGhlIHBpcGVsaW5lIGJlZm9yZSBleGVjdXRpb24gdG8gZW5zdXJlIHRoZVxuICAgKiBuYXJyYXRpdmVFbmFibGVkIGZsYWcgKHNldCB2aWEgZW5hYmxlTmFycmF0aXZlKCkpIGlzIHBhc3NlZFxuICAgKiB0byB0aGUgUGlwZWxpbmUgY29uc3RydWN0b3IuXG4gICAqXG4gICAqIEByZXR1cm5zIFByb21pc2UgcmVzb2x2aW5nIHRvIHRoZSBleGVjdXRpb24gcmVzdWx0XG4gICAqL1xuICBhc3luYyBydW4oKTogUHJvbWlzZTxUcmVlT2ZGdW5jdGlvbnNSZXNwb25zZT4ge1xuICAgIC8vIFJlY3JlYXRlIHBpcGVsaW5lIHRvIHBpY2sgdXAgYW55IGVuYWJsZU5hcnJhdGl2ZSgpIGNhbGxzIG1hZGUgYWZ0ZXIgY29uc3RydWN0aW9uXG4gICAgdGhpcy5waXBlbGluZSA9IHRoaXMuY3JlYXRlUGlwZWxpbmUoKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5waXBlbGluZS5leGVjdXRlKCk7XG4gIH1cblxuICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgSW50cm9zcGVjdGlvbiBNZXRob2RzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBmdWxsIGNvbnRleHQgdHJlZSAoZ2xvYmFsICsgc3RhZ2UgY29udGV4dHMpIGZvciBvYnNlcnZhYmlsaXR5IHBhbmVscy5cbiAgICpcbiAgICogV0hZOiBUaGlzIGlzIHRoZSBsZWdhY3kgaW50cm9zcGVjdGlvbiBBUEkgdGhhdCB3YWxrcyB0aGUgU3RhZ2VDb250ZXh0IGxpbmtlZFxuICAgKiBsaXN0IGFmdGVyIGV4ZWN1dGlvbiB0byByZWNvbnN0cnVjdCBzY29wZSBhbmQgZGVidWcgZGF0YSBmb3IgZWFjaCBzdGFnZS5cbiAgICpcbiAgICogREVTSUdOOiBUaGlzIHBlcmZvcm1zIGEgcG9zdC10cmF2ZXJzYWwgd2FsayAoUGFzcyAyKSBvZiB0aGUgU3RhZ2VDb250ZXh0XG4gICAqIGxpbmtlZCBsaXN0IGJ1aWx0IGR1cmluZyBleGVjdXRpb24uIEZvciBuZXcgaW50ZWdyYXRpb25zIHRoYXQgbmVlZCBwZXItc3RhZ2VcbiAgICogc2NvcGUgc3RhdGUgYW5kIGRlYnVnIG1ldGFkYXRhLCBwcmVmZXIgZW5hYmxpbmcgYGVucmljaFNuYXBzaG90czogdHJ1ZWAgYW5kXG4gICAqIHVzaW5nIHtAbGluayBnZXRFbnJpY2hlZFJlc3VsdHN9IGluc3RlYWQg4oCUIGl0IGNhcHR1cmVzIHRoZSBzYW1lIGRhdGFcbiAgICogaW5jcmVtZW50YWxseSBkdXJpbmcgdHJhdmVyc2FsIChQYXNzIDEpLCBlbGltaW5hdGluZyB0aGUgcmVkdW5kYW50IHdhbGsuXG4gICAqXG4gICAqIEByZXR1cm5zIFJ1bnRpbWVTbmFwc2hvdCBjb250YWluaW5nIGdsb2JhbCBjb250ZXh0IGFuZCBwZXItc3RhZ2UgZGF0YVxuICAgKlxuICAgKiBAc2VlIHtAbGluayBnZXRFbnJpY2hlZFJlc3VsdHN9IGZvciB0aGUgc2luZ2xlLXBhc3MgYWx0ZXJuYXRpdmVcbiAgICovXG4gIGdldENvbnRleHRUcmVlKCk6IFJ1bnRpbWVTbmFwc2hvdCB7XG4gICAgcmV0dXJuIHRoaXMucGlwZWxpbmUuZ2V0Q29udGV4dFRyZWUoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBQaXBlbGluZVJ1bnRpbWUgKHJvb3QgaG9sZGVyIG9mIFN0YWdlQ29udGV4dHMpLlxuICAgKi9cbiAgZ2V0Q29udGV4dCgpOiBQaXBlbGluZVJ1bnRpbWUge1xuICAgIHJldHVybiB0aGlzLnBpcGVsaW5lLmdldENvbnRleHQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIGEgcm9vdCBvYmplY3QgdmFsdWUgaW50byB0aGUgZ2xvYmFsIGNvbnRleHQgKHV0aWxpdHkpLlxuICAgKi9cbiAgc2V0Um9vdE9iamVjdChwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG4gICAgdGhpcy5waXBlbGluZS5zZXRSb290T2JqZWN0KHBhdGgsIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgcGlwZWxpbmUgaWRzIGluaGVyaXRlZCB1bmRlciB0aGlzIHJvb3QgKGZvciBkZWJ1Z2dpbmcgZmFuLW91dCkuXG4gICAqL1xuICBnZXRJbmhlcml0ZWRQaXBlbGluZXMoKTogc3RyaW5nW10ge1xuICAgIHJldHVybiB0aGlzLnBpcGVsaW5lLmdldEluaGVyaXRlZFBpcGVsaW5lcygpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGN1cnJlbnQgcGlwZWxpbmUgcm9vdCBub2RlIChpbmNsdWRpbmcgcnVudGltZSBtb2RpZmljYXRpb25zKS5cbiAgICpcbiAgICogVGhpcyBpcyB1c2VmdWwgZm9yIHNlcmlhbGl6aW5nIHRoZSBwaXBlbGluZSBzdHJ1Y3R1cmUgYWZ0ZXIgZXhlY3V0aW9uLFxuICAgKiB3aGljaCBpbmNsdWRlcyBhbnkgZHluYW1pYyBjaGlsZHJlbiBvciBsb29wIHRhcmdldHMgYWRkZWQgYXQgcnVudGltZS5cbiAgICovXG4gIGdldFJ1bnRpbWVSb290KCk6IFN0YWdlTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMucGlwZWxpbmUuZ2V0UnVudGltZVJvb3QoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjb21wbGV0ZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSBpbmNsdWRpbmcgZHluYW1pYyB1cGRhdGVzLlxuICAgKlxuICAgKiBXSFk6IFRoaXMgaXMgdGhlIGF1dGhvcml0YXRpdmUgc3RydWN0dXJlIGZvciB2aXN1YWxpemF0aW9uIOKAlCBubyBleHRlcm5hbFxuICAgKiByZWNvbnN0cnVjdGlvbiBuZWVkZWQuIERlbGVnYXRlcyB0byBQaXBlbGluZS5nZXRSdW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUoKS5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgNi4xX1xuICAgKi9cbiAgZ2V0UnVudGltZVBpcGVsaW5lU3RydWN0dXJlKCk6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMucGlwZWxpbmUuZ2V0UnVudGltZVBpcGVsaW5lU3RydWN0dXJlKCk7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjb2xsZWN0ZWQgU3ViZmxvd1Jlc3VsdHNNYXAgYWZ0ZXIgZXhlY3V0aW9uLlxuICAgKiBVc2VkIGJ5IHRoZSBzZXJ2aWNlIGxheWVyIHRvIGluY2x1ZGUgc3ViZmxvdyBkYXRhIGluIEFQSSByZXNwb25zZXMuXG4gICAqL1xuICBnZXRTdWJmbG93UmVzdWx0cygpOiBNYXA8c3RyaW5nLCBTdWJmbG93UmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMucGlwZWxpbmUuZ2V0U3ViZmxvd1Jlc3VsdHMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjb2xsZWN0ZWQgZXh0cmFjdGVkIHJlc3VsdHMgYWZ0ZXIgZXhlY3V0aW9uLlxuICAgKiBNYXAga2V5cyBhcmUgc3RhZ2UgcGF0aHMgKGUuZy4sIFwicm9vdC5jaGlsZC5ncmFuZGNoaWxkXCIpLlxuICAgKi9cbiAgZ2V0RXh0cmFjdGVkUmVzdWx0czxUUmVzdWx0ID0gdW5rbm93bj4oKTogTWFwPHN0cmluZywgVFJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLnBpcGVsaW5lLmdldEV4dHJhY3RlZFJlc3VsdHM8VFJlc3VsdD4oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBlbnJpY2hlZCBleHRyYWN0ZWQgcmVzdWx0cyBhZnRlciBleGVjdXRpb24uXG4gICAqIENvbnZlbmllbmNlIG1ldGhvZCB0aGF0IHJldHVybnMgZ2V0RXh0cmFjdGVkUmVzdWx0cygpIHdpdGggYSB0eXBlIGhpbnQuXG4gICAqXG4gICAqIFdIWTogUHJvdmlkZXMgYSBzZW1hbnRpYyBBUEkgZm9yIGNvbnN1bWVycyB3aG8gZW5hYmxlZCBlbnJpY2hTbmFwc2hvdHNcbiAgICogYW5kIHdhbnQgdG8gYWNjZXNzIHRoZSBpbmNyZW1lbnRhbGx5LWJ1aWx0IGRlYnVnIHN0cnVjdHVyZS4gVW5kZXIgdGhlIGhvb2QsXG4gICAqIHRoaXMgaXMgdGhlIHNhbWUgTWFwIGFzIGdldEV4dHJhY3RlZFJlc3VsdHMoKSDigJQgdGhlIGVucmljaG1lbnQgZGF0YSBpc1xuICAgKiBpbmNsdWRlZCBpbiB0aGUgZXh0cmFjdG9yIHJlc3VsdHMgd2hlbiBlbnJpY2hTbmFwc2hvdHMgaXMgZW5hYmxlZC5cbiAgICpcbiAgICogREVTSUdOOiBUaGlzIGlzIGEgdGhpbiBkZWxlZ2F0aW9uIHRvIHBpcGVsaW5lLmdldEV4dHJhY3RlZFJlc3VsdHMoKS5cbiAgICogVGhlIGVucmljaG1lbnQgZGF0YSAoc2NvcGVTdGF0ZSwgZGVidWdJbmZvLCBzdGFnZU91dHB1dCwgaGlzdG9yeUluZGV4KVxuICAgKiBpcyBjYXB0dXJlZCBkdXJpbmcgdHJhdmVyc2FsIGJ5IGNhbGxFeHRyYWN0b3IoKSB3aGVuIGVucmljaFNuYXBzaG90c1xuICAgKiBpcyB0cnVlLCBhbmQgc3RvcmVkIGluIHRoZSBzYW1lIGV4dHJhY3RlZFJlc3VsdHMgTWFwLiBUaGlzIG1ldGhvZFxuICAgKiBzaW1wbHkgcHJvdmlkZXMgYSBjbGVhcmVyIG5hbWUgYW5kIHR5cGUgaGludCBmb3IgdGhhdCB1c2UgY2FzZS5cbiAgICpcbiAgICogQHR5cGVQYXJhbSBUUmVzdWx0IC0gVGhlIGV4cGVjdGVkIHNoYXBlIG9mIGVhY2ggZW5yaWNoZWQgcmVzdWx0IGVudHJ5LlxuICAgKiAgIERlZmF1bHRzIHRvIGB1bmtub3duYC4gQ29uc3VtZXJzIHR5cGljYWxseSBuYXJyb3cgdGhpcyB0byB0aGVpclxuICAgKiAgIGV4dHJhY3RvcidzIHJldHVybiB0eXBlIHdoaWNoIGluY2x1ZGVzIGVucmljaG1lbnQgZmllbGRzLlxuICAgKiBAcmV0dXJucyBNYXAgb2Ygc3RhZ2UgcGF0aHMgdG8gZW5yaWNoZWQgcmVzdWx0IGVudHJpZXNcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBleGVjdXRvciA9IG5ldyBGbG93Q2hhcnRFeGVjdXRvcihjaGFydCwgc2NvcGVGYWN0b3J5LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcbiAgICogYXdhaXQgZXhlY3V0b3IucnVuKCk7XG4gICAqIGNvbnN0IGVucmljaGVkID0gZXhlY3V0b3IuZ2V0RW5yaWNoZWRSZXN1bHRzPE15RW5yaWNoZWRUeXBlPigpO1xuICAgKiBgYGBcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDUuMSwgNS4yX1xuICAgKi9cbiAgZ2V0RW5yaWNoZWRSZXN1bHRzPFRSZXN1bHQgPSB1bmtub3duPigpOiBNYXA8c3RyaW5nLCBUUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMucGlwZWxpbmUuZ2V0RXh0cmFjdGVkUmVzdWx0czxUUmVzdWx0PigpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW55IGVycm9ycyB0aGF0IG9jY3VycmVkIGR1cmluZyBleHRyYWN0aW9uLlxuICAgKiBVc2VmdWwgZm9yIGRlYnVnZ2luZyBleHRyYWN0b3IgaXNzdWVzLlxuICAgKi9cbiAgZ2V0RXh0cmFjdG9yRXJyb3JzKCk6IEV4dHJhY3RvckVycm9yW10ge1xuICAgIHJldHVybiB0aGlzLnBpcGVsaW5lLmdldEV4dHJhY3RvckVycm9ycygpO1xuICB9XG59XG5cbi8vIFJlLWV4cG9ydCB0eXBlcyB0aGF0IGNvbnN1bWVycyBuZWVkXG5leHBvcnQgeyBTdGFnZU5vZGUsIERlY2lkZXIsIFNlbGVjdG9yLCBpc1N0YWdlTm9kZVJldHVybiB9O1xuIl19