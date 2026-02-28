"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pipeline = exports.isStageNodeReturn = void 0;
const PipelineRuntime_1 = require("../memory/PipelineRuntime");
const logger_1 = require("../../utils/logger");
const NodeResolver_1 = require("./handlers/NodeResolver");
const ChildrenExecutor_1 = require("./handlers/ChildrenExecutor");
const SubflowExecutor_1 = require("./handlers/SubflowExecutor");
const StageRunner_1 = require("./handlers/StageRunner");
const LoopHandler_1 = require("./handlers/LoopHandler");
const DeciderHandler_1 = require("./handlers/DeciderHandler");
const NarrativeGenerator_1 = require("./narrative/NarrativeGenerator");
const NullNarrativeGenerator_1 = require("./narrative/NullNarrativeGenerator");
// Note: Dynamic behavior is detected via isStageNodeReturn() duck-typing on stage output.
// No isDynamic flag needed on node definition - stages that return StageNode are automatically
// treated as dynamic continuations.
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
function isStageNodeReturn(output) {
    // Must be a non-null object
    if (!output || typeof output !== 'object')
        return false;
    // Use try-catch to safely handle proxy objects that throw on property access
    try {
        const obj = output;
        // Must have 'name' property as a string
        if (typeof obj.name !== 'string')
            return false;
        // Must have at least one continuation property
        // Note: children must be a non-empty array to count as continuation
        // Note: `deciderFn` is a boolean flag on StageNode, NOT a continuation property.
        // It marks a node's fn as a scope-based decider but doesn't itself indicate
        // dynamic continuation. We intentionally exclude it from this check to prevent
        // false positives when duck-typing stage output objects.
        // _Requirements: 5.1_
        const hasContinuation = (Array.isArray(obj.children) && obj.children.length > 0) ||
            obj.next !== undefined ||
            typeof obj.nextNodeDecider === 'function' ||
            typeof obj.nextNodeSelector === 'function';
        return hasContinuation;
    }
    catch (_a) {
        // If property access throws (e.g., Zod scope proxy), it's not a StageNode
        return false;
    }
}
exports.isStageNodeReturn = isStageNodeReturn;
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
class Pipeline {
    constructor(root, stageMap, scopeFactory, defaultValuesForContext, initialContext, readOnlyContext, throttlingErrorChecker, streamHandlers, extractor, scopeProtectionMode, subflows, enrichSnapshots, narrativeEnabled, buildTimeStructure) {
        /**
         * Iteration counter for loop support.
         * Tracks how many times each node ID has been visited (for context path generation).
         * Key: node.id, Value: iteration count (0 = first visit)
         */
        this.iterationCounters = new Map();
        /**
         * Collected subflow execution results during pipeline run.
         * Keyed by subflowId for lookup during API response construction.
         *
         * _Requirements: 4.1, 4.2_
         */
        this.subflowResults = new Map();
        /**
         * Collected extracted results during pipeline run.
         * Keyed by stage path (e.g., "root.child.grandchild").
         */
        this.extractedResults = new Map();
        /**
         * Errors encountered during extraction.
         * Logged but don't stop pipeline execution.
         */
        this.extractorErrors = [];
        /**
         * Step counter for execution order tracking.
         * Incremented before each extractor call.
         * 1-based: first stage gets stepNumber 1.
         *
         * _Requirements: unified-extractor-architecture 3.1_
         */
        this.stepCounter = 0;
        /**
         * Lookup map from node ID/name to its SerializedPipelineStructure node
         * in the runtimePipelineStructure tree. Enables O(1) updates.
         *
         * WHY: When a dynamic event occurs, we need to find the corresponding
         * structure node quickly. Walking the tree each time would be O(n).
         *
         * _Requirements: runtime-pipeline-structure 1.3_
         */
        this.structureNodeMap = new Map();
        this.root = root;
        this.stageMap = stageMap;
        this.readOnlyContext = readOnlyContext;
        this.pipelineRuntime = new PipelineRuntime_1.PipelineRuntime(this.root.name, defaultValuesForContext, initialContext);
        this.throttlingErrorChecker = throttlingErrorChecker;
        this.ScopeFactory = scopeFactory;
        this.streamHandlers = streamHandlers;
        this.extractor = extractor;
        this.scopeProtectionMode = scopeProtectionMode !== null && scopeProtectionMode !== void 0 ? scopeProtectionMode : 'error';
        this.subflows = subflows;
        this.enrichSnapshots = enrichSnapshots !== null && enrichSnapshots !== void 0 ? enrichSnapshots : false;
        this.buildTimeStructure = buildTimeStructure;
        // Deep-clone buildTimeStructure into runtimePipelineStructure and build
        // the O(1) lookup map. No-op when buildTimeStructure is not provided.
        // _Requirements: runtime-pipeline-structure 1.1, 1.3, 1.4_
        this.initRuntimeStructure(buildTimeStructure);
        // Create narrative generator based on opt-in flag.
        // WHY: NullNarrativeGenerator is the default — zero allocation, zero string
        // formatting. Only when the consumer explicitly enables narrative do we
        // allocate the real NarrativeGenerator with its sentences array.
        // _Requirements: 1.2, 1.3, 9.3_
        this.narrativeGenerator = narrativeEnabled
            ? new NarrativeGenerator_1.NarrativeGenerator()
            : new NullNarrativeGenerator_1.NullNarrativeGenerator();
        // Initialize NodeResolver with shared context
        this.nodeResolver = new NodeResolver_1.NodeResolver(this.createPipelineContext());
        // Initialize ChildrenExecutor with shared context and executeNode callback
        // Note: We bind executeNode to preserve 'this' context
        this.childrenExecutor = new ChildrenExecutor_1.ChildrenExecutor(this.createPipelineContext(), this.executeNode.bind(this));
        // Initialize SubflowExecutor with shared context and required callbacks
        // Note: We bind methods to preserve 'this' context
        this.subflowExecutor = new SubflowExecutor_1.SubflowExecutor(this.createPipelineContext(), this.nodeResolver, this.executeStage.bind(this), this.callExtractor.bind(this), this.getStageFn.bind(this));
        // Initialize StageRunner with shared context
        this.stageRunner = new StageRunner_1.StageRunner(this.createPipelineContext());
        // Initialize LoopHandler with shared context and NodeResolver
        this.loopHandler = new LoopHandler_1.LoopHandler(this.createPipelineContext(), this.nodeResolver, 
        // Callback to update runtime pipeline structure with iteration count
        // _Requirements: runtime-pipeline-structure 5.1_
        (nodeId, count) => this.updateStructureIterationCount(nodeId, count));
        // Initialize DeciderHandler with shared context and NodeResolver
        this.deciderHandler = new DeciderHandler_1.DeciderHandler(this.createPipelineContext(), this.nodeResolver);
    }
    /**
     * Create a PipelineContext object for use by extracted modules.
     * This provides all the shared state needed by NodeResolver, ChildrenExecutor, etc.
     *
     * @returns PipelineContext with all required fields
     *
     * _Requirements: 5.4_
     */
    createPipelineContext() {
        return {
            stageMap: this.stageMap,
            root: this.root,
            pipelineRuntime: this.pipelineRuntime,
            ScopeFactory: this.ScopeFactory,
            subflows: this.subflows,
            throttlingErrorChecker: this.throttlingErrorChecker,
            streamHandlers: this.streamHandlers,
            scopeProtectionMode: this.scopeProtectionMode,
            readOnlyContext: this.readOnlyContext,
            extractor: this.extractor,
            narrativeGenerator: this.narrativeGenerator,
        };
    }
    /** Execute the pipeline from the root node. */
    async execute() {
        const context = this.pipelineRuntime.rootStageContext;
        return await this.executeNode(this.root, context, { shouldBreak: false }, '');
    }
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
    getRuntimePipelineStructure() {
        return this.runtimePipelineStructure;
    }
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
    initRuntimeStructure(buildTimeStructure) {
        if (!buildTimeStructure)
            return;
        this.runtimePipelineStructure = JSON.parse(JSON.stringify(buildTimeStructure));
        this.buildStructureNodeMap(this.runtimePipelineStructure);
    }
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
    buildStructureNodeMap(node) {
        var _a;
        const key = (_a = node.id) !== null && _a !== void 0 ? _a : node.name;
        this.structureNodeMap.set(key, node);
        if (node.children) {
            for (const child of node.children) {
                this.buildStructureNodeMap(child);
            }
        }
        if (node.next) {
            this.buildStructureNodeMap(node.next);
        }
        if (node.subflowStructure) {
            this.buildStructureNodeMap(node.subflowStructure);
        }
    }
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
    stageNodeToStructure(node) {
        var _a, _b, _c, _d;
        const structure = {
            name: node.name,
            id: node.id,
            type: this.computeNodeType(node),
            displayName: node.displayName,
            description: node.description,
        };
        // Streaming metadata
        if (node.isStreaming) {
            structure.isStreaming = true;
            structure.streamId = node.streamId;
        }
        // Subflow root metadata
        if (node.isSubflowRoot) {
            structure.isSubflowRoot = true;
            structure.subflowId = node.subflowId;
            structure.subflowName = node.subflowName;
        }
        // Decider metadata — legacy (nextNodeDecider) or scope-based (deciderFn)
        if (node.nextNodeDecider || node.deciderFn) {
            structure.hasDecider = true;
            structure.branchIds = (_a = node.children) === null || _a === void 0 ? void 0 : _a.map(c => { var _a; return (_a = c.id) !== null && _a !== void 0 ? _a : c.name; });
        }
        // Selector metadata
        if (node.nextNodeSelector) {
            structure.hasSelector = true;
            structure.branchIds = (_b = node.children) === null || _b === void 0 ? void 0 : _b.map(c => { var _a; return (_a = c.id) !== null && _a !== void 0 ? _a : c.name; });
        }
        // Recursively convert children
        if ((_c = node.children) === null || _c === void 0 ? void 0 : _c.length) {
            structure.children = node.children.map(c => this.stageNodeToStructure(c));
        }
        // Recursively convert next chain
        if (node.next) {
            structure.next = this.stageNodeToStructure(node.next);
        }
        // Attach subflow's build-time structure if available
        if ((_d = node.subflowDef) === null || _d === void 0 ? void 0 : _d.buildTimeStructure) {
            structure.subflowStructure = node.subflowDef.buildTimeStructure;
        }
        return structure;
    }
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
    updateStructureWithDynamicChildren(parentNodeId, dynamicChildren, hasSelector, hasDecider) {
        // Guard: no-op when structure tracking is disabled
        if (!this.runtimePipelineStructure)
            return;
        // O(1) lookup for the parent node
        const parentStructure = this.structureNodeMap.get(parentNodeId);
        if (!parentStructure) {
            // Defensive: shouldn't happen in practice but prevents crashes
            // eslint-disable-next-line no-console
            console.warn(`[Pipeline] updateStructureWithDynamicChildren: parent node "${parentNodeId}" not found in structureNodeMap`);
            return;
        }
        // Convert each dynamic child StageNode into a SerializedPipelineStructure node
        const childStructures = dynamicChildren.map(child => this.stageNodeToStructure(child));
        // Set the converted children on the parent's children array
        parentStructure.children = childStructures;
        // Register each new child (and its descendants) in the structureNodeMap
        for (const childStructure of childStructures) {
            this.buildStructureNodeMap(childStructure);
        }
        // Set selector flag and compute branchIds when the dynamic node has a selector
        if (hasSelector) {
            parentStructure.hasSelector = true;
            parentStructure.branchIds = childStructures.map(c => { var _a; return (_a = c.id) !== null && _a !== void 0 ? _a : c.name; });
        }
        // Set decider flag and compute branchIds when the dynamic node has a decider
        if (hasDecider) {
            parentStructure.hasDecider = true;
            parentStructure.branchIds = childStructures.map(c => { var _a; return (_a = c.id) !== null && _a !== void 0 ? _a : c.name; });
        }
    }
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
    updateStructureWithDynamicSubflow(mountNodeId, subflowId, subflowName, subflowBuildTimeStructure) {
        // Guard: no-op when structure tracking is disabled
        if (!this.runtimePipelineStructure)
            return;
        // O(1) lookup for the mount node
        const mountStructure = this.structureNodeMap.get(mountNodeId);
        if (!mountStructure) {
            // Defensive: shouldn't happen in practice but prevents crashes
            // eslint-disable-next-line no-console
            console.warn(`[Pipeline] updateStructureWithDynamicSubflow: mount node "${mountNodeId}" not found in structureNodeMap`);
            return;
        }
        // Mark the mount node as a subflow root with its identity
        mountStructure.isSubflowRoot = true;
        mountStructure.subflowId = subflowId;
        // Set display name only when provided to avoid overwriting existing values with undefined
        if (subflowName !== undefined) {
            mountStructure.subflowName = subflowName;
        }
        // Attach the subflow's build-time structure for drill-down visualization
        if (subflowBuildTimeStructure) {
            mountStructure.subflowStructure = subflowBuildTimeStructure;
            // Register all subflow structure nodes for future O(1) lookups
            this.buildStructureNodeMap(mountStructure.subflowStructure);
        }
    }
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
    updateStructureWithDynamicNext(currentNodeId, dynamicNext) {
        // Guard: no-op when structure tracking is disabled
        if (!this.runtimePipelineStructure)
            return;
        // O(1) lookup for the current node
        const currentStructure = this.structureNodeMap.get(currentNodeId);
        if (!currentStructure) {
            // Defensive: shouldn't happen in practice but prevents crashes
            // eslint-disable-next-line no-console
            console.warn(`[Pipeline] updateStructureWithDynamicNext: node "${currentNodeId}" not found in structureNodeMap`);
            return;
        }
        // Convert the dynamic StageNode into a serialized structure node
        const nextStructure = this.stageNodeToStructure(dynamicNext);
        // Attach as the next continuation on the current structure node
        currentStructure.next = nextStructure;
        // Register the new node (and any descendants) for future O(1) lookups
        this.buildStructureNodeMap(nextStructure);
    }
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
    updateStructureIterationCount(nodeId, count) {
        // Guard: no-op when structure tracking is disabled
        if (!this.runtimePipelineStructure)
            return;
        // O(1) lookup for the target node
        const nodeStructure = this.structureNodeMap.get(nodeId);
        // Guard: expected for nodes without IDs — no warning needed
        if (!nodeStructure)
            return;
        // Set the iteration count on the structure node
        nodeStructure.iterationCount = count;
    }
    /** Resolve a stage function: prefer embedded `node.fn`, else look up by `node.name` in `stageMap`. */
    getStageFn(node) {
        if (typeof node.fn === 'function')
            return node.fn;
        return this.stageMap.get(node.name);
    }
    /**
     * Execute a single node with the unified order described in the file header.
     *
     * @param node         Current node to execute
     * @param context      Current StageContext
     * @param breakFlag    Break flag bubbled through recursion
     * @param branchPath   Logical pipeline id/path (for logs); inherited by children
     */
    async executeNode(node, context, breakFlag, branchPath) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
        // ───────────────────────── 0) Subflow Detection ─────────────────────────
        // If this node is a subflow root, execute it with an isolated nested context
        if (node.isSubflowRoot && node.subflowId) {
            // Resolve reference node if needed
            // Reference nodes have isSubflowRoot but no fn/children - they point to subflows dictionary
            const resolvedNode = this.nodeResolver.resolveSubflowReference(node);
            // Set subflow context for structureMetadata propagation
            // All nodes within this subflow will have subflowId in their structureMetadata
            // _Requirements: unified-extractor-architecture 3.3, 3.4, 3.5_
            const previousSubflowId = this.currentSubflowId;
            this.currentSubflowId = node.subflowId;
            let subflowOutput;
            try {
                subflowOutput = await this.subflowExecutor.executeSubflow(resolvedNode, context, breakFlag, branchPath, this.subflowResults);
            }
            finally {
                // Clear subflow context when exiting (restore previous if nested)
                this.currentSubflowId = previousSubflowId;
            }
            // After subflow completes, continue with node.next in the PARENT context (if present)
            // 
            // IMPORTANT: We need to determine if `next` is a continuation after the subflow
            // or if it was already executed as part of the subflow's internal structure.
            //
            // Heuristic:
            // - If the subflow has `children` (fork pattern), `next` is the continuation
            // - If the subflow has no `children` (linear pattern), `next` was already executed internally
            //
            // For reference-based subflows (resolvedNode !== node), the original reference node's
            // `next` is always the continuation (the subflow's internal structure is in the definition).
            const isReferenceBasedSubflow = resolvedNode !== node;
            const hasChildren = Boolean(node.children && node.children.length > 0);
            const shouldExecuteContinuation = isReferenceBasedSubflow || hasChildren;
            if (node.next && shouldExecuteContinuation) {
                const nextStageContext = context.createNext(branchPath, node.next.name);
                return await this.executeNode(node.next, nextStageContext, breakFlag, branchPath);
            }
            return subflowOutput;
        }
        const stageFunc = this.getStageFn(node);
        const hasStageFunction = Boolean(stageFunc);
        const isLegacyDecider = Boolean(node.nextNodeDecider);
        const isScopeBasedDecider = Boolean(node.deciderFn);
        const isDeciderNode = isLegacyDecider || isScopeBasedDecider;
        const hasChildren = Boolean((_a = node.children) === null || _a === void 0 ? void 0 : _a.length);
        const hasNext = Boolean(node.next);
        // Save original next reference before stage execution.
        // WHY: Dynamic stage handling (step 3) may mutate node.next for serialization
        // visibility (getRuntimeRoot). We must use the ORIGINAL next for step 6 to
        // avoid following a dynamicNext reference that was attached during a previous
        // iteration's stage execution.
        const originalNext = node.next;
        // Note: Dynamic behavior is detected via isStageNodeReturn() on stage output, not via node flags
        // ───────────────────────── 1) Validation ─────────────────────────
        // A node must provide at least one of: stage, children, or decider.
        if (!hasStageFunction && !isDeciderNode && !hasChildren) {
            const errorMessage = `Node '${node.name}' must define: embedded fn OR a stageMap entry OR have children/decider`;
            logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${node.name}]:`, { error: errorMessage });
            throw new Error(errorMessage);
        }
        if (isDeciderNode && !hasChildren) {
            const errorMessage = 'Decider node needs to have children to execute';
            logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${node.name}]:`, { error: errorMessage });
            throw new Error(errorMessage);
        }
        // Mark role when there is no stage function (useful for debug panels)
        if (!hasStageFunction) {
            if (isDeciderNode)
                context.setAsDecider();
            else if (hasChildren)
                context.setAsFork();
        }
        const breakFn = () => (breakFlag.shouldBreak = true);
        // ───────────────────────── 2) Decider node ─────────────────────────
        // decider order: stage (optional) → commit → decider → chosen child
        // Route to the correct DeciderHandler method based on decider type:
        // - Scope-based (deciderFn): fn IS the decider, returns branch ID directly
        // - Legacy (nextNodeDecider): separate decider function evaluates after optional stage
        // _Requirements: 5.3, 5.4, phase2-handlers 2.1, 2.2, 2.3, 2.4, 2.5_
        if (isDeciderNode) {
            if (isScopeBasedDecider) {
                // Scope-based decider: fn is required (it IS the decider)
                // _Requirements: 5.3_
                return this.deciderHandler.handleScopeBased(node, stageFunc, context, breakFlag, branchPath, this.executeStage.bind(this), this.executeNode.bind(this), this.callExtractor.bind(this), this.getStagePath.bind(this));
            }
            else {
                // Legacy output-based decider: stage is optional, decider is separate
                // _Requirements: 5.4_
                return this.deciderHandler.handle(node, stageFunc, context, breakFlag, branchPath, this.executeStage.bind(this), this.executeNode.bind(this), this.callExtractor.bind(this), this.getStagePath.bind(this));
            }
        }
        // ───────────────────────── 3) Non-decider: STAGE FIRST ─────────────────────────
        // unified order: stage (optional) → commit → (break?) → children (optional) → dynamicNext (optional) → next (optional)
        let stageOutput;
        let dynamicNext;
        if (stageFunc) {
            try {
                stageOutput = await this.executeStage(node, stageFunc, context, breakFn);
            }
            catch (error) {
                context.commit(); // apply patch on error as before
                // Pass undefined for stageOutput and error details for enrichment
                // WHY: On error path, there's no successful output, but we capture
                // the error info so enriched snapshots include what went wrong.
                // _Requirements: single-pass-debug-structure 1.4_
                this.callExtractor(node, context, this.getStagePath(node, branchPath, context.stageName), undefined, {
                    type: 'stageExecutionError',
                    message: error.toString(),
                });
                // Narrative: record the error so the story captures what went wrong
                // _Requirements: 10.1_
                this.narrativeGenerator.onError(node.name, error.toString(), node.displayName);
                logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${node.name}]:`, { error });
                context.addError('stageExecutionError', error.toString());
                throw error;
            }
            context.commit();
            // Pass stageOutput so enriched snapshots capture the stage's return value
            // _Requirements: single-pass-debug-structure 1.3_
            this.callExtractor(node, context, this.getStagePath(node, branchPath, context.stageName), stageOutput);
            // Narrative: record that this stage executed successfully
            // _Requirements: 3.1_
            this.narrativeGenerator.onStageExecuted(node.name, node.displayName, node.description);
            if (breakFlag.shouldBreak) {
                // Narrative: record that execution stopped here due to break
                // _Requirements: 3.3_
                this.narrativeGenerator.onBreak(node.name, node.displayName);
                logger_1.logger.info(`Execution stopped in pipeline (${branchPath}) after ${node.name} due to break condition.`);
                return stageOutput; // leaf/early stop returns the stage's output
            }
            // ───────────────────────── Handle dynamic stages ─────────────────────────
            // Check if the handler's return object is a StageNode for dynamic continuation.
            // Detection uses duck-typing via isStageNodeReturn().
            if (stageOutput && typeof stageOutput === 'object' && isStageNodeReturn(stageOutput)) {
                const dynamicNode = stageOutput;
                context.addLog('isDynamic', true);
                context.addLog('dynamicPattern', 'StageNodeReturn');
                // ───────────────────── Dynamic Subflow Auto-Registration ─────────────────────
                // WHY: When a stage returns a StageNode with isSubflowRoot + subflowDef,
                // it's requesting dynamic subflow attachment. We auto-register the compiled
                // FlowChart in the subflows dictionary so SubflowExecutor can resolve it.
                // This enables runtime subflow attachment without build-time registration.
                //
                // DESIGN: First-write-wins — if a subflow with the same ID already exists
                // in the dictionary, we preserve the existing definition. StageMap entries
                // from the subflow are merged into the parent (parent entries preserved).
                //
                // After registration, we transfer subflow properties to the current node
                // and recurse into executeNode so step 0 (subflow detection) picks it up.
                //
                // _Requirements: dynamic-subflow-support 2.1, 2.2, 2.3, 2.4, 2.5_
                if (dynamicNode.isSubflowRoot && dynamicNode.subflowDef && dynamicNode.subflowId) {
                    context.addLog('dynamicPattern', 'dynamicSubflow');
                    context.addLog('dynamicSubflowId', dynamicNode.subflowId);
                    this.autoRegisterSubflowDef(dynamicNode.subflowId, dynamicNode.subflowDef, (_b = node.id) !== null && _b !== void 0 ? _b : node.name);
                    // Transfer subflow properties to current node for step 0 detection
                    node.isSubflowRoot = true;
                    node.subflowId = dynamicNode.subflowId;
                    node.subflowName = dynamicNode.subflowName;
                    node.subflowMountOptions = dynamicNode.subflowMountOptions;
                    // Update runtime pipeline structure with dynamic subflow
                    // _Requirements: runtime-pipeline-structure 3.1_
                    this.updateStructureWithDynamicSubflow((_c = node.id) !== null && _c !== void 0 ? _c : node.name, dynamicNode.subflowId, dynamicNode.subflowName, (_d = dynamicNode.subflowDef) === null || _d === void 0 ? void 0 : _d.buildTimeStructure);
                    // Recurse into executeNode — step 0 will detect isSubflowRoot
                    return await this.executeNode(node, context, breakFlag, branchPath);
                }
                // Also check children for subflowDef (e.g., tool dispatch returns
                // parallel children where some are subflow references)
                if (dynamicNode.children) {
                    for (const child of dynamicNode.children) {
                        if (child.isSubflowRoot && child.subflowDef && child.subflowId) {
                            this.autoRegisterSubflowDef(child.subflowId, child.subflowDef, (_e = child.id) !== null && _e !== void 0 ? _e : child.name);
                            // Update runtime pipeline structure with dynamic subflow for each child
                            // _Requirements: runtime-pipeline-structure 3.1, 3.3_
                            this.updateStructureWithDynamicSubflow((_f = child.id) !== null && _f !== void 0 ? _f : child.name, child.subflowId, child.subflowName, (_g = child.subflowDef) === null || _g === void 0 ? void 0 : _g.buildTimeStructure);
                        }
                    }
                }
                // Handle dynamic children (fork pattern)
                if (dynamicNode.children && dynamicNode.children.length > 0) {
                    node.children = dynamicNode.children;
                    context.addLog('dynamicChildCount', dynamicNode.children.length);
                    context.addLog('dynamicChildIds', dynamicNode.children.map(c => c.id || c.name));
                    // Update runtime pipeline structure with dynamic children
                    // _Requirements: runtime-pipeline-structure 2.1_
                    this.updateStructureWithDynamicChildren((_h = node.id) !== null && _h !== void 0 ? _h : node.name, dynamicNode.children, Boolean(dynamicNode.nextNodeSelector), Boolean(dynamicNode.nextNodeDecider || dynamicNode.deciderFn));
                    // Handle dynamic selector (multi-choice branching)
                    if (typeof dynamicNode.nextNodeSelector === 'function') {
                        node.nextNodeSelector = dynamicNode.nextNodeSelector;
                        context.addLog('hasSelector', true);
                    }
                    // Handle dynamic decider (single-choice branching)
                    else if (typeof dynamicNode.nextNodeDecider === 'function') {
                        node.nextNodeDecider = dynamicNode.nextNodeDecider;
                        context.addLog('hasDecider', true);
                    }
                }
                // Handle dynamic next (linear continuation)
                if (dynamicNode.next) {
                    dynamicNext = dynamicNode.next;
                    // Update runtime pipeline structure with dynamic next
                    // _Requirements: runtime-pipeline-structure 4.1_
                    this.updateStructureWithDynamicNext((_j = node.id) !== null && _j !== void 0 ? _j : node.name, dynamicNode.next);
                    // Attach to node for serialization visibility (getRuntimeRoot)
                    node.next = dynamicNode.next;
                    context.addLog('hasDynamicNext', true);
                }
                // Clear stageOutput since the StageNode is the continuation, not the output
                stageOutput = undefined;
            }
            // Restore node.next to its original value after capturing dynamicNext.
            // WHY: The mutation `node.next = dynamicNode.next` above is for serialization
            // visibility (getRuntimeRoot), but it persists on the node object. If this node
            // is visited again in a loop, the stale dynamicNext reference would cause step 6
            // to follow it incorrectly. Restoring ensures loop-back visits see the original
            // node structure.
            if (dynamicNext) {
                node.next = originalNext;
            }
        }
        // ───────────────────────── 4) Children (if any) ─────────────────────────
        // Re-evaluate hasChildren after stage execution, as the stage may have
        // dynamically populated node.children (e.g., toolBranch injects tool nodes)
        const hasChildrenAfterStage = Boolean((_k = node.children) === null || _k === void 0 ? void 0 : _k.length);
        if (hasChildrenAfterStage) {
            // Breadcrumbs
            context.addLog('totalChildren', (_l = node.children) === null || _l === void 0 ? void 0 : _l.length);
            context.addLog('orderOfExecution', 'ChildrenAfterStage');
            let nodeChildrenResults;
            // Check for selector (multi-choice) - can pick multiple children
            if (node.nextNodeSelector) {
                // Set fork context for structureMetadata propagation
                // All parallel children will have parallelGroupId in their structureMetadata
                // _Requirements: unified-extractor-architecture 3.6, 3.7_
                const previousForkId = this.currentForkId;
                this.currentForkId = (_m = node.id) !== null && _m !== void 0 ? _m : node.name;
                try {
                    nodeChildrenResults = await this.childrenExecutor.executeSelectedChildren(node.nextNodeSelector, node.children, stageOutput, context, branchPath);
                }
                finally {
                    // Clear fork context after children complete (restore previous if nested)
                    this.currentForkId = previousForkId;
                }
            }
            // Check for decider (single-choice) - picks exactly one child
            else if (node.nextNodeDecider) {
                // Decider was dynamically injected, execute it
                const chosen = await this.nodeResolver.getNextNode(node.nextNodeDecider, node.children, stageOutput, context);
                const nextStageContext = context.createNext(branchPath, chosen.name);
                return await this.executeNode(chosen, nextStageContext, breakFlag, branchPath);
            }
            // Default: execute all children in parallel (fork pattern)
            else {
                // Log flow control decision for fork children
                // _Requirements: flow-control-narrative REQ-3 (Task 4)
                const childCount = (_p = (_o = node.children) === null || _o === void 0 ? void 0 : _o.length) !== null && _p !== void 0 ? _p : 0;
                const childNames = (_q = node.children) === null || _q === void 0 ? void 0 : _q.map(c => c.displayName || c.name).join(', ');
                context.addFlowDebugMessage('children', `Executing all ${childCount} children in parallel: ${childNames}`, {
                    count: childCount,
                    targetStage: (_r = node.children) === null || _r === void 0 ? void 0 : _r.map(c => c.name),
                });
                // Set fork context for structureMetadata propagation
                // All parallel children will have parallelGroupId in their structureMetadata
                // _Requirements: unified-extractor-architecture 3.6, 3.7_
                const previousForkId = this.currentForkId;
                this.currentForkId = (_s = node.id) !== null && _s !== void 0 ? _s : node.name;
                try {
                    nodeChildrenResults = await this.childrenExecutor.executeNodeChildren(node, context, undefined, branchPath);
                }
                finally {
                    // Clear fork context after children complete (restore previous if nested)
                    this.currentForkId = previousForkId;
                }
            }
            // Fork-only (no next, no dynamicNext): return bundle object
            if (!hasNext && !dynamicNext) {
                return nodeChildrenResults;
            }
            // ── Capture dynamic children as subflow result for debug visualization ──
            // WHY: When a stage dynamically creates children (e.g., tool execution),
            // the UI needs subflowResults data to render them as a drillable subflow.
            // ChildrenExecutor doesn't produce subflowResults — only SubflowExecutor does.
            // So we create a synthetic entry here from the children's execution data.
            //
            // DESIGN: Only for dynamic children (isDynamic flag in context). Static
            // children (build-time fork) don't need this — they're in the pipelineStructure.
            const isDynamic = (_u = (_t = context.debug) === null || _t === void 0 ? void 0 : _t.logContext) === null || _u === void 0 ? void 0 : _u.isDynamic;
            if (isDynamic && node.children && node.children.length > 0) {
                const parentStageId = context.getStageId();
                // Mark this node as a subflow root in context so the UI renders it
                // with drill-down capability
                context.addLog('isSubflowContainer', true);
                context.addLog('subflowId', node.id || node.name);
                context.addLog('subflowName', node.displayName || node.name);
                context.addLog('hasSubflowData', true);
                const childStructure = {
                    id: `${node.id || node.name}-children`,
                    name: 'Dynamic Children',
                    type: 'fork',
                    children: node.children.map(c => ({
                        id: c.id || c.name,
                        name: c.name,
                        displayName: c.displayName || c.name,
                        type: 'stage',
                    })),
                };
                // Build treeContext from the children's actual execution data.
                // WHY: The drill-down UI renders from the subflow's treeContext.
                // We extract each child's snapshot (logs, errors, metrics) from
                // the parent context's children array.
                const childStages = {};
                if (context.children) {
                    for (const childCtx of context.children) {
                        const snapshot = childCtx.getSnapshot();
                        childStages[snapshot.name || snapshot.id] = {
                            name: snapshot.name,
                            output: snapshot.logs,
                            errors: snapshot.errors,
                            metrics: snapshot.metrics,
                            status: snapshot.errors && Object.keys(snapshot.errors).length > 0 ? 'error' : 'success',
                        };
                    }
                }
                this.subflowResults.set(node.id || node.name, {
                    subflowId: node.id || node.name,
                    subflowName: node.displayName || node.name,
                    treeContext: {
                        globalContext: {},
                        stageContexts: childStages,
                        history: [],
                    },
                    parentStageId,
                    pipelineStructure: childStructure,
                });
            }
            // Fork + next or dynamicNext: continue below
        }
        // ───────────────────────── 5) Dynamic Next (loop support) ─────────────────────────
        // If dynamicNext is set, delegate to LoopHandler for resolution and execution
        // _Requirements: phase2-handlers 3.4, 3.5, 3.6, 3.7_
        if (dynamicNext) {
            return this.loopHandler.handle(dynamicNext, node, context, breakFlag, branchPath, this.executeNode.bind(this));
        }
        // ───────────────────────── 6) Linear `next` (if provided) ─────────────────────────
        if (hasNext) {
            // Use originalNext (captured before stage execution) to avoid following
            // a dynamicNext reference that was attached to node.next during stage handling.
            const nextNode = originalNext;
            // Narrative: record the transition to the next stage
            // _Requirements: 3.2_
            this.narrativeGenerator.onNext(node.name, nextNode.name, nextNode.displayName, nextNode.description);
            // Log flow control decision for linear next
            // _Requirements: flow-control-narrative REQ-3 (Task 2)
            context.addFlowDebugMessage('next', `Moving to ${nextNode.displayName || nextNode.name} stage`, {
                targetStage: nextNode.name,
            });
            const nextStageContext = context.createNext(branchPath, nextNode.name);
            return await this.executeNode(nextNode, nextStageContext, breakFlag, branchPath);
        }
        // ───────────────────────── 7) Leaf ─────────────────────────
        // No children & no next & no dynamicNext → return this node's stage output (may be undefined)
        return stageOutput;
    }
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
    async executeStage(node, stageFunc, context, breakFn) {
        return this.stageRunner.run(node, stageFunc, context, breakFn);
    }
    // ───────────────────────── Extractor helpers ─────────────────────────
    /**
     * Compute the node type based on node properties.
     * This logic was previously in service-layer serializePipelineStructure().
     *
     * @param node - The stage node to compute type for
     * @returns The computed node type
     *
     * _Requirements: unified-extractor-architecture 3.2_
     */
    computeNodeType(node) {
        var _a;
        // Decider takes precedence (has decision logic)
        // Check both legacy (nextNodeDecider) and scope-based (deciderFn) deciders
        // _Requirements: 3.2, decider-first-class-stage 3.2_
        if (node.nextNodeDecider || node.nextNodeSelector || node.deciderFn)
            return 'decider';
        // Streaming stages
        if (node.isStreaming)
            return 'streaming';
        // Fork: has static children (not dynamic)
        // Dynamic children are detected by having children + fn (stage that returns children)
        const hasDynamicChildren = Boolean(((_a = node.children) === null || _a === void 0 ? void 0 : _a.length) &&
            !node.nextNodeDecider &&
            !node.nextNodeSelector &&
            node.fn);
        if (node.children && node.children.length > 0 && !hasDynamicChildren)
            return 'fork';
        // Default: regular stage
        return 'stage';
    }
    /**
     * Build the RuntimeStructureMetadata for a node.
     * Called during traversal to provide pre-computed metadata to the extractor.
     *
     * @param node - The stage node to build metadata for
     * @returns The computed RuntimeStructureMetadata
     *
     * _Requirements: unified-extractor-architecture 3.1-3.10_
     */
    buildStructureMetadata(node) {
        var _a;
        const metadata = {
            type: this.computeNodeType(node),
        };
        // Subflow metadata
        if (node.isSubflowRoot) {
            metadata.isSubflowRoot = true;
            metadata.subflowId = node.subflowId;
            metadata.subflowName = node.subflowName;
        }
        else if (this.currentSubflowId) {
            // Propagate subflowId to children within the subflow
            metadata.subflowId = this.currentSubflowId;
        }
        // Parallel child metadata (set by ChildrenExecutor)
        if (this.currentForkId) {
            metadata.isParallelChild = true;
            metadata.parallelGroupId = this.currentForkId;
        }
        // Streaming metadata
        if (node.isStreaming) {
            metadata.streamId = node.streamId;
        }
        // Dynamic children detection
        const hasDynamicChildren = Boolean(((_a = node.children) === null || _a === void 0 ? void 0 : _a.length) &&
            !node.nextNodeDecider &&
            !node.nextNodeSelector &&
            node.fn);
        if (hasDynamicChildren) {
            metadata.isDynamic = true;
        }
        return metadata;
    }
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
    callExtractor(node, context, stagePath, stageOutput, errorInfo) {
        var _a;
        if (!this.extractor)
            return;
        // Increment step counter before creating snapshot (1-based)
        this.stepCounter++;
        try {
            const snapshot = {
                node,
                context,
                stepNumber: this.stepCounter,
                structureMetadata: this.buildStructureMetadata(node),
            };
            // ── Enrich snapshot when opt-in is enabled ──
            // WHY: Captures full stage data during traversal, eliminating the need
            // for a redundant post-traversal walk via PipelineRuntime.getSnapshot().
            // Wrapped in its own try-catch so enrichment failures don't break the
            // base snapshot — the extractor still receives node/context/stepNumber.
            if (this.enrichSnapshots) {
                try {
                    // Shallow clone of committed scope state
                    // WHY: Shallow clone is sufficient because each stage's commit()
                    // produces a new top-level object via structural sharing.
                    // Deep values are immutable by convention (WriteBuffer enforces this).
                    snapshot.scopeState = { ...this.pipelineRuntime.globalStore.getState() };
                    // Capture debug metadata from StageMetadata
                    // WHY: Eliminates the need to walk StageContext.debug after traversal.
                    snapshot.debugInfo = {
                        logs: { ...context.debug.logContext },
                        errors: { ...context.debug.errorContext },
                        metrics: { ...context.debug.metricContext },
                        evals: { ...context.debug.evalContext },
                    };
                    if (context.debug.flowMessages.length > 0) {
                        snapshot.debugInfo.flowMessages = [...context.debug.flowMessages];
                    }
                    // Capture stage output (undefined for dynamic stages that return StageNode)
                    snapshot.stageOutput = stageOutput;
                    // Capture error info if present (stage threw during execution)
                    if (errorInfo) {
                        snapshot.errorInfo = errorInfo;
                    }
                    // Capture history index (number of commits so far)
                    // WHY: Enables scope reconstruction via executionHistory.materialise(historyIndex)
                    // without a separate history replay pass.
                    snapshot.historyIndex = this.pipelineRuntime.executionHistory.list().length;
                }
                catch (enrichError) {
                    // Log but don't fail — the base snapshot is still valid
                    logger_1.logger.warn(`Enrichment error at stage '${stagePath}':`, { error: enrichError });
                }
            }
            const result = this.extractor(snapshot);
            // Only store if extractor returned a value
            if (result !== undefined && result !== null) {
                this.extractedResults.set(stagePath, result);
            }
        }
        catch (error) {
            // Log error but don't stop execution
            logger_1.logger.error(`Extractor error at stage '${stagePath}':`, { error });
            this.extractorErrors.push({
                stagePath,
                message: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error),
                error,
            });
        }
    }
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
    getStagePath(node, branchPath, contextStageName) {
        var _a;
        const baseName = (_a = node.id) !== null && _a !== void 0 ? _a : node.name;
        // Use contextStageName only when it indicates an iteration (differs from base node.name).
        // WHY: During loop iterations, LoopHandler creates a StageContext with an iterated name
        // (e.g., "CallLLM.1"), but the node object still has the base name ("CallLLM").
        // For non-iterated stages, we prefer node.id (stable identifier) over node.name.
        const nodeId = (contextStageName && contextStageName !== node.name) ? contextStageName : baseName;
        if (!branchPath)
            return nodeId;
        return `${branchPath}.${nodeId}`;
    }
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
    autoRegisterSubflowDef(subflowId, subflowDef, mountNodeId) {
        var _a, _b;
        let subflowsDict = this.subflows;
        if (!subflowsDict) {
            subflowsDict = {};
            this.subflows = subflowsDict;
            // Update all handler contexts to see the new dictionary
            this.nodeResolver.ctx.subflows = subflowsDict;
            this.subflowExecutor.ctx.subflows = subflowsDict;
            this.childrenExecutor.ctx.subflows = subflowsDict;
        }
        // First-write-wins
        if (!subflowsDict[subflowId]) {
            subflowsDict[subflowId] = {
                root: subflowDef.root,
                ...(subflowDef.buildTimeStructure
                    ? { buildTimeStructure: subflowDef.buildTimeStructure }
                    : {}),
            };
        }
        // Merge stageMap entries (parent entries preserved)
        if (subflowDef.stageMap) {
            for (const [key, fn] of subflowDef.stageMap.entries()) {
                if (!this.stageMap.has(key)) {
                    this.stageMap.set(key, fn);
                }
            }
        }
        // Merge nested subflows
        if (subflowDef.subflows) {
            for (const [key, def] of Object.entries(subflowDef.subflows)) {
                if (!subflowsDict[key]) {
                    subflowsDict[key] = def;
                }
            }
        }
        // Update runtime pipeline structure with dynamic subflow
        // _Requirements: runtime-pipeline-structure 3.1_
        if (mountNodeId) {
            this.updateStructureWithDynamicSubflow(mountNodeId, subflowId, ((_a = subflowDef.root) === null || _a === void 0 ? void 0 : _a.subflowName) || ((_b = subflowDef.root) === null || _b === void 0 ? void 0 : _b.displayName), subflowDef.buildTimeStructure);
        }
    }
    // ───────────────────────── Introspection helpers ─────────────────────────
    /** Returns the full context tree (global + stage contexts) for observability panels. */
    getContextTree() {
        return this.pipelineRuntime.getSnapshot();
    }
    /** Returns the PipelineRuntime (root holder of StageContexts). */
    getContext() {
        return this.pipelineRuntime;
    }
    /** Sets a root object value into the global context (utility). */
    setRootObject(path, key, value) {
        this.pipelineRuntime.setRootObject(path, key, value);
    }
    /** Returns pipeline ids inherited under this root (for debugging fan-out). */
    getInheritedPipelines() {
        return this.pipelineRuntime.getPipelines();
    }
    /**
     * Returns the current pipeline root node (including runtime modifications).
     *
     * This is useful for serializing the pipeline structure after execution,
     * which includes any dynamic children or loop targets added at runtime
     * by stages that return StageNode.
     *
     * @returns The root StageNode with runtime modifications
     */
    getRuntimeRoot() {
        return this.root;
    }
    /**
     * Returns the collected SubflowResultsMap after pipeline execution.
     * Used by the service layer to include subflow data in API responses.
     *
     * _Requirements: 4.3_
     */
    getSubflowResults() {
        return this.subflowResults;
    }
    /**
     * Returns the collected extracted results after pipeline execution.
     * Map keys are stage paths (e.g., "root.child.grandchild").
     */
    getExtractedResults() {
        return this.extractedResults;
    }
    /**
     * Returns any errors that occurred during extraction.
     * Useful for debugging extractor issues.
     */
    getExtractorErrors() {
        return this.extractorErrors;
    }
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
    getNarrative() {
        return this.narrativeGenerator.getSentences();
    }
}
exports.Pipeline = Pipeline;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGlwZWxpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9QaXBlbGluZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUVHOzs7QUFHSCwrREFBNkU7QUFFN0UsK0NBQTRDO0FBZTVDLDBEQUF1RDtBQUN2RCxrRUFBK0Q7QUFDL0QsZ0VBQTZEO0FBQzdELHdEQUFxRDtBQUNyRCx3REFBcUQ7QUFDckQsOERBQTJEO0FBQzNELHVFQUFvRTtBQUNwRSwrRUFBNEU7QUFnSzVFLDBGQUEwRjtBQUMxRiwrRkFBK0Y7QUFDL0Ysb0NBQW9DO0FBRXBDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHO0FBQ0gsU0FBZ0IsaUJBQWlCLENBQUMsTUFBZTtJQUMvQyw0QkFBNEI7SUFDNUIsSUFBSSxDQUFDLE1BQU0sSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFFeEQsNkVBQTZFO0lBQzdFLElBQUksQ0FBQztRQUNILE1BQU0sR0FBRyxHQUFHLE1BQWlDLENBQUM7UUFFOUMsd0NBQXdDO1FBQ3hDLElBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxLQUFLLFFBQVE7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUUvQywrQ0FBK0M7UUFDL0Msb0VBQW9FO1FBQ3BFLGlGQUFpRjtRQUNqRiw0RUFBNEU7UUFDNUUsK0VBQStFO1FBQy9FLHlEQUF5RDtRQUN6RCxzQkFBc0I7UUFDdEIsTUFBTSxlQUFlLEdBQ25CLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBQ3hELEdBQUcsQ0FBQyxJQUFJLEtBQUssU0FBUztZQUN0QixPQUFPLEdBQUcsQ0FBQyxl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QUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILGNBQWM7UUFDWixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsaUJBQWlCO1FBQ2YsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQzdCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxtQkFBbUI7UUFDakIsT0FBTyxJQUFJLENBQUMsZ0JBQXdDLENBQUM7SUFDdkQsQ0FBQztJQUVEOzs7T0FHRztJQUNILGtCQUFrQjtRQUNoQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7SUFDOUIsQ0FBQztJQUVEOzs7Ozs7Ozs7OztPQVdHO0lBQ0gsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFlBQVksRUFBRSxDQUFDO0lBQ2hELENBQUM7Q0FDRjtBQS8rQ0QsNEJBKytDQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUGlwZWxpbmUudHMgKGZvcm1lcmx5IEdyYXBoVHJhdmVyc2VyLnRzKVxuICpcbiAqIFdIWTogVGhpcyBpcyB0aGUgY29yZSBleGVjdXRpb24gZW5naW5lIGZvciBmbG93Y2hhcnQtYmFzZWQgcGlwZWxpbmVzLlxuICogSXQgdHJhdmVyc2VzIGEgdHJlZSBvZiBTdGFnZU5vZGVzLCBleGVjdXRpbmcgc3RhZ2UgZnVuY3Rpb25zIGluIGFcbiAqIHByb2dyYW1tZXItZnJpZW5kbHkgb3JkZXIgdGhhdCBtaXJyb3JzIG5hdHVyYWwgYXN5bmMvYXdhaXQgcGF0dGVybnMuXG4gKlxuICogREVTSUdOOiBUaGUgdHJhdmVyc2FsIGZvbGxvd3MgYSB1bmlmaWVkIG9yZGVyIGZvciBhbGwgbm9kZSBzaGFwZXM6XG4gKiAgIC8vIHByZXAgICAgICAgIOKGkiAgICAgcGFyYWxsZWwgZ2F0aGVyICAgICDihpIgICAgIGFnZ3JlZ2F0ZS9jb250aW51ZVxuICogICBjb25zdCBwcmUgPSBhd2FpdCBwcmVwKCk7XG4gKiAgIGNvbnN0IFt4LCB5XSA9IGF3YWl0IFByb21pc2UuYWxsKFtmeChwcmUpLCBmeShwcmUpXSk7XG4gKiAgIHJldHVybiBhd2FpdCBuZXh0KHgsIHkpO1xuICpcbiAqIFJFU1BPTlNJQklMSVRJRVM6XG4gKiAtIEV4ZWN1dGUgc3RhZ2UgZnVuY3Rpb25zIGluIGNvcnJlY3Qgb3JkZXIgKHN0YWdlIOKGkiBjaGlsZHJlbiDihpIgbmV4dClcbiAqIC0gSGFuZGxlIGRpZmZlcmVudCBub2RlIHNoYXBlcyAobGluZWFyLCBmb3JrLCBkZWNpZGVyLCBzZWxlY3RvcilcbiAqIC0gTWFuYWdlIGJyZWFrIHNlbWFudGljcyBmb3IgZWFybHkgdGVybWluYXRpb25cbiAqIC0gQ29vcmRpbmF0ZSB3aXRoIGV4dHJhY3RlZCBoYW5kbGVyIG1vZHVsZXMgKFN0YWdlUnVubmVyLCBMb29wSGFuZGxlciwgZXRjLilcbiAqIC0gU3VwcG9ydCBkeW5hbWljIHN0YWdlcyB0aGF0IHJldHVybiBTdGFnZU5vZGUgZm9yIGNvbnRpbnVhdGlvblxuICogLSBFeGVjdXRlIHN1YmZsb3dzIHdpdGggaXNvbGF0ZWQgY29udGV4dHNcbiAqXG4gKiBSRUxBVEVEOlxuICogLSB7QGxpbmsgRmxvd0NoYXJ0RXhlY3V0b3J9IC0gUHVibGljIEFQSSB3cmFwcGVyIGFyb3VuZCBQaXBlbGluZVxuICogLSB7QGxpbmsgU3RhZ2VSdW5uZXJ9IC0gRXhlY3V0ZXMgaW5kaXZpZHVhbCBzdGFnZSBmdW5jdGlvbnNcbiAqIC0ge0BsaW5rIENoaWxkcmVuRXhlY3V0b3J9IC0gSGFuZGxlcyBwYXJhbGxlbCBjaGlsZHJlbiBleGVjdXRpb25cbiAqIC0ge0BsaW5rIFN1YmZsb3dFeGVjdXRvcn0gLSBIYW5kbGVzIHN1YmZsb3cgZXhlY3V0aW9uIHdpdGggaXNvbGF0aW9uXG4gKiAtIHtAbGluayBMb29wSGFuZGxlcn0gLSBIYW5kbGVzIGR5bmFtaWMgbmV4dCBhbmQgbG9vcC1iYWNrIGxvZ2ljXG4gKiAtIHtAbGluayBEZWNpZGVySGFuZGxlcn0gLSBIYW5kbGVzIGRlY2lkZXIgZXZhbHVhdGlvbiBhbmQgYnJhbmNoaW5nXG4gKlxuICogQ29uY3JldGVseSwgZm9yIGVhY2ggbm9kZSBzaGFwZSB3ZSBleGVjdXRlOlxuICpcbiAqIDEpIExpbmVhciBub2RlIChubyBjaGlsZHJlbjsgbWF5IGhhdmUgYG5leHRgKVxuICogICAg4oCiIFJ1biAqKnRoaXMgbm9kZSdzIHN0YWdlKiogKGlmIGFueSkg4oaSIGNvbW1pdCDihpIgKGJyZWFrPykg4oaSICoqbmV4dCoqXG4gKlxuICogMikgRm9yay1vbmx5IChoYXMgYGNoaWxkcmVuYCwgKipubyoqIGBuZXh0YCwgbm90IGEgZGVjaWRlcilcbiAqICAgIOKAoiBSdW4gKipzdGFnZSoqIChpZiBhbnkpIOKGkiBjb21taXRcbiAqICAgIOKAoiBSdW4gKipBTEwgY2hpbGRyZW4gaW4gcGFyYWxsZWwqKiAoZWFjaCBjaGlsZCBjb21taXRzIGFmdGVyIGl0IHNldHRsZXMpXG4gKiAgICDigKIgKipSRVRVUk4qKiBjaGlsZHJlbiBidW5kbGU6IGB7IFtjaGlsZElkXTogeyByZXN1bHQsIGlzRXJyb3IgfSB9YFxuICpcbiAqIDMpIEZvcmsgKyBuZXh0IChoYXMgYGNoaWxkcmVuYCBhbmQgYG5leHRgLCBub3QgYSBkZWNpZGVyKVxuICogICAg4oCiIFJ1biAqKnN0YWdlKiogKGlmIGFueSkg4oaSIGNvbW1pdFxuICogICAg4oCiIFJ1biAqKkFMTCBjaGlsZHJlbiBpbiBwYXJhbGxlbCoqIChjb21taXQgb24gc2V0dGxlKVxuICogICAg4oCiICoqQ29udGludWUqKiB0byBgbmV4dGAgKGRvd25zdHJlYW0gc3RhZ2VzIHJlYWQgY2hpbGRyZW4ncyBjb21taXR0ZWQgd3JpdGVzKVxuICpcbiAqIDQpIERlY2lkZXIgKGhhcyBgY2hpbGRyZW5gIGFuZCBgbmV4dE5vZGVEZWNpZGVyYClcbiAqICAgIOKAoiBSdW4gKipzdGFnZSoqIChpZiBhbnkpIOKGkiBjb21taXRcbiAqICAgIOKAoiAqKkRlY2lkZXIqKiBwaWNrcyBFWEFDVExZIE9ORSBjaGlsZCBgaWRgXG4gKiAgICDigKIgKipDb250aW51ZSoqIGludG8gdGhhdCBjaG9zZW4gY2hpbGQgKG9ubHkgdGhhdCBicmFuY2ggcnVucylcbiAqXG4gKiBCcmVhayBzZW1hbnRpY3M6XG4gKiAgICBJZiBhIHN0YWdlIGNhbGxzIGBicmVha0ZuKClgLCB3ZSBjb21taXQgYW5kICoqU1RPUCoqIGF0IHRoaXMgbm9kZTpcbiAqICAgICAg4oCTIGZvciBmb3JrLW9ubHk6IGNoaWxkcmVuIGRvICoqbm90KiogcnVuOyBub3RoaW5nIGNvbnRpbnVlc1xuICogICAgICDigJMgZm9yIGZvcmsgKyBuZXh0OiBjaGlsZHJlbiBhbmQgbmV4dCBkbyAqKm5vdCoqIHJ1blxuICogICAgICDigJMgZm9yIGxpbmVhcjogbmV4dCBkb2VzICoqbm90KiogcnVuXG4gKiAgICAgIOKAkyBmb3IgZGVjaWRlcjogd2UgZG8gKipub3QqKiBldmFsdWF0ZSB0aGUgZGVjaWRlcjsgbm8gY2hpbGQgcnVuc1xuICpcbiAqIFBhdGNoL3Zpc2liaWxpdHkgbW9kZWw6XG4gKiAgIOKAkyBBIHN0YWdlIHdyaXRlcyBpbnRvIGEgbG9jYWwgcGF0Y2g7IHdlIGFsd2F5cyBgY29tbWl0UGF0Y2goKWAgYWZ0ZXIgaXQgcmV0dXJucyBvciB0aHJvd3NcbiAqICAg4oCTIENoaWxkcmVuIGFsd2F5cyBgY29tbWl0UGF0Y2goKWAgYWZ0ZXIgdGhleSBzZXR0bGU7IHRocm90dGxlZCBjaGlsZHJlbiBjYW4gZmxhZ1xuICogICAgIGBtb25pdG9yLmlzVGhyb3R0bGVkID0gdHJ1ZWAgdmlhIGB0aHJvdHRsaW5nRXJyb3JDaGVja2VyYFxuICpcbiAqIFN5bmMgKyBBc3luYyBzdGFnZXM6XG4gKiAgIOKAkyBXZSBrZWVwIHRoZSBvcmlnaW5hbCBlbmdpbmUncyBiZWhhdmlvcjogKipvbmx5KiogYGF3YWl0YCByZWFsIFByb21pc2VzXG4gKiAgICAgKHVzaW5nIGBvdXRwdXQgaW5zdGFuY2VvZiBQcm9taXNlYCksIG90aGVyd2lzZSByZXR1cm4gdGhlIHZhbHVlIGRpcmVjdGx5LlxuICogICAgIFRoaXMgYXZvaWRzIFwidGhlbmFibGUgYXNzaW1pbGF0aW9uXCIgc2lkZS1lZmZlY3RzL3Byb2JlcyBvbiBhcmJpdHJhcnkgb2JqZWN0cy5cbiAqL1xuXG5pbXBvcnQgeyBTdGFnZUNvbnRleHQgfSBmcm9tICcuLi9tZW1vcnkvU3RhZ2VDb250ZXh0JztcbmltcG9ydCB7IFBpcGVsaW5lUnVudGltZSwgUnVudGltZVNuYXBzaG90IH0gZnJvbSAnLi4vbWVtb3J5L1BpcGVsaW5lUnVudGltZSc7XG5pbXBvcnQgeyBTY29wZUZhY3RvcnkgfSBmcm9tICcuLi9tZW1vcnkvdHlwZXMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vLi4vdXRpbHMvbG9nZ2VyJztcbmltcG9ydCB7XG4gIE5vZGVSZXN1bHRUeXBlLFxuICBQaXBlbGluZVN0YWdlRnVuY3Rpb24sXG4gIFN0cmVhbUhhbmRsZXJzLFxuICBTdWJmbG93UmVzdWx0LFxuICBUcmVlT2ZGdW5jdGlvbnNSZXNwb25zZSxcbiAgVHJhdmVyc2FsRXh0cmFjdG9yLFxuICBFeHRyYWN0b3JFcnJvcixcbiAgU3RhZ2VTbmFwc2hvdCxcbiAgUGlwZWxpbmVDb250ZXh0LFxuICBSdW50aW1lU3RydWN0dXJlTWV0YWRhdGEsXG4gIFN1YmZsb3dNb3VudE9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgU2NvcGVQcm90ZWN0aW9uTW9kZSB9IGZyb20gJy4uLy4uL3Njb3BlL3Byb3RlY3Rpb24vdHlwZXMnO1xuaW1wb3J0IHsgTm9kZVJlc29sdmVyIH0gZnJvbSAnLi9oYW5kbGVycy9Ob2RlUmVzb2x2ZXInO1xuaW1wb3J0IHsgQ2hpbGRyZW5FeGVjdXRvciB9IGZyb20gJy4vaGFuZGxlcnMvQ2hpbGRyZW5FeGVjdXRvcic7XG5pbXBvcnQgeyBTdWJmbG93RXhlY3V0b3IgfSBmcm9tICcuL2hhbmRsZXJzL1N1YmZsb3dFeGVjdXRvcic7XG5pbXBvcnQgeyBTdGFnZVJ1bm5lciB9IGZyb20gJy4vaGFuZGxlcnMvU3RhZ2VSdW5uZXInO1xuaW1wb3J0IHsgTG9vcEhhbmRsZXIgfSBmcm9tICcuL2hhbmRsZXJzL0xvb3BIYW5kbGVyJztcbmltcG9ydCB7IERlY2lkZXJIYW5kbGVyIH0gZnJvbSAnLi9oYW5kbGVycy9EZWNpZGVySGFuZGxlcic7XG5pbXBvcnQgeyBOYXJyYXRpdmVHZW5lcmF0b3IgfSBmcm9tICcuL25hcnJhdGl2ZS9OYXJyYXRpdmVHZW5lcmF0b3InO1xuaW1wb3J0IHsgTnVsbE5hcnJhdGl2ZUdlbmVyYXRvciB9IGZyb20gJy4vbmFycmF0aXZlL051bGxOYXJyYXRpdmVHZW5lcmF0b3InO1xuaW1wb3J0IHR5cGUgeyBJTmFycmF0aXZlR2VuZXJhdG9yIH0gZnJvbSAnLi9uYXJyYXRpdmUvdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgfSBmcm9tICcuLi9idWlsZGVyL0Zsb3dDaGFydEJ1aWxkZXInO1xuXG5leHBvcnQgdHlwZSBEZWNpZGVyID0gKG5vZGVBcmdzOiBhbnkpID0+IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPjtcblxuLyoqXG4gKiBTZWxlY3RvclxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBBIGZ1bmN0aW9uIHRoYXQgcGlja3MgT05FIE9SIE1PUkUgY2hpbGRyZW4gZnJvbSBhIGNoaWxkcmVuIGFycmF5IHRvIGV4ZWN1dGUuXG4gKiBVbmxpa2UgRGVjaWRlciAod2hpY2ggcGlja3MgZXhhY3RseSBvbmUpLCBTZWxlY3RvciBjYW4gcmV0dXJuOlxuICogLSBBIHNpbmdsZSBzdHJpbmcgSUQgKGJlaGF2ZXMgbGlrZSBEZWNpZGVyKVxuICogLSBBbiBhcnJheSBvZiBzdHJpbmcgSURzIChzZWxlY3RlZCBjaGlsZHJlbiBleGVjdXRlIGluIHBhcmFsbGVsKVxuICogLSBBbiBlbXB0eSBhcnJheSAoc2tpcCBhbGwgY2hpbGRyZW4sIGNvbnRpbnVlIHRvIG5leHQgaWYgcHJlc2VudClcbiAqXG4gKiBXSFk6IFRoaXMgZW5hYmxlcyBzZWxlY3RpdmUgcGFyYWxsZWwgYnJhbmNoaW5nIHdoZXJlIG9ubHkgYSBzdWJzZXQgb2ZcbiAqIGNoaWxkcmVuIGFyZSBleGVjdXRlZCBiYXNlZCBvbiBydW50aW1lIGNvbmRpdGlvbnMuXG4gKlxuICogQHBhcmFtIG5vZGVBcmdzIC0gVGhlIHN0YWdlIG91dHB1dCBvciBpbnB1dCBwYXNzZWQgdG8gdGhlIHNlbGVjdG9yXG4gKiBAcmV0dXJucyBTaW5nbGUgSUQsIGFycmF5IG9mIElEcywgb3IgUHJvbWlzZSByZXNvbHZpbmcgdG8gZWl0aGVyXG4gKlxuICogX1JlcXVpcmVtZW50czogOC4xLCA4LjJfXG4gKi9cbmV4cG9ydCB0eXBlIFNlbGVjdG9yID0gKG5vZGVBcmdzOiBhbnkpID0+IHN0cmluZyB8IHN0cmluZ1tdIHwgUHJvbWlzZTxzdHJpbmcgfCBzdHJpbmdbXT47XG5cbmV4cG9ydCB0eXBlIFN0YWdlTm9kZTxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+ID0ge1xuICAvKiogSHVtYW4tcmVhZGFibGUgc3RhZ2UgbmFtZTsgYWxzbyB1c2VkIGFzIHRoZSBzdGFnZU1hcCBrZXkgKi9cbiAgbmFtZTogc3RyaW5nO1xuICAvKiogT3B0aW9uYWwgc3RhYmxlIGlkIChyZXF1aXJlZCBieSBkZWNpZGVyL2ZvcmsgYWdncmVnYXRpb24pICovXG4gIGlkPzogc3RyaW5nO1xuICAvKiogSHVtYW4tcmVhZGFibGUgZGlzcGxheSBuYW1lIGZvciBVSSB2aXN1YWxpemF0aW9uIChlLmcuLCBcIlVzZXIgUHJvbXB0XCIgaW5zdGVhZCBvZiBcInVzZVF1ZXN0aW9uXCIpICovXG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuICAvKipcbiAgICogSHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2Ygd2hhdCB0aGlzIHN0YWdlIGRvZXMuXG4gICAqIFVzZWQgZm9yIGV4ZWN1dGlvbiBjb250ZXh0IGRlc2NyaXB0aW9ucyBhbmQgYXV0by1nZW5lcmF0ZWQgdG9vbCBkZXNjcmlwdGlvbnMuXG4gICAqL1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgLyoqIExpbmVhciBjb250aW51YXRpb24gKi9cbiAgbmV4dD86IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+O1xuICAvKiogUGFyYWxsZWwgY2hpbGRyZW4gKGZvcmspICovXG4gIGNoaWxkcmVuPzogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT5bXTtcbiAgLyoqIERlY2lkZXIgKG11dHVhbGx5IGV4Y2x1c2l2ZSB3aXRoIGBuZXh0YCk7IG11c3Qgc2VsZWN0IGEgY2hpbGQgYGlkYCAqL1xuICBuZXh0Tm9kZURlY2lkZXI/OiBEZWNpZGVyO1xuICAvKipcbiAgICogV2hlbiB0cnVlLCB0aGlzIG5vZGUncyBgZm5gIGlzIGEgc2NvcGUtYmFzZWQgZGVjaWRlciBmdW5jdGlvbi5cbiAgICogVGhlIGZuIHJlY2VpdmVzIChzY29wZSwgYnJlYWtGbikgYW5kIGl0cyBzdHJpbmcgcmV0dXJuIHZhbHVlXG4gICAqIGlzIHVzZWQgYXMgdGhlIGJyYW5jaCBJRCB0byBzZWxlY3QgdGhlIGNoaWxkIG5vZGUgdG8gZXhlY3V0ZS5cbiAgICpcbiAgICogV0hZOiBEaXN0aW5ndWlzaGVzIHNjb3BlLWJhc2VkIGRlY2lkZXJzIChuZXcgYGFkZERlY2lkZXJGdW5jdGlvbmAgQVBJKVxuICAgKiBmcm9tIGxlZ2FjeSBvdXRwdXQtYmFzZWQgZGVjaWRlcnMgKGBhZGREZWNpZGVyYCBBUEkpIHNvIHRoYXQgUGlwZWxpbmVcbiAgICogYW5kIERlY2lkZXJIYW5kbGVyIGNhbiByb3V0ZSB0byB0aGUgY29ycmVjdCBleGVjdXRpb24gcGF0aC5cbiAgICpcbiAgICogREVTSUdOOiBBIGJvb2xlYW4gZmxhZyByYXRoZXIgdGhhbiBzdG9yaW5nIHRoZSBmdW5jdGlvbiBzZXBhcmF0ZWx5XG4gICAqIGJlY2F1c2UgdGhlIGZ1bmN0aW9uIGlzIGFscmVhZHkgaW4gYG5vZGUuZm5gIGFuZCB0aGUgc3RhZ2VNYXAuXG4gICAqIFRoZSBmbGFnIHRlbGxzIFBpcGVsaW5lIHRvIGludGVycHJldCB0aGUgcmV0dXJuIHZhbHVlIGFzIGEgYnJhbmNoIElELlxuICAgKlxuICAgKiBNdXR1YWxseSBleGNsdXNpdmUgd2l0aCBgbmV4dE5vZGVEZWNpZGVyYDpcbiAgICogLSBgZGVjaWRlckZuID0gdHJ1ZWAg4oaSIHNjb3BlLWJhc2VkIGRlY2lkZXIgKHJlYWRzIGZyb20gc2NvcGUsIGZuIHJldHVybnMgYnJhbmNoIElEKVxuICAgKiAtIGBuZXh0Tm9kZURlY2lkZXJgIHNldCDihpIgbGVnYWN5IG91dHB1dC1iYXNlZCBkZWNpZGVyIChyZWFkcyBmcm9tIHByZXZpb3VzIHN0YWdlIG91dHB1dClcbiAgICpcbiAgICogV2hlbiBzZXQsIGBmbmAgTVVTVCBiZSBkZWZpbmVkIChlaXRoZXIgZW1iZWRkZWQgb3IgaW4gc3RhZ2VNYXApLlxuICAgKiBXaGVuIHNldCwgYGNoaWxkcmVuYCBNVVNUIGJlIGRlZmluZWQgd2l0aCBhdCBsZWFzdCBvbmUgYnJhbmNoLlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiA1LjEsIDUuMl9cbiAgICovXG4gIGRlY2lkZXJGbj86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBTZWxlY3RvciBmb3IgbXVsdGktY2hvaWNlIGJyYW5jaGluZy5cbiAgICogVW5saWtlIERlY2lkZXIgKHBpY2tzIE9ORSksIFNlbGVjdG9yIGNhbiBwaWNrIE1VTFRJUExFIGNoaWxkcmVuIHRvIGV4ZWN1dGUgaW4gcGFyYWxsZWwuXG4gICAqIE11dHVhbGx5IGV4Y2x1c2l2ZSB3aXRoIGBuZXh0Tm9kZURlY2lkZXJgLlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiA4LjFfXG4gICAqL1xuICBuZXh0Tm9kZVNlbGVjdG9yPzogU2VsZWN0b3I7XG4gIC8qKiBPcHRpb25hbCBlbWJlZGRlZCBmdW5jdGlvbiBmb3IgdGhpcyBub2RlOyBvdGhlcndpc2UgcmVzb2x2ZWQgZnJvbSBzdGFnZU1hcCBieSBgbmFtZWAgKi9cbiAgZm4/OiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPjtcbiAgLyoqXG4gICAqIEluZGljYXRlcyB0aGlzIHN0YWdlIGVtaXRzIHRva2VucyBpbmNyZW1lbnRhbGx5IHZpYSBhIHN0cmVhbSBjYWxsYmFjay5cbiAgICogV2hlbiB0cnVlLCBUcmVlUGlwZWxpbmUgd2lsbCBpbmplY3QgYSBzdHJlYW1DYWxsYmFjayBhcyB0aGUgM3JkIHBhcmFtZXRlciB0byB0aGUgc3RhZ2UgZnVuY3Rpb24uXG4gICAqL1xuICBpc1N0cmVhbWluZz86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhlIHN0cmVhbSwgdXNlZCB0byByb3V0ZSB0b2tlbnMgdG8gdGhlIGNvcnJlY3QgaGFuZGxlci5cbiAgICogRGVmYXVsdHMgdG8gdGhlIHN0YWdlIG5hbWUgaWYgbm90IHByb3ZpZGVkIHdoZW4gdXNpbmcgYWRkU3RyZWFtaW5nRnVuY3Rpb24uXG4gICAqL1xuICBzdHJlYW1JZD86IHN0cmluZztcbiAgLyoqIFRydWUgaWYgdGhpcyBpcyB0aGUgcm9vdCBub2RlIG9mIGEgbW91bnRlZCBzdWJmbG93ICovXG4gIGlzU3ViZmxvd1Jvb3Q/OiBib29sZWFuO1xuICAvKiogTW91bnQgaWQgb2YgdGhlIHN1YmZsb3cgKGUuZy4sIFwibGxtLWNvcmVcIikgKi9cbiAgc3ViZmxvd0lkPzogc3RyaW5nO1xuICAvKiogRGlzcGxheSBuYW1lIG9mIHRoZSBzdWJmbG93IChlLmcuLCBcIkxMTSBDb3JlXCIpICovXG4gIHN1YmZsb3dOYW1lPzogc3RyaW5nO1xuICAvKipcbiAgICogUmVmZXJlbmNlIHRvIGEgc3ViZmxvdyBkZWZpbml0aW9uIGluIHRoZSBgc3ViZmxvd3NgIGRpY3Rpb25hcnkuXG4gICAqIFdoZW4gcHJlc2VudCwgdGhpcyBub2RlIGlzIGEgbGlnaHR3ZWlnaHQgcmVmZXJlbmNlIHRoYXQgc2hvdWxkIGJlIHJlc29sdmVkXG4gICAqIGJ5IGxvb2tpbmcgdXAgYHN1YmZsb3dzWyRyZWZdYCB0byBnZXQgdGhlIGFjdHVhbCBzdWJmbG93IHN0cnVjdHVyZS5cbiAgICogXG4gICAqIFVzZWQgYnkgcmVmZXJlbmNlLWJhc2VkIHN1YmZsb3cgYXJjaGl0ZWN0dXJlIHRvIGF2b2lkIGRlZXAtY29weWluZy5cbiAgICovXG4gICRyZWY/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBtb3VudCBpbnN0YW5jZS5cbiAgICogRGlzdGluZ3Vpc2hlcyBtdWx0aXBsZSBtb3VudHMgb2YgdGhlIHNhbWUgc3ViZmxvdyBkZWZpbml0aW9uLlxuICAgKi9cbiAgbW91bnRJZD86IHN0cmluZztcbiAgLyoqXG4gICAqIE9wdGlvbnMgZm9yIHN1YmZsb3cgbW91bnRpbmcgKGlucHV0L291dHB1dCBtYXBwaW5nLCBzY29wZSBtb2RlKS5cbiAgICogT25seSBwcmVzZW50IG9uIG5vZGVzIHdoZXJlIGlzU3ViZmxvd1Jvb3QgaXMgdHJ1ZS5cbiAgICogXG4gICAqIEVuYWJsZXMgZXhwbGljaXQgZGF0YSBjb250cmFjdHMgYmV0d2VlbiBwYXJlbnQgYW5kIHN1YmZsb3c6XG4gICAqIC0gaW5wdXRNYXBwZXI6IEV4dHJhY3QgZGF0YSBmcm9tIHBhcmVudCBzY29wZSB0byBzZWVkIHN1YmZsb3cncyBpbml0aWFsIHNjb3BlXG4gICAqIC0gb3V0cHV0TWFwcGVyOiBFeHRyYWN0IGRhdGEgZnJvbSBzdWJmbG93IG91dHB1dCB0byB3cml0ZSBiYWNrIHRvIHBhcmVudCBzY29wZVxuICAgKiAtIHNjb3BlTW9kZTogJ2lzb2xhdGVkJyAoZGVmYXVsdCkgb3IgJ2luaGVyaXQnIGZvciBzY29wZSBpbmhlcml0YW5jZSBiZWhhdmlvclxuICAgKiBcbiAgICogX1JlcXVpcmVtZW50czogc3ViZmxvdy1pbnB1dC1tYXBwaW5nIDEuNV9cbiAgICovXG4gIHN1YmZsb3dNb3VudE9wdGlvbnM/OiBTdWJmbG93TW91bnRPcHRpb25zO1xuXG4gIC8qKlxuICAgKiBJbmxpbmUgc3ViZmxvdyBkZWZpbml0aW9uIGZvciBkeW5hbWljIHN1YmZsb3cgYXR0YWNobWVudC5cbiAgICpcbiAgICogV0hZOiBFbmFibGVzIHJ1bnRpbWUgc3ViZmxvdyBhdHRhY2htZW50IHdpdGhvdXQgYnVpbGQtdGltZSByZWdpc3RyYXRpb24uXG4gICAqIEEgc3RhZ2UgZnVuY3Rpb24gY2FuIGNvbnN0cnVjdCBvciBzZWxlY3QgYSBjb21waWxlZCBGbG93Q2hhcnQgYXQgcnVudGltZVxuICAgKiBhbmQgcmV0dXJuIGl0IGlubGluZSBvbiB0aGUgU3RhZ2VOb2RlLiBQaXBlbGluZSBhdXRvLXJlZ2lzdGVycyB0aGVcbiAgICogZGVmaW5pdGlvbiBpbiB0aGUgc3ViZmxvd3MgZGljdGlvbmFyeSBiZWZvcmUgcm91dGluZyB0byBTdWJmbG93RXhlY3V0b3IuXG4gICAqXG4gICAqIERFU0lHTjogV2hlbiBwcmVzZW50IGFsb25nc2lkZSBgaXNTdWJmbG93Um9vdDogdHJ1ZWAgYW5kIGBzdWJmbG93SWRgLFxuICAgKiBQaXBlbGluZSByZWdpc3RlcnMgYHsgcm9vdCwgYnVpbGRUaW1lU3RydWN0dXJlIH1gIGluIHRoZSBzdWJmbG93c1xuICAgKiBkaWN0aW9uYXJ5IHVzaW5nIGZpcnN0LXdyaXRlLXdpbnMgc2VtYW50aWNzLCBtZXJnZXMgc3RhZ2VNYXAgZW50cmllcyxcbiAgICogYW5kIHRoZW4gcHJvY2VlZHMgd2l0aCBub3JtYWwgc3ViZmxvdyByZXNvbHV0aW9uIGFuZCBleGVjdXRpb24uXG4gICAqXG4gICAqIFVzZSBjYXNlczpcbiAgICogLSBBZ2VudCB0b29scyB0aGF0IGFyZSBjb21waWxlZCBzdWItYWdlbnQgRmxvd0NoYXJ0c1xuICAgKiAtIE1pY3Jvc2VydmljZSBvcmNoZXN0cmF0aW9uIHdoZXJlIHNlcnZpY2UgcGlwZWxpbmVzIGFyZSBjb21waWxlZCBhdCBzdGFydHVwXG4gICAqIC0gUGx1Z2luIHN5c3RlbXMgd2hlcmUgcGx1Z2lucyByZWdpc3RlciBGbG93Q2hhcnRzIGR5bmFtaWNhbGx5XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogLy8gQSBzdGFnZSByZXR1cm5zIGEgZHluYW1pYyBzdWJmbG93OlxuICAgKiByZXR1cm4ge1xuICAgKiAgIG5hbWU6ICdydW4tc3ViLWFnZW50JyxcbiAgICogICBpc1N1YmZsb3dSb290OiB0cnVlLFxuICAgKiAgIHN1YmZsb3dJZDogJ3NvY2lhbC1tZWRpYS1hZ2VudCcsXG4gICAqICAgc3ViZmxvd0RlZjogY29tcGlsZWRBZ2VudEZsb3dDaGFydCwgIC8vIHsgcm9vdCwgc3RhZ2VNYXAsIGJ1aWxkVGltZVN0cnVjdHVyZSB9XG4gICAqICAgc3ViZmxvd01vdW50T3B0aW9uczoge1xuICAgKiAgICAgaW5wdXRNYXBwZXI6IChwYXJlbnRTY29wZSkgPT4gKHsgYWdlbnQ6IHsgbWVzc2FnZXM6IFsuLi5dIH0gfSksXG4gICAqICAgfSxcbiAgICogfTtcbiAgICogYGBgXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IGR5bmFtaWMtc3ViZmxvdy1zdXBwb3J0IDEuMSwgMS4yLCAxLjRfXG4gICAqL1xuICBzdWJmbG93RGVmPzoge1xuICAgIHJvb3Q6IFN0YWdlTm9kZTtcbiAgICBzdGFnZU1hcD86IE1hcDxzdHJpbmcsIFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+PjtcbiAgICBidWlsZFRpbWVTdHJ1Y3R1cmU/OiB1bmtub3duO1xuICAgIHN1YmZsb3dzPzogUmVjb3JkPHN0cmluZywgeyByb290OiBTdGFnZU5vZGUgfT47XG4gIH07XG59O1xuXG4vLyBOb3RlOiBEeW5hbWljIGJlaGF2aW9yIGlzIGRldGVjdGVkIHZpYSBpc1N0YWdlTm9kZVJldHVybigpIGR1Y2stdHlwaW5nIG9uIHN0YWdlIG91dHB1dC5cbi8vIE5vIGlzRHluYW1pYyBmbGFnIG5lZWRlZCBvbiBub2RlIGRlZmluaXRpb24gLSBzdGFnZXMgdGhhdCByZXR1cm4gU3RhZ2VOb2RlIGFyZSBhdXRvbWF0aWNhbGx5XG4vLyB0cmVhdGVkIGFzIGR5bmFtaWMgY29udGludWF0aW9ucy5cblxuLyoqXG4gKiBpc1N0YWdlTm9kZVJldHVyblxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBEZXRlY3RzIGlmIGEgc3RhZ2Ugb3V0cHV0IGlzIGEgU3RhZ2VOb2RlIGZvciBkeW5hbWljIGNvbnRpbnVhdGlvbi5cbiAqIFVzZXMgZHVjay10eXBpbmc6IG11c3QgaGF2ZSAnbmFtZScgKHN0cmluZykgQU5EIGF0IGxlYXN0IG9uZSBjb250aW51YXRpb24gcHJvcGVydHkuXG4gKlxuICogV0hZOiBUaGlzIGVuYWJsZXMgc3RhZ2UgZnVuY3Rpb25zIHRvIHJldHVybiBhIFN0YWdlTm9kZSBkaXJlY3RseSBmb3IgZHluYW1pY1xuICogcGlwZWxpbmUgY29udGludWF0aW9uIChwYXJhbGxlbCBjaGlsZHJlbiwgbG9vcHMsIGV0Yy4pIHdpdGhvdXQgcmVxdWlyaW5nXG4gKiBleHBsaWNpdCBmbGFncyBvbiB0aGUgbm9kZSBkZWZpbml0aW9uLlxuICpcbiAqIERFU0lHTjogV2UgdXNlIGR1Y2stdHlwaW5nIHJhdGhlciB0aGFuIGluc3RhbmNlb2YgYmVjYXVzZTpcbiAqIDEuIFN0YWdlTm9kZSBpcyBhIHR5cGUgYWxpYXMsIG5vdCBhIGNsYXNzXG4gKiAyLiBBbGxvd3MgcGxhaW4gb2JqZWN0cyB0byBiZSB1c2VkIGFzIGR5bmFtaWMgY29udGludWF0aW9uc1xuICogMy4gU2FmZWx5IGhhbmRsZXMgcHJveHkgb2JqZWN0cyAobGlrZSBab2Qgc2NvcGVzKSB0aGF0IG1heSB0aHJvdyBvbiBwcm9wZXJ0eSBhY2Nlc3NcbiAqXG4gKiBAcGFyYW0gb3V0cHV0IC0gVGhlIHN0YWdlIGZ1bmN0aW9uJ3MgcmV0dXJuIHZhbHVlXG4gKiBAcmV0dXJucyB0cnVlIGlmIHRoZSBvdXRwdXQgaXMgYSBTdGFnZU5vZGUgZm9yIGR5bmFtaWMgY29udGludWF0aW9uXG4gKlxuICogX1JlcXVpcmVtZW50czogMS4xLCAxLjIsIDEuM19cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU3RhZ2VOb2RlUmV0dXJuKG91dHB1dDogdW5rbm93bik6IG91dHB1dCBpcyBTdGFnZU5vZGUge1xuICAvLyBNdXN0IGJlIGEgbm9uLW51bGwgb2JqZWN0XG4gIGlmICghb3V0cHV0IHx8IHR5cGVvZiBvdXRwdXQgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG5cbiAgLy8gVXNlIHRyeS1jYXRjaCB0byBzYWZlbHkgaGFuZGxlIHByb3h5IG9iamVjdHMgdGhhdCB0aHJvdyBvbiBwcm9wZXJ0eSBhY2Nlc3NcbiAgdHJ5IHtcbiAgICBjb25zdCBvYmogPSBvdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cbiAgICAvLyBNdXN0IGhhdmUgJ25hbWUnIHByb3BlcnR5IGFzIGEgc3RyaW5nXG4gICAgaWYgKHR5cGVvZiBvYmoubmFtZSAhPT0gJ3N0cmluZycpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIE11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgY29udGludWF0aW9uIHByb3BlcnR5XG4gICAgLy8gTm90ZTogY2hpbGRyZW4gbXVzdCBiZSBhIG5vbi1lbXB0eSBhcnJheSB0byBjb3VudCBhcyBjb250aW51YXRpb25cbiAgICAvLyBOb3RlOiBgZGVjaWRlckZuYCBpcyBhIGJvb2xlYW4gZmxhZyBvbiBTdGFnZU5vZGUsIE5PVCBhIGNvbnRpbnVhdGlvbiBwcm9wZXJ0eS5cbiAgICAvLyBJdCBtYXJrcyBhIG5vZGUncyBmbiBhcyBhIHNjb3BlLWJhc2VkIGRlY2lkZXIgYnV0IGRvZXNuJ3QgaXRzZWxmIGluZGljYXRlXG4gICAgLy8gZHluYW1pYyBjb250aW51YXRpb24uIFdlIGludGVudGlvbmFsbHkgZXhjbHVkZSBpdCBmcm9tIHRoaXMgY2hlY2sgdG8gcHJldmVudFxuICAgIC8vIGZhbHNlIHBvc2l0aXZlcyB3aGVuIGR1Y2stdHlwaW5nIHN0YWdlIG91dHB1dCBvYmplY3RzLlxuICAgIC8vIF9SZXF1aXJlbWVudHM6IDUuMV9cbiAgICBjb25zdCBoYXNDb250aW51YXRpb24gPVxuICAgICAgKEFycmF5LmlzQXJyYXkob2JqLmNoaWxkcmVuKSAmJiBvYmouY2hpbGRyZW4ubGVuZ3RoID4gMCkgfHxcbiAgICAgIG9iai5uZXh0ICE9PSB1bmRlZmluZWQgfHxcbiAgICAgIHR5cGVvZiBvYmoubmV4dE5vZGVEZWNpZGVyID09PSAnZnVuY3Rpb24nIHx8XG4gICAgICB0eXBlb2Ygb2JqLm5leHROb2RlU2VsZWN0b3IgPT09ICdmdW5jdGlvbic7XG5cbiAgICByZXR1cm4gaGFzQ29udGludWF0aW9uO1xuICB9IGNhdGNoIHtcbiAgICAvLyBJZiBwcm9wZXJ0eSBhY2Nlc3MgdGhyb3dzIChlLmcuLCBab2Qgc2NvcGUgcHJveHkpLCBpdCdzIG5vdCBhIFN0YWdlTm9kZVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5cbi8qKlxuICogUGlwZWxpbmVcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogQ29yZSBleGVjdXRpb24gZW5naW5lIGZvciBmbG93Y2hhcnQtYmFzZWQgcGlwZWxpbmVzLlxuICpcbiAqIFdIWTogUHJvdmlkZXMgYSB1bmlmaWVkIHRyYXZlcnNhbCBhbGdvcml0aG0gdGhhdCBoYW5kbGVzIGFsbCBub2RlIHNoYXBlc1xuICogKGxpbmVhciwgZm9yaywgZGVjaWRlciwgc2VsZWN0b3IpIHdpdGggY29uc2lzdGVudCBzZW1hbnRpY3MuXG4gKlxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gRXhlY3V0ZSBzdGFnZSBmdW5jdGlvbnMgaW4gY29ycmVjdCBvcmRlclxuICogLSBDb29yZGluYXRlIHdpdGggZXh0cmFjdGVkIGhhbmRsZXIgbW9kdWxlc1xuICogLSBNYW5hZ2UgZXhlY3V0aW9uIHN0YXRlIChpdGVyYXRpb24gY291bnRlcnMsIHN1YmZsb3cgcmVzdWx0cywgZXRjLilcbiAqIC0gU3VwcG9ydCBkeW5hbWljIHN0YWdlcyBhbmQgc3ViZmxvd3NcbiAqXG4gKiBERVNJR04gREVDSVNJT05TOlxuICogLSBIYW5kbGVyIG1vZHVsZXMgKFN0YWdlUnVubmVyLCBMb29wSGFuZGxlciwgZXRjLikgYXJlIGluamVjdGVkIGZvciB0ZXN0YWJpbGl0eVxuICogLSBVc2VzIFBpcGVsaW5lQ29udGV4dCB0byBzaGFyZSBzdGF0ZSB3aXRoIGhhbmRsZXJzXG4gKiAtIFN1cHBvcnRzIGJvdGggc3luYyBhbmQgYXN5bmMgc3RhZ2VzIHdpdGhvdXQgdGhlbmFibGUgYXNzaW1pbGF0aW9uXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IHBpcGVsaW5lID0gbmV3IFBpcGVsaW5lKHJvb3QsIHN0YWdlTWFwLCBzY29wZUZhY3RvcnkpO1xuICogY29uc3QgcmVzdWx0ID0gYXdhaXQgcGlwZWxpbmUuZXhlY3V0ZSgpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBQaXBlbGluZTxUT3V0LCBUU2NvcGU+IHtcbiAgcHJpdmF0ZSBzdGFnZU1hcDogTWFwPHN0cmluZywgUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4+O1xuICBwcml2YXRlIHJvb3Q6IFN0YWdlTm9kZTtcbiAgcHJpdmF0ZSBwaXBlbGluZVJ1bnRpbWU6IFBpcGVsaW5lUnVudGltZTtcblxuICAvKiogTm9ybWFsaXplZCBzY29wZSBmYWN0b3J5IGluamVjdGVkIGJ5IHRoZSBjYWxsZXIgKGNsYXNzIHwgZmFjdG9yeSB8IHBsdWdpbiDihpIgZmFjdG9yeSkgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBTY29wZUZhY3Rvcnk6IFNjb3BlRmFjdG9yeTxUU2NvcGU+O1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgcmVhZE9ubHlDb250ZXh0PzogdW5rbm93bjtcbiAgcHJpdmF0ZSByZWFkb25seSB0aHJvdHRsaW5nRXJyb3JDaGVja2VyPzogKGVycm9yOiB1bmtub3duKSA9PiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBTdHJlYW0gaGFuZGxlcnMgZm9yIHN0cmVhbWluZyBzdGFnZXMuXG4gICAqIENvbnRhaW5zIGNhbGxiYWNrcyBmb3IgdG9rZW4gZW1pc3Npb24gYW5kIGxpZmVjeWNsZSBldmVudHMgKHN0YXJ0L2VuZCkuXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IHN0cmVhbUhhbmRsZXJzPzogU3RyZWFtSGFuZGxlcnM7XG5cbiAgLyoqXG4gICAqIEl0ZXJhdGlvbiBjb3VudGVyIGZvciBsb29wIHN1cHBvcnQuXG4gICAqIFRyYWNrcyBob3cgbWFueSB0aW1lcyBlYWNoIG5vZGUgSUQgaGFzIGJlZW4gdmlzaXRlZCAoZm9yIGNvbnRleHQgcGF0aCBnZW5lcmF0aW9uKS5cbiAgICogS2V5OiBub2RlLmlkLCBWYWx1ZTogaXRlcmF0aW9uIGNvdW50ICgwID0gZmlyc3QgdmlzaXQpXG4gICAqL1xuICBwcml2YXRlIGl0ZXJhdGlvbkNvdW50ZXJzOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXG4gIC8qKlxuICAgKiBDb2xsZWN0ZWQgc3ViZmxvdyBleGVjdXRpb24gcmVzdWx0cyBkdXJpbmcgcGlwZWxpbmUgcnVuLlxuICAgKiBLZXllZCBieSBzdWJmbG93SWQgZm9yIGxvb2t1cCBkdXJpbmcgQVBJIHJlc3BvbnNlIGNvbnN0cnVjdGlvbi5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogNC4xLCA0LjJfXG4gICAqL1xuICBwcml2YXRlIHN1YmZsb3dSZXN1bHRzOiBNYXA8c3RyaW5nLCBTdWJmbG93UmVzdWx0PiA9IG5ldyBNYXAoKTtcblxuICAvKipcbiAgICogT3B0aW9uYWwgdHJhdmVyc2FsIGV4dHJhY3RvciBmdW5jdGlvbi5cbiAgICogQ2FsbGVkIGFmdGVyIGVhY2ggc3RhZ2UgY29tcGxldGVzIHRvIGV4dHJhY3QgZGF0YS5cbiAgICovXG4gIHByaXZhdGUgcmVhZG9ubHkgZXh0cmFjdG9yPzogVHJhdmVyc2FsRXh0cmFjdG9yO1xuXG4gIC8qKlxuICAgKiBDb2xsZWN0ZWQgZXh0cmFjdGVkIHJlc3VsdHMgZHVyaW5nIHBpcGVsaW5lIHJ1bi5cbiAgICogS2V5ZWQgYnkgc3RhZ2UgcGF0aCAoZS5nLiwgXCJyb290LmNoaWxkLmdyYW5kY2hpbGRcIikuXG4gICAqL1xuICBwcml2YXRlIGV4dHJhY3RlZFJlc3VsdHM6IE1hcDxzdHJpbmcsIHVua25vd24+ID0gbmV3IE1hcCgpO1xuXG4gIC8qKlxuICAgKiBFcnJvcnMgZW5jb3VudGVyZWQgZHVyaW5nIGV4dHJhY3Rpb24uXG4gICAqIExvZ2dlZCBidXQgZG9uJ3Qgc3RvcCBwaXBlbGluZSBleGVjdXRpb24uXG4gICAqL1xuICBwcml2YXRlIGV4dHJhY3RvckVycm9yczogRXh0cmFjdG9yRXJyb3JbXSA9IFtdO1xuXG4gIC8qKlxuICAgKiBTdGVwIGNvdW50ZXIgZm9yIGV4ZWN1dGlvbiBvcmRlciB0cmFja2luZy5cbiAgICogSW5jcmVtZW50ZWQgYmVmb3JlIGVhY2ggZXh0cmFjdG9yIGNhbGwuXG4gICAqIDEtYmFzZWQ6IGZpcnN0IHN0YWdlIGdldHMgc3RlcE51bWJlciAxLlxuICAgKiBcbiAgICogX1JlcXVpcmVtZW50czogdW5pZmllZC1leHRyYWN0b3ItYXJjaGl0ZWN0dXJlIDMuMV9cbiAgICovXG4gIHByaXZhdGUgc3RlcENvdW50ZXI6IG51bWJlciA9IDA7XG5cbiAgLyoqXG4gICAqIEN1cnJlbnQgc3ViZmxvdyBjb250ZXh0IGZvciBzdWJmbG93SWQgcHJvcGFnYXRpb24uXG4gICAqIFNldCB3aGVuIGVudGVyaW5nIGEgc3ViZmxvdywgY2xlYXJlZCB3aGVuIGV4aXRpbmcuXG4gICAqIFByb3BhZ2F0ZWQgdG8gYWxsIGNoaWxkcmVuIHdpdGhpbiB0aGUgc3ViZmxvdyB2aWEgc3RydWN0dXJlTWV0YWRhdGEuXG4gICAqIFxuICAgKiBfUmVxdWlyZW1lbnRzOiB1bmlmaWVkLWV4dHJhY3Rvci1hcmNoaXRlY3R1cmUgMy4zLCAzLjQsIDMuNV9cbiAgICovXG4gIHByaXZhdGUgY3VycmVudFN1YmZsb3dJZD86IHN0cmluZztcblxuICAvKipcbiAgICogQ3VycmVudCBmb3JrIGNvbnRleHQgZm9yIHBhcmFsbGVsR3JvdXBJZCBwcm9wYWdhdGlvbi5cbiAgICogU2V0IHdoZW4gZXhlY3V0aW5nIGZvcmsgY2hpbGRyZW4sIGNsZWFyZWQgYWZ0ZXIgY2hpbGRyZW4gY29tcGxldGUuXG4gICAqIFByb3BhZ2F0ZWQgdG8gcGFyYWxsZWwgY2hpbGRyZW4gdmlhIHN0cnVjdHVyZU1ldGFkYXRhLlxuICAgKiBcbiAgICogX1JlcXVpcmVtZW50czogdW5pZmllZC1leHRyYWN0b3ItYXJjaGl0ZWN0dXJlIDMuNiwgMy43X1xuICAgKi9cbiAgcHJpdmF0ZSBjdXJyZW50Rm9ya0lkPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBQcm90ZWN0aW9uIG1vZGUgZm9yIHNjb3BlIGFjY2Vzcy5cbiAgICogV2hlbiAnZXJyb3InIChkZWZhdWx0KSwgdGhyb3dzIG9uIGRpcmVjdCBwcm9wZXJ0eSBhc3NpZ25tZW50LlxuICAgKiBXaGVuICd3YXJuJywgbG9ncyB3YXJuaW5nIGJ1dCBhbGxvd3MgYXNzaWdubWVudC5cbiAgICogV2hlbiAnb2ZmJywgbm8gcHJvdGVjdGlvbiBpcyBhcHBsaWVkLlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiA1LjEsIDUuMiwgNS4zX1xuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBzY29wZVByb3RlY3Rpb25Nb2RlOiBTY29wZVByb3RlY3Rpb25Nb2RlO1xuXG4gIC8qKlxuICAgKiBNZW1vaXplZCBzdWJmbG93IGRlZmluaXRpb25zLlxuICAgKiBLZXkgaXMgdGhlIHN1YmZsb3cncyByb290IG5hbWUsIHZhbHVlIGNvbnRhaW5zIHRoZSBzdWJmbG93IHJvb3Qgbm9kZS5cbiAgICogVXNlZCB0byByZXNvbHZlIHJlZmVyZW5jZSBub2RlcyAobm9kZXMgd2l0aCBgaXNTdWJmbG93Um9vdGAgYnV0IG5vIGBmbmApLlxuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBzdWJmbG93cz86IFJlY29yZDxzdHJpbmcsIHsgcm9vdDogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gfT47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gZW5yaWNoIFN0YWdlU25hcHNob3RzIHdpdGggc2NvcGUgc3RhdGUsIGRlYnVnIG1ldGFkYXRhLFxuICAgKiBzdGFnZSBvdXRwdXQsIGFuZCBoaXN0b3J5IGluZGV4IGR1cmluZyB0cmF2ZXJzYWwuXG4gICAqXG4gICAqIFdIWTogV2hlbiBlbmFibGVkLCB0aGUgZXh0cmFjdG9yIHJlY2VpdmVzIGZ1bGwgc3RhZ2UgZGF0YSBkdXJpbmcgdHJhdmVyc2FsLFxuICAgKiBlbGltaW5hdGluZyB0aGUgbmVlZCBmb3IgYSByZWR1bmRhbnQgcG9zdC10cmF2ZXJzYWwgd2FsayB2aWFcbiAgICogUGlwZWxpbmVSdW50aW1lLmdldFNuYXBzaG90KCkuIERlZmF1bHRzIHRvIGZhbHNlIGZvciB6ZXJvLW92ZXJoZWFkXG4gICAqIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuXG4gICAqXG4gICAqIERFU0lHTjogT3B0LWluIGZsYWcgc28gZXhpc3RpbmcgY29uc3VtZXJzIHBheSBubyBhZGRpdGlvbmFsIGNvc3QuXG4gICAqIFdoZW4gdHJ1ZSwgY2FsbEV4dHJhY3RvcigpIGNhcHR1cmVzIGFkZGl0aW9uYWwgZGF0YSBmcm9tIFN0YWdlQ29udGV4dFxuICAgKiBhbmQgR2xvYmFsU3RvcmUgYXQgY29tbWl0IHRpbWUuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IHNpbmdsZS1wYXNzLWRlYnVnLXN0cnVjdHVyZSA0LjEsIDQuMywgOC4zX1xuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBlbnJpY2hTbmFwc2hvdHM6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIE5vZGVSZXNvbHZlciBtb2R1bGUgZm9yIG5vZGUgbG9va3VwIGFuZCBzdWJmbG93IHJlZmVyZW5jZSByZXNvbHV0aW9uLlxuICAgKiBFeHRyYWN0ZWQgZnJvbSBQaXBlbGluZS50cyBmb3IgU2luZ2xlIFJlc3BvbnNpYmlsaXR5IFByaW5jaXBsZS5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMy4xLCAzLjIsIDMuM19cbiAgICovXG4gIHByaXZhdGUgcmVhZG9ubHkgbm9kZVJlc29sdmVyOiBOb2RlUmVzb2x2ZXI8VE91dCwgVFNjb3BlPjtcblxuICAvKipcbiAgICogQ2hpbGRyZW5FeGVjdXRvciBtb2R1bGUgZm9yIHBhcmFsbGVsIGNoaWxkcmVuIGV4ZWN1dGlvbi5cbiAgICogRXh0cmFjdGVkIGZyb20gUGlwZWxpbmUudHMgZm9yIFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDIuMSwgMi4yLCAyLjNfXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IGNoaWxkcmVuRXhlY3V0b3I6IENoaWxkcmVuRXhlY3V0b3I8VE91dCwgVFNjb3BlPjtcblxuICAvKipcbiAgICogU3ViZmxvd0V4ZWN1dG9yIG1vZHVsZSBmb3Igc3ViZmxvdyBleGVjdXRpb24gd2l0aCBpc29sYXRlZCBjb250ZXh0cy5cbiAgICogRXh0cmFjdGVkIGZyb20gUGlwZWxpbmUudHMgZm9yIFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDEuMSwgMS4yLCAxLjMsIDEuNCwgMS41X1xuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBzdWJmbG93RXhlY3V0b3I6IFN1YmZsb3dFeGVjdXRvcjxUT3V0LCBUU2NvcGU+O1xuXG4gIC8qKlxuICAgKiBTdGFnZVJ1bm5lciBtb2R1bGUgZm9yIGV4ZWN1dGluZyBpbmRpdmlkdWFsIHN0YWdlIGZ1bmN0aW9ucy5cbiAgICogRXh0cmFjdGVkIGZyb20gUGlwZWxpbmUudHMgZm9yIFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IHBoYXNlMi1oYW5kbGVycyAxLjEsIDEuMiwgMS4zLCAxLjQsIDEuNSwgMS42X1xuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBzdGFnZVJ1bm5lcjogU3RhZ2VSdW5uZXI8VE91dCwgVFNjb3BlPjtcblxuICAvKipcbiAgICogTG9vcEhhbmRsZXIgbW9kdWxlIGZvciBkeW5hbWljIG5leHQsIGl0ZXJhdGlvbiBjb3VudGluZywgYW5kIGxvb3AtYmFjayBsb2dpYy5cbiAgICogRXh0cmFjdGVkIGZyb20gUGlwZWxpbmUudHMgZm9yIFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IHBoYXNlMi1oYW5kbGVycyAzLjEsIDMuMiwgMy4zLCAzLjQsIDMuNSwgMy42LCAzLjdfXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IGxvb3BIYW5kbGVyOiBMb29wSGFuZGxlcjxUT3V0LCBUU2NvcGU+O1xuXG4gIC8qKlxuICAgKiBEZWNpZGVySGFuZGxlciBtb2R1bGUgZm9yIGRlY2lkZXIgZXZhbHVhdGlvbiBhbmQgYnJhbmNoaW5nLlxuICAgKiBFeHRyYWN0ZWQgZnJvbSBQaXBlbGluZS50cyBmb3IgU2luZ2xlIFJlc3BvbnNpYmlsaXR5IFByaW5jaXBsZS5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcGhhc2UyLWhhbmRsZXJzIDIuMSwgMi4yLCAyLjMsIDIuNCwgMi41X1xuICAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBkZWNpZGVySGFuZGxlcjogRGVjaWRlckhhbmRsZXI8VE91dCwgVFNjb3BlPjtcblxuICAvKipcbiAgICogTmFycmF0aXZlIGdlbmVyYXRvciBmb3IgcHJvZHVjaW5nIGh1bWFuLXJlYWRhYmxlIGV4ZWN1dGlvbiBzdG9yeS5cbiAgICpcbiAgICogV0hZOiBIb2xkcyBlaXRoZXIgYSBOYXJyYXRpdmVHZW5lcmF0b3IgKHdoZW4gZW5hYmxlZCkgb3IgYVxuICAgKiBOdWxsTmFycmF0aXZlR2VuZXJhdG9yICh3aGVuIGRpc2FibGVkKS4gVGhlIE51bGwgT2JqZWN0IHBhdHRlcm5cbiAgICogbGV0cyBoYW5kbGVycyBjYWxsIG5hcnJhdGl2ZSBtZXRob2RzIHVuY29uZGl0aW9uYWxseSDigJQgemVybyBjb3N0XG4gICAqIHdoZW4gbmFycmF0aXZlIGlzIG5vdCBuZWVkZWQuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDEuMiwgMS4zLCA5LjNfXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IG5hcnJhdGl2ZUdlbmVyYXRvcjogSU5hcnJhdGl2ZUdlbmVyYXRvcjtcblxuICAvKipcbiAgICogU3RhdGljIGJ1aWxkLXRpbWUgcGlwZWxpbmUgc3RydWN0dXJlIHNuYXBzaG90IGZyb20gRmxvd0NoYXJ0QnVpbGRlci5cbiAgICpcbiAgICogV0hZOiBTdG9yZWQgc28gdGhhdCBQaXBlbGluZSBjYW4gZGVlcC1jbG9uZSBpdCBpbnRvIGBydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmVgXG4gICAqIGR1cmluZyBpbml0aWFsaXphdGlvbiAodGFzayAyLjEpLiBLZXB0IGFzIGFuIGltbXV0YWJsZSByZWZlcmVuY2Ug4oCUIG5ldmVyXG4gICAqIG11dGF0ZWQgZHVyaW5nIGV4ZWN1dGlvbiDigJQgc28gY29uc3VtZXJzIGNhbiBzdGlsbCBhY2Nlc3MgdGhlIG9yaWdpbmFsXG4gICAqIHN0YXRpYyBzdHJ1Y3R1cmUgZm9yIGRpZmZpbmcgb3IgY2FjaGluZy5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgMS4xLCAxLjJfXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IGJ1aWxkVGltZVN0cnVjdHVyZT86IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZTtcblxuICAvKipcbiAgICogTXV0YWJsZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSB0aGF0IHN0YXJ0cyBhcyBhIGRlZXAgY2xvbmUgb2YgYnVpbGRUaW1lU3RydWN0dXJlXG4gICAqIGFuZCBnZXRzIHVwZGF0ZWQgYXMgZHluYW1pYyBzdGFnZXMgYXJlIGRpc2NvdmVyZWQgZHVyaW5nIGV4ZWN1dGlvbi5cbiAgICpcbiAgICogV0hZOiBNYWtlcyB0aGUgbGlicmFyeSB0aGUgc2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3IgdGhlIGNvbXBsZXRlIGV4ZWN1dGlvbiBzdHJ1Y3R1cmUsXG4gICAqIGVsaW1pbmF0aW5nIHRoZSBuZWVkIGZvciBVSS1zaWRlIHJlY29uc3RydWN0aW9uIChydW50aW1lTWVyZ2VyKS5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgMS4xLCAxLjRfXG4gICAqL1xuICBwcml2YXRlIHJ1bnRpbWVQaXBlbGluZVN0cnVjdHVyZT86IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZTtcblxuICAvKipcbiAgICogTG9va3VwIG1hcCBmcm9tIG5vZGUgSUQvbmFtZSB0byBpdHMgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlIG5vZGVcbiAgICogaW4gdGhlIHJ1bnRpbWVQaXBlbGluZVN0cnVjdHVyZSB0cmVlLiBFbmFibGVzIE8oMSkgdXBkYXRlcy5cbiAgICpcbiAgICogV0hZOiBXaGVuIGEgZHluYW1pYyBldmVudCBvY2N1cnMsIHdlIG5lZWQgdG8gZmluZCB0aGUgY29ycmVzcG9uZGluZ1xuICAgKiBzdHJ1Y3R1cmUgbm9kZSBxdWlja2x5LiBXYWxraW5nIHRoZSB0cmVlIGVhY2ggdGltZSB3b3VsZCBiZSBPKG4pLlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBydW50aW1lLXBpcGVsaW5lLXN0cnVjdHVyZSAxLjNfXG4gICAqL1xuICBwcml2YXRlIHN0cnVjdHVyZU5vZGVNYXA6IE1hcDxzdHJpbmcsIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZT4gPSBuZXcgTWFwKCk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcm9vdDogU3RhZ2VOb2RlLFxuICAgIHN0YWdlTWFwOiBNYXA8c3RyaW5nLCBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPj4sXG4gICAgc2NvcGVGYWN0b3J5OiBTY29wZUZhY3Rvcnk8VFNjb3BlPixcbiAgICBkZWZhdWx0VmFsdWVzRm9yQ29udGV4dD86IHVua25vd24sXG4gICAgaW5pdGlhbENvbnRleHQ/OiB1bmtub3duLFxuICAgIHJlYWRPbmx5Q29udGV4dD86IHVua25vd24sXG4gICAgdGhyb3R0bGluZ0Vycm9yQ2hlY2tlcj86IChlcnJvcjogdW5rbm93bikgPT4gYm9vbGVhbixcbiAgICBzdHJlYW1IYW5kbGVycz86IFN0cmVhbUhhbmRsZXJzLFxuICAgIGV4dHJhY3Rvcj86IFRyYXZlcnNhbEV4dHJhY3RvcixcbiAgICBzY29wZVByb3RlY3Rpb25Nb2RlPzogU2NvcGVQcm90ZWN0aW9uTW9kZSxcbiAgICBzdWJmbG93cz86IFJlY29yZDxzdHJpbmcsIHsgcm9vdDogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gfT4sXG4gICAgZW5yaWNoU25hcHNob3RzPzogYm9vbGVhbixcbiAgICBuYXJyYXRpdmVFbmFibGVkPzogYm9vbGVhbixcbiAgICBidWlsZFRpbWVTdHJ1Y3R1cmU/OiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUsXG4gICkge1xuICAgIHRoaXMucm9vdCA9IHJvb3Q7XG4gICAgdGhpcy5zdGFnZU1hcCA9IHN0YWdlTWFwO1xuICAgIHRoaXMucmVhZE9ubHlDb250ZXh0ID0gcmVhZE9ubHlDb250ZXh0O1xuICAgIHRoaXMucGlwZWxpbmVSdW50aW1lID0gbmV3IFBpcGVsaW5lUnVudGltZSh0aGlzLnJvb3QubmFtZSwgZGVmYXVsdFZhbHVlc0ZvckNvbnRleHQsIGluaXRpYWxDb250ZXh0KTtcbiAgICB0aGlzLnRocm90dGxpbmdFcnJvckNoZWNrZXIgPSB0aHJvdHRsaW5nRXJyb3JDaGVja2VyO1xuICAgIHRoaXMuU2NvcGVGYWN0b3J5ID0gc2NvcGVGYWN0b3J5O1xuICAgIHRoaXMuc3RyZWFtSGFuZGxlcnMgPSBzdHJlYW1IYW5kbGVycztcbiAgICB0aGlzLmV4dHJhY3RvciA9IGV4dHJhY3RvcjtcbiAgICB0aGlzLnNjb3BlUHJvdGVjdGlvbk1vZGUgPSBzY29wZVByb3RlY3Rpb25Nb2RlID8/ICdlcnJvcic7XG4gICAgdGhpcy5zdWJmbG93cyA9IHN1YmZsb3dzO1xuICAgIHRoaXMuZW5yaWNoU25hcHNob3RzID0gZW5yaWNoU25hcHNob3RzID8/IGZhbHNlO1xuICAgIHRoaXMuYnVpbGRUaW1lU3RydWN0dXJlID0gYnVpbGRUaW1lU3RydWN0dXJlO1xuXG4gICAgLy8gRGVlcC1jbG9uZSBidWlsZFRpbWVTdHJ1Y3R1cmUgaW50byBydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUgYW5kIGJ1aWxkXG4gICAgLy8gdGhlIE8oMSkgbG9va3VwIG1hcC4gTm8tb3Agd2hlbiBidWlsZFRpbWVTdHJ1Y3R1cmUgaXMgbm90IHByb3ZpZGVkLlxuICAgIC8vIF9SZXF1aXJlbWVudHM6IHJ1bnRpbWUtcGlwZWxpbmUtc3RydWN0dXJlIDEuMSwgMS4zLCAxLjRfXG4gICAgdGhpcy5pbml0UnVudGltZVN0cnVjdHVyZShidWlsZFRpbWVTdHJ1Y3R1cmUpO1xuXG4gICAgLy8gQ3JlYXRlIG5hcnJhdGl2ZSBnZW5lcmF0b3IgYmFzZWQgb24gb3B0LWluIGZsYWcuXG4gICAgLy8gV0hZOiBOdWxsTmFycmF0aXZlR2VuZXJhdG9yIGlzIHRoZSBkZWZhdWx0IOKAlCB6ZXJvIGFsbG9jYXRpb24sIHplcm8gc3RyaW5nXG4gICAgLy8gZm9ybWF0dGluZy4gT25seSB3aGVuIHRoZSBjb25zdW1lciBleHBsaWNpdGx5IGVuYWJsZXMgbmFycmF0aXZlIGRvIHdlXG4gICAgLy8gYWxsb2NhdGUgdGhlIHJlYWwgTmFycmF0aXZlR2VuZXJhdG9yIHdpdGggaXRzIHNlbnRlbmNlcyBhcnJheS5cbiAgICAvLyBfUmVxdWlyZW1lbnRzOiAxLjIsIDEuMywgOS4zX1xuICAgIHRoaXMubmFycmF0aXZlR2VuZXJhdG9yID0gbmFycmF0aXZlRW5hYmxlZFxuICAgICAgPyBuZXcgTmFycmF0aXZlR2VuZXJhdG9yKClcbiAgICAgIDogbmV3IE51bGxOYXJyYXRpdmVHZW5lcmF0b3IoKTtcblxuICAgIC8vIEluaXRpYWxpemUgTm9kZVJlc29sdmVyIHdpdGggc2hhcmVkIGNvbnRleHRcbiAgICB0aGlzLm5vZGVSZXNvbHZlciA9IG5ldyBOb2RlUmVzb2x2ZXIodGhpcy5jcmVhdGVQaXBlbGluZUNvbnRleHQoKSk7XG5cbiAgICAvLyBJbml0aWFsaXplIENoaWxkcmVuRXhlY3V0b3Igd2l0aCBzaGFyZWQgY29udGV4dCBhbmQgZXhlY3V0ZU5vZGUgY2FsbGJhY2tcbiAgICAvLyBOb3RlOiBXZSBiaW5kIGV4ZWN1dGVOb2RlIHRvIHByZXNlcnZlICd0aGlzJyBjb250ZXh0XG4gICAgdGhpcy5jaGlsZHJlbkV4ZWN1dG9yID0gbmV3IENoaWxkcmVuRXhlY3V0b3IoXG4gICAgICB0aGlzLmNyZWF0ZVBpcGVsaW5lQ29udGV4dCgpLFxuICAgICAgdGhpcy5leGVjdXRlTm9kZS5iaW5kKHRoaXMpLFxuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIFN1YmZsb3dFeGVjdXRvciB3aXRoIHNoYXJlZCBjb250ZXh0IGFuZCByZXF1aXJlZCBjYWxsYmFja3NcbiAgICAvLyBOb3RlOiBXZSBiaW5kIG1ldGhvZHMgdG8gcHJlc2VydmUgJ3RoaXMnIGNvbnRleHRcbiAgICB0aGlzLnN1YmZsb3dFeGVjdXRvciA9IG5ldyBTdWJmbG93RXhlY3V0b3IoXG4gICAgICB0aGlzLmNyZWF0ZVBpcGVsaW5lQ29udGV4dCgpLFxuICAgICAgdGhpcy5ub2RlUmVzb2x2ZXIsXG4gICAgICB0aGlzLmV4ZWN1dGVTdGFnZS5iaW5kKHRoaXMpLFxuICAgICAgdGhpcy5jYWxsRXh0cmFjdG9yLmJpbmQodGhpcyksXG4gICAgICB0aGlzLmdldFN0YWdlRm4uYmluZCh0aGlzKSxcbiAgICApO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBTdGFnZVJ1bm5lciB3aXRoIHNoYXJlZCBjb250ZXh0XG4gICAgdGhpcy5zdGFnZVJ1bm5lciA9IG5ldyBTdGFnZVJ1bm5lcih0aGlzLmNyZWF0ZVBpcGVsaW5lQ29udGV4dCgpKTtcblxuICAgIC8vIEluaXRpYWxpemUgTG9vcEhhbmRsZXIgd2l0aCBzaGFyZWQgY29udGV4dCBhbmQgTm9kZVJlc29sdmVyXG4gICAgdGhpcy5sb29wSGFuZGxlciA9IG5ldyBMb29wSGFuZGxlcihcbiAgICAgIHRoaXMuY3JlYXRlUGlwZWxpbmVDb250ZXh0KCksXG4gICAgICB0aGlzLm5vZGVSZXNvbHZlcixcbiAgICAgIC8vIENhbGxiYWNrIHRvIHVwZGF0ZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSB3aXRoIGl0ZXJhdGlvbiBjb3VudFxuICAgICAgLy8gX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgNS4xX1xuICAgICAgKG5vZGVJZDogc3RyaW5nLCBjb3VudDogbnVtYmVyKSA9PiB0aGlzLnVwZGF0ZVN0cnVjdHVyZUl0ZXJhdGlvbkNvdW50KG5vZGVJZCwgY291bnQpLFxuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIERlY2lkZXJIYW5kbGVyIHdpdGggc2hhcmVkIGNvbnRleHQgYW5kIE5vZGVSZXNvbHZlclxuICAgIHRoaXMuZGVjaWRlckhhbmRsZXIgPSBuZXcgRGVjaWRlckhhbmRsZXIodGhpcy5jcmVhdGVQaXBlbGluZUNvbnRleHQoKSwgdGhpcy5ub2RlUmVzb2x2ZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIFBpcGVsaW5lQ29udGV4dCBvYmplY3QgZm9yIHVzZSBieSBleHRyYWN0ZWQgbW9kdWxlcy5cbiAgICogVGhpcyBwcm92aWRlcyBhbGwgdGhlIHNoYXJlZCBzdGF0ZSBuZWVkZWQgYnkgTm9kZVJlc29sdmVyLCBDaGlsZHJlbkV4ZWN1dG9yLCBldGMuXG4gICAqXG4gICAqIEByZXR1cm5zIFBpcGVsaW5lQ29udGV4dCB3aXRoIGFsbCByZXF1aXJlZCBmaWVsZHNcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogNS40X1xuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVQaXBlbGluZUNvbnRleHQoKTogUGlwZWxpbmVDb250ZXh0PFRPdXQsIFRTY29wZT4ge1xuICAgIHJldHVybiB7XG4gICAgICBzdGFnZU1hcDogdGhpcy5zdGFnZU1hcCxcbiAgICAgIHJvb3Q6IHRoaXMucm9vdCxcbiAgICAgIHBpcGVsaW5lUnVudGltZTogdGhpcy5waXBlbGluZVJ1bnRpbWUsXG4gICAgICBTY29wZUZhY3Rvcnk6IHRoaXMuU2NvcGVGYWN0b3J5LFxuICAgICAgc3ViZmxvd3M6IHRoaXMuc3ViZmxvd3MsXG4gICAgICB0aHJvdHRsaW5nRXJyb3JDaGVja2VyOiB0aGlzLnRocm90dGxpbmdFcnJvckNoZWNrZXIsXG4gICAgICBzdHJlYW1IYW5kbGVyczogdGhpcy5zdHJlYW1IYW5kbGVycyxcbiAgICAgIHNjb3BlUHJvdGVjdGlvbk1vZGU6IHRoaXMuc2NvcGVQcm90ZWN0aW9uTW9kZSxcbiAgICAgIHJlYWRPbmx5Q29udGV4dDogdGhpcy5yZWFkT25seUNvbnRleHQsXG4gICAgICBleHRyYWN0b3I6IHRoaXMuZXh0cmFjdG9yLFxuICAgICAgbmFycmF0aXZlR2VuZXJhdG9yOiB0aGlzLm5hcnJhdGl2ZUdlbmVyYXRvcixcbiAgICB9O1xuICB9XG5cbiAgLyoqIEV4ZWN1dGUgdGhlIHBpcGVsaW5lIGZyb20gdGhlIHJvb3Qgbm9kZS4gKi9cbiAgYXN5bmMgZXhlY3V0ZSgpOiBQcm9taXNlPFRyZWVPZkZ1bmN0aW9uc1Jlc3BvbnNlPiB7XG4gICAgY29uc3QgY29udGV4dCA9IHRoaXMucGlwZWxpbmVSdW50aW1lLnJvb3RTdGFnZUNvbnRleHQ7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZU5vZGUodGhpcy5yb290LCBjb250ZXh0LCB7IHNob3VsZEJyZWFrOiBmYWxzZSB9LCAnJyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgcnVudGltZSBwaXBlbGluZSBzdHJ1Y3R1cmUgd2l0aCBhbGwgZHluYW1pYyB1cGRhdGVzIGFwcGxpZWQuXG4gICAqXG4gICAqIFdIWTogUHJvdmlkZXMgdGhlIGNvbXBsZXRlLCBhdXRob3JpdGF0aXZlIHBpcGVsaW5lIHN0cnVjdHVyZSBpbmNsdWRpbmdcbiAgICogZHluYW1pY2FsbHkgYWRkZWQgY2hpbGRyZW4sIHN1YmZsb3dzLCBuZXh0IG5vZGVzLCBhbmQgbG9vcCBpdGVyYXRpb24gY291bnRzLlxuICAgKiBDb25zdW1lcnMgY2FuIHVzZSB0aGlzIGZvciB2aXN1YWxpemF0aW9uIHdpdGhvdXQgbmVlZGluZyB0byByZWNvbnN0cnVjdFxuICAgKiB0aGUgc3RydWN0dXJlIGZyb20gc2VwYXJhdGUgZGF0YSBzb3VyY2VzLlxuICAgKlxuICAgKiBCZWZvcmUgZXhlY3V0aW9uOiByZXR1cm5zIHRoZSBpbml0aWFsIGRlZXAgY2xvbmUgb2YgYnVpbGRUaW1lU3RydWN0dXJlLlxuICAgKiBBZnRlciBleGVjdXRpb246IHJldHVybnMgdGhlIGZ1bGx5IGVucmljaGVkIHN0cnVjdHVyZS5cbiAgICogV2hlbiBidWlsZFRpbWVTdHJ1Y3R1cmUgd2FzIG5vdCBwcm92aWRlZDogcmV0dXJucyB1bmRlZmluZWQuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IHJ1bnRpbWUtcGlwZWxpbmUtc3RydWN0dXJlIDYuMiwgNi4zLCA2LjRfXG4gICAqL1xuICBnZXRSdW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUoKTogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5ydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmU7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIHRoZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSBmcm9tIHRoZSBidWlsZC10aW1lIHN0cnVjdHVyZS5cbiAgICpcbiAgICogV0hZOiBDcmVhdGVzIGEgbXV0YWJsZSBkZWVwIGNsb25lIHNvIHRoYXQgZHluYW1pYyBjaGFuZ2VzIGR1cmluZyBleGVjdXRpb25cbiAgICogKGNoaWxkcmVuLCBzdWJmbG93cywgbmV4dCBub2RlcywgbG9vcCBpdGVyYXRpb25zKSBjYW4gYmUgcmVmbGVjdGVkIGluIGFcbiAgICogc2luZ2xlIGF1dGhvcml0YXRpdmUgc3RydWN0dXJlIHdpdGhvdXQgbXV0YXRpbmcgdGhlIG9yaWdpbmFsIGJ1aWxkVGltZVN0cnVjdHVyZS5cbiAgICpcbiAgICogREVTSUdOOiBVc2VzIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoLi4uKSkgZm9yIGRlZXAgY2xvbmluZyDigJQgc2ltcGxlIGFuZFxuICAgKiBzdWZmaWNpZW50IHNpbmNlIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSBjb250YWlucyBvbmx5IEpTT04tc2FmZSB2YWx1ZXMuXG4gICAqXG4gICAqIEBwYXJhbSBidWlsZFRpbWVTdHJ1Y3R1cmUgLSBUaGUgc3RhdGljIHN0cnVjdHVyZSBmcm9tIEZsb3dDaGFydEJ1aWxkZXIsIG9yIHVuZGVmaW5lZFxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBydW50aW1lLXBpcGVsaW5lLXN0cnVjdHVyZSAxLjEsIDEuMywgMS40X1xuICAgKi9cbiAgcHJpdmF0ZSBpbml0UnVudGltZVN0cnVjdHVyZShidWlsZFRpbWVTdHJ1Y3R1cmU/OiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUpOiB2b2lkIHtcbiAgICBpZiAoIWJ1aWxkVGltZVN0cnVjdHVyZSkgcmV0dXJuO1xuXG4gICAgdGhpcy5ydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGJ1aWxkVGltZVN0cnVjdHVyZSkpO1xuICAgIHRoaXMuYnVpbGRTdHJ1Y3R1cmVOb2RlTWFwKHRoaXMucnVudGltZVBpcGVsaW5lU3RydWN0dXJlISk7XG4gIH1cblxuICAvKipcbiAgICogQnVpbGQgdGhlIFN0cnVjdHVyZU5vZGVNYXAgYnkgcmVjdXJzaXZlbHkgd2Fsa2luZyB0aGUgc3RydWN0dXJlIHRyZWUuXG4gICAqIEtleXMgYXJlIG5vZGUgSURzIChwcmVmZXJyZWQpIG9yIG5hbWVzIChmYWxsYmFjaykuXG4gICAqXG4gICAqIFdIWTogRW5hYmxlcyBPKDEpIGxvb2t1cHMgd2hlbiBkeW5hbWljIGV2ZW50cyBvY2N1ciBkdXJpbmcgZXhlY3V0aW9uLFxuICAgKiBhdm9pZGluZyBhbiBPKG4pIHRyZWUgd2FsayBmb3IgZWFjaCB1cGRhdGUuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIGN1cnJlbnQgc3RydWN0dXJlIG5vZGUgdG8gcmVnaXN0ZXIgYW5kIHJlY3Vyc2UgaW50b1xuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBydW50aW1lLXBpcGVsaW5lLXN0cnVjdHVyZSAxLjNfXG4gICAqL1xuICBwcml2YXRlIGJ1aWxkU3RydWN0dXJlTm9kZU1hcChub2RlOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUpOiB2b2lkIHtcbiAgICBjb25zdCBrZXkgPSBub2RlLmlkID8/IG5vZGUubmFtZTtcbiAgICB0aGlzLnN0cnVjdHVyZU5vZGVNYXAuc2V0KGtleSwgbm9kZSk7XG5cbiAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgIHRoaXMuYnVpbGRTdHJ1Y3R1cmVOb2RlTWFwKGNoaWxkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5vZGUubmV4dCkge1xuICAgICAgdGhpcy5idWlsZFN0cnVjdHVyZU5vZGVNYXAobm9kZS5uZXh0KTtcbiAgICB9XG4gICAgaWYgKG5vZGUuc3ViZmxvd1N0cnVjdHVyZSkge1xuICAgICAgdGhpcy5idWlsZFN0cnVjdHVyZU5vZGVNYXAobm9kZS5zdWJmbG93U3RydWN0dXJlKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29udmVydCBhIHJ1bnRpbWUgU3RhZ2VOb2RlIGludG8gYSBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgbm9kZS5cbiAgICpcbiAgICogV0hZOiBXaGVuIGR5bmFtaWMgc3RhZ2VzIGFyZSBkaXNjb3ZlcmVkIGR1cmluZyBleGVjdXRpb24sIHdlIG5lZWQgdG8gY3JlYXRlXG4gICAqIGNvcnJlc3BvbmRpbmcgc3RydWN0dXJlIG5vZGVzIGZvciB0aGUgcnVudGltZVBpcGVsaW5lU3RydWN0dXJlLiBUaGlzIG1ldGhvZFxuICAgKiBwcm92aWRlcyBhIGNvbnNpc3RlbnQgY29udmVyc2lvbiB0aGF0IHJldXNlcyBjb21wdXRlTm9kZVR5cGUgZm9yIHRoZSB0eXBlIGZpZWxkXG4gICAqIGFuZCByZWN1cnNpdmVseSBoYW5kbGVzIGNoaWxkcmVuL25leHQgY2hhaW5zLlxuICAgKlxuICAgKiBERVNJR046IENvcGllcyBvbmx5IHRoZSBzZXJpYWxpemF0aW9uLXJlbGV2YW50IGZpZWxkcyBmcm9tIFN0YWdlTm9kZS5cbiAgICogTWV0YWRhdGEgZmxhZ3MgKGlzU3RyZWFtaW5nLCBpc1N1YmZsb3dSb290LCBoYXNEZWNpZGVyLCBoYXNTZWxlY3RvcikgYXJlIHNldFxuICAgKiBjb25kaXRpb25hbGx5IHRvIGtlZXAgdGhlIHNlcmlhbGl6ZWQgb3V0cHV0IHNwYXJzZS4gU3ViZmxvdyBidWlsZFRpbWVTdHJ1Y3R1cmVcbiAgICogaXMgYXR0YWNoZWQgYXMtaXMgc2luY2UgaXQncyBhbHJlYWR5IGluIHNlcmlhbGl6ZWQgZm9ybS5cbiAgICpcbiAgICogQHBhcmFtIG5vZGUgLSBUaGUgcnVudGltZSBTdGFnZU5vZGUgdG8gY29udmVydFxuICAgKiBAcmV0dXJucyBBIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSBub2RlIHJlcHJlc2VudGluZyB0aGUgc2FtZSBzdGFnZVxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBydW50aW1lLXBpcGVsaW5lLXN0cnVjdHVyZSA3LjEsIDcuMiwgNy4zLCA3LjRfXG4gICAqL1xuICBwcml2YXRlIHN0YWdlTm9kZVRvU3RydWN0dXJlKG5vZGU6IFN0YWdlTm9kZSk6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSB7XG4gICAgY29uc3Qgc3RydWN0dXJlOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgPSB7XG4gICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICBpZDogbm9kZS5pZCxcbiAgICAgIHR5cGU6IHRoaXMuY29tcHV0ZU5vZGVUeXBlKG5vZGUpLFxuICAgICAgZGlzcGxheU5hbWU6IG5vZGUuZGlzcGxheU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogbm9kZS5kZXNjcmlwdGlvbixcbiAgICB9O1xuXG4gICAgLy8gU3RyZWFtaW5nIG1ldGFkYXRhXG4gICAgaWYgKG5vZGUuaXNTdHJlYW1pbmcpIHtcbiAgICAgIHN0cnVjdHVyZS5pc1N0cmVhbWluZyA9IHRydWU7XG4gICAgICBzdHJ1Y3R1cmUuc3RyZWFtSWQgPSBub2RlLnN0cmVhbUlkO1xuICAgIH1cblxuICAgIC8vIFN1YmZsb3cgcm9vdCBtZXRhZGF0YVxuICAgIGlmIChub2RlLmlzU3ViZmxvd1Jvb3QpIHtcbiAgICAgIHN0cnVjdHVyZS5pc1N1YmZsb3dSb290ID0gdHJ1ZTtcbiAgICAgIHN0cnVjdHVyZS5zdWJmbG93SWQgPSBub2RlLnN1YmZsb3dJZDtcbiAgICAgIHN0cnVjdHVyZS5zdWJmbG93TmFtZSA9IG5vZGUuc3ViZmxvd05hbWU7XG4gICAgfVxuXG4gICAgLy8gRGVjaWRlciBtZXRhZGF0YSDigJQgbGVnYWN5IChuZXh0Tm9kZURlY2lkZXIpIG9yIHNjb3BlLWJhc2VkIChkZWNpZGVyRm4pXG4gICAgaWYgKG5vZGUubmV4dE5vZGVEZWNpZGVyIHx8IG5vZGUuZGVjaWRlckZuKSB7XG4gICAgICBzdHJ1Y3R1cmUuaGFzRGVjaWRlciA9IHRydWU7XG4gICAgICBzdHJ1Y3R1cmUuYnJhbmNoSWRzID0gbm9kZS5jaGlsZHJlbj8ubWFwKGMgPT4gYy5pZCA/PyBjLm5hbWUpO1xuICAgIH1cblxuICAgIC8vIFNlbGVjdG9yIG1ldGFkYXRhXG4gICAgaWYgKG5vZGUubmV4dE5vZGVTZWxlY3Rvcikge1xuICAgICAgc3RydWN0dXJlLmhhc1NlbGVjdG9yID0gdHJ1ZTtcbiAgICAgIHN0cnVjdHVyZS5icmFuY2hJZHMgPSBub2RlLmNoaWxkcmVuPy5tYXAoYyA9PiBjLmlkID8/IGMubmFtZSk7XG4gICAgfVxuXG4gICAgLy8gUmVjdXJzaXZlbHkgY29udmVydCBjaGlsZHJlblxuICAgIGlmIChub2RlLmNoaWxkcmVuPy5sZW5ndGgpIHtcbiAgICAgIHN0cnVjdHVyZS5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKGMgPT4gdGhpcy5zdGFnZU5vZGVUb1N0cnVjdHVyZShjKSk7XG4gICAgfVxuXG4gICAgLy8gUmVjdXJzaXZlbHkgY29udmVydCBuZXh0IGNoYWluXG4gICAgaWYgKG5vZGUubmV4dCkge1xuICAgICAgc3RydWN0dXJlLm5leHQgPSB0aGlzLnN0YWdlTm9kZVRvU3RydWN0dXJlKG5vZGUubmV4dCk7XG4gICAgfVxuXG4gICAgLy8gQXR0YWNoIHN1YmZsb3cncyBidWlsZC10aW1lIHN0cnVjdHVyZSBpZiBhdmFpbGFibGVcbiAgICBpZiAobm9kZS5zdWJmbG93RGVmPy5idWlsZFRpbWVTdHJ1Y3R1cmUpIHtcbiAgICAgIHN0cnVjdHVyZS5zdWJmbG93U3RydWN0dXJlID0gbm9kZS5zdWJmbG93RGVmLmJ1aWxkVGltZVN0cnVjdHVyZSBhcyBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0cnVjdHVyZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIHJ1bnRpbWUgc3RydWN0dXJlIHdoZW4gZHluYW1pYyBjaGlsZHJlbiBhcmUgZGlzY292ZXJlZC5cbiAgICpcbiAgICogV0hZOiBXaGVuIGEgc3RhZ2UgcmV0dXJucyBhIFN0YWdlTm9kZSB3aXRoIGR5bmFtaWMgY2hpbGRyZW4gdmlhIGlzU3RhZ2VOb2RlUmV0dXJuKCksXG4gICAqIHRoZSBydW50aW1lIFN0YWdlTm9kZSB0cmVlIGlzIG11dGF0ZWQgYnV0IHRoZSBzZXJpYWxpemVkIHN0cnVjdHVyZSB3b3VsZCBiZSBzdGFsZS5cbiAgICogVGhpcyBtZXRob2Qga2VlcHMgcnVudGltZVBpcGVsaW5lU3RydWN0dXJlIGluIHN5bmMgYnkgY29udmVydGluZyBlYWNoIGR5bmFtaWMgY2hpbGRcbiAgICogaW50byBhIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSBub2RlIGFuZCBpbnNlcnRpbmcgaXQgdW5kZXIgdGhlIHBhcmVudC5cbiAgICpcbiAgICogREVTSUdOOiBVc2VzIHN0cnVjdHVyZU5vZGVNYXAgZm9yIE8oMSkgcGFyZW50IGxvb2t1cCwgdGhlbiBkZWxlZ2F0ZXMgdG9cbiAgICogc3RhZ2VOb2RlVG9TdHJ1Y3R1cmUgZm9yIHJlY3Vyc2l2ZSBjb252ZXJzaW9uIGFuZCBidWlsZFN0cnVjdHVyZU5vZGVNYXAgZm9yXG4gICAqIHJlZ2lzdHJhdGlvbi4gU2VsZWN0b3IvZGVjaWRlciBmbGFncyBhcmUgc2V0IG9uIHRoZSBwYXJlbnQgc28gdGhlIFVJIGNhblxuICAgKiByZW5kZXIgYnJhbmNoaW5nIGNvbnRyb2xzIGNvcnJlY3RseS5cbiAgICpcbiAgICogQHBhcmFtIHBhcmVudE5vZGVJZCAtIFRoZSBJRCAob3IgbmFtZSkgb2YgdGhlIHBhcmVudCBub2RlIGluIHRoZSBzdHJ1Y3R1cmVcbiAgICogQHBhcmFtIGR5bmFtaWNDaGlsZHJlbiAtIFRoZSBydW50aW1lIFN0YWdlTm9kZSBjaGlsZHJlbiB0byBjb252ZXJ0IGFuZCBpbnNlcnRcbiAgICogQHBhcmFtIGhhc1NlbGVjdG9yIC0gV2hldGhlciB0aGUgZHluYW1pYyBub2RlIGhhcyBhIG5leHROb2RlU2VsZWN0b3JcbiAgICogQHBhcmFtIGhhc0RlY2lkZXIgLSBXaGV0aGVyIHRoZSBkeW5hbWljIG5vZGUgaGFzIGEgbmV4dE5vZGVEZWNpZGVyXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IHJ1bnRpbWUtcGlwZWxpbmUtc3RydWN0dXJlIDIuMSwgMi4yLCAyLjNfXG4gICAqL1xuICBwcml2YXRlIHVwZGF0ZVN0cnVjdHVyZVdpdGhEeW5hbWljQ2hpbGRyZW4oXG4gICAgcGFyZW50Tm9kZUlkOiBzdHJpbmcsXG4gICAgZHluYW1pY0NoaWxkcmVuOiBTdGFnZU5vZGVbXSxcbiAgICBoYXNTZWxlY3Rvcj86IGJvb2xlYW4sXG4gICAgaGFzRGVjaWRlcj86IGJvb2xlYW4sXG4gICk6IHZvaWQge1xuICAgIC8vIEd1YXJkOiBuby1vcCB3aGVuIHN0cnVjdHVyZSB0cmFja2luZyBpcyBkaXNhYmxlZFxuICAgIGlmICghdGhpcy5ydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUpIHJldHVybjtcblxuICAgIC8vIE8oMSkgbG9va3VwIGZvciB0aGUgcGFyZW50IG5vZGVcbiAgICBjb25zdCBwYXJlbnRTdHJ1Y3R1cmUgPSB0aGlzLnN0cnVjdHVyZU5vZGVNYXAuZ2V0KHBhcmVudE5vZGVJZCk7XG4gICAgaWYgKCFwYXJlbnRTdHJ1Y3R1cmUpIHtcbiAgICAgIC8vIERlZmVuc2l2ZTogc2hvdWxkbid0IGhhcHBlbiBpbiBwcmFjdGljZSBidXQgcHJldmVudHMgY3Jhc2hlc1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtQaXBlbGluZV0gdXBkYXRlU3RydWN0dXJlV2l0aER5bmFtaWNDaGlsZHJlbjogcGFyZW50IG5vZGUgXCIke3BhcmVudE5vZGVJZH1cIiBub3QgZm91bmQgaW4gc3RydWN0dXJlTm9kZU1hcGAsXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIENvbnZlcnQgZWFjaCBkeW5hbWljIGNoaWxkIFN0YWdlTm9kZSBpbnRvIGEgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlIG5vZGVcbiAgICBjb25zdCBjaGlsZFN0cnVjdHVyZXMgPSBkeW5hbWljQ2hpbGRyZW4ubWFwKGNoaWxkID0+IHRoaXMuc3RhZ2VOb2RlVG9TdHJ1Y3R1cmUoY2hpbGQpKTtcblxuICAgIC8vIFNldCB0aGUgY29udmVydGVkIGNoaWxkcmVuIG9uIHRoZSBwYXJlbnQncyBjaGlsZHJlbiBhcnJheVxuICAgIHBhcmVudFN0cnVjdHVyZS5jaGlsZHJlbiA9IGNoaWxkU3RydWN0dXJlcztcblxuICAgIC8vIFJlZ2lzdGVyIGVhY2ggbmV3IGNoaWxkIChhbmQgaXRzIGRlc2NlbmRhbnRzKSBpbiB0aGUgc3RydWN0dXJlTm9kZU1hcFxuICAgIGZvciAoY29uc3QgY2hpbGRTdHJ1Y3R1cmUgb2YgY2hpbGRTdHJ1Y3R1cmVzKSB7XG4gICAgICB0aGlzLmJ1aWxkU3RydWN0dXJlTm9kZU1hcChjaGlsZFN0cnVjdHVyZSk7XG4gICAgfVxuXG4gICAgLy8gU2V0IHNlbGVjdG9yIGZsYWcgYW5kIGNvbXB1dGUgYnJhbmNoSWRzIHdoZW4gdGhlIGR5bmFtaWMgbm9kZSBoYXMgYSBzZWxlY3RvclxuICAgIGlmIChoYXNTZWxlY3Rvcikge1xuICAgICAgcGFyZW50U3RydWN0dXJlLmhhc1NlbGVjdG9yID0gdHJ1ZTtcbiAgICAgIHBhcmVudFN0cnVjdHVyZS5icmFuY2hJZHMgPSBjaGlsZFN0cnVjdHVyZXMubWFwKGMgPT4gYy5pZCA/PyBjLm5hbWUpO1xuICAgIH1cblxuICAgIC8vIFNldCBkZWNpZGVyIGZsYWcgYW5kIGNvbXB1dGUgYnJhbmNoSWRzIHdoZW4gdGhlIGR5bmFtaWMgbm9kZSBoYXMgYSBkZWNpZGVyXG4gICAgaWYgKGhhc0RlY2lkZXIpIHtcbiAgICAgIHBhcmVudFN0cnVjdHVyZS5oYXNEZWNpZGVyID0gdHJ1ZTtcbiAgICAgIHBhcmVudFN0cnVjdHVyZS5icmFuY2hJZHMgPSBjaGlsZFN0cnVjdHVyZXMubWFwKGMgPT4gYy5pZCA/PyBjLm5hbWUpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIHJ1bnRpbWUgc3RydWN0dXJlIHdoZW4gYSBkeW5hbWljIHN1YmZsb3cgaXMgcmVnaXN0ZXJlZC5cbiAgICpcbiAgICogV0hZOiBXaGVuIGEgc3ViZmxvdyBpcyBhdXRvLXJlZ2lzdGVyZWQgYXQgcnVudGltZSAoZS5nLiwgdG9vbCBkaXNwYXRjaCBzcGF3bmluZ1xuICAgKiBhIHN1Yi1hZ2VudCksIHRoZSBzZXJpYWxpemVkIHN0cnVjdHVyZSBuZWVkcyB0byByZWZsZWN0IHRoZSBzdWJmbG93IGhpZXJhcmNoeSBzb1xuICAgKiBjb25zdW1lcnMgZ2V0IHRoZSBjb21wbGV0ZSBwaWN0dXJlIHdpdGhvdXQgVUktc2lkZSByZWNvbnN0cnVjdGlvbi5cbiAgICpcbiAgICogREVTSUdOOiBNYXJrcyB0aGUgbW91bnQgbm9kZSBhcyBhIHN1YmZsb3cgcm9vdCBhbmQgYXR0YWNoZXMgdGhlIHN1YmZsb3cnc1xuICAgKiBidWlsZC10aW1lIHN0cnVjdHVyZSBmb3IgZHJpbGwtZG93biB2aXN1YWxpemF0aW9uLiBSZWdpc3RlcnMgc3ViZmxvdyBub2Rlc1xuICAgKiBpbiB0aGUgc3RydWN0dXJlTm9kZU1hcCBzbyBzdWJzZXF1ZW50IGR5bmFtaWMgdXBkYXRlcyB3aXRoaW4gdGhlIHN1YmZsb3dcbiAgICogY2FuIGZpbmQgdGhlaXIgdGFyZ2V0cyB2aWEgTygxKSBsb29rdXAuXG4gICAqXG4gICAqIEBwYXJhbSBtb3VudE5vZGVJZCAtIElEIG9mIHRoZSBub2RlIHdoZXJlIHRoZSBzdWJmbG93IGlzIG1vdW50ZWRcbiAgICogQHBhcmFtIHN1YmZsb3dJZCAtIFVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGUgc3ViZmxvd1xuICAgKiBAcGFyYW0gc3ViZmxvd05hbWUgLSBPcHRpb25hbCBkaXNwbGF5IG5hbWUgZm9yIHRoZSBzdWJmbG93XG4gICAqIEBwYXJhbSBzdWJmbG93QnVpbGRUaW1lU3RydWN0dXJlIC0gT3B0aW9uYWwgYnVpbGQtdGltZSBzdHJ1Y3R1cmUgb2YgdGhlIHN1YmZsb3cgZm9yIGRyaWxsLWRvd25cbiAgICovXG4gIHByaXZhdGUgdXBkYXRlU3RydWN0dXJlV2l0aER5bmFtaWNTdWJmbG93KFxuICAgIG1vdW50Tm9kZUlkOiBzdHJpbmcsXG4gICAgc3ViZmxvd0lkOiBzdHJpbmcsXG4gICAgc3ViZmxvd05hbWU/OiBzdHJpbmcsXG4gICAgc3ViZmxvd0J1aWxkVGltZVN0cnVjdHVyZT86IHVua25vd24sXG4gICk6IHZvaWQge1xuICAgIC8vIEd1YXJkOiBuby1vcCB3aGVuIHN0cnVjdHVyZSB0cmFja2luZyBpcyBkaXNhYmxlZFxuICAgIGlmICghdGhpcy5ydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUpIHJldHVybjtcblxuICAgIC8vIE8oMSkgbG9va3VwIGZvciB0aGUgbW91bnQgbm9kZVxuICAgIGNvbnN0IG1vdW50U3RydWN0dXJlID0gdGhpcy5zdHJ1Y3R1cmVOb2RlTWFwLmdldChtb3VudE5vZGVJZCk7XG4gICAgaWYgKCFtb3VudFN0cnVjdHVyZSkge1xuICAgICAgLy8gRGVmZW5zaXZlOiBzaG91bGRuJ3QgaGFwcGVuIGluIHByYWN0aWNlIGJ1dCBwcmV2ZW50cyBjcmFzaGVzXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgW1BpcGVsaW5lXSB1cGRhdGVTdHJ1Y3R1cmVXaXRoRHluYW1pY1N1YmZsb3c6IG1vdW50IG5vZGUgXCIke21vdW50Tm9kZUlkfVwiIG5vdCBmb3VuZCBpbiBzdHJ1Y3R1cmVOb2RlTWFwYCxcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gTWFyayB0aGUgbW91bnQgbm9kZSBhcyBhIHN1YmZsb3cgcm9vdCB3aXRoIGl0cyBpZGVudGl0eVxuICAgIG1vdW50U3RydWN0dXJlLmlzU3ViZmxvd1Jvb3QgPSB0cnVlO1xuICAgIG1vdW50U3RydWN0dXJlLnN1YmZsb3dJZCA9IHN1YmZsb3dJZDtcblxuICAgIC8vIFNldCBkaXNwbGF5IG5hbWUgb25seSB3aGVuIHByb3ZpZGVkIHRvIGF2b2lkIG92ZXJ3cml0aW5nIGV4aXN0aW5nIHZhbHVlcyB3aXRoIHVuZGVmaW5lZFxuICAgIGlmIChzdWJmbG93TmFtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBtb3VudFN0cnVjdHVyZS5zdWJmbG93TmFtZSA9IHN1YmZsb3dOYW1lO1xuICAgIH1cblxuICAgIC8vIEF0dGFjaCB0aGUgc3ViZmxvdydzIGJ1aWxkLXRpbWUgc3RydWN0dXJlIGZvciBkcmlsbC1kb3duIHZpc3VhbGl6YXRpb25cbiAgICBpZiAoc3ViZmxvd0J1aWxkVGltZVN0cnVjdHVyZSkge1xuICAgICAgbW91bnRTdHJ1Y3R1cmUuc3ViZmxvd1N0cnVjdHVyZSA9IHN1YmZsb3dCdWlsZFRpbWVTdHJ1Y3R1cmUgYXMgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlO1xuXG4gICAgICAvLyBSZWdpc3RlciBhbGwgc3ViZmxvdyBzdHJ1Y3R1cmUgbm9kZXMgZm9yIGZ1dHVyZSBPKDEpIGxvb2t1cHNcbiAgICAgIHRoaXMuYnVpbGRTdHJ1Y3R1cmVOb2RlTWFwKG1vdW50U3RydWN0dXJlLnN1YmZsb3dTdHJ1Y3R1cmUpO1xuICAgIH1cbiAgfVxuXG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgcnVudGltZSBzdHJ1Y3R1cmUgd2hlbiBhIGR5bmFtaWMgbmV4dCBpcyBkaXNjb3ZlcmVkLlxuICAgKlxuICAgKiBXSFk6IFdoZW4gYSBzdGFnZSByZXR1cm5zIGEgU3RhZ2VOb2RlIHdpdGggYSBgbmV4dGAgY2hhaW4gdmlhIGBpc1N0YWdlTm9kZVJldHVybigpYCxcbiAgICogdGhlIHJ1bnRpbWUgU3RhZ2VOb2RlIHRyZWUgaXMgbXV0YXRlZCBidXQgdGhlIHNlcmlhbGl6ZWQgc3RydWN0dXJlIGlzIG5vdC4gVGhpcyBtZXRob2RcbiAgICoga2VlcHMgYHJ1bnRpbWVQaXBlbGluZVN0cnVjdHVyZWAgaW4gc3luYyBzbyBjb25zdW1lcnMgZ2V0IHRoZSBjb21wbGV0ZSBsaW5lYXJcbiAgICogY29udGludWF0aW9uIHdpdGhvdXQgZXh0ZXJuYWwgcmVjb25zdHJ1Y3Rpb24uXG4gICAqXG4gICAqIERFU0lHTjogTWlycm9ycyB0aGUgcGF0dGVybiBvZiBgdXBkYXRlU3RydWN0dXJlV2l0aER5bmFtaWNDaGlsZHJlbmAgYW5kXG4gICAqIGB1cGRhdGVTdHJ1Y3R1cmVXaXRoRHluYW1pY1N1YmZsb3dgIOKAlCBndWFyZCwgbG9va3VwLCBjb252ZXJ0LCBhdHRhY2gsIHJlZ2lzdGVyLlxuICAgKlxuICAgKiBAcGFyYW0gY3VycmVudE5vZGVJZCAtIElEIG9mIHRoZSBub2RlIHdob3NlIHN0YWdlIHJldHVybmVkIHRoZSBkeW5hbWljIG5leHRcbiAgICogQHBhcmFtIGR5bmFtaWNOZXh0ICAgLSBUaGUgU3RhZ2VOb2RlIHRvIGF0dGFjaCBhcyB0aGUgbmV4dCBjb250aW51YXRpb25cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgNC4xLCA0LjJfXG4gICAqL1xuICBwcml2YXRlIHVwZGF0ZVN0cnVjdHVyZVdpdGhEeW5hbWljTmV4dChcbiAgICBjdXJyZW50Tm9kZUlkOiBzdHJpbmcsXG4gICAgZHluYW1pY05leHQ6IFN0YWdlTm9kZSxcbiAgKTogdm9pZCB7XG4gICAgLy8gR3VhcmQ6IG5vLW9wIHdoZW4gc3RydWN0dXJlIHRyYWNraW5nIGlzIGRpc2FibGVkXG4gICAgaWYgKCF0aGlzLnJ1bnRpbWVQaXBlbGluZVN0cnVjdHVyZSkgcmV0dXJuO1xuXG4gICAgLy8gTygxKSBsb29rdXAgZm9yIHRoZSBjdXJyZW50IG5vZGVcbiAgICBjb25zdCBjdXJyZW50U3RydWN0dXJlID0gdGhpcy5zdHJ1Y3R1cmVOb2RlTWFwLmdldChjdXJyZW50Tm9kZUlkKTtcbiAgICBpZiAoIWN1cnJlbnRTdHJ1Y3R1cmUpIHtcbiAgICAgIC8vIERlZmVuc2l2ZTogc2hvdWxkbid0IGhhcHBlbiBpbiBwcmFjdGljZSBidXQgcHJldmVudHMgY3Jhc2hlc1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtQaXBlbGluZV0gdXBkYXRlU3RydWN0dXJlV2l0aER5bmFtaWNOZXh0OiBub2RlIFwiJHtjdXJyZW50Tm9kZUlkfVwiIG5vdCBmb3VuZCBpbiBzdHJ1Y3R1cmVOb2RlTWFwYCxcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCB0aGUgZHluYW1pYyBTdGFnZU5vZGUgaW50byBhIHNlcmlhbGl6ZWQgc3RydWN0dXJlIG5vZGVcbiAgICBjb25zdCBuZXh0U3RydWN0dXJlID0gdGhpcy5zdGFnZU5vZGVUb1N0cnVjdHVyZShkeW5hbWljTmV4dCk7XG5cbiAgICAvLyBBdHRhY2ggYXMgdGhlIG5leHQgY29udGludWF0aW9uIG9uIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBub2RlXG4gICAgY3VycmVudFN0cnVjdHVyZS5uZXh0ID0gbmV4dFN0cnVjdHVyZTtcblxuICAgIC8vIFJlZ2lzdGVyIHRoZSBuZXcgbm9kZSAoYW5kIGFueSBkZXNjZW5kYW50cykgZm9yIGZ1dHVyZSBPKDEpIGxvb2t1cHNcbiAgICB0aGlzLmJ1aWxkU3RydWN0dXJlTm9kZU1hcChuZXh0U3RydWN0dXJlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIHJ1bnRpbWUgc3RydWN0dXJlIHdpdGggbG9vcCBpdGVyYXRpb24gY291bnQgZm9yIGEgbm9kZS5cbiAgICpcbiAgICogV0hZOiBXaGVuIGEgbm9kZSBpcyB2aXNpdGVkIG1vcmUgdGhhbiBvbmNlIGR1ZSB0byBhIGxvb3AsIHRoZSBydW50aW1lXG4gICAqIHN0cnVjdHVyZSBzaG91bGQgcmVmbGVjdCB0aGUgdG90YWwgbnVtYmVyIG9mIGV4ZWN1dGlvbnMgc28gdGhhdFxuICAgKiBjb25zdW1lcnMgKGUuZy4sIGRlYnVnIFVJKSBjYW4gZGlzcGxheSBpdGVyYXRpb24gY291bnRzIHdpdGhvdXRcbiAgICogcmVjb25zdHJ1Y3RpbmcgdGhlbSBmcm9tIHJ1bnRpbWUgZGF0YS5cbiAgICpcbiAgICogREVTSUdOOiBDYWxsZWQgdmlhIGFuIG9uSXRlcmF0aW9uVXBkYXRlIGNhbGxiYWNrIGZyb20gTG9vcEhhbmRsZXIsXG4gICAqIHdoaWNoIG93bnMgdGhlIGl0ZXJhdGlvbiBjb3VudGVycy4gVGhlIGNvdW50IHBhc3NlZCBoZXJlIGlzIHRoZVxuICAgKiB0b3RhbCBudW1iZXIgb2YgdmlzaXRzICgxLWJhc2VkOiBmaXJzdCBsb29wLWJhY2sgPSAyKS5cbiAgICpcbiAgICogQHBhcmFtIG5vZGVJZCAtIFRoZSBJRCBvZiB0aGUgbm9kZSBiZWluZyBpdGVyYXRlZFxuICAgKiBAcGFyYW0gY291bnQgLSBUaGUgdG90YWwgaXRlcmF0aW9uIGNvdW50IChudW1iZXIgb2YgdGltZXMgdmlzaXRlZClcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgNS4xX1xuICAgKi9cbiAgcHJpdmF0ZSB1cGRhdGVTdHJ1Y3R1cmVJdGVyYXRpb25Db3VudChub2RlSWQ6IHN0cmluZywgY291bnQ6IG51bWJlcik6IHZvaWQge1xuICAgIC8vIEd1YXJkOiBuby1vcCB3aGVuIHN0cnVjdHVyZSB0cmFja2luZyBpcyBkaXNhYmxlZFxuICAgIGlmICghdGhpcy5ydW50aW1lUGlwZWxpbmVTdHJ1Y3R1cmUpIHJldHVybjtcblxuICAgIC8vIE8oMSkgbG9va3VwIGZvciB0aGUgdGFyZ2V0IG5vZGVcbiAgICBjb25zdCBub2RlU3RydWN0dXJlID0gdGhpcy5zdHJ1Y3R1cmVOb2RlTWFwLmdldChub2RlSWQpO1xuICAgIC8vIEd1YXJkOiBleHBlY3RlZCBmb3Igbm9kZXMgd2l0aG91dCBJRHMg4oCUIG5vIHdhcm5pbmcgbmVlZGVkXG4gICAgaWYgKCFub2RlU3RydWN0dXJlKSByZXR1cm47XG5cbiAgICAvLyBTZXQgdGhlIGl0ZXJhdGlvbiBjb3VudCBvbiB0aGUgc3RydWN0dXJlIG5vZGVcbiAgICBub2RlU3RydWN0dXJlLml0ZXJhdGlvbkNvdW50ID0gY291bnQ7XG4gIH1cblxuXG4gIC8qKiBSZXNvbHZlIGEgc3RhZ2UgZnVuY3Rpb246IHByZWZlciBlbWJlZGRlZCBgbm9kZS5mbmAsIGVsc2UgbG9vayB1cCBieSBgbm9kZS5uYW1lYCBpbiBgc3RhZ2VNYXBgLiAqL1xuICBwcml2YXRlIGdldFN0YWdlRm4obm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4pOiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPiB8IHVuZGVmaW5lZCB7XG4gICAgaWYgKHR5cGVvZiBub2RlLmZuID09PSAnZnVuY3Rpb24nKSByZXR1cm4gbm9kZS5mbiBhcyBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPjtcbiAgICByZXR1cm4gdGhpcy5zdGFnZU1hcC5nZXQobm9kZS5uYW1lKTtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIEV4ZWN1dGUgYSBzaW5nbGUgbm9kZSB3aXRoIHRoZSB1bmlmaWVkIG9yZGVyIGRlc2NyaWJlZCBpbiB0aGUgZmlsZSBoZWFkZXIuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlICAgICAgICAgQ3VycmVudCBub2RlIHRvIGV4ZWN1dGVcbiAgICogQHBhcmFtIGNvbnRleHQgICAgICBDdXJyZW50IFN0YWdlQ29udGV4dFxuICAgKiBAcGFyYW0gYnJlYWtGbGFnICAgIEJyZWFrIGZsYWcgYnViYmxlZCB0aHJvdWdoIHJlY3Vyc2lvblxuICAgKiBAcGFyYW0gYnJhbmNoUGF0aCAgIExvZ2ljYWwgcGlwZWxpbmUgaWQvcGF0aCAoZm9yIGxvZ3MpOyBpbmhlcml0ZWQgYnkgY2hpbGRyZW5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZU5vZGUoXG4gICAgbm9kZTogU3RhZ2VOb2RlLFxuICAgIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgICBicmVha0ZsYWc6IHsgc2hvdWxkQnJlYWs6IGJvb2xlYW4gfSxcbiAgICBicmFuY2hQYXRoPzogc3RyaW5nLFxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAwKSBTdWJmbG93IERldGVjdGlvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBJZiB0aGlzIG5vZGUgaXMgYSBzdWJmbG93IHJvb3QsIGV4ZWN1dGUgaXQgd2l0aCBhbiBpc29sYXRlZCBuZXN0ZWQgY29udGV4dFxuICAgIGlmIChub2RlLmlzU3ViZmxvd1Jvb3QgJiYgbm9kZS5zdWJmbG93SWQpIHtcbiAgICAgIC8vIFJlc29sdmUgcmVmZXJlbmNlIG5vZGUgaWYgbmVlZGVkXG4gICAgICAvLyBSZWZlcmVuY2Ugbm9kZXMgaGF2ZSBpc1N1YmZsb3dSb290IGJ1dCBubyBmbi9jaGlsZHJlbiAtIHRoZXkgcG9pbnQgdG8gc3ViZmxvd3MgZGljdGlvbmFyeVxuICAgICAgY29uc3QgcmVzb2x2ZWROb2RlID0gdGhpcy5ub2RlUmVzb2x2ZXIucmVzb2x2ZVN1YmZsb3dSZWZlcmVuY2Uobm9kZSk7XG4gICAgICBcbiAgICAgIC8vIFNldCBzdWJmbG93IGNvbnRleHQgZm9yIHN0cnVjdHVyZU1ldGFkYXRhIHByb3BhZ2F0aW9uXG4gICAgICAvLyBBbGwgbm9kZXMgd2l0aGluIHRoaXMgc3ViZmxvdyB3aWxsIGhhdmUgc3ViZmxvd0lkIGluIHRoZWlyIHN0cnVjdHVyZU1ldGFkYXRhXG4gICAgICAvLyBfUmVxdWlyZW1lbnRzOiB1bmlmaWVkLWV4dHJhY3Rvci1hcmNoaXRlY3R1cmUgMy4zLCAzLjQsIDMuNV9cbiAgICAgIGNvbnN0IHByZXZpb3VzU3ViZmxvd0lkID0gdGhpcy5jdXJyZW50U3ViZmxvd0lkO1xuICAgICAgdGhpcy5jdXJyZW50U3ViZmxvd0lkID0gbm9kZS5zdWJmbG93SWQ7XG4gICAgICBcbiAgICAgIGxldCBzdWJmbG93T3V0cHV0OiBhbnk7XG4gICAgICB0cnkge1xuICAgICAgICBzdWJmbG93T3V0cHV0ID0gYXdhaXQgdGhpcy5zdWJmbG93RXhlY3V0b3IuZXhlY3V0ZVN1YmZsb3coXG4gICAgICAgICAgcmVzb2x2ZWROb2RlLFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgYnJlYWtGbGFnLFxuICAgICAgICAgIGJyYW5jaFBhdGgsXG4gICAgICAgICAgdGhpcy5zdWJmbG93UmVzdWx0cyxcbiAgICAgICAgKTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIC8vIENsZWFyIHN1YmZsb3cgY29udGV4dCB3aGVuIGV4aXRpbmcgKHJlc3RvcmUgcHJldmlvdXMgaWYgbmVzdGVkKVxuICAgICAgICB0aGlzLmN1cnJlbnRTdWJmbG93SWQgPSBwcmV2aW91c1N1YmZsb3dJZDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gQWZ0ZXIgc3ViZmxvdyBjb21wbGV0ZXMsIGNvbnRpbnVlIHdpdGggbm9kZS5uZXh0IGluIHRoZSBQQVJFTlQgY29udGV4dCAoaWYgcHJlc2VudClcbiAgICAgIC8vIFxuICAgICAgLy8gSU1QT1JUQU5UOiBXZSBuZWVkIHRvIGRldGVybWluZSBpZiBgbmV4dGAgaXMgYSBjb250aW51YXRpb24gYWZ0ZXIgdGhlIHN1YmZsb3dcbiAgICAgIC8vIG9yIGlmIGl0IHdhcyBhbHJlYWR5IGV4ZWN1dGVkIGFzIHBhcnQgb2YgdGhlIHN1YmZsb3cncyBpbnRlcm5hbCBzdHJ1Y3R1cmUuXG4gICAgICAvL1xuICAgICAgLy8gSGV1cmlzdGljOlxuICAgICAgLy8gLSBJZiB0aGUgc3ViZmxvdyBoYXMgYGNoaWxkcmVuYCAoZm9yayBwYXR0ZXJuKSwgYG5leHRgIGlzIHRoZSBjb250aW51YXRpb25cbiAgICAgIC8vIC0gSWYgdGhlIHN1YmZsb3cgaGFzIG5vIGBjaGlsZHJlbmAgKGxpbmVhciBwYXR0ZXJuKSwgYG5leHRgIHdhcyBhbHJlYWR5IGV4ZWN1dGVkIGludGVybmFsbHlcbiAgICAgIC8vXG4gICAgICAvLyBGb3IgcmVmZXJlbmNlLWJhc2VkIHN1YmZsb3dzIChyZXNvbHZlZE5vZGUgIT09IG5vZGUpLCB0aGUgb3JpZ2luYWwgcmVmZXJlbmNlIG5vZGUnc1xuICAgICAgLy8gYG5leHRgIGlzIGFsd2F5cyB0aGUgY29udGludWF0aW9uICh0aGUgc3ViZmxvdydzIGludGVybmFsIHN0cnVjdHVyZSBpcyBpbiB0aGUgZGVmaW5pdGlvbikuXG4gICAgICBjb25zdCBpc1JlZmVyZW5jZUJhc2VkU3ViZmxvdyA9IHJlc29sdmVkTm9kZSAhPT0gbm9kZTtcbiAgICAgIGNvbnN0IGhhc0NoaWxkcmVuID0gQm9vbGVhbihub2RlLmNoaWxkcmVuICYmIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG4gICAgICBjb25zdCBzaG91bGRFeGVjdXRlQ29udGludWF0aW9uID0gaXNSZWZlcmVuY2VCYXNlZFN1YmZsb3cgfHwgaGFzQ2hpbGRyZW47XG4gICAgICBcbiAgICAgIGlmIChub2RlLm5leHQgJiYgc2hvdWxkRXhlY3V0ZUNvbnRpbnVhdGlvbikge1xuICAgICAgICBjb25zdCBuZXh0U3RhZ2VDb250ZXh0ID0gY29udGV4dC5jcmVhdGVOZXh0KGJyYW5jaFBhdGggYXMgc3RyaW5nLCBub2RlLm5leHQubmFtZSk7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVOb2RlKG5vZGUubmV4dCwgbmV4dFN0YWdlQ29udGV4dCwgYnJlYWtGbGFnLCBicmFuY2hQYXRoKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIHN1YmZsb3dPdXRwdXQ7XG4gICAgfVxuXG4gICAgY29uc3Qgc3RhZ2VGdW5jID0gdGhpcy5nZXRTdGFnZUZuKG5vZGUpO1xuICAgIGNvbnN0IGhhc1N0YWdlRnVuY3Rpb24gPSBCb29sZWFuKHN0YWdlRnVuYyk7XG4gICAgY29uc3QgaXNMZWdhY3lEZWNpZGVyID0gQm9vbGVhbihub2RlLm5leHROb2RlRGVjaWRlcik7XG4gICAgY29uc3QgaXNTY29wZUJhc2VkRGVjaWRlciA9IEJvb2xlYW4obm9kZS5kZWNpZGVyRm4pO1xuICAgIGNvbnN0IGlzRGVjaWRlck5vZGUgPSBpc0xlZ2FjeURlY2lkZXIgfHwgaXNTY29wZUJhc2VkRGVjaWRlcjtcbiAgICBjb25zdCBoYXNDaGlsZHJlbiA9IEJvb2xlYW4obm9kZS5jaGlsZHJlbj8ubGVuZ3RoKTtcbiAgICBjb25zdCBoYXNOZXh0ID0gQm9vbGVhbihub2RlLm5leHQpO1xuICAgIC8vIFNhdmUgb3JpZ2luYWwgbmV4dCByZWZlcmVuY2UgYmVmb3JlIHN0YWdlIGV4ZWN1dGlvbi5cbiAgICAvLyBXSFk6IER5bmFtaWMgc3RhZ2UgaGFuZGxpbmcgKHN0ZXAgMykgbWF5IG11dGF0ZSBub2RlLm5leHQgZm9yIHNlcmlhbGl6YXRpb25cbiAgICAvLyB2aXNpYmlsaXR5IChnZXRSdW50aW1lUm9vdCkuIFdlIG11c3QgdXNlIHRoZSBPUklHSU5BTCBuZXh0IGZvciBzdGVwIDYgdG9cbiAgICAvLyBhdm9pZCBmb2xsb3dpbmcgYSBkeW5hbWljTmV4dCByZWZlcmVuY2UgdGhhdCB3YXMgYXR0YWNoZWQgZHVyaW5nIGEgcHJldmlvdXNcbiAgICAvLyBpdGVyYXRpb24ncyBzdGFnZSBleGVjdXRpb24uXG4gICAgY29uc3Qgb3JpZ2luYWxOZXh0ID0gbm9kZS5uZXh0O1xuICAgIC8vIE5vdGU6IER5bmFtaWMgYmVoYXZpb3IgaXMgZGV0ZWN0ZWQgdmlhIGlzU3RhZ2VOb2RlUmV0dXJuKCkgb24gc3RhZ2Ugb3V0cHV0LCBub3QgdmlhIG5vZGUgZmxhZ3NcblxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAxKSBWYWxpZGF0aW9uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIC8vIEEgbm9kZSBtdXN0IHByb3ZpZGUgYXQgbGVhc3Qgb25lIG9mOiBzdGFnZSwgY2hpbGRyZW4sIG9yIGRlY2lkZXIuXG4gICAgaWYgKCFoYXNTdGFnZUZ1bmN0aW9uICYmICFpc0RlY2lkZXJOb2RlICYmICFoYXNDaGlsZHJlbikge1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gYE5vZGUgJyR7bm9kZS5uYW1lfScgbXVzdCBkZWZpbmU6IGVtYmVkZGVkIGZuIE9SIGEgc3RhZ2VNYXAgZW50cnkgT1IgaGF2ZSBjaGlsZHJlbi9kZWNpZGVyYDtcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gcGlwZWxpbmUgKCR7YnJhbmNoUGF0aH0pIHN0YWdlIFske25vZGUubmFtZX1dOmAsIHsgZXJyb3I6IGVycm9yTWVzc2FnZSB9KTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpO1xuICAgIH1cbiAgICBpZiAoaXNEZWNpZGVyTm9kZSAmJiAhaGFzQ2hpbGRyZW4pIHtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9ICdEZWNpZGVyIG5vZGUgbmVlZHMgdG8gaGF2ZSBjaGlsZHJlbiB0byBleGVjdXRlJztcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gcGlwZWxpbmUgKCR7YnJhbmNoUGF0aH0pIHN0YWdlIFske25vZGUubmFtZX1dOmAsIHsgZXJyb3I6IGVycm9yTWVzc2FnZSB9KTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpO1xuICAgIH1cblxuICAgIC8vIE1hcmsgcm9sZSB3aGVuIHRoZXJlIGlzIG5vIHN0YWdlIGZ1bmN0aW9uICh1c2VmdWwgZm9yIGRlYnVnIHBhbmVscylcbiAgICBpZiAoIWhhc1N0YWdlRnVuY3Rpb24pIHtcbiAgICAgIGlmIChpc0RlY2lkZXJOb2RlKSBjb250ZXh0LnNldEFzRGVjaWRlcigpO1xuICAgICAgZWxzZSBpZiAoaGFzQ2hpbGRyZW4pIGNvbnRleHQuc2V0QXNGb3JrKCk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWtGbiA9ICgpID0+IChicmVha0ZsYWcuc2hvdWxkQnJlYWsgPSB0cnVlKTtcblxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAyKSBEZWNpZGVyIG5vZGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gZGVjaWRlciBvcmRlcjogc3RhZ2UgKG9wdGlvbmFsKSDihpIgY29tbWl0IOKGkiBkZWNpZGVyIOKGkiBjaG9zZW4gY2hpbGRcbiAgICAvLyBSb3V0ZSB0byB0aGUgY29ycmVjdCBEZWNpZGVySGFuZGxlciBtZXRob2QgYmFzZWQgb24gZGVjaWRlciB0eXBlOlxuICAgIC8vIC0gU2NvcGUtYmFzZWQgKGRlY2lkZXJGbik6IGZuIElTIHRoZSBkZWNpZGVyLCByZXR1cm5zIGJyYW5jaCBJRCBkaXJlY3RseVxuICAgIC8vIC0gTGVnYWN5IChuZXh0Tm9kZURlY2lkZXIpOiBzZXBhcmF0ZSBkZWNpZGVyIGZ1bmN0aW9uIGV2YWx1YXRlcyBhZnRlciBvcHRpb25hbCBzdGFnZVxuICAgIC8vIF9SZXF1aXJlbWVudHM6IDUuMywgNS40LCBwaGFzZTItaGFuZGxlcnMgMi4xLCAyLjIsIDIuMywgMi40LCAyLjVfXG4gICAgaWYgKGlzRGVjaWRlck5vZGUpIHtcbiAgICAgIGlmIChpc1Njb3BlQmFzZWREZWNpZGVyKSB7XG4gICAgICAgIC8vIFNjb3BlLWJhc2VkIGRlY2lkZXI6IGZuIGlzIHJlcXVpcmVkIChpdCBJUyB0aGUgZGVjaWRlcilcbiAgICAgICAgLy8gX1JlcXVpcmVtZW50czogNS4zX1xuICAgICAgICByZXR1cm4gdGhpcy5kZWNpZGVySGFuZGxlci5oYW5kbGVTY29wZUJhc2VkKFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgc3RhZ2VGdW5jISxcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIGJyZWFrRmxhZyxcbiAgICAgICAgICBicmFuY2hQYXRoLFxuICAgICAgICAgIHRoaXMuZXhlY3V0ZVN0YWdlLmJpbmQodGhpcyksXG4gICAgICAgICAgdGhpcy5leGVjdXRlTm9kZS5iaW5kKHRoaXMpLFxuICAgICAgICAgIHRoaXMuY2FsbEV4dHJhY3Rvci5iaW5kKHRoaXMpLFxuICAgICAgICAgIHRoaXMuZ2V0U3RhZ2VQYXRoLmJpbmQodGhpcyksXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBMZWdhY3kgb3V0cHV0LWJhc2VkIGRlY2lkZXI6IHN0YWdlIGlzIG9wdGlvbmFsLCBkZWNpZGVyIGlzIHNlcGFyYXRlXG4gICAgICAgIC8vIF9SZXF1aXJlbWVudHM6IDUuNF9cbiAgICAgICAgcmV0dXJuIHRoaXMuZGVjaWRlckhhbmRsZXIuaGFuZGxlKFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgc3RhZ2VGdW5jLFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgYnJlYWtGbGFnLFxuICAgICAgICAgIGJyYW5jaFBhdGgsXG4gICAgICAgICAgdGhpcy5leGVjdXRlU3RhZ2UuYmluZCh0aGlzKSxcbiAgICAgICAgICB0aGlzLmV4ZWN1dGVOb2RlLmJpbmQodGhpcyksXG4gICAgICAgICAgdGhpcy5jYWxsRXh0cmFjdG9yLmJpbmQodGhpcyksXG4gICAgICAgICAgdGhpcy5nZXRTdGFnZVBhdGguYmluZCh0aGlzKSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgMykgTm9uLWRlY2lkZXI6IFNUQUdFIEZJUlNUIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIC8vIHVuaWZpZWQgb3JkZXI6IHN0YWdlIChvcHRpb25hbCkg4oaSIGNvbW1pdCDihpIgKGJyZWFrPykg4oaSIGNoaWxkcmVuIChvcHRpb25hbCkg4oaSIGR5bmFtaWNOZXh0IChvcHRpb25hbCkg4oaSIG5leHQgKG9wdGlvbmFsKVxuICAgIGxldCBzdGFnZU91dHB1dDogVE91dCB8IHVuZGVmaW5lZDtcbiAgICBsZXQgZHluYW1pY05leHQ6IFN0YWdlTm9kZSB8IHVuZGVmaW5lZDtcblxuICAgIGlmIChzdGFnZUZ1bmMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHN0YWdlT3V0cHV0ID0gYXdhaXQgdGhpcy5leGVjdXRlU3RhZ2Uobm9kZSwgc3RhZ2VGdW5jLCBjb250ZXh0LCBicmVha0ZuKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgY29udGV4dC5jb21taXQoKTsgLy8gYXBwbHkgcGF0Y2ggb24gZXJyb3IgYXMgYmVmb3JlXG4gICAgICAgIC8vIFBhc3MgdW5kZWZpbmVkIGZvciBzdGFnZU91dHB1dCBhbmQgZXJyb3IgZGV0YWlscyBmb3IgZW5yaWNobWVudFxuICAgICAgICAvLyBXSFk6IE9uIGVycm9yIHBhdGgsIHRoZXJlJ3Mgbm8gc3VjY2Vzc2Z1bCBvdXRwdXQsIGJ1dCB3ZSBjYXB0dXJlXG4gICAgICAgIC8vIHRoZSBlcnJvciBpbmZvIHNvIGVucmljaGVkIHNuYXBzaG90cyBpbmNsdWRlIHdoYXQgd2VudCB3cm9uZy5cbiAgICAgICAgLy8gX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuNF9cbiAgICAgICAgdGhpcy5jYWxsRXh0cmFjdG9yKG5vZGUsIGNvbnRleHQsIHRoaXMuZ2V0U3RhZ2VQYXRoKG5vZGUsIGJyYW5jaFBhdGgsIGNvbnRleHQuc3RhZ2VOYW1lKSwgdW5kZWZpbmVkLCB7XG4gICAgICAgICAgdHlwZTogJ3N0YWdlRXhlY3V0aW9uRXJyb3InLFxuICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLnRvU3RyaW5nKCksXG4gICAgICAgIH0pO1xuICAgICAgICAvLyBOYXJyYXRpdmU6IHJlY29yZCB0aGUgZXJyb3Igc28gdGhlIHN0b3J5IGNhcHR1cmVzIHdoYXQgd2VudCB3cm9uZ1xuICAgICAgICAvLyBfUmVxdWlyZW1lbnRzOiAxMC4xX1xuICAgICAgICB0aGlzLm5hcnJhdGl2ZUdlbmVyYXRvci5vbkVycm9yKG5vZGUubmFtZSwgZXJyb3IudG9TdHJpbmcoKSwgbm9kZS5kaXNwbGF5TmFtZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gcGlwZWxpbmUgKCR7YnJhbmNoUGF0aH0pIHN0YWdlIFske25vZGUubmFtZX1dOmAsIHsgZXJyb3IgfSk7XG4gICAgICAgIGNvbnRleHQuYWRkRXJyb3IoJ3N0YWdlRXhlY3V0aW9uRXJyb3InLCBlcnJvci50b1N0cmluZygpKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICBjb250ZXh0LmNvbW1pdCgpO1xuICAgICAgLy8gUGFzcyBzdGFnZU91dHB1dCBzbyBlbnJpY2hlZCBzbmFwc2hvdHMgY2FwdHVyZSB0aGUgc3RhZ2UncyByZXR1cm4gdmFsdWVcbiAgICAgIC8vIF9SZXF1aXJlbWVudHM6IHNpbmdsZS1wYXNzLWRlYnVnLXN0cnVjdHVyZSAxLjNfXG4gICAgICB0aGlzLmNhbGxFeHRyYWN0b3Iobm9kZSwgY29udGV4dCwgdGhpcy5nZXRTdGFnZVBhdGgobm9kZSwgYnJhbmNoUGF0aCwgY29udGV4dC5zdGFnZU5hbWUpLCBzdGFnZU91dHB1dCk7XG5cbiAgICAgIC8vIE5hcnJhdGl2ZTogcmVjb3JkIHRoYXQgdGhpcyBzdGFnZSBleGVjdXRlZCBzdWNjZXNzZnVsbHlcbiAgICAgIC8vIF9SZXF1aXJlbWVudHM6IDMuMV9cbiAgICAgIHRoaXMubmFycmF0aXZlR2VuZXJhdG9yLm9uU3RhZ2VFeGVjdXRlZChub2RlLm5hbWUsIG5vZGUuZGlzcGxheU5hbWUsIG5vZGUuZGVzY3JpcHRpb24pO1xuXG4gICAgICBpZiAoYnJlYWtGbGFnLnNob3VsZEJyZWFrKSB7XG4gICAgICAgIC8vIE5hcnJhdGl2ZTogcmVjb3JkIHRoYXQgZXhlY3V0aW9uIHN0b3BwZWQgaGVyZSBkdWUgdG8gYnJlYWtcbiAgICAgICAgLy8gX1JlcXVpcmVtZW50czogMy4zX1xuICAgICAgICB0aGlzLm5hcnJhdGl2ZUdlbmVyYXRvci5vbkJyZWFrKG5vZGUubmFtZSwgbm9kZS5kaXNwbGF5TmFtZSk7XG4gICAgICAgIGxvZ2dlci5pbmZvKGBFeGVjdXRpb24gc3RvcHBlZCBpbiBwaXBlbGluZSAoJHticmFuY2hQYXRofSkgYWZ0ZXIgJHtub2RlLm5hbWV9IGR1ZSB0byBicmVhayBjb25kaXRpb24uYCk7XG4gICAgICAgIHJldHVybiBzdGFnZU91dHB1dDsgLy8gbGVhZi9lYXJseSBzdG9wIHJldHVybnMgdGhlIHN0YWdlJ3Mgb3V0cHV0XG4gICAgICB9XG5cbiAgICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCBIYW5kbGUgZHluYW1pYyBzdGFnZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgICAvLyBDaGVjayBpZiB0aGUgaGFuZGxlcidzIHJldHVybiBvYmplY3QgaXMgYSBTdGFnZU5vZGUgZm9yIGR5bmFtaWMgY29udGludWF0aW9uLlxuICAgICAgLy8gRGV0ZWN0aW9uIHVzZXMgZHVjay10eXBpbmcgdmlhIGlzU3RhZ2VOb2RlUmV0dXJuKCkuXG4gICAgICBpZiAoc3RhZ2VPdXRwdXQgJiYgdHlwZW9mIHN0YWdlT3V0cHV0ID09PSAnb2JqZWN0JyAmJiBpc1N0YWdlTm9kZVJldHVybihzdGFnZU91dHB1dCkpIHtcbiAgICAgICAgY29uc3QgZHluYW1pY05vZGUgPSBzdGFnZU91dHB1dCBhcyBTdGFnZU5vZGU7XG4gICAgICAgIGNvbnRleHQuYWRkTG9nKCdpc0R5bmFtaWMnLCB0cnVlKTtcbiAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNQYXR0ZXJuJywgJ1N0YWdlTm9kZVJldHVybicpO1xuXG4gICAgICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCBEeW5hbWljIFN1YmZsb3cgQXV0by1SZWdpc3RyYXRpb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgICAgIC8vIFdIWTogV2hlbiBhIHN0YWdlIHJldHVybnMgYSBTdGFnZU5vZGUgd2l0aCBpc1N1YmZsb3dSb290ICsgc3ViZmxvd0RlZixcbiAgICAgICAgLy8gaXQncyByZXF1ZXN0aW5nIGR5bmFtaWMgc3ViZmxvdyBhdHRhY2htZW50LiBXZSBhdXRvLXJlZ2lzdGVyIHRoZSBjb21waWxlZFxuICAgICAgICAvLyBGbG93Q2hhcnQgaW4gdGhlIHN1YmZsb3dzIGRpY3Rpb25hcnkgc28gU3ViZmxvd0V4ZWN1dG9yIGNhbiByZXNvbHZlIGl0LlxuICAgICAgICAvLyBUaGlzIGVuYWJsZXMgcnVudGltZSBzdWJmbG93IGF0dGFjaG1lbnQgd2l0aG91dCBidWlsZC10aW1lIHJlZ2lzdHJhdGlvbi5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gREVTSUdOOiBGaXJzdC13cml0ZS13aW5zIOKAlCBpZiBhIHN1YmZsb3cgd2l0aCB0aGUgc2FtZSBJRCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAvLyBpbiB0aGUgZGljdGlvbmFyeSwgd2UgcHJlc2VydmUgdGhlIGV4aXN0aW5nIGRlZmluaXRpb24uIFN0YWdlTWFwIGVudHJpZXNcbiAgICAgICAgLy8gZnJvbSB0aGUgc3ViZmxvdyBhcmUgbWVyZ2VkIGludG8gdGhlIHBhcmVudCAocGFyZW50IGVudHJpZXMgcHJlc2VydmVkKS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gQWZ0ZXIgcmVnaXN0cmF0aW9uLCB3ZSB0cmFuc2ZlciBzdWJmbG93IHByb3BlcnRpZXMgdG8gdGhlIGN1cnJlbnQgbm9kZVxuICAgICAgICAvLyBhbmQgcmVjdXJzZSBpbnRvIGV4ZWN1dGVOb2RlIHNvIHN0ZXAgMCAoc3ViZmxvdyBkZXRlY3Rpb24pIHBpY2tzIGl0IHVwLlxuICAgICAgICAvL1xuICAgICAgICAvLyBfUmVxdWlyZW1lbnRzOiBkeW5hbWljLXN1YmZsb3ctc3VwcG9ydCAyLjEsIDIuMiwgMi4zLCAyLjQsIDIuNV9cbiAgICAgICAgaWYgKGR5bmFtaWNOb2RlLmlzU3ViZmxvd1Jvb3QgJiYgZHluYW1pY05vZGUuc3ViZmxvd0RlZiAmJiBkeW5hbWljTm9kZS5zdWJmbG93SWQpIHtcbiAgICAgICAgICBjb250ZXh0LmFkZExvZygnZHluYW1pY1BhdHRlcm4nLCAnZHluYW1pY1N1YmZsb3cnKTtcbiAgICAgICAgICBjb250ZXh0LmFkZExvZygnZHluYW1pY1N1YmZsb3dJZCcsIGR5bmFtaWNOb2RlLnN1YmZsb3dJZCk7XG5cbiAgICAgICAgICB0aGlzLmF1dG9SZWdpc3RlclN1YmZsb3dEZWYoZHluYW1pY05vZGUuc3ViZmxvd0lkLCBkeW5hbWljTm9kZS5zdWJmbG93RGVmLCBub2RlLmlkID8/IG5vZGUubmFtZSk7XG5cbiAgICAgICAgICAvLyBUcmFuc2ZlciBzdWJmbG93IHByb3BlcnRpZXMgdG8gY3VycmVudCBub2RlIGZvciBzdGVwIDAgZGV0ZWN0aW9uXG4gICAgICAgICAgbm9kZS5pc1N1YmZsb3dSb290ID0gdHJ1ZTtcbiAgICAgICAgICBub2RlLnN1YmZsb3dJZCA9IGR5bmFtaWNOb2RlLnN1YmZsb3dJZDtcbiAgICAgICAgICBub2RlLnN1YmZsb3dOYW1lID0gZHluYW1pY05vZGUuc3ViZmxvd05hbWU7XG4gICAgICAgICAgbm9kZS5zdWJmbG93TW91bnRPcHRpb25zID0gZHluYW1pY05vZGUuc3ViZmxvd01vdW50T3B0aW9ucztcblxuICAgICAgICAgIC8vIFVwZGF0ZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSB3aXRoIGR5bmFtaWMgc3ViZmxvd1xuICAgICAgICAgIC8vIF9SZXF1aXJlbWVudHM6IHJ1bnRpbWUtcGlwZWxpbmUtc3RydWN0dXJlIDMuMV9cbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0cnVjdHVyZVdpdGhEeW5hbWljU3ViZmxvdyhcbiAgICAgICAgICAgIG5vZGUuaWQgPz8gbm9kZS5uYW1lLFxuICAgICAgICAgICAgZHluYW1pY05vZGUuc3ViZmxvd0lkISxcbiAgICAgICAgICAgIGR5bmFtaWNOb2RlLnN1YmZsb3dOYW1lLFxuICAgICAgICAgICAgZHluYW1pY05vZGUuc3ViZmxvd0RlZj8uYnVpbGRUaW1lU3RydWN0dXJlLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBSZWN1cnNlIGludG8gZXhlY3V0ZU5vZGUg4oCUIHN0ZXAgMCB3aWxsIGRldGVjdCBpc1N1YmZsb3dSb290XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZU5vZGUobm9kZSwgY29udGV4dCwgYnJlYWtGbGFnLCBicmFuY2hQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFsc28gY2hlY2sgY2hpbGRyZW4gZm9yIHN1YmZsb3dEZWYgKGUuZy4sIHRvb2wgZGlzcGF0Y2ggcmV0dXJuc1xuICAgICAgICAvLyBwYXJhbGxlbCBjaGlsZHJlbiB3aGVyZSBzb21lIGFyZSBzdWJmbG93IHJlZmVyZW5jZXMpXG4gICAgICAgIGlmIChkeW5hbWljTm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZHluYW1pY05vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGlmIChjaGlsZC5pc1N1YmZsb3dSb290ICYmIGNoaWxkLnN1YmZsb3dEZWYgJiYgY2hpbGQuc3ViZmxvd0lkKSB7XG4gICAgICAgICAgICAgIHRoaXMuYXV0b1JlZ2lzdGVyU3ViZmxvd0RlZihjaGlsZC5zdWJmbG93SWQsIGNoaWxkLnN1YmZsb3dEZWYsIGNoaWxkLmlkID8/IGNoaWxkLm5hbWUpO1xuICAgICAgICAgICAgICAvLyBVcGRhdGUgcnVudGltZSBwaXBlbGluZSBzdHJ1Y3R1cmUgd2l0aCBkeW5hbWljIHN1YmZsb3cgZm9yIGVhY2ggY2hpbGRcbiAgICAgICAgICAgICAgLy8gX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgMy4xLCAzLjNfXG4gICAgICAgICAgICAgIHRoaXMudXBkYXRlU3RydWN0dXJlV2l0aER5bmFtaWNTdWJmbG93KFxuICAgICAgICAgICAgICAgIGNoaWxkLmlkID8/IGNoaWxkLm5hbWUsXG4gICAgICAgICAgICAgICAgY2hpbGQuc3ViZmxvd0lkISxcbiAgICAgICAgICAgICAgICBjaGlsZC5zdWJmbG93TmFtZSxcbiAgICAgICAgICAgICAgICBjaGlsZC5zdWJmbG93RGVmPy5idWlsZFRpbWVTdHJ1Y3R1cmUsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSGFuZGxlIGR5bmFtaWMgY2hpbGRyZW4gKGZvcmsgcGF0dGVybilcbiAgICAgICAgaWYgKGR5bmFtaWNOb2RlLmNoaWxkcmVuICYmIGR5bmFtaWNOb2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBub2RlLmNoaWxkcmVuID0gZHluYW1pY05vZGUuY2hpbGRyZW47XG4gICAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNDaGlsZENvdW50JywgZHluYW1pY05vZGUuY2hpbGRyZW4ubGVuZ3RoKTtcbiAgICAgICAgICBjb250ZXh0LmFkZExvZygnZHluYW1pY0NoaWxkSWRzJywgZHluYW1pY05vZGUuY2hpbGRyZW4ubWFwKGMgPT4gYy5pZCB8fCBjLm5hbWUpKTtcblxuICAgICAgICAgIC8vIFVwZGF0ZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSB3aXRoIGR5bmFtaWMgY2hpbGRyZW5cbiAgICAgICAgICAvLyBfUmVxdWlyZW1lbnRzOiBydW50aW1lLXBpcGVsaW5lLXN0cnVjdHVyZSAyLjFfXG4gICAgICAgICAgdGhpcy51cGRhdGVTdHJ1Y3R1cmVXaXRoRHluYW1pY0NoaWxkcmVuKFxuICAgICAgICAgICAgbm9kZS5pZCA/PyBub2RlLm5hbWUsXG4gICAgICAgICAgICBkeW5hbWljTm9kZS5jaGlsZHJlbixcbiAgICAgICAgICAgIEJvb2xlYW4oZHluYW1pY05vZGUubmV4dE5vZGVTZWxlY3RvciksXG4gICAgICAgICAgICBCb29sZWFuKGR5bmFtaWNOb2RlLm5leHROb2RlRGVjaWRlciB8fCBkeW5hbWljTm9kZS5kZWNpZGVyRm4pLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgZHluYW1pYyBzZWxlY3RvciAobXVsdGktY2hvaWNlIGJyYW5jaGluZylcbiAgICAgICAgICBpZiAodHlwZW9mIGR5bmFtaWNOb2RlLm5leHROb2RlU2VsZWN0b3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIG5vZGUubmV4dE5vZGVTZWxlY3RvciA9IGR5bmFtaWNOb2RlLm5leHROb2RlU2VsZWN0b3I7XG4gICAgICAgICAgICBjb250ZXh0LmFkZExvZygnaGFzU2VsZWN0b3InLCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSGFuZGxlIGR5bmFtaWMgZGVjaWRlciAoc2luZ2xlLWNob2ljZSBicmFuY2hpbmcpXG4gICAgICAgICAgZWxzZSBpZiAodHlwZW9mIGR5bmFtaWNOb2RlLm5leHROb2RlRGVjaWRlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgbm9kZS5uZXh0Tm9kZURlY2lkZXIgPSBkeW5hbWljTm9kZS5uZXh0Tm9kZURlY2lkZXI7XG4gICAgICAgICAgICBjb250ZXh0LmFkZExvZygnaGFzRGVjaWRlcicsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhhbmRsZSBkeW5hbWljIG5leHQgKGxpbmVhciBjb250aW51YXRpb24pXG4gICAgICAgIGlmIChkeW5hbWljTm9kZS5uZXh0KSB7XG4gICAgICAgICAgZHluYW1pY05leHQgPSBkeW5hbWljTm9kZS5uZXh0O1xuICAgICAgICAgIC8vIFVwZGF0ZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSB3aXRoIGR5bmFtaWMgbmV4dFxuICAgICAgICAgIC8vIF9SZXF1aXJlbWVudHM6IHJ1bnRpbWUtcGlwZWxpbmUtc3RydWN0dXJlIDQuMV9cbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0cnVjdHVyZVdpdGhEeW5hbWljTmV4dChcbiAgICAgICAgICAgIG5vZGUuaWQgPz8gbm9kZS5uYW1lLFxuICAgICAgICAgICAgZHluYW1pY05vZGUubmV4dCxcbiAgICAgICAgICApO1xuICAgICAgICAgIC8vIEF0dGFjaCB0byBub2RlIGZvciBzZXJpYWxpemF0aW9uIHZpc2liaWxpdHkgKGdldFJ1bnRpbWVSb290KVxuICAgICAgICAgIG5vZGUubmV4dCA9IGR5bmFtaWNOb2RlLm5leHQ7XG4gICAgICAgICAgY29udGV4dC5hZGRMb2coJ2hhc0R5bmFtaWNOZXh0JywgdHJ1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbGVhciBzdGFnZU91dHB1dCBzaW5jZSB0aGUgU3RhZ2VOb2RlIGlzIHRoZSBjb250aW51YXRpb24sIG5vdCB0aGUgb3V0cHV0XG4gICAgICAgIHN0YWdlT3V0cHV0ID0gdW5kZWZpbmVkO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXN0b3JlIG5vZGUubmV4dCB0byBpdHMgb3JpZ2luYWwgdmFsdWUgYWZ0ZXIgY2FwdHVyaW5nIGR5bmFtaWNOZXh0LlxuICAgICAgLy8gV0hZOiBUaGUgbXV0YXRpb24gYG5vZGUubmV4dCA9IGR5bmFtaWNOb2RlLm5leHRgIGFib3ZlIGlzIGZvciBzZXJpYWxpemF0aW9uXG4gICAgICAvLyB2aXNpYmlsaXR5IChnZXRSdW50aW1lUm9vdCksIGJ1dCBpdCBwZXJzaXN0cyBvbiB0aGUgbm9kZSBvYmplY3QuIElmIHRoaXMgbm9kZVxuICAgICAgLy8gaXMgdmlzaXRlZCBhZ2FpbiBpbiBhIGxvb3AsIHRoZSBzdGFsZSBkeW5hbWljTmV4dCByZWZlcmVuY2Ugd291bGQgY2F1c2Ugc3RlcCA2XG4gICAgICAvLyB0byBmb2xsb3cgaXQgaW5jb3JyZWN0bHkuIFJlc3RvcmluZyBlbnN1cmVzIGxvb3AtYmFjayB2aXNpdHMgc2VlIHRoZSBvcmlnaW5hbFxuICAgICAgLy8gbm9kZSBzdHJ1Y3R1cmUuXG4gICAgICBpZiAoZHluYW1pY05leHQpIHtcbiAgICAgICAgbm9kZS5uZXh0ID0gb3JpZ2luYWxOZXh0O1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCA0KSBDaGlsZHJlbiAoaWYgYW55KSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBSZS1ldmFsdWF0ZSBoYXNDaGlsZHJlbiBhZnRlciBzdGFnZSBleGVjdXRpb24sIGFzIHRoZSBzdGFnZSBtYXkgaGF2ZVxuICAgIC8vIGR5bmFtaWNhbGx5IHBvcHVsYXRlZCBub2RlLmNoaWxkcmVuIChlLmcuLCB0b29sQnJhbmNoIGluamVjdHMgdG9vbCBub2RlcylcbiAgICBjb25zdCBoYXNDaGlsZHJlbkFmdGVyU3RhZ2UgPSBCb29sZWFuKG5vZGUuY2hpbGRyZW4/Lmxlbmd0aCk7XG4gICAgXG4gICAgaWYgKGhhc0NoaWxkcmVuQWZ0ZXJTdGFnZSkge1xuICAgICAgLy8gQnJlYWRjcnVtYnNcbiAgICAgIGNvbnRleHQuYWRkTG9nKCd0b3RhbENoaWxkcmVuJywgbm9kZS5jaGlsZHJlbj8ubGVuZ3RoKTtcbiAgICAgIGNvbnRleHQuYWRkTG9nKCdvcmRlck9mRXhlY3V0aW9uJywgJ0NoaWxkcmVuQWZ0ZXJTdGFnZScpO1xuXG4gICAgICBsZXQgbm9kZUNoaWxkcmVuUmVzdWx0czogUmVjb3JkPHN0cmluZywgTm9kZVJlc3VsdFR5cGU+O1xuXG4gICAgICAvLyBDaGVjayBmb3Igc2VsZWN0b3IgKG11bHRpLWNob2ljZSkgLSBjYW4gcGljayBtdWx0aXBsZSBjaGlsZHJlblxuICAgICAgaWYgKG5vZGUubmV4dE5vZGVTZWxlY3Rvcikge1xuICAgICAgICAvLyBTZXQgZm9yayBjb250ZXh0IGZvciBzdHJ1Y3R1cmVNZXRhZGF0YSBwcm9wYWdhdGlvblxuICAgICAgICAvLyBBbGwgcGFyYWxsZWwgY2hpbGRyZW4gd2lsbCBoYXZlIHBhcmFsbGVsR3JvdXBJZCBpbiB0aGVpciBzdHJ1Y3R1cmVNZXRhZGF0YVxuICAgICAgICAvLyBfUmVxdWlyZW1lbnRzOiB1bmlmaWVkLWV4dHJhY3Rvci1hcmNoaXRlY3R1cmUgMy42LCAzLjdfXG4gICAgICAgIGNvbnN0IHByZXZpb3VzRm9ya0lkID0gdGhpcy5jdXJyZW50Rm9ya0lkO1xuICAgICAgICB0aGlzLmN1cnJlbnRGb3JrSWQgPSBub2RlLmlkID8/IG5vZGUubmFtZTtcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbm9kZUNoaWxkcmVuUmVzdWx0cyA9IGF3YWl0IHRoaXMuY2hpbGRyZW5FeGVjdXRvci5leGVjdXRlU2VsZWN0ZWRDaGlsZHJlbihcbiAgICAgICAgICAgIG5vZGUubmV4dE5vZGVTZWxlY3RvcixcbiAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4hLFxuICAgICAgICAgICAgc3RhZ2VPdXRwdXQsXG4gICAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgICAgYnJhbmNoUGF0aCBhcyBzdHJpbmcsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAvLyBDbGVhciBmb3JrIGNvbnRleHQgYWZ0ZXIgY2hpbGRyZW4gY29tcGxldGUgKHJlc3RvcmUgcHJldmlvdXMgaWYgbmVzdGVkKVxuICAgICAgICAgIHRoaXMuY3VycmVudEZvcmtJZCA9IHByZXZpb3VzRm9ya0lkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBDaGVjayBmb3IgZGVjaWRlciAoc2luZ2xlLWNob2ljZSkgLSBwaWNrcyBleGFjdGx5IG9uZSBjaGlsZFxuICAgICAgZWxzZSBpZiAobm9kZS5uZXh0Tm9kZURlY2lkZXIpIHtcbiAgICAgICAgLy8gRGVjaWRlciB3YXMgZHluYW1pY2FsbHkgaW5qZWN0ZWQsIGV4ZWN1dGUgaXRcbiAgICAgICAgY29uc3QgY2hvc2VuID0gYXdhaXQgdGhpcy5ub2RlUmVzb2x2ZXIuZ2V0TmV4dE5vZGUoXG4gICAgICAgICAgbm9kZS5uZXh0Tm9kZURlY2lkZXIsXG4gICAgICAgICAgbm9kZS5jaGlsZHJlbiEsXG4gICAgICAgICAgc3RhZ2VPdXRwdXQsXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgbmV4dFN0YWdlQ29udGV4dCA9IGNvbnRleHQuY3JlYXRlTmV4dChicmFuY2hQYXRoIGFzIHN0cmluZywgY2hvc2VuLm5hbWUpO1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlTm9kZShjaG9zZW4sIG5leHRTdGFnZUNvbnRleHQsIGJyZWFrRmxhZywgYnJhbmNoUGF0aCk7XG4gICAgICB9XG4gICAgICAvLyBEZWZhdWx0OiBleGVjdXRlIGFsbCBjaGlsZHJlbiBpbiBwYXJhbGxlbCAoZm9yayBwYXR0ZXJuKVxuICAgICAgZWxzZSB7XG4gICAgICAgIC8vIExvZyBmbG93IGNvbnRyb2wgZGVjaXNpb24gZm9yIGZvcmsgY2hpbGRyZW5cbiAgICAgICAgLy8gX1JlcXVpcmVtZW50czogZmxvdy1jb250cm9sLW5hcnJhdGl2ZSBSRVEtMyAoVGFzayA0KVxuICAgICAgICBjb25zdCBjaGlsZENvdW50ID0gbm9kZS5jaGlsZHJlbj8ubGVuZ3RoID8/IDA7XG4gICAgICAgIGNvbnN0IGNoaWxkTmFtZXMgPSBub2RlLmNoaWxkcmVuPy5tYXAoYyA9PiBjLmRpc3BsYXlOYW1lIHx8IGMubmFtZSkuam9pbignLCAnKTtcbiAgICAgICAgY29udGV4dC5hZGRGbG93RGVidWdNZXNzYWdlKCdjaGlsZHJlbicsIGBFeGVjdXRpbmcgYWxsICR7Y2hpbGRDb3VudH0gY2hpbGRyZW4gaW4gcGFyYWxsZWw6ICR7Y2hpbGROYW1lc31gLCB7XG4gICAgICAgICAgY291bnQ6IGNoaWxkQ291bnQsXG4gICAgICAgICAgdGFyZ2V0U3RhZ2U6IG5vZGUuY2hpbGRyZW4/Lm1hcChjID0+IGMubmFtZSksXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgLy8gU2V0IGZvcmsgY29udGV4dCBmb3Igc3RydWN0dXJlTWV0YWRhdGEgcHJvcGFnYXRpb25cbiAgICAgICAgLy8gQWxsIHBhcmFsbGVsIGNoaWxkcmVuIHdpbGwgaGF2ZSBwYXJhbGxlbEdyb3VwSWQgaW4gdGhlaXIgc3RydWN0dXJlTWV0YWRhdGFcbiAgICAgICAgLy8gX1JlcXVpcmVtZW50czogdW5pZmllZC1leHRyYWN0b3ItYXJjaGl0ZWN0dXJlIDMuNiwgMy43X1xuICAgICAgICBjb25zdCBwcmV2aW91c0ZvcmtJZCA9IHRoaXMuY3VycmVudEZvcmtJZDtcbiAgICAgICAgdGhpcy5jdXJyZW50Rm9ya0lkID0gbm9kZS5pZCA/PyBub2RlLm5hbWU7XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgIG5vZGVDaGlsZHJlblJlc3VsdHMgPSBhd2FpdCB0aGlzLmNoaWxkcmVuRXhlY3V0b3IuZXhlY3V0ZU5vZGVDaGlsZHJlbihub2RlLCBjb250ZXh0LCB1bmRlZmluZWQsIGJyYW5jaFBhdGgpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIC8vIENsZWFyIGZvcmsgY29udGV4dCBhZnRlciBjaGlsZHJlbiBjb21wbGV0ZSAocmVzdG9yZSBwcmV2aW91cyBpZiBuZXN0ZWQpXG4gICAgICAgICAgdGhpcy5jdXJyZW50Rm9ya0lkID0gcHJldmlvdXNGb3JrSWQ7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRm9yay1vbmx5IChubyBuZXh0LCBubyBkeW5hbWljTmV4dCk6IHJldHVybiBidW5kbGUgb2JqZWN0XG4gICAgICBpZiAoIWhhc05leHQgJiYgIWR5bmFtaWNOZXh0KSB7XG4gICAgICAgIHJldHVybiBub2RlQ2hpbGRyZW5SZXN1bHRzO1xuICAgICAgfVxuXG4gICAgICAvLyDilIDilIAgQ2FwdHVyZSBkeW5hbWljIGNoaWxkcmVuIGFzIHN1YmZsb3cgcmVzdWx0IGZvciBkZWJ1ZyB2aXN1YWxpemF0aW9uIOKUgOKUgFxuICAgICAgLy8gV0hZOiBXaGVuIGEgc3RhZ2UgZHluYW1pY2FsbHkgY3JlYXRlcyBjaGlsZHJlbiAoZS5nLiwgdG9vbCBleGVjdXRpb24pLFxuICAgICAgLy8gdGhlIFVJIG5lZWRzIHN1YmZsb3dSZXN1bHRzIGRhdGEgdG8gcmVuZGVyIHRoZW0gYXMgYSBkcmlsbGFibGUgc3ViZmxvdy5cbiAgICAgIC8vIENoaWxkcmVuRXhlY3V0b3IgZG9lc24ndCBwcm9kdWNlIHN1YmZsb3dSZXN1bHRzIOKAlCBvbmx5IFN1YmZsb3dFeGVjdXRvciBkb2VzLlxuICAgICAgLy8gU28gd2UgY3JlYXRlIGEgc3ludGhldGljIGVudHJ5IGhlcmUgZnJvbSB0aGUgY2hpbGRyZW4ncyBleGVjdXRpb24gZGF0YS5cbiAgICAgIC8vXG4gICAgICAvLyBERVNJR046IE9ubHkgZm9yIGR5bmFtaWMgY2hpbGRyZW4gKGlzRHluYW1pYyBmbGFnIGluIGNvbnRleHQpLiBTdGF0aWNcbiAgICAgIC8vIGNoaWxkcmVuIChidWlsZC10aW1lIGZvcmspIGRvbid0IG5lZWQgdGhpcyDigJQgdGhleSdyZSBpbiB0aGUgcGlwZWxpbmVTdHJ1Y3R1cmUuXG4gICAgICBjb25zdCBpc0R5bmFtaWMgPSBjb250ZXh0LmRlYnVnPy5sb2dDb250ZXh0Py5pc0R5bmFtaWM7XG4gICAgICBpZiAoaXNEeW5hbWljICYmIG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudFN0YWdlSWQgPSBjb250ZXh0LmdldFN0YWdlSWQoKTtcblxuICAgICAgICAvLyBNYXJrIHRoaXMgbm9kZSBhcyBhIHN1YmZsb3cgcm9vdCBpbiBjb250ZXh0IHNvIHRoZSBVSSByZW5kZXJzIGl0XG4gICAgICAgIC8vIHdpdGggZHJpbGwtZG93biBjYXBhYmlsaXR5XG4gICAgICAgIGNvbnRleHQuYWRkTG9nKCdpc1N1YmZsb3dDb250YWluZXInLCB0cnVlKTtcbiAgICAgICAgY29udGV4dC5hZGRMb2coJ3N1YmZsb3dJZCcsIG5vZGUuaWQgfHwgbm9kZS5uYW1lKTtcbiAgICAgICAgY29udGV4dC5hZGRMb2coJ3N1YmZsb3dOYW1lJywgbm9kZS5kaXNwbGF5TmFtZSB8fCBub2RlLm5hbWUpO1xuICAgICAgICBjb250ZXh0LmFkZExvZygnaGFzU3ViZmxvd0RhdGEnLCB0cnVlKTtcblxuICAgICAgICBjb25zdCBjaGlsZFN0cnVjdHVyZTogYW55ID0ge1xuICAgICAgICAgIGlkOiBgJHtub2RlLmlkIHx8IG5vZGUubmFtZX0tY2hpbGRyZW5gLFxuICAgICAgICAgIG5hbWU6ICdEeW5hbWljIENoaWxkcmVuJyxcbiAgICAgICAgICB0eXBlOiAnZm9yaycsXG4gICAgICAgICAgY2hpbGRyZW46IG5vZGUuY2hpbGRyZW4ubWFwKGMgPT4gKHtcbiAgICAgICAgICAgIGlkOiBjLmlkIHx8IGMubmFtZSxcbiAgICAgICAgICAgIG5hbWU6IGMubmFtZSxcbiAgICAgICAgICAgIGRpc3BsYXlOYW1lOiBjLmRpc3BsYXlOYW1lIHx8IGMubmFtZSxcbiAgICAgICAgICAgIHR5cGU6ICdzdGFnZScsXG4gICAgICAgICAgfSkpLFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIEJ1aWxkIHRyZWVDb250ZXh0IGZyb20gdGhlIGNoaWxkcmVuJ3MgYWN0dWFsIGV4ZWN1dGlvbiBkYXRhLlxuICAgICAgICAvLyBXSFk6IFRoZSBkcmlsbC1kb3duIFVJIHJlbmRlcnMgZnJvbSB0aGUgc3ViZmxvdydzIHRyZWVDb250ZXh0LlxuICAgICAgICAvLyBXZSBleHRyYWN0IGVhY2ggY2hpbGQncyBzbmFwc2hvdCAobG9ncywgZXJyb3JzLCBtZXRyaWNzKSBmcm9tXG4gICAgICAgIC8vIHRoZSBwYXJlbnQgY29udGV4dCdzIGNoaWxkcmVuIGFycmF5LlxuICAgICAgICBjb25zdCBjaGlsZFN0YWdlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgICAgICAgaWYgKGNvbnRleHQuY2hpbGRyZW4pIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkQ3R4IG9mIGNvbnRleHQuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGNvbnN0IHNuYXBzaG90ID0gY2hpbGRDdHguZ2V0U25hcHNob3QoKTtcbiAgICAgICAgICAgIGNoaWxkU3RhZ2VzW3NuYXBzaG90Lm5hbWUgfHwgc25hcHNob3QuaWRdID0ge1xuICAgICAgICAgICAgICBuYW1lOiBzbmFwc2hvdC5uYW1lLFxuICAgICAgICAgICAgICBvdXRwdXQ6IHNuYXBzaG90LmxvZ3MsXG4gICAgICAgICAgICAgIGVycm9yczogc25hcHNob3QuZXJyb3JzLFxuICAgICAgICAgICAgICBtZXRyaWNzOiBzbmFwc2hvdC5tZXRyaWNzLFxuICAgICAgICAgICAgICBzdGF0dXM6IHNuYXBzaG90LmVycm9ycyAmJiBPYmplY3Qua2V5cyhzbmFwc2hvdC5lcnJvcnMpLmxlbmd0aCA+IDAgPyAnZXJyb3InIDogJ3N1Y2Nlc3MnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnN1YmZsb3dSZXN1bHRzLnNldChub2RlLmlkIHx8IG5vZGUubmFtZSwge1xuICAgICAgICAgIHN1YmZsb3dJZDogbm9kZS5pZCB8fCBub2RlLm5hbWUsXG4gICAgICAgICAgc3ViZmxvd05hbWU6IG5vZGUuZGlzcGxheU5hbWUgfHwgbm9kZS5uYW1lLFxuICAgICAgICAgIHRyZWVDb250ZXh0OiB7XG4gICAgICAgICAgICBnbG9iYWxDb250ZXh0OiB7fSxcbiAgICAgICAgICAgIHN0YWdlQ29udGV4dHM6IGNoaWxkU3RhZ2VzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICAgICAgICAgICBoaXN0b3J5OiBbXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBhcmVudFN0YWdlSWQsXG4gICAgICAgICAgcGlwZWxpbmVTdHJ1Y3R1cmU6IGNoaWxkU3RydWN0dXJlLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yayArIG5leHQgb3IgZHluYW1pY05leHQ6IGNvbnRpbnVlIGJlbG93XG4gICAgfVxuXG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIDUpIER5bmFtaWMgTmV4dCAobG9vcCBzdXBwb3J0KSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBJZiBkeW5hbWljTmV4dCBpcyBzZXQsIGRlbGVnYXRlIHRvIExvb3BIYW5kbGVyIGZvciByZXNvbHV0aW9uIGFuZCBleGVjdXRpb25cbiAgICAvLyBfUmVxdWlyZW1lbnRzOiBwaGFzZTItaGFuZGxlcnMgMy40LCAzLjUsIDMuNiwgMy43X1xuICAgIGlmIChkeW5hbWljTmV4dCkge1xuICAgICAgcmV0dXJuIHRoaXMubG9vcEhhbmRsZXIuaGFuZGxlKFxuICAgICAgICBkeW5hbWljTmV4dCxcbiAgICAgICAgbm9kZSxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgYnJlYWtGbGFnLFxuICAgICAgICBicmFuY2hQYXRoLFxuICAgICAgICB0aGlzLmV4ZWN1dGVOb2RlLmJpbmQodGhpcyksXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCA2KSBMaW5lYXIgYG5leHRgIChpZiBwcm92aWRlZCkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgaWYgKGhhc05leHQpIHtcbiAgICAgIC8vIFVzZSBvcmlnaW5hbE5leHQgKGNhcHR1cmVkIGJlZm9yZSBzdGFnZSBleGVjdXRpb24pIHRvIGF2b2lkIGZvbGxvd2luZ1xuICAgICAgLy8gYSBkeW5hbWljTmV4dCByZWZlcmVuY2UgdGhhdCB3YXMgYXR0YWNoZWQgdG8gbm9kZS5uZXh0IGR1cmluZyBzdGFnZSBoYW5kbGluZy5cbiAgICAgIGNvbnN0IG5leHROb2RlID0gb3JpZ2luYWxOZXh0ITtcbiAgICAgIFxuICAgICAgLy8gTmFycmF0aXZlOiByZWNvcmQgdGhlIHRyYW5zaXRpb24gdG8gdGhlIG5leHQgc3RhZ2VcbiAgICAgIC8vIF9SZXF1aXJlbWVudHM6IDMuMl9cbiAgICAgIHRoaXMubmFycmF0aXZlR2VuZXJhdG9yLm9uTmV4dChub2RlLm5hbWUsIG5leHROb2RlLm5hbWUsIG5leHROb2RlLmRpc3BsYXlOYW1lLCBuZXh0Tm9kZS5kZXNjcmlwdGlvbik7XG4gICAgICBcbiAgICAgIC8vIExvZyBmbG93IGNvbnRyb2wgZGVjaXNpb24gZm9yIGxpbmVhciBuZXh0XG4gICAgICAvLyBfUmVxdWlyZW1lbnRzOiBmbG93LWNvbnRyb2wtbmFycmF0aXZlIFJFUS0zIChUYXNrIDIpXG4gICAgICBjb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoJ25leHQnLCBgTW92aW5nIHRvICR7bmV4dE5vZGUuZGlzcGxheU5hbWUgfHwgbmV4dE5vZGUubmFtZX0gc3RhZ2VgLCB7XG4gICAgICAgIHRhcmdldFN0YWdlOiBuZXh0Tm9kZS5uYW1lLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNvbnN0IG5leHRTdGFnZUNvbnRleHQgPSBjb250ZXh0LmNyZWF0ZU5leHQoYnJhbmNoUGF0aCBhcyBzdHJpbmcsIG5leHROb2RlLm5hbWUpO1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZU5vZGUobmV4dE5vZGUsIG5leHRTdGFnZUNvbnRleHQsIGJyZWFrRmxhZywgYnJhbmNoUGF0aCk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIDcpIExlYWYg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gTm8gY2hpbGRyZW4gJiBubyBuZXh0ICYgbm8gZHluYW1pY05leHQg4oaSIHJldHVybiB0aGlzIG5vZGUncyBzdGFnZSBvdXRwdXQgKG1heSBiZSB1bmRlZmluZWQpXG4gICAgcmV0dXJuIHN0YWdlT3V0cHV0O1xuICB9XG5cblxuICAvKipcbiAgICogRXhlY3V0ZSBhIG5vZGUncyBzdGFnZSBmdW5jdGlvbiB3aXRoICoqc3luYythc3luYyBzYWZldHkqKjpcbiAgICogIC0gSWYgaXQncyBhIHJlYWwgUHJvbWlzZSwgYXdhaXQgaXRcbiAgICogIC0gT3RoZXJ3aXNlIHJldHVybiB0aGUgdmFsdWUgYXMtaXMgKG5vIHRoZW5hYmxlIGFzc2ltaWxhdGlvbilcbiAgICpcbiAgICogRm9yIHN0cmVhbWluZyBzdGFnZXMgKG5vZGUuaXNTdHJlYW1pbmcgPT09IHRydWUpOlxuICAgKiAgLSBDcmVhdGVzIGEgYm91bmQgc3RyZWFtQ2FsbGJhY2sgdGhhdCByb3V0ZXMgdG9rZW5zIHRvIHRoZSByZWdpc3RlcmVkIGhhbmRsZXJcbiAgICogIC0gQ2FsbHMgb25TdGFydCBsaWZlY3ljbGUgaG9vayBiZWZvcmUgZXhlY3V0aW9uXG4gICAqICAtIEFjY3VtdWxhdGVzIHRva2VucyBkdXJpbmcgc3RyZWFtaW5nXG4gICAqICAtIENhbGxzIG9uRW5kIGxpZmVjeWNsZSBob29rIGFmdGVyIGV4ZWN1dGlvbiB3aXRoIGFjY3VtdWxhdGVkIHRleHRcbiAgICpcbiAgICogTm90ZTogRHluYW1pYyBiZWhhdmlvciBpcyBkZXRlY3RlZCB2aWEgaXNTdGFnZU5vZGVSZXR1cm4oKSBvbiB0aGUgc3RhZ2Ugb3V0cHV0LFxuICAgKiBub3QgdmlhIG5vZGUgZmxhZ3MuIEFueSBzdGFnZSBjYW4gcmV0dXJuIGEgU3RhZ2VOb2RlIGZvciBkeW5hbWljIGNvbnRpbnVhdGlvbi5cbiAgICpcbiAgICogRGVsZWdhdGVzIHRvIFN0YWdlUnVubmVyIG1vZHVsZSBmb3IgYWN0dWFsIGV4ZWN1dGlvbi5cbiAgICogX1JlcXVpcmVtZW50czogcGhhc2UyLWhhbmRsZXJzIDEuMSwgMS4yLCA0LjMsIDQuNCwgNi4xX1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU3RhZ2UoXG4gICAgbm9kZTogU3RhZ2VOb2RlLFxuICAgIHN0YWdlRnVuYzogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4sXG4gICAgY29udGV4dDogU3RhZ2VDb250ZXh0LFxuICAgIGJyZWFrRm46ICgpID0+IHZvaWQsXG4gICkge1xuICAgIHJldHVybiB0aGlzLnN0YWdlUnVubmVyLnJ1bihub2RlLCBzdGFnZUZ1bmMsIGNvbnRleHQsIGJyZWFrRm4pO1xuICB9XG5cbiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIEV4dHJhY3RvciBoZWxwZXJzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gIC8qKlxuICAgKiBDb21wdXRlIHRoZSBub2RlIHR5cGUgYmFzZWQgb24gbm9kZSBwcm9wZXJ0aWVzLlxuICAgKiBUaGlzIGxvZ2ljIHdhcyBwcmV2aW91c2x5IGluIHNlcnZpY2UtbGF5ZXIgc2VyaWFsaXplUGlwZWxpbmVTdHJ1Y3R1cmUoKS5cbiAgICogXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIHN0YWdlIG5vZGUgdG8gY29tcHV0ZSB0eXBlIGZvclxuICAgKiBAcmV0dXJucyBUaGUgY29tcHV0ZWQgbm9kZSB0eXBlXG4gICAqIFxuICAgKiBfUmVxdWlyZW1lbnRzOiB1bmlmaWVkLWV4dHJhY3Rvci1hcmNoaXRlY3R1cmUgMy4yX1xuICAgKi9cbiAgcHJpdmF0ZSBjb21wdXRlTm9kZVR5cGUobm9kZTogU3RhZ2VOb2RlKTogJ3N0YWdlJyB8ICdkZWNpZGVyJyB8ICdmb3JrJyB8ICdzdHJlYW1pbmcnIHtcbiAgICAvLyBEZWNpZGVyIHRha2VzIHByZWNlZGVuY2UgKGhhcyBkZWNpc2lvbiBsb2dpYylcbiAgICAvLyBDaGVjayBib3RoIGxlZ2FjeSAobmV4dE5vZGVEZWNpZGVyKSBhbmQgc2NvcGUtYmFzZWQgKGRlY2lkZXJGbikgZGVjaWRlcnNcbiAgICAvLyBfUmVxdWlyZW1lbnRzOiAzLjIsIGRlY2lkZXItZmlyc3QtY2xhc3Mtc3RhZ2UgMy4yX1xuICAgIGlmIChub2RlLm5leHROb2RlRGVjaWRlciB8fCBub2RlLm5leHROb2RlU2VsZWN0b3IgfHwgbm9kZS5kZWNpZGVyRm4pIHJldHVybiAnZGVjaWRlcic7XG4gICAgXG4gICAgLy8gU3RyZWFtaW5nIHN0YWdlc1xuICAgIGlmIChub2RlLmlzU3RyZWFtaW5nKSByZXR1cm4gJ3N0cmVhbWluZyc7XG4gICAgXG4gICAgLy8gRm9yazogaGFzIHN0YXRpYyBjaGlsZHJlbiAobm90IGR5bmFtaWMpXG4gICAgLy8gRHluYW1pYyBjaGlsZHJlbiBhcmUgZGV0ZWN0ZWQgYnkgaGF2aW5nIGNoaWxkcmVuICsgZm4gKHN0YWdlIHRoYXQgcmV0dXJucyBjaGlsZHJlbilcbiAgICBjb25zdCBoYXNEeW5hbWljQ2hpbGRyZW4gPSBCb29sZWFuKFxuICAgICAgbm9kZS5jaGlsZHJlbj8ubGVuZ3RoICYmXG4gICAgICAhbm9kZS5uZXh0Tm9kZURlY2lkZXIgJiZcbiAgICAgICFub2RlLm5leHROb2RlU2VsZWN0b3IgJiZcbiAgICAgIG5vZGUuZm5cbiAgICApO1xuICAgIGlmIChub2RlLmNoaWxkcmVuICYmIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCAmJiAhaGFzRHluYW1pY0NoaWxkcmVuKSByZXR1cm4gJ2ZvcmsnO1xuICAgIFxuICAgIC8vIERlZmF1bHQ6IHJlZ3VsYXIgc3RhZ2VcbiAgICByZXR1cm4gJ3N0YWdlJztcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCB0aGUgUnVudGltZVN0cnVjdHVyZU1ldGFkYXRhIGZvciBhIG5vZGUuXG4gICAqIENhbGxlZCBkdXJpbmcgdHJhdmVyc2FsIHRvIHByb3ZpZGUgcHJlLWNvbXB1dGVkIG1ldGFkYXRhIHRvIHRoZSBleHRyYWN0b3IuXG4gICAqIFxuICAgKiBAcGFyYW0gbm9kZSAtIFRoZSBzdGFnZSBub2RlIHRvIGJ1aWxkIG1ldGFkYXRhIGZvclxuICAgKiBAcmV0dXJucyBUaGUgY29tcHV0ZWQgUnVudGltZVN0cnVjdHVyZU1ldGFkYXRhXG4gICAqIFxuICAgKiBfUmVxdWlyZW1lbnRzOiB1bmlmaWVkLWV4dHJhY3Rvci1hcmNoaXRlY3R1cmUgMy4xLTMuMTBfXG4gICAqL1xuICBwcml2YXRlIGJ1aWxkU3RydWN0dXJlTWV0YWRhdGEobm9kZTogU3RhZ2VOb2RlKTogUnVudGltZVN0cnVjdHVyZU1ldGFkYXRhIHtcbiAgICBjb25zdCBtZXRhZGF0YTogUnVudGltZVN0cnVjdHVyZU1ldGFkYXRhID0ge1xuICAgICAgdHlwZTogdGhpcy5jb21wdXRlTm9kZVR5cGUobm9kZSksXG4gICAgfTtcblxuICAgIC8vIFN1YmZsb3cgbWV0YWRhdGFcbiAgICBpZiAobm9kZS5pc1N1YmZsb3dSb290KSB7XG4gICAgICBtZXRhZGF0YS5pc1N1YmZsb3dSb290ID0gdHJ1ZTtcbiAgICAgIG1ldGFkYXRhLnN1YmZsb3dJZCA9IG5vZGUuc3ViZmxvd0lkO1xuICAgICAgbWV0YWRhdGEuc3ViZmxvd05hbWUgPSBub2RlLnN1YmZsb3dOYW1lO1xuICAgIH0gZWxzZSBpZiAodGhpcy5jdXJyZW50U3ViZmxvd0lkKSB7XG4gICAgICAvLyBQcm9wYWdhdGUgc3ViZmxvd0lkIHRvIGNoaWxkcmVuIHdpdGhpbiB0aGUgc3ViZmxvd1xuICAgICAgbWV0YWRhdGEuc3ViZmxvd0lkID0gdGhpcy5jdXJyZW50U3ViZmxvd0lkO1xuICAgIH1cblxuICAgIC8vIFBhcmFsbGVsIGNoaWxkIG1ldGFkYXRhIChzZXQgYnkgQ2hpbGRyZW5FeGVjdXRvcilcbiAgICBpZiAodGhpcy5jdXJyZW50Rm9ya0lkKSB7XG4gICAgICBtZXRhZGF0YS5pc1BhcmFsbGVsQ2hpbGQgPSB0cnVlO1xuICAgICAgbWV0YWRhdGEucGFyYWxsZWxHcm91cElkID0gdGhpcy5jdXJyZW50Rm9ya0lkO1xuICAgIH1cblxuICAgIC8vIFN0cmVhbWluZyBtZXRhZGF0YVxuICAgIGlmIChub2RlLmlzU3RyZWFtaW5nKSB7XG4gICAgICBtZXRhZGF0YS5zdHJlYW1JZCA9IG5vZGUuc3RyZWFtSWQ7XG4gICAgfVxuXG4gICAgLy8gRHluYW1pYyBjaGlsZHJlbiBkZXRlY3Rpb25cbiAgICBjb25zdCBoYXNEeW5hbWljQ2hpbGRyZW4gPSBCb29sZWFuKFxuICAgICAgbm9kZS5jaGlsZHJlbj8ubGVuZ3RoICYmXG4gICAgICAhbm9kZS5uZXh0Tm9kZURlY2lkZXIgJiZcbiAgICAgICFub2RlLm5leHROb2RlU2VsZWN0b3IgJiZcbiAgICAgIG5vZGUuZm5cbiAgICApO1xuICAgIGlmIChoYXNEeW5hbWljQ2hpbGRyZW4pIHtcbiAgICAgIG1ldGFkYXRhLmlzRHluYW1pYyA9IHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1ldGFkYXRhO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGwgdGhlIGV4dHJhY3RvciBmb3IgYSBzdGFnZSBhbmQgc3RvcmUgdGhlIHJlc3VsdC5cbiAgICogSGFuZGxlcyBlcnJvcnMgZ3JhY2VmdWxseSAtIGxvZ3MgYW5kIGNvbnRpbnVlcyBleGVjdXRpb24uXG4gICAqIFxuICAgKiBJbmNyZW1lbnRzIHN0ZXBDb3VudGVyIGJlZm9yZSBjcmVhdGluZyBzbmFwc2hvdCB0byBwcm92aWRlXG4gICAqIDEtYmFzZWQgc3RlcCBudW1iZXJzIGZvciB0aW1lIHRyYXZlbGVyIHN5bmNocm9uaXphdGlvbi5cbiAgICogXG4gICAqIEluY2x1ZGVzIHByZS1jb21wdXRlZCBzdHJ1Y3R1cmVNZXRhZGF0YSBzbyBjb25zdW1lcnMgY2FuIGJ1aWxkXG4gICAqIHNlcmlhbGl6ZWQgc3RydWN0dXJlIGF0IHJ1bnRpbWUgd2l0aG91dCBwb3N0LXByb2Nlc3NpbmcgZ2V0UnVudGltZVJvb3QoKS5cbiAgICogXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIHN0YWdlIG5vZGVcbiAgICogQHBhcmFtIGNvbnRleHQgLSBUaGUgc3RhZ2UgY29udGV4dCAoYWZ0ZXIgY29tbWl0UGF0Y2gpXG4gICAqIEBwYXJhbSBzdGFnZVBhdGggLSBUaGUgZnVsbCBwYXRoIHRvIHRoaXMgc3RhZ2UgKGUuZy4sIFwicm9vdC5jaGlsZFwiKVxuICAgKiBAcGFyYW0gc3RhZ2VPdXRwdXQgLSBUaGUgc3RhZ2UgZnVuY3Rpb24ncyByZXR1cm4gdmFsdWUgKHVuZGVmaW5lZCBmb3Igc3RhZ2VzXG4gICAqICAgdGhhdCByZXR1cm4gYSBTdGFnZU5vZGUgZm9yIGR5bmFtaWMgY29udGludWF0aW9uIG9yIHN0YWdlcyB3aXRob3V0IGZ1bmN0aW9ucykuXG4gICAqICAgVXNlZCBieSBlbnJpY2htZW50IHRvIHBvcHVsYXRlIFN0YWdlU25hcHNob3Quc3RhZ2VPdXRwdXQuXG4gICAqICAgX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuM19cbiAgICogQHBhcmFtIGVycm9ySW5mbyAtIEVycm9yIGRldGFpbHMgd2hlbiB0aGUgc3RhZ2UgdGhyZXcgZHVyaW5nIGV4ZWN1dGlvbi5cbiAgICogICBDb250YWlucyBgdHlwZWAgKGVycm9yIGNsYXNzaWZpY2F0aW9uKSBhbmQgYG1lc3NhZ2VgIChlcnJvciBkZXNjcmlwdGlvbikuXG4gICAqICAgVXNlZCBieSBlbnJpY2htZW50IHRvIHBvcHVsYXRlIFN0YWdlU25hcHNob3QuZXJyb3JJbmZvLlxuICAgKiAgIF9SZXF1aXJlbWVudHM6IHNpbmdsZS1wYXNzLWRlYnVnLXN0cnVjdHVyZSAxLjRfXG4gICAqIFxuICAgKiBfUmVxdWlyZW1lbnRzOiB1bmlmaWVkLWV4dHJhY3Rvci1hcmNoaXRlY3R1cmUgMy4xLCAzLjIsIDMuMywgMy40LCA1LjNfXG4gICAqL1xuICBwcml2YXRlIGNhbGxFeHRyYWN0b3IoXG4gICAgbm9kZTogU3RhZ2VOb2RlLFxuICAgIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgICBzdGFnZVBhdGg6IHN0cmluZyxcbiAgICBzdGFnZU91dHB1dD86IHVua25vd24sXG4gICAgZXJyb3JJbmZvPzogeyB0eXBlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9LFxuICApOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZXh0cmFjdG9yKSByZXR1cm47XG4gICAgXG4gICAgLy8gSW5jcmVtZW50IHN0ZXAgY291bnRlciBiZWZvcmUgY3JlYXRpbmcgc25hcHNob3QgKDEtYmFzZWQpXG4gICAgdGhpcy5zdGVwQ291bnRlcisrO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzbmFwc2hvdDogU3RhZ2VTbmFwc2hvdCA9IHsgXG4gICAgICAgIG5vZGUsIFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBzdGVwTnVtYmVyOiB0aGlzLnN0ZXBDb3VudGVyLFxuICAgICAgICBzdHJ1Y3R1cmVNZXRhZGF0YTogdGhpcy5idWlsZFN0cnVjdHVyZU1ldGFkYXRhKG5vZGUpLFxuICAgICAgfTtcblxuICAgICAgLy8g4pSA4pSAIEVucmljaCBzbmFwc2hvdCB3aGVuIG9wdC1pbiBpcyBlbmFibGVkIOKUgOKUgFxuICAgICAgLy8gV0hZOiBDYXB0dXJlcyBmdWxsIHN0YWdlIGRhdGEgZHVyaW5nIHRyYXZlcnNhbCwgZWxpbWluYXRpbmcgdGhlIG5lZWRcbiAgICAgIC8vIGZvciBhIHJlZHVuZGFudCBwb3N0LXRyYXZlcnNhbCB3YWxrIHZpYSBQaXBlbGluZVJ1bnRpbWUuZ2V0U25hcHNob3QoKS5cbiAgICAgIC8vIFdyYXBwZWQgaW4gaXRzIG93biB0cnktY2F0Y2ggc28gZW5yaWNobWVudCBmYWlsdXJlcyBkb24ndCBicmVhayB0aGVcbiAgICAgIC8vIGJhc2Ugc25hcHNob3Qg4oCUIHRoZSBleHRyYWN0b3Igc3RpbGwgcmVjZWl2ZXMgbm9kZS9jb250ZXh0L3N0ZXBOdW1iZXIuXG4gICAgICBpZiAodGhpcy5lbnJpY2hTbmFwc2hvdHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBTaGFsbG93IGNsb25lIG9mIGNvbW1pdHRlZCBzY29wZSBzdGF0ZVxuICAgICAgICAgIC8vIFdIWTogU2hhbGxvdyBjbG9uZSBpcyBzdWZmaWNpZW50IGJlY2F1c2UgZWFjaCBzdGFnZSdzIGNvbW1pdCgpXG4gICAgICAgICAgLy8gcHJvZHVjZXMgYSBuZXcgdG9wLWxldmVsIG9iamVjdCB2aWEgc3RydWN0dXJhbCBzaGFyaW5nLlxuICAgICAgICAgIC8vIERlZXAgdmFsdWVzIGFyZSBpbW11dGFibGUgYnkgY29udmVudGlvbiAoV3JpdGVCdWZmZXIgZW5mb3JjZXMgdGhpcykuXG4gICAgICAgICAgc25hcHNob3Quc2NvcGVTdGF0ZSA9IHsgLi4udGhpcy5waXBlbGluZVJ1bnRpbWUuZ2xvYmFsU3RvcmUuZ2V0U3RhdGUoKSB9O1xuXG4gICAgICAgICAgLy8gQ2FwdHVyZSBkZWJ1ZyBtZXRhZGF0YSBmcm9tIFN0YWdlTWV0YWRhdGFcbiAgICAgICAgICAvLyBXSFk6IEVsaW1pbmF0ZXMgdGhlIG5lZWQgdG8gd2FsayBTdGFnZUNvbnRleHQuZGVidWcgYWZ0ZXIgdHJhdmVyc2FsLlxuICAgICAgICAgIHNuYXBzaG90LmRlYnVnSW5mbyA9IHtcbiAgICAgICAgICAgIGxvZ3M6IHsgLi4uY29udGV4dC5kZWJ1Zy5sb2dDb250ZXh0IH0sXG4gICAgICAgICAgICBlcnJvcnM6IHsgLi4uY29udGV4dC5kZWJ1Zy5lcnJvckNvbnRleHQgfSxcbiAgICAgICAgICAgIG1ldHJpY3M6IHsgLi4uY29udGV4dC5kZWJ1Zy5tZXRyaWNDb250ZXh0IH0sXG4gICAgICAgICAgICBldmFsczogeyAuLi5jb250ZXh0LmRlYnVnLmV2YWxDb250ZXh0IH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAoY29udGV4dC5kZWJ1Zy5mbG93TWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc25hcHNob3QuZGVidWdJbmZvLmZsb3dNZXNzYWdlcyA9IFsuLi5jb250ZXh0LmRlYnVnLmZsb3dNZXNzYWdlc107XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQ2FwdHVyZSBzdGFnZSBvdXRwdXQgKHVuZGVmaW5lZCBmb3IgZHluYW1pYyBzdGFnZXMgdGhhdCByZXR1cm4gU3RhZ2VOb2RlKVxuICAgICAgICAgIHNuYXBzaG90LnN0YWdlT3V0cHV0ID0gc3RhZ2VPdXRwdXQ7XG5cbiAgICAgICAgICAvLyBDYXB0dXJlIGVycm9yIGluZm8gaWYgcHJlc2VudCAoc3RhZ2UgdGhyZXcgZHVyaW5nIGV4ZWN1dGlvbilcbiAgICAgICAgICBpZiAoZXJyb3JJbmZvKSB7XG4gICAgICAgICAgICBzbmFwc2hvdC5lcnJvckluZm8gPSBlcnJvckluZm87XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQ2FwdHVyZSBoaXN0b3J5IGluZGV4IChudW1iZXIgb2YgY29tbWl0cyBzbyBmYXIpXG4gICAgICAgICAgLy8gV0hZOiBFbmFibGVzIHNjb3BlIHJlY29uc3RydWN0aW9uIHZpYSBleGVjdXRpb25IaXN0b3J5Lm1hdGVyaWFsaXNlKGhpc3RvcnlJbmRleClcbiAgICAgICAgICAvLyB3aXRob3V0IGEgc2VwYXJhdGUgaGlzdG9yeSByZXBsYXkgcGFzcy5cbiAgICAgICAgICBzbmFwc2hvdC5oaXN0b3J5SW5kZXggPSB0aGlzLnBpcGVsaW5lUnVudGltZS5leGVjdXRpb25IaXN0b3J5Lmxpc3QoKS5sZW5ndGg7XG4gICAgICAgIH0gY2F0Y2ggKGVucmljaEVycm9yOiBhbnkpIHtcbiAgICAgICAgICAvLyBMb2cgYnV0IGRvbid0IGZhaWwg4oCUIHRoZSBiYXNlIHNuYXBzaG90IGlzIHN0aWxsIHZhbGlkXG4gICAgICAgICAgbG9nZ2VyLndhcm4oYEVucmljaG1lbnQgZXJyb3IgYXQgc3RhZ2UgJyR7c3RhZ2VQYXRofSc6YCwgeyBlcnJvcjogZW5yaWNoRXJyb3IgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5leHRyYWN0b3Ioc25hcHNob3QpO1xuICAgICAgXG4gICAgICAvLyBPbmx5IHN0b3JlIGlmIGV4dHJhY3RvciByZXR1cm5lZCBhIHZhbHVlXG4gICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQgJiYgcmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgIHRoaXMuZXh0cmFjdGVkUmVzdWx0cy5zZXQoc3RhZ2VQYXRoLCByZXN1bHQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIC8vIExvZyBlcnJvciBidXQgZG9uJ3Qgc3RvcCBleGVjdXRpb25cbiAgICAgIGxvZ2dlci5lcnJvcihgRXh0cmFjdG9yIGVycm9yIGF0IHN0YWdlICcke3N0YWdlUGF0aH0nOmAsIHsgZXJyb3IgfSk7XG4gICAgICB0aGlzLmV4dHJhY3RvckVycm9ycy5wdXNoKHtcbiAgICAgICAgc3RhZ2VQYXRoLFxuICAgICAgICBtZXNzYWdlOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpLFxuICAgICAgICBlcnJvcixcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSB0aGUgc3RhZ2UgcGF0aCBmb3IgZXh0cmFjdG9yIHJlc3VsdHMuXG4gICAqIFVzZXMgbm9kZS5pZCBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBub2RlLm5hbWUuXG4gICAqIENvbWJpbmVzIHdpdGggYnJhbmNoUGF0aCBmb3IgbmVzdGVkIHN0YWdlcy5cbiAgICpcbiAgICogQHBhcmFtIG5vZGUgLSBUaGUgc3RhZ2Ugbm9kZVxuICAgKiBAcGFyYW0gYnJhbmNoUGF0aCAtIFRoZSBicmFuY2ggcGF0aCBwcmVmaXggKGUuZy4sIFwicm9vdC5jaGlsZFwiKVxuICAgKiBAcGFyYW0gY29udGV4dFN0YWdlTmFtZSAtIE9wdGlvbmFsIHN0YWdlIG5hbWUgZnJvbSBTdGFnZUNvbnRleHQsIHdoaWNoIGluY2x1ZGVzXG4gICAqICAgaXRlcmF0aW9uIHN1ZmZpeGVzIChlLmcuLCBcIkNhbGxMTE0uMVwiKSBmb3IgbG9vcCBpdGVyYXRpb25zLiBXaGVuIHRoZSBjb250ZXh0XG4gICAqICAgbmFtZSBkaWZmZXJzIGZyb20gdGhlIGJhc2Ugbm9kZSBuYW1lIChpbmRpY2F0aW5nIGFuIGl0ZXJhdGlvbiksIHdlIHVzZSBpdFxuICAgKiAgIHRvIGVuc3VyZSBsb29wIGl0ZXJhdGlvbnMgcHJvZHVjZSB1bmlxdWUga2V5cyBpbiBleHRyYWN0ZWRSZXN1bHRzLlxuICAgKi9cbiAgcHJpdmF0ZSBnZXRTdGFnZVBhdGgobm9kZTogU3RhZ2VOb2RlLCBicmFuY2hQYXRoPzogc3RyaW5nLCBjb250ZXh0U3RhZ2VOYW1lPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBiYXNlTmFtZSA9IG5vZGUuaWQgPz8gbm9kZS5uYW1lO1xuICAgIC8vIFVzZSBjb250ZXh0U3RhZ2VOYW1lIG9ubHkgd2hlbiBpdCBpbmRpY2F0ZXMgYW4gaXRlcmF0aW9uIChkaWZmZXJzIGZyb20gYmFzZSBub2RlLm5hbWUpLlxuICAgIC8vIFdIWTogRHVyaW5nIGxvb3AgaXRlcmF0aW9ucywgTG9vcEhhbmRsZXIgY3JlYXRlcyBhIFN0YWdlQ29udGV4dCB3aXRoIGFuIGl0ZXJhdGVkIG5hbWVcbiAgICAvLyAoZS5nLiwgXCJDYWxsTExNLjFcIiksIGJ1dCB0aGUgbm9kZSBvYmplY3Qgc3RpbGwgaGFzIHRoZSBiYXNlIG5hbWUgKFwiQ2FsbExMTVwiKS5cbiAgICAvLyBGb3Igbm9uLWl0ZXJhdGVkIHN0YWdlcywgd2UgcHJlZmVyIG5vZGUuaWQgKHN0YWJsZSBpZGVudGlmaWVyKSBvdmVyIG5vZGUubmFtZS5cbiAgICBjb25zdCBub2RlSWQgPSAoY29udGV4dFN0YWdlTmFtZSAmJiBjb250ZXh0U3RhZ2VOYW1lICE9PSBub2RlLm5hbWUpID8gY29udGV4dFN0YWdlTmFtZSA6IGJhc2VOYW1lO1xuICAgIGlmICghYnJhbmNoUGF0aCkgcmV0dXJuIG5vZGVJZDtcbiAgICByZXR1cm4gYCR7YnJhbmNoUGF0aH0uJHtub2RlSWR9YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBdXRvLXJlZ2lzdGVyIGEgZHluYW1pYyBzdWJmbG93IGRlZmluaXRpb24gaW4gdGhlIHN1YmZsb3dzIGRpY3Rpb25hcnkuXG4gICAqXG4gICAqIFdIWTogV2hlbiBhIHN0YWdlIHJldHVybnMgYSBkeW5hbWljIFN0YWdlTm9kZSB3aXRoIGBzdWJmbG93RGVmYCwgdGhlXG4gICAqIGNvbXBpbGVkIEZsb3dDaGFydCBuZWVkcyB0byBiZSByZWdpc3RlcmVkIHNvIFN1YmZsb3dFeGVjdXRvciBhbmRcbiAgICogTm9kZVJlc29sdmVyIGNhbiByZXNvbHZlIGl0LiBUaGlzIG1ldGhvZCBoYW5kbGVzIHRoZSByZWdpc3RyYXRpb24sXG4gICAqIHN0YWdlTWFwIG1lcmdpbmcsIGFuZCBoYW5kbGVyIGNvbnRleHQgdXBkYXRlcy5cbiAgICpcbiAgICogREVTSUdOOiBGaXJzdC13cml0ZS13aW5zIOKAlCBleGlzdGluZyBkZWZpbml0aW9ucyBhcmUgcHJlc2VydmVkLlxuICAgKiBTdGFnZU1hcCBlbnRyaWVzIGZyb20gdGhlIHN1YmZsb3cgYXJlIG1lcmdlZCAocGFyZW50IGVudHJpZXMgcHJlc2VydmVkKS5cbiAgICogSGFuZGxlciBjb250ZXh0cyBhcmUgdXBkYXRlZCBpZiB0aGUgc3ViZmxvd3MgZGljdGlvbmFyeSB3YXMganVzdCBjcmVhdGVkLlxuICAgKlxuICAgKiBAcGFyYW0gc3ViZmxvd0lkIC0gVGhlIHN1YmZsb3cgSUQgdG8gcmVnaXN0ZXIgdW5kZXJcbiAgICogQHBhcmFtIHN1YmZsb3dEZWYgLSBUaGUgY29tcGlsZWQgRmxvd0NoYXJ0IGRlZmluaXRpb25cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogZHluYW1pYy1zdWJmbG93LXN1cHBvcnQgMi4xLCAyLjIsIDIuMywgMi40LCAyLjVfXG4gICAqL1xuICBwcml2YXRlIGF1dG9SZWdpc3RlclN1YmZsb3dEZWYoXG4gICAgc3ViZmxvd0lkOiBzdHJpbmcsXG4gICAgc3ViZmxvd0RlZjogTm9uTnVsbGFibGU8U3RhZ2VOb2RlWydzdWJmbG93RGVmJ10+LFxuICAgIG1vdW50Tm9kZUlkPzogc3RyaW5nLFxuICApOiB2b2lkIHtcbiAgICBsZXQgc3ViZmxvd3NEaWN0ID0gdGhpcy5zdWJmbG93cyBhcyBSZWNvcmQ8c3RyaW5nLCB7IHJvb3Q6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+IH0+IHwgdW5kZWZpbmVkO1xuICAgIGlmICghc3ViZmxvd3NEaWN0KSB7XG4gICAgICBzdWJmbG93c0RpY3QgPSB7fTtcbiAgICAgICh0aGlzIGFzIGFueSkuc3ViZmxvd3MgPSBzdWJmbG93c0RpY3Q7XG4gICAgICAvLyBVcGRhdGUgYWxsIGhhbmRsZXIgY29udGV4dHMgdG8gc2VlIHRoZSBuZXcgZGljdGlvbmFyeVxuICAgICAgKHRoaXMubm9kZVJlc29sdmVyIGFzIGFueSkuY3R4LnN1YmZsb3dzID0gc3ViZmxvd3NEaWN0O1xuICAgICAgKHRoaXMuc3ViZmxvd0V4ZWN1dG9yIGFzIGFueSkuY3R4LnN1YmZsb3dzID0gc3ViZmxvd3NEaWN0O1xuICAgICAgKHRoaXMuY2hpbGRyZW5FeGVjdXRvciBhcyBhbnkpLmN0eC5zdWJmbG93cyA9IHN1YmZsb3dzRGljdDtcbiAgICB9XG5cbiAgICAvLyBGaXJzdC13cml0ZS13aW5zXG4gICAgaWYgKCFzdWJmbG93c0RpY3Rbc3ViZmxvd0lkXSkge1xuICAgICAgc3ViZmxvd3NEaWN0W3N1YmZsb3dJZF0gPSB7XG4gICAgICAgIHJvb3Q6IHN1YmZsb3dEZWYucm9vdCBhcyBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICAgICAgLi4uKHN1YmZsb3dEZWYuYnVpbGRUaW1lU3RydWN0dXJlXG4gICAgICAgICAgPyB7IGJ1aWxkVGltZVN0cnVjdHVyZTogc3ViZmxvd0RlZi5idWlsZFRpbWVTdHJ1Y3R1cmUgfVxuICAgICAgICAgIDoge30pLFxuICAgICAgfSBhcyBhbnk7XG4gICAgfVxuXG4gICAgLy8gTWVyZ2Ugc3RhZ2VNYXAgZW50cmllcyAocGFyZW50IGVudHJpZXMgcHJlc2VydmVkKVxuICAgIGlmIChzdWJmbG93RGVmLnN0YWdlTWFwKSB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIGZuXSBvZiBzdWJmbG93RGVmLnN0YWdlTWFwLmVudHJpZXMoKSkge1xuICAgICAgICBpZiAoIXRoaXMuc3RhZ2VNYXAuaGFzKGtleSkpIHtcbiAgICAgICAgICB0aGlzLnN0YWdlTWFwLnNldChrZXksIGZuIGFzIFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE1lcmdlIG5lc3RlZCBzdWJmbG93c1xuICAgIGlmIChzdWJmbG93RGVmLnN1YmZsb3dzKSB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIGRlZl0gb2YgT2JqZWN0LmVudHJpZXMoc3ViZmxvd0RlZi5zdWJmbG93cykpIHtcbiAgICAgICAgaWYgKCFzdWJmbG93c0RpY3Rba2V5XSkge1xuICAgICAgICAgIHN1YmZsb3dzRGljdFtrZXldID0gZGVmIGFzIHsgcm9vdDogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBydW50aW1lIHBpcGVsaW5lIHN0cnVjdHVyZSB3aXRoIGR5bmFtaWMgc3ViZmxvd1xuICAgIC8vIF9SZXF1aXJlbWVudHM6IHJ1bnRpbWUtcGlwZWxpbmUtc3RydWN0dXJlIDMuMV9cbiAgICBpZiAobW91bnROb2RlSWQpIHtcbiAgICAgIHRoaXMudXBkYXRlU3RydWN0dXJlV2l0aER5bmFtaWNTdWJmbG93KFxuICAgICAgICBtb3VudE5vZGVJZCxcbiAgICAgICAgc3ViZmxvd0lkLFxuICAgICAgICBzdWJmbG93RGVmLnJvb3Q/LnN1YmZsb3dOYW1lIHx8IHN1YmZsb3dEZWYucm9vdD8uZGlzcGxheU5hbWUsXG4gICAgICAgIHN1YmZsb3dEZWYuYnVpbGRUaW1lU3RydWN0dXJlLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgSW50cm9zcGVjdGlvbiBoZWxwZXJzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gIC8qKiBSZXR1cm5zIHRoZSBmdWxsIGNvbnRleHQgdHJlZSAoZ2xvYmFsICsgc3RhZ2UgY29udGV4dHMpIGZvciBvYnNlcnZhYmlsaXR5IHBhbmVscy4gKi9cbiAgZ2V0Q29udGV4dFRyZWUoKTogUnVudGltZVNuYXBzaG90IHtcbiAgICByZXR1cm4gdGhpcy5waXBlbGluZVJ1bnRpbWUuZ2V0U25hcHNob3QoKTtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIHRoZSBQaXBlbGluZVJ1bnRpbWUgKHJvb3QgaG9sZGVyIG9mIFN0YWdlQ29udGV4dHMpLiAqL1xuICBnZXRDb250ZXh0KCk6IFBpcGVsaW5lUnVudGltZSB7XG4gICAgcmV0dXJuIHRoaXMucGlwZWxpbmVSdW50aW1lO1xuICB9XG5cbiAgLyoqIFNldHMgYSByb290IG9iamVjdCB2YWx1ZSBpbnRvIHRoZSBnbG9iYWwgY29udGV4dCAodXRpbGl0eSkuICovXG4gIHNldFJvb3RPYmplY3QocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHRoaXMucGlwZWxpbmVSdW50aW1lLnNldFJvb3RPYmplY3QocGF0aCwga2V5LCB2YWx1ZSk7XG4gIH1cblxuICAvKiogUmV0dXJucyBwaXBlbGluZSBpZHMgaW5oZXJpdGVkIHVuZGVyIHRoaXMgcm9vdCAoZm9yIGRlYnVnZ2luZyBmYW4tb3V0KS4gKi9cbiAgZ2V0SW5oZXJpdGVkUGlwZWxpbmVzKCkge1xuICAgIHJldHVybiB0aGlzLnBpcGVsaW5lUnVudGltZS5nZXRQaXBlbGluZXMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHBpcGVsaW5lIHJvb3Qgbm9kZSAoaW5jbHVkaW5nIHJ1bnRpbWUgbW9kaWZpY2F0aW9ucykuXG4gICAqIFxuICAgKiBUaGlzIGlzIHVzZWZ1bCBmb3Igc2VyaWFsaXppbmcgdGhlIHBpcGVsaW5lIHN0cnVjdHVyZSBhZnRlciBleGVjdXRpb24sXG4gICAqIHdoaWNoIGluY2x1ZGVzIGFueSBkeW5hbWljIGNoaWxkcmVuIG9yIGxvb3AgdGFyZ2V0cyBhZGRlZCBhdCBydW50aW1lXG4gICAqIGJ5IHN0YWdlcyB0aGF0IHJldHVybiBTdGFnZU5vZGUuXG4gICAqIFxuICAgKiBAcmV0dXJucyBUaGUgcm9vdCBTdGFnZU5vZGUgd2l0aCBydW50aW1lIG1vZGlmaWNhdGlvbnNcbiAgICovXG4gIGdldFJ1bnRpbWVSb290KCk6IFN0YWdlTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMucm9vdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjb2xsZWN0ZWQgU3ViZmxvd1Jlc3VsdHNNYXAgYWZ0ZXIgcGlwZWxpbmUgZXhlY3V0aW9uLlxuICAgKiBVc2VkIGJ5IHRoZSBzZXJ2aWNlIGxheWVyIHRvIGluY2x1ZGUgc3ViZmxvdyBkYXRhIGluIEFQSSByZXNwb25zZXMuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDQuM19cbiAgICovXG4gIGdldFN1YmZsb3dSZXN1bHRzKCk6IE1hcDxzdHJpbmcsIFN1YmZsb3dSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5zdWJmbG93UmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjb2xsZWN0ZWQgZXh0cmFjdGVkIHJlc3VsdHMgYWZ0ZXIgcGlwZWxpbmUgZXhlY3V0aW9uLlxuICAgKiBNYXAga2V5cyBhcmUgc3RhZ2UgcGF0aHMgKGUuZy4sIFwicm9vdC5jaGlsZC5ncmFuZGNoaWxkXCIpLlxuICAgKi9cbiAgZ2V0RXh0cmFjdGVkUmVzdWx0czxUUmVzdWx0ID0gdW5rbm93bj4oKTogTWFwPHN0cmluZywgVFJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmV4dHJhY3RlZFJlc3VsdHMgYXMgTWFwPHN0cmluZywgVFJlc3VsdD47XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhbnkgZXJyb3JzIHRoYXQgb2NjdXJyZWQgZHVyaW5nIGV4dHJhY3Rpb24uXG4gICAqIFVzZWZ1bCBmb3IgZGVidWdnaW5nIGV4dHJhY3RvciBpc3N1ZXMuXG4gICAqL1xuICBnZXRFeHRyYWN0b3JFcnJvcnMoKTogRXh0cmFjdG9yRXJyb3JbXSB7XG4gICAgcmV0dXJuIHRoaXMuZXh0cmFjdG9yRXJyb3JzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG5hcnJhdGl2ZSBzZW50ZW5jZXMgZnJvbSB0aGUgY3VycmVudCBleGVjdXRpb24uXG4gICAqXG4gICAqIFdIWTogRGVsZWdhdGVzIHRvIHRoZSBuYXJyYXRpdmUgZ2VuZXJhdG9yJ3MgZ2V0U2VudGVuY2VzKCkgbWV0aG9kLlxuICAgKiBXaGVuIG5hcnJhdGl2ZSBpcyBkaXNhYmxlZCAoTnVsbE5hcnJhdGl2ZUdlbmVyYXRvciksIHJldHVybnMgYW4gZW1wdHkgYXJyYXkuXG4gICAqIFdoZW4gZW5hYmxlZCwgcmV0dXJucyB0aGUgb3JkZXJlZCBhcnJheSBvZiBodW1hbi1yZWFkYWJsZSBzZW50ZW5jZXNcbiAgICogcHJvZHVjZWQgZHVyaW5nIHRyYXZlcnNhbC5cbiAgICpcbiAgICogQHJldHVybnMgT3JkZXJlZCBhcnJheSBvZiBuYXJyYXRpdmUgc2VudGVuY2VzLCBvciBlbXB0eSBhcnJheSBpZiBkaXNhYmxlZFxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiAxLjIsIDEuMywgMi4xX1xuICAgKi9cbiAgZ2V0TmFycmF0aXZlKCk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gdGhpcy5uYXJyYXRpdmVHZW5lcmF0b3IuZ2V0U2VudGVuY2VzKCk7XG4gIH1cbn1cbiJdfQ==