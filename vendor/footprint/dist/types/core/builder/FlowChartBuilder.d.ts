/**
 * FlowChartBuilder.ts
 *
 * WHY: This is the primary API for building flowchart-based pipelines.
 * It provides a fluent builder pattern for constructing StageNode trees
 * and FlowChartSpec structures that can be executed by FlowChartExecutor.
 *
 * RESPONSIBILITIES:
 * - Build StageNode trees directly (no intermediate classes)
 * - Build FlowChartSpec incrementally alongside StageNode
 * - Support linear chaining, branching (decider/selector), and subflow mounting
 * - Manage stage function registry and stream handlers
 *
 * DESIGN DECISIONS:
 * - Simplified from original: no _N class, no parent pointer, no build callbacks
 * - Promotes subgraph composition over callback-based nesting
 * - Builds SerializedPipelineStructure with type field incrementally
 * - Applies buildTimeExtractor immediately when nodes are created
 *
 * RELATED:
 * - {@link FlowChartExecutor} - Executes the built flowchart
 * - {@link Pipeline} - Core execution engine
 * - {@link StageNode} - The node type built by this builder
 *
 * _Requirements: flowchart-builder-simplification 1.1, 1.4, 4.1_
 */
import type { Selector, StageNode } from '../executor/Pipeline';
import type { PipelineStageFunction, StreamHandlers, StreamTokenHandler, StreamLifecycleHandler, TraversalExtractor, SubflowMountOptions } from '../executor/types';
import type { ScopeFactory } from '../memory/types';
import type { ScopeProtectionMode } from '../../scope/protection/types';
export type { StreamHandlers, StreamTokenHandler, StreamLifecycleHandler };
export type { Selector };
export type { SubflowMountOptions };
/**
 * Pure JSON Flow Chart spec for FE → BE transport (no functions/closures).
 */
export interface FlowChartSpec {
    name: string;
    id?: string;
    displayName?: string;
    /** Human-readable description of what this stage does. */
    description?: string;
    children?: FlowChartSpec[];
    next?: FlowChartSpec;
    hasDecider?: boolean;
    hasSelector?: boolean;
    branchIds?: string[];
    loopTarget?: string;
    isStreaming?: boolean;
    streamId?: string;
    isParallelChild?: boolean;
    parallelGroupId?: string;
    isSubflowRoot?: boolean;
    subflowId?: string;
    subflowName?: string;
}
/**
 * Metadata provided to the build-time extractor for each node.
 */
export interface BuildTimeNodeMetadata {
    name: string;
    id?: string;
    displayName?: string;
    /** Human-readable description of what this stage does. */
    description?: string;
    children?: BuildTimeNodeMetadata[];
    next?: BuildTimeNodeMetadata;
    hasDecider?: boolean;
    hasSelector?: boolean;
    branchIds?: string[];
    loopTarget?: string;
    isStreaming?: boolean;
    streamId?: string;
    isParallelChild?: boolean;
    parallelGroupId?: string;
    isSubflowRoot?: boolean;
    subflowId?: string;
    subflowName?: string;
}
/**
 * Build-time extractor function type.
 */
export type BuildTimeExtractor<TResult = FlowChartSpec> = (metadata: BuildTimeNodeMetadata) => TResult;
/**
 * Simplified parallel spec without build callback.
 * _Requirements: flowchart-builder-simplification 2.2_
 */
export type SimplifiedParallelSpec<TOut = any, TScope = any> = {
    id: string;
    name: string;
    displayName?: string;
    fn?: PipelineStageFunction<TOut, TScope>;
};
/**
 * Serialized pipeline structure for frontend consumption.
 */
export interface SerializedPipelineStructure {
    name: string;
    id?: string;
    type: 'stage' | 'decider' | 'fork' | 'streaming';
    displayName?: string;
    /** Human-readable description of what this stage does. */
    description?: string;
    children?: SerializedPipelineStructure[];
    next?: SerializedPipelineStructure;
    hasDecider?: boolean;
    hasSelector?: boolean;
    branchIds?: string[];
    loopTarget?: string;
    isStreaming?: boolean;
    streamId?: string;
    isParallelChild?: boolean;
    parallelGroupId?: string;
    isSubflowRoot?: boolean;
    subflowId?: string;
    subflowName?: string;
    /**
     * Complete subflow structure for drill-down visualization.
     * When a subflow is mounted, this contains the subflow's internal structure
     * (its first stage with its own ID, and the full next/children chain).
     * This is separate from the mount node to preserve the subflow's original IDs.
     *
     * TODO: PAYLOAD OPTIMIZATION - Consider removing this field to reduce payload size.
     * FE could lookup structure from subflowResults[subflowId].pipelineStructure instead.
     * Currently kept as fallback for non-executed subflows (where no runtime data exists).
     * When removing, update FE useTreeLayout.ts to handle the lookup properly.
     */
    subflowStructure?: SerializedPipelineStructure;
    /**
     * Number of times this node was executed in a loop.
     * Only present when the node was visited more than once.
     *
     * WHY: Enables the runtime pipeline structure to track loop iterations
     * so consumers can visualize how many times a looping node was executed
     * without needing external reconstruction from runtime data.
     */
    iterationCount?: number;
}
/**
 * Compiled flowchart ready for execution.
 */
export type FlowChart<TOut = any, TScope = any> = {
    root: StageNode<TOut, TScope>;
    stageMap: Map<string, PipelineStageFunction<TOut, TScope>>;
    extractor?: TraversalExtractor;
    subflows?: Record<string, {
        root: StageNode<TOut, TScope>;
    }>;
    buildTimeStructure: SerializedPipelineStructure;
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
    /** Pre-built execution context description string. Empty string when no descriptions provided. */
    description: string;
    /** Individual stage descriptions keyed by stage name. Empty map when no descriptions provided. */
    stageDescriptions: Map<string, string>;
};
/**
 * Options for the execute sugar.
 */
export type ExecOptions = {
    defaults?: unknown;
    initial?: unknown;
    readOnly?: unknown;
    throttlingErrorChecker?: (e: unknown) => boolean;
    scopeProtectionMode?: ScopeProtectionMode;
    /**
     * Enable narrative generation at build time.
     *
     * WHY: Allows consumers to opt into narrative via the builder's execute()
     * convenience method, which sets the flag on the FlowChart object.
     *
     * _Requirements: pipeline-narrative-generation 1.4_
     */
    enableNarrative?: boolean;
};
/**
 * Fluent helper returned by addDecider / addDeciderFunction to add branches.
 *
 * WHY: Provides a fluent API for configuring decider branches regardless of
 * whether the decider is legacy (output-based) or scope-based. The `isScopeBased`
 * flag controls how `end()` wires the node — setting `nextNodeDecider` (legacy)
 * vs `deciderFn` (new scope-based).
 *
 * DESIGN: Reuses the same class for both old and new decider types. Only the
 * constructor parameters and `end()` behavior differ based on `isScopeBased`.
 * All branch methods (addFunctionBranch, addSubFlowChartBranch, addBranchList,
 * setDefault) remain identical for both modes.
 *
 * _Requirements: flowchart-builder-simplification 2.1, 6.1, 6.3, 6.4_
 * _Requirements: decider-first-class-stage 4.4, 5.1, 6.2_
 */
export declare class DeciderList<TOut = any, TScope = any> {
    private readonly b;
    private readonly curNode;
    private readonly curSpec;
    private readonly originalDecider;
    private readonly branchIds;
    private defaultId?;
    /**
     * Whether this DeciderList is for a scope-based decider (addDeciderFunction)
     * vs a legacy output-based decider (addDecider).
     *
     * WHY: Controls how `end()` wires the StageNode — scope-based sets `deciderFn = true`
     * while legacy wraps the decider function and sets `nextNodeDecider`.
     *
     * _Requirements: decider-first-class-stage 4.4, 5.1_
     */
    private readonly isScopeBased;
    private readonly parentDescriptionParts;
    private readonly parentStageDescriptions;
    private readonly reservedStepNumber;
    private readonly deciderDescription?;
    /** Collected branch info for description accumulation at end() */
    private readonly branchDescInfo;
    constructor(builder: FlowChartBuilder<TOut, TScope>, curNode: StageNode<TOut, TScope>, curSpec: SerializedPipelineStructure, decider: ((out?: TOut) => string | Promise<string>) | null, isScopeBased?: boolean, parentDescriptionParts?: string[], parentStageDescriptions?: Map<string, string>, reservedStepNumber?: number, deciderDescription?: string);
    /**
     * Add a simple function branch (no nested flowchart).
     * REMOVED: build callback parameter
     * _Requirements: flowchart-builder-simplification 2.1_
     */
    addFunctionBranch(id: string, name: string, fn?: PipelineStageFunction<TOut, TScope>, displayName?: string, description?: string): DeciderList<TOut, TScope>;
    /**
     * Mount a prebuilt flowchart as a branch.
     * _Requirements: flowchart-builder-simplification 6.2_
     * _Requirements: subflow-input-mapping 1.2, 1.5, 7.3_
     *
     * IMPORTANT: This creates a WRAPPER node for the subflow mount point.
     * The subflow's internal structure is preserved in `subflowStructure` property,
     * NOT merged with the wrapper node. This ensures:
     * 1. The subflow's first stage keeps its original ID
     * 2. The mount point has its own distinct ID for navigation
     * 3. Drill-down can access the full subflow structure via `subflowStructure`
     *
     * @param id - Unique identifier for the subflow mount point
     * @param subflow - The prebuilt FlowChart to mount
     * @param mountName - Optional display name for the mount point
     * @param options - Optional input/output mapping options for data flow between parent and subflow
     */
    addSubFlowChartBranch(id: string, subflow: FlowChart<TOut, TScope>, mountName?: string, options?: SubflowMountOptions): DeciderList<TOut, TScope>;
    /**
     * Add multiple simple branches.
     * REMOVED: build callback in branch spec
     * _Requirements: flowchart-builder-simplification 2.3_
     */
    addBranchList(branches: Array<{
        id: string;
        name: string;
        fn?: PipelineStageFunction<TOut, TScope>;
        displayName?: string;
    }>): DeciderList<TOut, TScope>;
    /**
     * Set default branch id.
     */
    setDefault(id: string): DeciderList<TOut, TScope>;
    /**
     * Finalize the decider and return to main builder.
     *
     * WHY: Wires the StageNode differently based on whether this is a scope-based
     * or legacy decider. Scope-based sets `deciderFn = true` (the fn IS the decider),
     * while legacy wraps the decider function with default handling and sets `nextNodeDecider`.
     *
     * _Requirements: flowchart-builder-simplification 6.4_
     * _Requirements: decider-first-class-stage 4.4, 5.1, 6.2_
     */
    end(): FlowChartBuilder<TOut, TScope>;
}
/**
 * Fluent helper returned by addSelector to add branches.
 * _Requirements: flowchart-builder-simplification 6.5_
 */
export declare class SelectorList<TOut = any, TScope = any> {
    private readonly b;
    private readonly curNode;
    private readonly curSpec;
    private readonly originalSelector;
    private readonly branchIds;
    private readonly parentDescriptionParts;
    private readonly parentStageDescriptions;
    private readonly reservedStepNumber;
    /** Collected branch info for description accumulation at end() */
    private readonly branchDescInfo;
    constructor(builder: FlowChartBuilder<TOut, TScope>, curNode: StageNode<TOut, TScope>, curSpec: SerializedPipelineStructure, selector: Selector, parentDescriptionParts?: string[], parentStageDescriptions?: Map<string, string>, reservedStepNumber?: number);
    /**
     * Add a simple function branch (no nested flowchart).
     */
    addFunctionBranch(id: string, name: string, fn?: PipelineStageFunction<TOut, TScope>, displayName?: string, description?: string): SelectorList<TOut, TScope>;
    /**
     * Mount a prebuilt flowchart as a branch.
     * _Requirements: subflow-input-mapping 1.2, 1.5, 7.3_
     *
     * IMPORTANT: This creates a WRAPPER node for the subflow mount point.
     * The subflow's internal structure is preserved in `subflowStructure` property,
     * NOT merged with the wrapper node. This ensures:
     * 1. The subflow's first stage keeps its original ID
     * 2. The mount point has its own distinct ID for navigation
     * 3. Drill-down can access the full subflow structure via `subflowStructure`
     *
     * @param id - Unique identifier for the subflow mount point
     * @param subflow - The prebuilt FlowChart to mount
     * @param mountName - Optional display name for the mount point
     * @param options - Optional input/output mapping options for data flow between parent and subflow
     */
    addSubFlowChartBranch(id: string, subflow: FlowChart<TOut, TScope>, mountName?: string, options?: SubflowMountOptions): SelectorList<TOut, TScope>;
    /**
     * Add multiple simple branches.
     */
    addBranchList(branches: Array<{
        id: string;
        name: string;
        fn?: PipelineStageFunction<TOut, TScope>;
        displayName?: string;
    }>): SelectorList<TOut, TScope>;
    /**
     * Finalize the selector and return to main builder.
     */
    end(): FlowChartBuilder<TOut, TScope>;
}
/**
 * Simplified FlowChartBuilder that builds StageNode and SerializedPipelineStructure directly.
 *
 * Key differences from original:
 * - No _N intermediate class
 * - No parent pointer on nodes
 * - No end() for navigation (only DeciderList.end() and SelectorList.end())
 * - No into() method
 * - No _spawnAt() method
 * - No build callbacks in addFunctionBranch, addListOfFunction, etc.
 * - Builds SerializedPipelineStructure directly with type field (incremental type computation)
 * - Applies buildTimeExtractor immediately when nodes are created (not at build time)
 *
 * _Requirements: flowchart-builder-simplification 1.1, 3.1, 3.2, 3.3, 3.4_
 * _Requirements: incremental-type-computation 1.1, 2.1, 2.2, 3.1, 3.2_
 */
export declare class FlowChartBuilder<TOut = any, TScope = any> {
    private _root?;
    private _rootSpec?;
    private _cursor?;
    private _cursorSpec?;
    private _stageMap;
    _subflowDefs: Map<string, {
        root: StageNode<TOut, TScope>;
    }>;
    private _streamHandlers;
    private _extractor?;
    private _buildTimeExtractor?;
    private _buildTimeExtractorErrors;
    /**
     * Whether narrative generation is enabled at build time.
     *
     * WHY: Stored as a field so setEnableNarrative() or execute(opts) can set it
     * before build() is called. build() includes it in the FlowChart object.
     *
     * _Requirements: pipeline-narrative-generation 1.4_
     */
    private _enableNarrative;
    /** Accumulated description lines, built incrementally as stages are added. */
    private _descriptionParts;
    /** Current step number for description numbering. */
    private _stepCounter;
    /** Map of stage name → individual description for UI tooltips. */
    private _stageDescriptions;
    /** Map of stage name → step number for loopTo step-number lookup. */
    private _stageStepMap;
    /**
     * Increment step counter, format a description line, and push to _descriptionParts.
     *
     * WHY: Centralizes the incremental description accumulation logic so every
     * builder method (start, addFunction, addStreamingFunction, etc.) uses the
     * same formatting and bookkeeping.
     *
     * @param displayName - The display name (falls back to name)
     * @param name - The stage name (used as key in maps)
     * @param description - Optional human-readable description
     */
    private _appendDescriptionLine;
    /**
     * Enable narrative generation at build time.
     *
     * WHY: Allows consumers to opt into narrative via the builder API,
     * so the resulting FlowChart carries the flag and FlowChartExecutor
     * respects it as a default without requiring an explicit
     * enableNarrative() call on the executor.
     *
     * DESIGN: Fluent API — returns `this` for chaining.
     *
     * @returns this builder for chaining
     *
     * @example
     * ```typescript
     * const chart = flowChart('entry', entryFn)
     *   .addFunction('process', processFn)
     *   .setEnableNarrative()
     *   .build();
     * // chart.enableNarrative === true
     * ```
     *
     * _Requirements: pipeline-narrative-generation 1.4_
     */
    setEnableNarrative(): this;
    /**
     * Create a new FlowChartBuilder.
     * @param buildTimeExtractor Optional extractor to apply to each node as it's created.
     *                           Pass this in the constructor to ensure it's applied to ALL nodes.
     * _Requirements: incremental-type-computation 3.2_
     */
    constructor(buildTimeExtractor?: BuildTimeExtractor<any>);
    /**
     * Define the root function of the flow.
     * _Requirements: flowchart-builder-simplification 4.1, 5.1_
     * _Requirements: incremental-type-computation 1.1_
     */
    start(name: string, fn?: PipelineStageFunction<TOut, TScope>, id?: string, displayName?: string, description?: string): this;
    /**
     * Append a linear "next" function and move to it.
     * _Requirements: flowchart-builder-simplification 4.2, 5.2_
     * _Requirements: incremental-type-computation 1.2_
     */
    addFunction(name: string, fn?: PipelineStageFunction<TOut, TScope>, id?: string, displayName?: string, description?: string): this;
    /**
     * Add a streaming function.
     * _Requirements: flowchart-builder-simplification 5.3_
     * _Requirements: incremental-type-computation 1.3_
     */
    addStreamingFunction(name: string, streamId?: string, fn?: PipelineStageFunction<TOut, TScope>, id?: string, displayName?: string, description?: string): this;
    /**
     * Add a legacy output-based decider — returns DeciderList for adding branches.
     *
     * WHY: This is the original decider API where the decider function receives
     * the previous stage's output and returns a branch ID. Kept for backward
     * compatibility with existing consumers.
     *
     * @deprecated Use {@link addDeciderFunction} instead. The new API makes the decider
     * a first-class stage function that reads from scope, providing better decoupling,
     * debug visibility, and alignment with modern state-based routing patterns.
     *
     * _Requirements: flowchart-builder-simplification 6.1_
     * _Requirements: incremental-type-computation 1.4_
     * _Requirements: decider-first-class-stage 4.1, 4.2_
     */
    addDecider(decider: (out?: TOut) => string | Promise<string>): DeciderList<TOut, TScope>;
    /**
     * Add a scope-based decider function — returns DeciderList for adding branches.
     *
     * WHY: Makes the decider a first-class stage function that reads from scope
     * (shared state) instead of the previous stage's output. This decouples the
     * decider from the preceding stage's return type, provides debug visibility
     * (step number, extractor call, snapshot), and aligns with how LangGraph
     * reads from state and Airflow reads from XCom.
     *
     * DESIGN: The decider function IS the stage function — its return value (a string)
     * is the branch ID. No separate decider invocation step. The function is registered
     * in the stageMap like any other stage, and `deciderFn = true` on the StageNode
     * tells Pipeline to interpret the return value as a branch ID.
     *
     * @param name - Stage name for the decider node
     * @param fn - Stage function that receives (scope, breakFn) and returns a branch ID string
     * @param id - Optional stable ID for the node (for debug UI, time-travel, etc.)
     * @param displayName - Optional display name for UI visualization
     * @returns DeciderList for fluent branch configuration
     *
     * @example
     * ```typescript
     * flowChart('entry', entryFn)
     *   .addDeciderFunction('RouteDecider', async (scope) => {
     *     const type = scope.get('type');
     *     return type === 'express' ? 'express-branch' : 'standard-branch';
     *   }, 'route-decider')
     *     .addFunctionBranch('express-branch', 'Express', expressFn)
     *     .addFunctionBranch('standard-branch', 'Standard', standardFn)
     *   .end()
     *   .build();
     * ```
     *
     * _Requirements: decider-first-class-stage 1.1, 1.2, 1.3, 1.4, 1.5, 6.1_
     */
    addDeciderFunction(name: string, fn: PipelineStageFunction<TOut, TScope>, id?: string, displayName?: string, description?: string): DeciderList<TOut, TScope>;
    /**
     * Add a selector - returns SelectorList for adding branches.
     * _Requirements: flowchart-builder-simplification 6.5_
     * _Requirements: incremental-type-computation 1.5_
     */
    addSelector(selector: Selector): SelectorList<TOut, TScope>;
    /**
     * Mount a prebuilt flowchart as a child (fork pattern).
     * _Requirements: flowchart-builder-simplification 5.4_
     * _Requirements: incremental-type-computation 1.7, 4.1_
     * _Requirements: subflow-input-mapping 1.1, 1.5, 7.3_
     *
     * IMPORTANT: This creates a WRAPPER node for the subflow mount point.
     * The subflow's internal structure is preserved in `subflowStructure` property,
     * NOT merged with the wrapper node. This ensures:
     * 1. The subflow's first stage keeps its original ID
     * 2. The mount point has its own distinct ID for navigation
     * 3. Drill-down can access the full subflow structure via `subflowStructure`
     *
     * @param id - Unique identifier for the subflow mount point
     * @param subflow - The prebuilt FlowChart to mount
     * @param mountName - Optional display name for the mount point
     * @param options - Optional input/output mapping options for data flow between parent and subflow
     */
    addSubFlowChart(id: string, subflow: FlowChart<TOut, TScope>, mountName?: string, options?: SubflowMountOptions): this;
    /**
     * Mount a prebuilt flowchart as next (linear continuation).
     * _Requirements: flowchart-builder-simplification 5.5_
     * _Requirements: incremental-type-computation 4.4_
     * _Requirements: subflow-input-mapping 1.3, 1.5, 7.3_
     *
     * IMPORTANT: This creates a WRAPPER node for the subflow mount point.
     * The subflow's internal structure is preserved in `subflowStructure` property,
     * NOT merged with the wrapper node. This ensures:
     * 1. The subflow's first stage keeps its original ID
     * 2. The mount point has its own distinct ID for navigation
     * 3. Drill-down can access the full subflow structure via `subflowStructure`
     *
     * @param id - Unique identifier for the subflow mount point
     * @param subflow - The prebuilt FlowChart to mount
     * @param mountName - Optional display name for the mount point
     * @param options - Optional input/output mapping options for data flow between parent and subflow
     */
    addSubFlowChartNext(id: string, subflow: FlowChart<TOut, TScope>, mountName?: string, options?: SubflowMountOptions): this;
    /**
     * Add parallel children (fork) - simplified, no build callbacks.
     * _Requirements: flowchart-builder-simplification 2.2_
     * _Requirements: incremental-type-computation 1.6_
     */
    addListOfFunction(children: SimplifiedParallelSpec<TOut, TScope>[]): this;
    /**
     * Set a loop target for the current node.
     * _Requirements: flowchart-builder-simplification 5.6_
     * _Requirements: incremental-type-computation 6.1_
     */
    loopTo(stageId: string): this;
    onStream(handler: StreamTokenHandler): this;
    onStreamStart(handler: StreamLifecycleHandler): this;
    onStreamEnd(handler: StreamLifecycleHandler): this;
    addTraversalExtractor<TResult = unknown>(extractor: TraversalExtractor<TResult>): this;
    addBuildTimeExtractor<TResult = FlowChartSpec>(extractor: BuildTimeExtractor<TResult>): this;
    getBuildTimeExtractorErrors(): Array<{
        message: string;
        error: unknown;
    }>;
    /**
     * Compile to FlowChart (returns pre-built structures).
     * _Requirements: flowchart-builder-simplification 4.4, 5.7_
     * _Requirements: incremental-type-computation 3.1, 3.3, 3.4_
     */
    build(): FlowChart<TOut, TScope>;
    /**
     * Emit pure JSON spec (returns pre-built structure).
     * _Requirements: flowchart-builder-simplification 4.5_
     * _Requirements: incremental-type-computation 3.1_
     */
    toSpec<TResult = SerializedPipelineStructure>(): TResult;
    /**
     * Convenience: build & execute.
     */
    execute(scopeFactory: ScopeFactory<TScope>, opts?: ExecOptions): Promise<any>;
    /**
     * Mermaid diagram generator.
     */
    toMermaid(): string;
    private _needCursor;
    private _needCursorSpec;
    /**
     * Apply build-time extractor to a single node immediately.
     * If no extractor registered, returns spec as-is.
     * _Requirements: incremental-type-computation 3.2_
     */
    _applyExtractorToNode(spec: SerializedPipelineStructure): SerializedPipelineStructure;
    /** Add a function to the shared stageMap; fail on conflicting names. */
    _addToMap(name: string, fn: PipelineStageFunction<TOut, TScope>): void;
    /**
     * Merge another flow's stageMap; throw on name collisions.
     *
     * WHY: When mounting subflows, their stage functions need to be accessible
     * from the parent's shared stageMap. An optional `prefix` parameter
     * namespaces all keys (e.g., "classify/SeedScope") to prevent collisions
     * when multiple subflows share the same stage names.
     *
     * @param other - The stageMap to merge in
     * @param prefix - Optional namespace prefix for all keys (e.g., mount id)
     */
    _mergeStageMap(other: Map<string, PipelineStageFunction<TOut, TScope>>, prefix?: string): void;
    /**
     * Deep-clone a StageNode tree, prefixing all `name` (stageMap key) and
     * `subflowId` properties so the tree references the namespaced stageMap.
     *
     * WHY: When two subflows have identically-named stages (e.g., both have
     * "SeedScope"), prefixing avoids stageMap collisions. The cloned tree
     * is stored in _subflowDefs so runtime execution uses the prefixed names.
     *
     * @param node - Root of the tree to clone
     * @param prefix - Namespace prefix (e.g., the mount id "classify")
     * @returns A new tree with all names prefixed
     */
    private _prefixNodeTree;
    /**
     * Append a subflow description line to _descriptionParts.
     *
     * WHY: Both addSubFlowChart and addSubFlowChartNext need the same
     * description accumulation logic, so it's extracted here.
     */
    private _appendSubflowDescription;
}
/**
 * Convenience factory to create a FlowChartBuilder with start() already called.
 * Recommended way to create flows.
 *
 * _Requirements: flowchart-builder-simplification 7.1_
 * _Requirements: incremental-type-computation 3.2_
 *
 * @example
 * ```typescript
 * // Simple branch
 * const branchA = flowChart('handleA', handleAFn)
 *   .addFunction('stepA1', stepA1Fn)
 *   .build();
 *
 * // Main flow with subflow branches
 * const main = flowChart('entry', entryFn)
 *   .addDecider(deciderFn)
 *     .addSubFlowChartBranch('branchA', branchA)
 *   .end()
 *   .build();
 *
 * // With custom extractor (applied to all nodes)
 * const customExtractor = (node) => ({ ...node, custom: true });
 * const flow = flowChart('entry', entryFn, 'id', 'display', customExtractor)
 *   .addFunction('next', nextFn)
 *   .build();
 * ```
 */
export declare function flowChart<TOut = any, TScope = any>(name: string, fn?: PipelineStageFunction<TOut, TScope>, id?: string, displayName?: string, buildTimeExtractor?: BuildTimeExtractor<any>, description?: string): FlowChartBuilder<TOut, TScope>;
/**
 * Convert a pure JSON FlowChartSpec to a StageNode tree.
 * Used by backends to reconstruct the tree from a spec received from frontend.
 *
 * Note: nextNodeDecider is intentionally omitted - runtime uses your BE decider.
 */
export declare function specToStageNode(spec: FlowChartSpec): StageNode<any, any>;
/**
 * @deprecated Use FlowChart instead. This alias exists for backward compatibility.
 */
export type BuiltFlow<TOut = any, TScope = any> = FlowChart<TOut, TScope>;
/**
 * A stage function (relaxed generics for builder ergonomics).
 */
export type StageFn = PipelineStageFunction<any, any>;
/**
 * Legacy ParallelSpec with build callback (for backward compatibility).
 * @deprecated Use SimplifiedParallelSpec instead.
 */
export type ParallelSpec<TOut = any, TScope = any> = SimplifiedParallelSpec<TOut, TScope> & {
    /** @deprecated Build callbacks are no longer supported. Use addSubFlowChartBranch instead. */
    build?: never;
};
/**
 * A branch body for deciders.
 * @deprecated Use addSubFlowChartBranch for nested flowcharts.
 */
export type BranchBody<TOut = any, TScope = any> = {
    name?: string;
    fn?: PipelineStageFunction<TOut, TScope>;
} | ((b: FlowChartBuilder<TOut, TScope>) => void);
/**
 * Branch spec for deciders.
 * @deprecated Use addSubFlowChartBranch for nested flowcharts.
 */
export type BranchSpec<TOut = any, TScope = any> = Record<string, BranchBody<TOut, TScope>>;
/**
 * A reference node that points to a subflow definition.
 */
export interface SubflowRef {
    $ref: string;
    mountId: string;
    displayName?: string;
}
