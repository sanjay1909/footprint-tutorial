/**
 * Pipeline.ts (formerly GraphTraverser.ts)
 *
 * WHY: This is the core execution engine for flowchart-based pipelines.
 * It traverses a tree of StageNodes, executing stage functions in a
 * programmer-friendly order that mirrors natural async/await patterns.
 *
 * DESIGN: The traversal follows a unified order for all node shapes:
 *   // prep        →     parallel gather     →     aggregate/continue
 *   const pre = await prep();
 *   const [x, y] = await Promise.all([fx(pre), fy(pre)]);
 *   return await next(x, y);
 *
 * RESPONSIBILITIES:
 * - Execute stage functions in correct order (stage → children → next)
 * - Handle different node shapes (linear, fork, decider, selector)
 * - Manage break semantics for early termination
 * - Coordinate with extracted handler modules (StageRunner, LoopHandler, etc.)
 * - Support dynamic stages that return StageNode for continuation
 * - Execute subflows with isolated contexts
 *
 * RELATED:
 * - {@link FlowChartExecutor} - Public API wrapper around Pipeline
 * - {@link StageRunner} - Executes individual stage functions
 * - {@link ChildrenExecutor} - Handles parallel children execution
 * - {@link SubflowExecutor} - Handles subflow execution with isolation
 * - {@link LoopHandler} - Handles dynamic next and loop-back logic
 * - {@link DeciderHandler} - Handles decider evaluation and branching
 *
 * Concretely, for each node shape we execute:
 *
 * 1) Linear node (no children; may have `next`)
 *    • Run **this node's stage** (if any) → commit → (break?) → **next**
 *
 * 2) Fork-only (has `children`, **no** `next`, not a decider)
 *    • Run **stage** (if any) → commit
 *    • Run **ALL children in parallel** (each child commits after it settles)
 *    • **RETURN** children bundle: `{ [childId]: { result, isError } }`
 *
 * 3) Fork + next (has `children` and `next`, not a decider)
 *    • Run **stage** (if any) → commit
 *    • Run **ALL children in parallel** (commit on settle)
 *    • **Continue** to `next` (downstream stages read children's committed writes)
 *
 * 4) Decider (has `children` and `nextNodeDecider`)
 *    • Run **stage** (if any) → commit
 *    • **Decider** picks EXACTLY ONE child `id`
 *    • **Continue** into that chosen child (only that branch runs)
 *
 * Break semantics:
 *    If a stage calls `breakFn()`, we commit and **STOP** at this node:
 *      – for fork-only: children do **not** run; nothing continues
 *      – for fork + next: children and next do **not** run
 *      – for linear: next does **not** run
 *      – for decider: we do **not** evaluate the decider; no child runs
 *
 * Patch/visibility model:
 *   – A stage writes into a local patch; we always `commitPatch()` after it returns or throws
 *   – Children always `commitPatch()` after they settle; throttled children can flag
 *     `monitor.isThrottled = true` via `throttlingErrorChecker`
 *
 * Sync + Async stages:
 *   – We keep the original engine's behavior: **only** `await` real Promises
 *     (using `output instanceof Promise`), otherwise return the value directly.
 *     This avoids "thenable assimilation" side-effects/probes on arbitrary objects.
 */
import { PipelineRuntime, RuntimeSnapshot } from '../memory/PipelineRuntime';
import { ScopeFactory } from '../memory/types';
import { PipelineStageFunction, StreamHandlers, SubflowResult, TreeOfFunctionsResponse, TraversalExtractor, ExtractorError, SubflowMountOptions } from './types';
import { ScopeProtectionMode } from '../../scope/protection/types';
import type { SerializedPipelineStructure } from '../builder/FlowChartBuilder';
export type Decider = (nodeArgs: any) => string | Promise<string>;
/**
 * Selector
 * ------------------------------------------------------------------
 * A function that picks ONE OR MORE children from a children array to execute.
 * Unlike Decider (which picks exactly one), Selector can return:
 * - A single string ID (behaves like Decider)
 * - An array of string IDs (selected children execute in parallel)
 * - An empty array (skip all children, continue to next if present)
 *
 * WHY: This enables selective parallel branching where only a subset of
 * children are executed based on runtime conditions.
 *
 * @param nodeArgs - The stage output or input passed to the selector
 * @returns Single ID, array of IDs, or Promise resolving to either
 *
 * _Requirements: 8.1, 8.2_
 */
export type Selector = (nodeArgs: any) => string | string[] | Promise<string | string[]>;
export type StageNode<TOut = any, TScope = any> = {
    /** Human-readable stage name; also used as the stageMap key */
    name: string;
    /** Optional stable id (required by decider/fork aggregation) */
    id?: string;
    /** Human-readable display name for UI visualization (e.g., "User Prompt" instead of "useQuestion") */
    displayName?: string;
    /**
     * Human-readable description of what this stage does.
     * Used for execution context descriptions and auto-generated tool descriptions.
     */
    description?: string;
    /** Linear continuation */
    next?: StageNode<TOut, TScope>;
    /** Parallel children (fork) */
    children?: StageNode<TOut, TScope>[];
    /** Decider (mutually exclusive with `next`); must select a child `id` */
    nextNodeDecider?: Decider;
    /**
     * When true, this node's `fn` is a scope-based decider function.
     * The fn receives (scope, breakFn) and its string return value
     * is used as the branch ID to select the child node to execute.
     *
     * WHY: Distinguishes scope-based deciders (new `addDeciderFunction` API)
     * from legacy output-based deciders (`addDecider` API) so that Pipeline
     * and DeciderHandler can route to the correct execution path.
     *
     * DESIGN: A boolean flag rather than storing the function separately
     * because the function is already in `node.fn` and the stageMap.
     * The flag tells Pipeline to interpret the return value as a branch ID.
     *
     * Mutually exclusive with `nextNodeDecider`:
     * - `deciderFn = true` → scope-based decider (reads from scope, fn returns branch ID)
     * - `nextNodeDecider` set → legacy output-based decider (reads from previous stage output)
     *
     * When set, `fn` MUST be defined (either embedded or in stageMap).
     * When set, `children` MUST be defined with at least one branch.
     *
     * _Requirements: 5.1, 5.2_
     */
    deciderFn?: boolean;
    /**
     * Selector for multi-choice branching.
     * Unlike Decider (picks ONE), Selector can pick MULTIPLE children to execute in parallel.
     * Mutually exclusive with `nextNodeDecider`.
     *
     * _Requirements: 8.1_
     */
    nextNodeSelector?: Selector;
    /** Optional embedded function for this node; otherwise resolved from stageMap by `name` */
    fn?: PipelineStageFunction<TOut, TScope>;
    /**
     * Indicates this stage emits tokens incrementally via a stream callback.
     * When true, TreePipeline will inject a streamCallback as the 3rd parameter to the stage function.
     */
    isStreaming?: boolean;
    /**
     * Unique identifier for the stream, used to route tokens to the correct handler.
     * Defaults to the stage name if not provided when using addStreamingFunction.
     */
    streamId?: string;
    /** True if this is the root node of a mounted subflow */
    isSubflowRoot?: boolean;
    /** Mount id of the subflow (e.g., "llm-core") */
    subflowId?: string;
    /** Display name of the subflow (e.g., "LLM Core") */
    subflowName?: string;
    /**
     * Reference to a subflow definition in the `subflows` dictionary.
     * When present, this node is a lightweight reference that should be resolved
     * by looking up `subflows[$ref]` to get the actual subflow structure.
     *
     * Used by reference-based subflow architecture to avoid deep-copying.
     */
    $ref?: string;
    /**
     * Unique identifier for this mount instance.
     * Distinguishes multiple mounts of the same subflow definition.
     */
    mountId?: string;
    /**
     * Options for subflow mounting (input/output mapping, scope mode).
     * Only present on nodes where isSubflowRoot is true.
     *
     * Enables explicit data contracts between parent and subflow:
     * - inputMapper: Extract data from parent scope to seed subflow's initial scope
     * - outputMapper: Extract data from subflow output to write back to parent scope
     * - scopeMode: 'isolated' (default) or 'inherit' for scope inheritance behavior
     *
     * _Requirements: subflow-input-mapping 1.5_
     */
    subflowMountOptions?: SubflowMountOptions;
    /**
     * Inline subflow definition for dynamic subflow attachment.
     *
     * WHY: Enables runtime subflow attachment without build-time registration.
     * A stage function can construct or select a compiled FlowChart at runtime
     * and return it inline on the StageNode. Pipeline auto-registers the
     * definition in the subflows dictionary before routing to SubflowExecutor.
     *
     * DESIGN: When present alongside `isSubflowRoot: true` and `subflowId`,
     * Pipeline registers `{ root, buildTimeStructure }` in the subflows
     * dictionary using first-write-wins semantics, merges stageMap entries,
     * and then proceeds with normal subflow resolution and execution.
     *
     * Use cases:
     * - Agent tools that are compiled sub-agent FlowCharts
     * - Microservice orchestration where service pipelines are compiled at startup
     * - Plugin systems where plugins register FlowCharts dynamically
     *
     * @example
     * ```typescript
     * // A stage returns a dynamic subflow:
     * return {
     *   name: 'run-sub-agent',
     *   isSubflowRoot: true,
     *   subflowId: 'social-media-agent',
     *   subflowDef: compiledAgentFlowChart,  // { root, stageMap, buildTimeStructure }
     *   subflowMountOptions: {
     *     inputMapper: (parentScope) => ({ agent: { messages: [...] } }),
     *   },
     * };
     * ```
     *
     * _Requirements: dynamic-subflow-support 1.1, 1.2, 1.4_
     */
    subflowDef?: {
        root: StageNode;
        stageMap?: Map<string, PipelineStageFunction<TOut, TScope>>;
        buildTimeStructure?: unknown;
        subflows?: Record<string, {
            root: StageNode;
        }>;
    };
};
/**
 * isStageNodeReturn
 * ------------------------------------------------------------------
 * Detects if a stage output is a StageNode for dynamic continuation.
 * Uses duck-typing: must have 'name' (string) AND at least one continuation property.
 *
 * WHY: This enables stage functions to return a StageNode directly for dynamic
 * pipeline continuation (parallel children, loops, etc.) without requiring
 * explicit flags on the node definition.
 *
 * DESIGN: We use duck-typing rather than instanceof because:
 * 1. StageNode is a type alias, not a class
 * 2. Allows plain objects to be used as dynamic continuations
 * 3. Safely handles proxy objects (like Zod scopes) that may throw on property access
 *
 * @param output - The stage function's return value
 * @returns true if the output is a StageNode for dynamic continuation
 *
 * _Requirements: 1.1, 1.2, 1.3_
 */
export declare function isStageNodeReturn(output: unknown): output is StageNode;
/**
 * Pipeline
 * ------------------------------------------------------------------
 * Core execution engine for flowchart-based pipelines.
 *
 * WHY: Provides a unified traversal algorithm that handles all node shapes
 * (linear, fork, decider, selector) with consistent semantics.
 *
 * RESPONSIBILITIES:
 * - Execute stage functions in correct order
 * - Coordinate with extracted handler modules
 * - Manage execution state (iteration counters, subflow results, etc.)
 * - Support dynamic stages and subflows
 *
 * DESIGN DECISIONS:
 * - Handler modules (StageRunner, LoopHandler, etc.) are injected for testability
 * - Uses PipelineContext to share state with handlers
 * - Supports both sync and async stages without thenable assimilation
 *
 * @example
 * ```typescript
 * const pipeline = new Pipeline(root, stageMap, scopeFactory);
 * const result = await pipeline.execute();
 * ```
 */
export declare class Pipeline<TOut, TScope> {
    private stageMap;
    private root;
    private pipelineRuntime;
    /** Normalized scope factory injected by the caller (class | factory | plugin → factory) */
    private readonly ScopeFactory;
    private readonly readOnlyContext?;
    private readonly throttlingErrorChecker?;
    /**
     * Stream handlers for streaming stages.
     * Contains callbacks for token emission and lifecycle events (start/end).
     */
    private readonly streamHandlers?;
    /**
     * Iteration counter for loop support.
     * Tracks how many times each node ID has been visited (for context path generation).
     * Key: node.id, Value: iteration count (0 = first visit)
     */
    private iterationCounters;
    /**
     * Collected subflow execution results during pipeline run.
     * Keyed by subflowId for lookup during API response construction.
     *
     * _Requirements: 4.1, 4.2_
     */
    private subflowResults;
    /**
     * Optional traversal extractor function.
     * Called after each stage completes to extract data.
     */
    private readonly extractor?;
    /**
     * Collected extracted results during pipeline run.
     * Keyed by stage path (e.g., "root.child.grandchild").
     */
    private extractedResults;
    /**
     * Errors encountered during extraction.
     * Logged but don't stop pipeline execution.
     */
    private extractorErrors;
    /**
     * Step counter for execution order tracking.
     * Incremented before each extractor call.
     * 1-based: first stage gets stepNumber 1.
     *
     * _Requirements: unified-extractor-architecture 3.1_
     */
    private stepCounter;
    /**
     * Current subflow context for subflowId propagation.
     * Set when entering a subflow, cleared when exiting.
     * Propagated to all children within the subflow via structureMetadata.
     *
     * _Requirements: unified-extractor-architecture 3.3, 3.4, 3.5_
     */
    private currentSubflowId?;
    /**
     * Current fork context for parallelGroupId propagation.
     * Set when executing fork children, cleared after children complete.
     * Propagated to parallel children via structureMetadata.
     *
     * _Requirements: unified-extractor-architecture 3.6, 3.7_
     */
    private currentForkId?;
    /**
     * Protection mode for scope access.
     * When 'error' (default), throws on direct property assignment.
     * When 'warn', logs warning but allows assignment.
     * When 'off', no protection is applied.
     *
     * _Requirements: 5.1, 5.2, 5.3_
     */
    private readonly scopeProtectionMode;
    /**
     * Memoized subflow definitions.
     * Key is the subflow's root name, value contains the subflow root node.
     * Used to resolve reference nodes (nodes with `isSubflowRoot` but no `fn`).
     */
    private readonly subflows?;
    /**
     * Whether to enrich StageSnapshots with scope state, debug metadata,
     * stage output, and history index during traversal.
     *
     * WHY: When enabled, the extractor receives full stage data during traversal,
     * eliminating the need for a redundant post-traversal walk via
     * PipelineRuntime.getSnapshot(). Defaults to false for zero-overhead
     * backward compatibility.
     *
     * DESIGN: Opt-in flag so existing consumers pay no additional cost.
     * When true, callExtractor() captures additional data from StageContext
     * and GlobalStore at commit time.
     *
     * _Requirements: single-pass-debug-structure 4.1, 4.3, 8.3_
     */
    private readonly enrichSnapshots;
    /**
     * NodeResolver module for node lookup and subflow reference resolution.
     * Extracted from Pipeline.ts for Single Responsibility Principle.
     *
     * _Requirements: 3.1, 3.2, 3.3_
     */
    private readonly nodeResolver;
    /**
     * ChildrenExecutor module for parallel children execution.
     * Extracted from Pipeline.ts for Single Responsibility Principle.
     *
     * _Requirements: 2.1, 2.2, 2.3_
     */
    private readonly childrenExecutor;
    /**
     * SubflowExecutor module for subflow execution with isolated contexts.
     * Extracted from Pipeline.ts for Single Responsibility Principle.
     *
     * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
     */
    private readonly subflowExecutor;
    /**
     * StageRunner module for executing individual stage functions.
     * Extracted from Pipeline.ts for Single Responsibility Principle.
     *
     * _Requirements: phase2-handlers 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
     */
    private readonly stageRunner;
    /**
     * LoopHandler module for dynamic next, iteration counting, and loop-back logic.
     * Extracted from Pipeline.ts for Single Responsibility Principle.
     *
     * _Requirements: phase2-handlers 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
     */
    private readonly loopHandler;
    /**
     * DeciderHandler module for decider evaluation and branching.
     * Extracted from Pipeline.ts for Single Responsibility Principle.
     *
     * _Requirements: phase2-handlers 2.1, 2.2, 2.3, 2.4, 2.5_
     */
    private readonly deciderHandler;
    /**
     * Narrative generator for producing human-readable execution story.
     *
     * WHY: Holds either a NarrativeGenerator (when enabled) or a
     * NullNarrativeGenerator (when disabled). The Null Object pattern
     * lets handlers call narrative methods unconditionally — zero cost
     * when narrative is not needed.
     *
     * _Requirements: 1.2, 1.3, 9.3_
     */
    private readonly narrativeGenerator;
    /**
     * Static build-time pipeline structure snapshot from FlowChartBuilder.
     *
     * WHY: Stored so that Pipeline can deep-clone it into `runtimePipelineStructure`
     * during initialization (task 2.1). Kept as an immutable reference — never
     * mutated during execution — so consumers can still access the original
     * static structure for diffing or caching.
     *
     * _Requirements: runtime-pipeline-structure 1.1, 1.2_
     */
    private readonly buildTimeStructure?;
    /**
     * Mutable runtime pipeline structure that starts as a deep clone of buildTimeStructure
     * and gets updated as dynamic stages are discovered during execution.
     *
     * WHY: Makes the library the single source of truth for the complete execution structure,
     * eliminating the need for UI-side reconstruction (runtimeMerger).
     *
     * _Requirements: runtime-pipeline-structure 1.1, 1.4_
     */
    private runtimePipelineStructure?;
    /**
     * Lookup map from node ID/name to its SerializedPipelineStructure node
     * in the runtimePipelineStructure tree. Enables O(1) updates.
     *
     * WHY: When a dynamic event occurs, we need to find the corresponding
     * structure node quickly. Walking the tree each time would be O(n).
     *
     * _Requirements: runtime-pipeline-structure 1.3_
     */
    private structureNodeMap;
    constructor(root: StageNode, stageMap: Map<string, PipelineStageFunction<TOut, TScope>>, scopeFactory: ScopeFactory<TScope>, defaultValuesForContext?: unknown, initialContext?: unknown, readOnlyContext?: unknown, throttlingErrorChecker?: (error: unknown) => boolean, streamHandlers?: StreamHandlers, extractor?: TraversalExtractor, scopeProtectionMode?: ScopeProtectionMode, subflows?: Record<string, {
        root: StageNode<TOut, TScope>;
    }>, enrichSnapshots?: boolean, narrativeEnabled?: boolean, buildTimeStructure?: SerializedPipelineStructure);
    /**
     * Create a PipelineContext object for use by extracted modules.
     * This provides all the shared state needed by NodeResolver, ChildrenExecutor, etc.
     *
     * @returns PipelineContext with all required fields
     *
     * _Requirements: 5.4_
     */
    private createPipelineContext;
    /** Execute the pipeline from the root node. */
    execute(): Promise<TreeOfFunctionsResponse>;
    /**
     * Returns the runtime pipeline structure with all dynamic updates applied.
     *
     * WHY: Provides the complete, authoritative pipeline structure including
     * dynamically added children, subflows, next nodes, and loop iteration counts.
     * Consumers can use this for visualization without needing to reconstruct
     * the structure from separate data sources.
     *
     * Before execution: returns the initial deep clone of buildTimeStructure.
     * After execution: returns the fully enriched structure.
     * When buildTimeStructure was not provided: returns undefined.
     *
     * _Requirements: runtime-pipeline-structure 6.2, 6.3, 6.4_
     */
    getRuntimePipelineStructure(): SerializedPipelineStructure | undefined;
    /**
     * Initialize the runtime pipeline structure from the build-time structure.
     *
     * WHY: Creates a mutable deep clone so that dynamic changes during execution
     * (children, subflows, next nodes, loop iterations) can be reflected in a
     * single authoritative structure without mutating the original buildTimeStructure.
     *
     * DESIGN: Uses JSON.parse(JSON.stringify(...)) for deep cloning — simple and
     * sufficient since SerializedPipelineStructure contains only JSON-safe values.
     *
     * @param buildTimeStructure - The static structure from FlowChartBuilder, or undefined
     *
     * _Requirements: runtime-pipeline-structure 1.1, 1.3, 1.4_
     */
    private initRuntimeStructure;
    /**
     * Build the StructureNodeMap by recursively walking the structure tree.
     * Keys are node IDs (preferred) or names (fallback).
     *
     * WHY: Enables O(1) lookups when dynamic events occur during execution,
     * avoiding an O(n) tree walk for each update.
     *
     * @param node - The current structure node to register and recurse into
     *
     * _Requirements: runtime-pipeline-structure 1.3_
     */
    private buildStructureNodeMap;
    /**
     * Convert a runtime StageNode into a SerializedPipelineStructure node.
     *
     * WHY: When dynamic stages are discovered during execution, we need to create
     * corresponding structure nodes for the runtimePipelineStructure. This method
     * provides a consistent conversion that reuses computeNodeType for the type field
     * and recursively handles children/next chains.
     *
     * DESIGN: Copies only the serialization-relevant fields from StageNode.
     * Metadata flags (isStreaming, isSubflowRoot, hasDecider, hasSelector) are set
     * conditionally to keep the serialized output sparse. Subflow buildTimeStructure
     * is attached as-is since it's already in serialized form.
     *
     * @param node - The runtime StageNode to convert
     * @returns A SerializedPipelineStructure node representing the same stage
     *
     * _Requirements: runtime-pipeline-structure 7.1, 7.2, 7.3, 7.4_
     */
    private stageNodeToStructure;
    /**
     * Update the runtime structure when dynamic children are discovered.
     *
     * WHY: When a stage returns a StageNode with dynamic children via isStageNodeReturn(),
     * the runtime StageNode tree is mutated but the serialized structure would be stale.
     * This method keeps runtimePipelineStructure in sync by converting each dynamic child
     * into a SerializedPipelineStructure node and inserting it under the parent.
     *
     * DESIGN: Uses structureNodeMap for O(1) parent lookup, then delegates to
     * stageNodeToStructure for recursive conversion and buildStructureNodeMap for
     * registration. Selector/decider flags are set on the parent so the UI can
     * render branching controls correctly.
     *
     * @param parentNodeId - The ID (or name) of the parent node in the structure
     * @param dynamicChildren - The runtime StageNode children to convert and insert
     * @param hasSelector - Whether the dynamic node has a nextNodeSelector
     * @param hasDecider - Whether the dynamic node has a nextNodeDecider
     *
     * _Requirements: runtime-pipeline-structure 2.1, 2.2, 2.3_
     */
    private updateStructureWithDynamicChildren;
    /**
     * Update the runtime structure when a dynamic subflow is registered.
     *
     * WHY: When a subflow is auto-registered at runtime (e.g., tool dispatch spawning
     * a sub-agent), the serialized structure needs to reflect the subflow hierarchy so
     * consumers get the complete picture without UI-side reconstruction.
     *
     * DESIGN: Marks the mount node as a subflow root and attaches the subflow's
     * build-time structure for drill-down visualization. Registers subflow nodes
     * in the structureNodeMap so subsequent dynamic updates within the subflow
     * can find their targets via O(1) lookup.
     *
     * @param mountNodeId - ID of the node where the subflow is mounted
     * @param subflowId - Unique identifier for the subflow
     * @param subflowName - Optional display name for the subflow
     * @param subflowBuildTimeStructure - Optional build-time structure of the subflow for drill-down
     */
    private updateStructureWithDynamicSubflow;
    /**
     * Update the runtime structure when a dynamic next is discovered.
     *
     * WHY: When a stage returns a StageNode with a `next` chain via `isStageNodeReturn()`,
     * the runtime StageNode tree is mutated but the serialized structure is not. This method
     * keeps `runtimePipelineStructure` in sync so consumers get the complete linear
     * continuation without external reconstruction.
     *
     * DESIGN: Mirrors the pattern of `updateStructureWithDynamicChildren` and
     * `updateStructureWithDynamicSubflow` — guard, lookup, convert, attach, register.
     *
     * @param currentNodeId - ID of the node whose stage returned the dynamic next
     * @param dynamicNext   - The StageNode to attach as the next continuation
     *
     * _Requirements: runtime-pipeline-structure 4.1, 4.2_
     */
    private updateStructureWithDynamicNext;
    /**
     * Update the runtime structure with loop iteration count for a node.
     *
     * WHY: When a node is visited more than once due to a loop, the runtime
     * structure should reflect the total number of executions so that
     * consumers (e.g., debug UI) can display iteration counts without
     * reconstructing them from runtime data.
     *
     * DESIGN: Called via an onIterationUpdate callback from LoopHandler,
     * which owns the iteration counters. The count passed here is the
     * total number of visits (1-based: first loop-back = 2).
     *
     * @param nodeId - The ID of the node being iterated
     * @param count - The total iteration count (number of times visited)
     *
     * _Requirements: runtime-pipeline-structure 5.1_
     */
    private updateStructureIterationCount;
    /** Resolve a stage function: prefer embedded `node.fn`, else look up by `node.name` in `stageMap`. */
    private getStageFn;
    /**
     * Execute a single node with the unified order described in the file header.
     *
     * @param node         Current node to execute
     * @param context      Current StageContext
     * @param breakFlag    Break flag bubbled through recursion
     * @param branchPath   Logical pipeline id/path (for logs); inherited by children
     */
    private executeNode;
    /**
     * Execute a node's stage function with **sync+async safety**:
     *  - If it's a real Promise, await it
     *  - Otherwise return the value as-is (no thenable assimilation)
     *
     * For streaming stages (node.isStreaming === true):
     *  - Creates a bound streamCallback that routes tokens to the registered handler
     *  - Calls onStart lifecycle hook before execution
     *  - Accumulates tokens during streaming
     *  - Calls onEnd lifecycle hook after execution with accumulated text
     *
     * Note: Dynamic behavior is detected via isStageNodeReturn() on the stage output,
     * not via node flags. Any stage can return a StageNode for dynamic continuation.
     *
     * Delegates to StageRunner module for actual execution.
     * _Requirements: phase2-handlers 1.1, 1.2, 4.3, 4.4, 6.1_
     */
    private executeStage;
    /**
     * Compute the node type based on node properties.
     * This logic was previously in service-layer serializePipelineStructure().
     *
     * @param node - The stage node to compute type for
     * @returns The computed node type
     *
     * _Requirements: unified-extractor-architecture 3.2_
     */
    private computeNodeType;
    /**
     * Build the RuntimeStructureMetadata for a node.
     * Called during traversal to provide pre-computed metadata to the extractor.
     *
     * @param node - The stage node to build metadata for
     * @returns The computed RuntimeStructureMetadata
     *
     * _Requirements: unified-extractor-architecture 3.1-3.10_
     */
    private buildStructureMetadata;
    /**
     * Call the extractor for a stage and store the result.
     * Handles errors gracefully - logs and continues execution.
     *
     * Increments stepCounter before creating snapshot to provide
     * 1-based step numbers for time traveler synchronization.
     *
     * Includes pre-computed structureMetadata so consumers can build
     * serialized structure at runtime without post-processing getRuntimeRoot().
     *
     * @param node - The stage node
     * @param context - The stage context (after commitPatch)
     * @param stagePath - The full path to this stage (e.g., "root.child")
     * @param stageOutput - The stage function's return value (undefined for stages
     *   that return a StageNode for dynamic continuation or stages without functions).
     *   Used by enrichment to populate StageSnapshot.stageOutput.
     *   _Requirements: single-pass-debug-structure 1.3_
     * @param errorInfo - Error details when the stage threw during execution.
     *   Contains `type` (error classification) and `message` (error description).
     *   Used by enrichment to populate StageSnapshot.errorInfo.
     *   _Requirements: single-pass-debug-structure 1.4_
     *
     * _Requirements: unified-extractor-architecture 3.1, 3.2, 3.3, 3.4, 5.3_
     */
    private callExtractor;
    /**
     * Generate the stage path for extractor results.
     * Uses node.id if available, otherwise node.name.
     * Combines with branchPath for nested stages.
     *
     * @param node - The stage node
     * @param branchPath - The branch path prefix (e.g., "root.child")
     * @param contextStageName - Optional stage name from StageContext, which includes
     *   iteration suffixes (e.g., "CallLLM.1") for loop iterations. When the context
     *   name differs from the base node name (indicating an iteration), we use it
     *   to ensure loop iterations produce unique keys in extractedResults.
     */
    private getStagePath;
    /**
     * Auto-register a dynamic subflow definition in the subflows dictionary.
     *
     * WHY: When a stage returns a dynamic StageNode with `subflowDef`, the
     * compiled FlowChart needs to be registered so SubflowExecutor and
     * NodeResolver can resolve it. This method handles the registration,
     * stageMap merging, and handler context updates.
     *
     * DESIGN: First-write-wins — existing definitions are preserved.
     * StageMap entries from the subflow are merged (parent entries preserved).
     * Handler contexts are updated if the subflows dictionary was just created.
     *
     * @param subflowId - The subflow ID to register under
     * @param subflowDef - The compiled FlowChart definition
     *
     * _Requirements: dynamic-subflow-support 2.1, 2.2, 2.3, 2.4, 2.5_
     */
    private autoRegisterSubflowDef;
    /** Returns the full context tree (global + stage contexts) for observability panels. */
    getContextTree(): RuntimeSnapshot;
    /** Returns the PipelineRuntime (root holder of StageContexts). */
    getContext(): PipelineRuntime;
    /** Sets a root object value into the global context (utility). */
    setRootObject(path: string[], key: string, value: unknown): void;
    /** Returns pipeline ids inherited under this root (for debugging fan-out). */
    getInheritedPipelines(): any;
    /**
     * Returns the current pipeline root node (including runtime modifications).
     *
     * This is useful for serializing the pipeline structure after execution,
     * which includes any dynamic children or loop targets added at runtime
     * by stages that return StageNode.
     *
     * @returns The root StageNode with runtime modifications
     */
    getRuntimeRoot(): StageNode;
    /**
     * Returns the collected SubflowResultsMap after pipeline execution.
     * Used by the service layer to include subflow data in API responses.
     *
     * _Requirements: 4.3_
     */
    getSubflowResults(): Map<string, SubflowResult>;
    /**
     * Returns the collected extracted results after pipeline execution.
     * Map keys are stage paths (e.g., "root.child.grandchild").
     */
    getExtractedResults<TResult = unknown>(): Map<string, TResult>;
    /**
     * Returns any errors that occurred during extraction.
     * Useful for debugging extractor issues.
     */
    getExtractorErrors(): ExtractorError[];
    /**
     * Returns the narrative sentences from the current execution.
     *
     * WHY: Delegates to the narrative generator's getSentences() method.
     * When narrative is disabled (NullNarrativeGenerator), returns an empty array.
     * When enabled, returns the ordered array of human-readable sentences
     * produced during traversal.
     *
     * @returns Ordered array of narrative sentences, or empty array if disabled
     *
     * _Requirements: 1.2, 1.3, 2.1_
     */
    getNarrative(): string[];
}
