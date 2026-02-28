"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.specToStageNode = exports.flowChart = exports.FlowChartBuilder = exports.SelectorList = exports.DeciderList = void 0;
const FlowChartExecutor_1 = require("../executor/FlowChartExecutor");
/* ============================================================================
 * Internal helpers
 * ========================================================================== */
const fail = (msg) => {
    throw new Error(`[FlowChartBuilder] ${msg}`);
};
/* ============================================================================
 * DeciderList (simplified - no build callbacks)
 * ========================================================================== */
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
class DeciderList {
    constructor(builder, curNode, curSpec, decider, isScopeBased = false, parentDescriptionParts = [], parentStageDescriptions = new Map(), reservedStepNumber = 0, deciderDescription) {
        this.branchIds = new Set();
        /** Collected branch info for description accumulation at end() */
        this.branchDescInfo = [];
        this.b = builder;
        this.curNode = curNode;
        this.curSpec = curSpec;
        this.originalDecider = decider;
        this.isScopeBased = isScopeBased;
        this.parentDescriptionParts = parentDescriptionParts;
        this.parentStageDescriptions = parentStageDescriptions;
        this.reservedStepNumber = reservedStepNumber;
        this.deciderDescription = deciderDescription;
    }
    /**
     * Add a simple function branch (no nested flowchart).
     * REMOVED: build callback parameter
     * _Requirements: flowchart-builder-simplification 2.1_
     */
    addFunctionBranch(id, name, fn, displayName, description) {
        if (this.branchIds.has(id))
            fail(`duplicate decider branch id '${id}' under '${this.curNode.name}'`);
        this.branchIds.add(id);
        // Create StageNode directly
        const node = { name: name !== null && name !== void 0 ? name : id };
        if (id)
            node.id = id;
        if (displayName)
            node.displayName = displayName;
        if (description)
            node.description = description;
        if (fn) {
            node.fn = fn;
            this.b._addToMap(name, fn);
        }
        // Create SerializedPipelineStructure with type='stage' and apply extractor
        let spec = { name: name !== null && name !== void 0 ? name : id, type: 'stage' };
        if (id)
            spec.id = id;
        if (displayName)
            spec.displayName = displayName;
        if (description)
            spec.description = description;
        // Apply extractor immediately
        spec = this.b._applyExtractorToNode(spec);
        // Add to parent's children
        this.curNode.children = this.curNode.children || [];
        this.curNode.children.push(node);
        this.curSpec.children = this.curSpec.children || [];
        this.curSpec.children.push(spec);
        // Track branch info for description accumulation at end()
        this.branchDescInfo.push({ id, displayName, description });
        return this;
    }
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
    addSubFlowChartBranch(id, subflow, mountName, options) {
        if (this.branchIds.has(id))
            fail(`duplicate decider branch id '${id}' under '${this.curNode.name}'`);
        this.branchIds.add(id);
        const displayName = mountName || id;
        // Namespace the subflow's stage names with mount id to prevent collisions
        const prefixedRoot = this.b._prefixNodeTree(subflow.root, id);
        // Register subflow definition with prefixed root
        if (!this.b._subflowDefs.has(id)) {
            this.b._subflowDefs.set(id, { root: prefixedRoot });
        }
        // Create reference StageNode
        const node = {
            name: displayName,
            id,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
        };
        // Store subflowMountOptions if provided
        if (options) {
            node.subflowMountOptions = options;
        }
        // Create a WRAPPER spec for the subflow mount point.
        // CRITICAL: We do NOT spread subflow.buildTimeStructure here!
        // Instead, we store the subflow's structure in `subflowStructure` property.
        // This preserves the subflow's first stage ID and creates a clear boundary.
        const spec = {
            name: displayName,
            type: 'stage',
            id,
            displayName,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
            // Store the COMPLETE subflow structure for drill-down visualization
            subflowStructure: subflow.buildTimeStructure,
        };
        // Add to parent's children
        this.curNode.children = this.curNode.children || [];
        this.curNode.children.push(node);
        this.curSpec.children = this.curSpec.children || [];
        this.curSpec.children.push(spec);
        // Merge stage maps with namespace prefix
        this.b._mergeStageMap(subflow.stageMap, id);
        // Merge nested subflows with namespace prefix
        if (subflow.subflows) {
            for (const [key, def] of Object.entries(subflow.subflows)) {
                const prefixedKey = `${id}/${key}`;
                if (!this.b._subflowDefs.has(prefixedKey)) {
                    this.b._subflowDefs.set(prefixedKey, {
                        root: this.b._prefixNodeTree(def.root, id),
                    });
                }
            }
        }
        return this;
    }
    /**
     * Add multiple simple branches.
     * REMOVED: build callback in branch spec
     * _Requirements: flowchart-builder-simplification 2.3_
     */
    addBranchList(branches) {
        for (const { id, name, fn, displayName } of branches) {
            this.addFunctionBranch(id, name, fn, displayName);
        }
        return this;
    }
    /**
     * Set default branch id.
     */
    setDefault(id) {
        this.defaultId = id;
        return this;
    }
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
    end() {
        const children = this.curNode.children;
        if (!children || children.length === 0) {
            throw new Error(`[FlowChartBuilder] decider at '${this.curNode.name}' requires at least one branch`);
        }
        if (this.isScopeBased) {
            // Scope-based: mark node's fn as the decider, don't set nextNodeDecider.
            // The fn receives (scope, breakFn) and returns a branch ID string.
            // Pipeline/DeciderHandler will use the deciderFn flag to route to the
            // scope-based execution path.
            // _Requirements: decider-first-class-stage 5.1_
            this.curNode.deciderFn = true;
        }
        else {
            // Legacy: wrap decider with default handling, set nextNodeDecider
            const validIds = new Set(children.map((c) => c.id));
            const fallbackId = this.defaultId;
            this.curNode.nextNodeDecider = async (out) => {
                const raw = this.originalDecider(out);
                const id = raw instanceof Promise ? await raw : raw;
                if (id && validIds.has(id))
                    return id;
                if (fallbackId && validIds.has(fallbackId))
                    return fallbackId;
                return id;
            };
        }
        // Common: set branchIds and type on spec
        this.curSpec.branchIds = children
            .map((c) => c.id)
            .filter((id) => typeof id === 'string' && id.length > 0);
        // Set type to 'decider' now that we know it has branches
        this.curSpec.type = 'decider';
        // Accumulate description lines for the decider and its branches
        if (this.reservedStepNumber > 0) {
            const deciderLabel = this.curNode.displayName || this.curNode.name;
            const branchIdList = this.branchDescInfo.map((b) => b.id).join(', ');
            const mainLine = this.deciderDescription
                ? `${this.reservedStepNumber}. ${deciderLabel} — ${this.deciderDescription}`
                : `${this.reservedStepNumber}. ${deciderLabel} — Decides between: ${branchIdList}`;
            this.parentDescriptionParts.push(mainLine);
            if (this.deciderDescription) {
                this.parentStageDescriptions.set(this.curNode.name, this.deciderDescription);
            }
            // Append arrow lines for each branch
            for (const branch of this.branchDescInfo) {
                const branchText = branch.description || branch.displayName;
                if (branchText) {
                    this.parentDescriptionParts.push(`   → ${branch.id}: ${branchText}`);
                }
                // Store individual branch descriptions
                if (branch.description) {
                    this.parentStageDescriptions.set(branch.id, branch.description);
                }
            }
        }
        return this.b;
    }
}
exports.DeciderList = DeciderList;
/* ============================================================================
 * SelectorList (simplified - no build callbacks)
 * ========================================================================== */
/**
 * Fluent helper returned by addSelector to add branches.
 * _Requirements: flowchart-builder-simplification 6.5_
 */
class SelectorList {
    constructor(builder, curNode, curSpec, selector, parentDescriptionParts = [], parentStageDescriptions = new Map(), reservedStepNumber = 0) {
        this.branchIds = new Set();
        /** Collected branch info for description accumulation at end() */
        this.branchDescInfo = [];
        this.b = builder;
        this.curNode = curNode;
        this.curSpec = curSpec;
        this.originalSelector = selector;
        this.parentDescriptionParts = parentDescriptionParts;
        this.parentStageDescriptions = parentStageDescriptions;
        this.reservedStepNumber = reservedStepNumber;
    }
    /**
     * Add a simple function branch (no nested flowchart).
     */
    addFunctionBranch(id, name, fn, displayName, description) {
        if (this.branchIds.has(id))
            fail(`duplicate selector branch id '${id}' under '${this.curNode.name}'`);
        this.branchIds.add(id);
        // Create StageNode directly
        const node = { name: name !== null && name !== void 0 ? name : id };
        if (id)
            node.id = id;
        if (displayName)
            node.displayName = displayName;
        if (description)
            node.description = description;
        if (fn) {
            node.fn = fn;
            this.b._addToMap(name, fn);
        }
        // Create SerializedPipelineStructure with type='stage' and apply extractor
        let spec = { name: name !== null && name !== void 0 ? name : id, type: 'stage' };
        if (id)
            spec.id = id;
        if (displayName)
            spec.displayName = displayName;
        if (description)
            spec.description = description;
        // Apply extractor immediately
        spec = this.b._applyExtractorToNode(spec);
        // Add to parent's children
        this.curNode.children = this.curNode.children || [];
        this.curNode.children.push(node);
        this.curSpec.children = this.curSpec.children || [];
        this.curSpec.children.push(spec);
        // Track branch info for description accumulation at end()
        this.branchDescInfo.push({ id, displayName, description });
        return this;
    }
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
    addSubFlowChartBranch(id, subflow, mountName, options) {
        if (this.branchIds.has(id))
            fail(`duplicate selector branch id '${id}' under '${this.curNode.name}'`);
        this.branchIds.add(id);
        const displayName = mountName || id;
        // Namespace the subflow's stage names with mount id to prevent collisions
        const prefixedRoot = this.b._prefixNodeTree(subflow.root, id);
        // Register subflow definition with prefixed root
        if (!this.b._subflowDefs.has(id)) {
            this.b._subflowDefs.set(id, { root: prefixedRoot });
        }
        // Create reference StageNode
        const node = {
            name: displayName,
            id,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
        };
        // Store subflowMountOptions if provided
        if (options) {
            node.subflowMountOptions = options;
        }
        // Create a WRAPPER spec for the subflow mount point.
        // CRITICAL: We do NOT spread subflow.buildTimeStructure here!
        // Instead, we store the subflow's structure in `subflowStructure` property.
        // This preserves the subflow's first stage ID and creates a clear boundary.
        const spec = {
            name: displayName,
            type: 'stage',
            id,
            displayName,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
            // Store the COMPLETE subflow structure for drill-down visualization
            subflowStructure: subflow.buildTimeStructure,
        };
        // Add to parent's children
        this.curNode.children = this.curNode.children || [];
        this.curNode.children.push(node);
        this.curSpec.children = this.curSpec.children || [];
        this.curSpec.children.push(spec);
        // Merge stage maps with namespace prefix
        this.b._mergeStageMap(subflow.stageMap, id);
        // Merge nested subflows with namespace prefix
        if (subflow.subflows) {
            for (const [key, def] of Object.entries(subflow.subflows)) {
                const prefixedKey = `${id}/${key}`;
                if (!this.b._subflowDefs.has(prefixedKey)) {
                    this.b._subflowDefs.set(prefixedKey, {
                        root: this.b._prefixNodeTree(def.root, id),
                    });
                }
            }
        }
        return this;
    }
    /**
     * Add multiple simple branches.
     */
    addBranchList(branches) {
        for (const { id, name, fn, displayName } of branches) {
            this.addFunctionBranch(id, name, fn, displayName);
        }
        return this;
    }
    /**
     * Finalize the selector and return to main builder.
     */
    end() {
        const children = this.curNode.children;
        if (!children || children.length === 0) {
            throw new Error(`[FlowChartBuilder] selector at '${this.curNode.name}' requires at least one branch`);
        }
        // Store selector directly
        this.curNode.nextNodeSelector = this.originalSelector;
        // Update branch IDs in spec
        this.curSpec.branchIds = children
            .map((c) => c.id)
            .filter((id) => typeof id === 'string' && id.length > 0);
        // Set type to 'decider' now that we know it has branches
        this.curSpec.type = 'decider';
        // Accumulate description lines for the selector and its branches
        if (this.reservedStepNumber > 0) {
            const selectorLabel = this.curNode.displayName || this.curNode.name;
            const branchIdList = this.branchDescInfo.map((b) => b.id).join(', ');
            const mainLine = `${this.reservedStepNumber}. ${selectorLabel} — Selects from: ${branchIdList}`;
            this.parentDescriptionParts.push(mainLine);
            // Append arrow lines for each branch
            for (const branch of this.branchDescInfo) {
                const branchText = branch.description || branch.displayName;
                if (branchText) {
                    this.parentDescriptionParts.push(`   → ${branch.id}: ${branchText}`);
                }
                // Store individual branch descriptions
                if (branch.description) {
                    this.parentStageDescriptions.set(branch.id, branch.description);
                }
            }
        }
        return this.b;
    }
}
exports.SelectorList = SelectorList;
/* ============================================================================
 * FlowChartBuilder (simplified)
 * ========================================================================== */
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
class FlowChartBuilder {
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
    _appendDescriptionLine(displayName, name, description) {
        this._stepCounter++;
        this._stageStepMap.set(name, this._stepCounter);
        const label = displayName || name;
        const line = description
            ? `${this._stepCounter}. ${label} — ${description}`
            : `${this._stepCounter}. ${label}`;
        this._descriptionParts.push(line);
        if (description) {
            this._stageDescriptions.set(name, description);
        }
    }
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
    setEnableNarrative() {
        this._enableNarrative = true;
        return this;
    }
    /**
     * Create a new FlowChartBuilder.
     * @param buildTimeExtractor Optional extractor to apply to each node as it's created.
     *                           Pass this in the constructor to ensure it's applied to ALL nodes.
     * _Requirements: incremental-type-computation 3.2_
     */
    constructor(buildTimeExtractor) {
        // Stage function registry
        this._stageMap = new Map();
        // Subflow definitions (for reference-based mounting)
        this._subflowDefs = new Map();
        // Stream handlers
        this._streamHandlers = {};
        this._buildTimeExtractorErrors = [];
        /**
         * Whether narrative generation is enabled at build time.
         *
         * WHY: Stored as a field so setEnableNarrative() or execute(opts) can set it
         * before build() is called. build() includes it in the FlowChart object.
         *
         * _Requirements: pipeline-narrative-generation 1.4_
         */
        this._enableNarrative = false;
        /* ── Description accumulator fields ── */
        /** Accumulated description lines, built incrementally as stages are added. */
        this._descriptionParts = [];
        /** Current step number for description numbering. */
        this._stepCounter = 0;
        /** Map of stage name → individual description for UI tooltips. */
        this._stageDescriptions = new Map();
        /** Map of stage name → step number for loopTo step-number lookup. */
        this._stageStepMap = new Map();
        if (buildTimeExtractor) {
            this._buildTimeExtractor = buildTimeExtractor;
        }
    }
    /* ─────────────────────────── Linear Chaining API ─────────────────────────── */
    /**
     * Define the root function of the flow.
     * _Requirements: flowchart-builder-simplification 4.1, 5.1_
     * _Requirements: incremental-type-computation 1.1_
     */
    start(name, fn, id, displayName, description) {
        if (this._root)
            fail('root already defined; create a new builder');
        // Create StageNode directly
        const node = { name };
        if (id)
            node.id = id;
        if (displayName)
            node.displayName = displayName;
        if (description)
            node.description = description;
        if (fn) {
            node.fn = fn;
            this._addToMap(name, fn);
        }
        // Create SerializedPipelineStructure with type='stage' and apply extractor
        let spec = { name, type: 'stage' };
        if (id)
            spec.id = id;
        if (displayName)
            spec.displayName = displayName;
        if (description)
            spec.description = description;
        // Apply extractor immediately
        spec = this._applyExtractorToNode(spec);
        this._root = node;
        this._rootSpec = spec;
        this._cursor = node;
        this._cursorSpec = spec;
        // Accumulate description line
        this._appendDescriptionLine(displayName || name, name, description);
        return this;
    }
    /**
     * Append a linear "next" function and move to it.
     * _Requirements: flowchart-builder-simplification 4.2, 5.2_
     * _Requirements: incremental-type-computation 1.2_
     */
    addFunction(name, fn, id, displayName, description) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        // Create StageNode directly
        const node = { name };
        if (id)
            node.id = id;
        if (displayName)
            node.displayName = displayName;
        if (description)
            node.description = description;
        if (fn) {
            node.fn = fn;
            this._addToMap(name, fn);
        }
        // Create SerializedPipelineStructure with type='stage' and apply extractor
        let spec = { name, type: 'stage' };
        if (id)
            spec.id = id;
        if (displayName)
            spec.displayName = displayName;
        if (description)
            spec.description = description;
        // Apply extractor immediately
        spec = this._applyExtractorToNode(spec);
        // Link to current node
        cur.next = node;
        curSpec.next = spec;
        // Move cursor
        this._cursor = node;
        this._cursorSpec = spec;
        // Accumulate description line
        this._appendDescriptionLine(displayName || name, name, description);
        return this;
    }
    /**
     * Add a streaming function.
     * _Requirements: flowchart-builder-simplification 5.3_
     * _Requirements: incremental-type-computation 1.3_
     */
    addStreamingFunction(name, streamId, fn, id, displayName, description) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        // Create StageNode directly with streaming properties
        const node = {
            name,
            isStreaming: true,
            streamId: streamId !== null && streamId !== void 0 ? streamId : name,
        };
        if (id)
            node.id = id;
        if (displayName)
            node.displayName = displayName;
        if (description)
            node.description = description;
        if (fn) {
            node.fn = fn;
            this._addToMap(name, fn);
        }
        // Create SerializedPipelineStructure with type='streaming' and apply extractor
        let spec = {
            name,
            type: 'streaming',
            isStreaming: true,
            streamId: streamId !== null && streamId !== void 0 ? streamId : name,
        };
        if (id)
            spec.id = id;
        if (displayName)
            spec.displayName = displayName;
        if (description)
            spec.description = description;
        // Apply extractor immediately
        spec = this._applyExtractorToNode(spec);
        // Link to current node
        cur.next = node;
        curSpec.next = spec;
        // Move cursor
        this._cursor = node;
        this._cursorSpec = spec;
        // Accumulate description line
        this._appendDescriptionLine(displayName || name, name, description);
        return this;
    }
    /* ─────────────────────────── Branching API ─────────────────────────── */
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
    addDecider(decider) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        if (cur.nextNodeDecider)
            fail(`decider already defined at '${cur.name}'`);
        if (cur.deciderFn)
            fail(`decider already defined at '${cur.name}'`);
        if (cur.nextNodeSelector)
            fail(`decider and selector are mutually exclusive at '${cur.name}'`);
        // Mark as decider in spec (type will be set to 'decider' in DeciderList.end())
        curSpec.hasDecider = true;
        // Reserve a step number for the decider — the full description line
        // (including branch names) is deferred to DeciderList.end()
        this._stepCounter++;
        this._stageStepMap.set(cur.name, this._stepCounter);
        return new DeciderList(this, cur, curSpec, decider, false, this._descriptionParts, this._stageDescriptions, this._stepCounter);
    }
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
    addDeciderFunction(name, fn, id, displayName, description) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        if (cur.nextNodeDecider)
            fail(`decider already defined at '${cur.name}'`);
        if (cur.deciderFn)
            fail(`decider already defined at '${cur.name}'`);
        if (cur.nextNodeSelector)
            fail(`decider and selector are mutually exclusive at '${cur.name}'`);
        // Create StageNode with the decider function as the stage function
        const node = { name };
        if (id)
            node.id = id;
        if (displayName)
            node.displayName = displayName;
        if (description)
            node.description = description;
        node.fn = fn;
        // Register fn in stageMap so Pipeline can resolve it during execution
        // _Requirements: decider-first-class-stage 1.3_
        this._addToMap(name, fn);
        // Create SerializedPipelineStructure with hasDecider: true
        // Type will be set to 'decider' in DeciderList.end()
        // _Requirements: decider-first-class-stage 6.1_
        let spec = { name, type: 'stage', hasDecider: true };
        if (id)
            spec.id = id;
        if (displayName)
            spec.displayName = displayName;
        if (description)
            spec.description = description;
        // Apply build-time extractor to the node
        // _Requirements: decider-first-class-stage 6.3_
        spec = this._applyExtractorToNode(spec);
        // Link to current node as next
        cur.next = node;
        curSpec.next = spec;
        // Move cursor to the new decider node
        this._cursor = node;
        this._cursorSpec = spec;
        // Reserve a step number for the decider — the full description line
        // (including branch names) is deferred to DeciderList.end()
        this._stepCounter++;
        this._stageStepMap.set(name, this._stepCounter);
        // Return DeciderList with isScopeBased = true and decider = null
        // (no legacy decider function — the fn IS the decider)
        // Pass reserved step number and description accumulator references
        // _Requirements: decider-first-class-stage 1.2_
        return new DeciderList(this, node, spec, null, true, this._descriptionParts, this._stageDescriptions, this._stepCounter, description);
    }
    /**
     * Add a selector - returns SelectorList for adding branches.
     * _Requirements: flowchart-builder-simplification 6.5_
     * _Requirements: incremental-type-computation 1.5_
     */
    addSelector(selector) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        if (cur.nextNodeSelector)
            fail(`selector already defined at '${cur.name}'`);
        if (cur.nextNodeDecider)
            fail(`decider and selector are mutually exclusive at '${cur.name}'`);
        // Mark as selector in spec (type will be set to 'decider' in SelectorList.end())
        curSpec.hasSelector = true;
        // Reserve a step number for the selector — the full description line
        // (including branch names) is deferred to SelectorList.end()
        this._stepCounter++;
        this._stageStepMap.set(cur.name, this._stepCounter);
        return new SelectorList(this, cur, curSpec, selector, this._descriptionParts, this._stageDescriptions, this._stepCounter);
    }
    /* ─────────────────────────── Subflow Mounting API ─────────────────────────── */
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
    addSubFlowChart(id, subflow, mountName, options) {
        var _a, _b;
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        if ((_a = cur.children) === null || _a === void 0 ? void 0 : _a.some((c) => c.id === id)) {
            fail(`duplicate child id '${id}' under '${cur.name}'`);
        }
        const displayName = mountName || id;
        const forkId = (_b = cur.id) !== null && _b !== void 0 ? _b : cur.name;
        // Namespace the subflow's stage names with mount id to prevent
        // collisions when multiple subflows share the same stage names
        // (e.g., two SimpleAgents both having "SeedScope").
        const prefixedRoot = this._prefixNodeTree(subflow.root, id);
        // Register subflow definition with prefixed root
        if (!this._subflowDefs.has(id)) {
            this._subflowDefs.set(id, { root: prefixedRoot });
        }
        // Create reference StageNode
        const node = {
            name: displayName,
            id,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
        };
        // Store subflowMountOptions if provided
        if (options) {
            node.subflowMountOptions = options;
        }
        // Create a WRAPPER spec for the subflow mount point.
        // CRITICAL: We do NOT spread subflow.buildTimeStructure here!
        // Instead, we store the subflow's structure in `subflowStructure` property.
        // This preserves the subflow's first stage ID and creates a clear boundary.
        let spec = {
            name: displayName,
            type: 'stage',
            id,
            displayName,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
            isParallelChild: true,
            parallelGroupId: forkId,
            // Store the COMPLETE subflow structure for drill-down visualization
            subflowStructure: subflow.buildTimeStructure,
        };
        // Apply extractor to the reference spec
        spec = this._applyExtractorToNode(spec);
        // Set parent type to 'fork' since it has children
        curSpec.type = 'fork';
        // Add to parent's children
        cur.children = cur.children || [];
        cur.children.push(node);
        curSpec.children = curSpec.children || [];
        curSpec.children.push(spec);
        // Merge stage maps with namespace prefix
        this._mergeStageMap(subflow.stageMap, id);
        // Merge nested subflows with namespace prefix
        if (subflow.subflows) {
            for (const [key, def] of Object.entries(subflow.subflows)) {
                const prefixedKey = `${id}/${key}`;
                if (!this._subflowDefs.has(prefixedKey)) {
                    this._subflowDefs.set(prefixedKey, {
                        root: this._prefixNodeTree(def.root, id),
                    });
                }
            }
        }
        // Accumulate subflow description line
        this._appendSubflowDescription(id, displayName, subflow);
        return this;
    }
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
    addSubFlowChartNext(id, subflow, mountName, options) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        if (cur.next) {
            fail(`cannot add subflow as next when next is already defined at '${cur.name}'`);
        }
        const displayName = mountName || id;
        // Namespace the subflow's stage names with mount id to prevent
        // collisions when multiple subflows share the same stage names.
        const prefixedRoot = this._prefixNodeTree(subflow.root, id);
        // Register subflow definition with prefixed root
        if (!this._subflowDefs.has(id)) {
            this._subflowDefs.set(id, { root: prefixedRoot });
        }
        // Create reference StageNode
        const node = {
            name: displayName,
            id,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
        };
        // Store subflowMountOptions if provided
        if (options) {
            node.subflowMountOptions = options;
        }
        // Create a WRAPPER spec for the subflow mount point.
        // CRITICAL: We do NOT spread subflow.buildTimeStructure here!
        // Instead, we store the subflow's structure in `subflowStructure` property.
        // This preserves the subflow's first stage ID and creates a clear boundary.
        let attachedSpec = {
            name: displayName,
            type: 'stage',
            id,
            displayName,
            isSubflowRoot: true,
            subflowId: id,
            subflowName: displayName,
            // Store the COMPLETE subflow structure for drill-down visualization
            subflowStructure: subflow.buildTimeStructure,
        };
        // Apply extractor to the attached spec
        attachedSpec = this._applyExtractorToNode(attachedSpec);
        // Set as next (linear continuation)
        cur.next = node;
        curSpec.next = attachedSpec;
        // Move cursor to the reference node AND the attached spec.
        // IMPORTANT: We use the SAME attachedSpec object for the cursor so that
        // subsequent addFunction calls will correctly set attachedSpec.next,
        // which is what appears in buildTimeStructure.
        this._cursor = node;
        this._cursorSpec = attachedSpec;
        // Merge stage maps with namespace prefix
        this._mergeStageMap(subflow.stageMap, id);
        // Merge nested subflows with namespace prefix
        if (subflow.subflows) {
            for (const [key, def] of Object.entries(subflow.subflows)) {
                const prefixedKey = `${id}/${key}`;
                if (!this._subflowDefs.has(prefixedKey)) {
                    this._subflowDefs.set(prefixedKey, {
                        root: this._prefixNodeTree(def.root, id),
                    });
                }
            }
        }
        // Accumulate subflow description line
        this._appendSubflowDescription(id, displayName, subflow);
        return this;
    }
    /**
     * Add parallel children (fork) - simplified, no build callbacks.
     * _Requirements: flowchart-builder-simplification 2.2_
     * _Requirements: incremental-type-computation 1.6_
     */
    addListOfFunction(children) {
        var _a, _b;
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        const forkId = (_a = cur.id) !== null && _a !== void 0 ? _a : cur.name;
        // Set parent type to 'fork' since it has children
        curSpec.type = 'fork';
        for (const { id, name, displayName, fn } of children) {
            if (!id)
                fail(`child id required under '${cur.name}'`);
            if ((_b = cur.children) === null || _b === void 0 ? void 0 : _b.some((c) => c.id === id)) {
                fail(`duplicate child id '${id}' under '${cur.name}'`);
            }
            // Create StageNode directly
            const node = { name: name !== null && name !== void 0 ? name : id };
            if (id)
                node.id = id;
            if (displayName)
                node.displayName = displayName;
            if (fn) {
                node.fn = fn;
                this._addToMap(name, fn);
            }
            // Create SerializedPipelineStructure with type='stage' and apply extractor
            let spec = {
                name: name !== null && name !== void 0 ? name : id,
                type: 'stage',
                isParallelChild: true,
                parallelGroupId: forkId,
            };
            if (id)
                spec.id = id;
            if (displayName)
                spec.displayName = displayName;
            // Apply extractor immediately
            spec = this._applyExtractorToNode(spec);
            // Add to parent's children
            cur.children = cur.children || [];
            cur.children.push(node);
            curSpec.children = curSpec.children || [];
            curSpec.children.push(spec);
        }
        // Accumulate parallel description line
        const childNames = children.map((c) => c.displayName || c.name || c.id).join(', ');
        this._stepCounter++;
        this._descriptionParts.push(`${this._stepCounter}. Runs in parallel: ${childNames}`);
        return this;
    }
    /* ─────────────────────────── Loop API ─────────────────────────── */
    /**
     * Set a loop target for the current node.
     * _Requirements: flowchart-builder-simplification 5.6_
     * _Requirements: incremental-type-computation 6.1_
     */
    loopTo(stageId) {
        const cur = this._needCursor();
        const curSpec = this._needCursorSpec();
        if (curSpec.loopTarget)
            fail(`loopTo already defined at '${cur.name}'`);
        if (cur.next)
            fail(`cannot set loopTo when next is already defined at '${cur.name}'`);
        // Set loop target in both structures with type='stage'
        cur.next = { name: stageId, id: stageId };
        curSpec.loopTarget = stageId;
        curSpec.next = { name: stageId, id: stageId, type: 'stage' };
        // Accumulate loop-back description line
        const targetStep = this._stageStepMap.get(stageId);
        if (targetStep !== undefined) {
            this._descriptionParts.push(`→ loops back to step ${targetStep}`);
        }
        else {
            this._descriptionParts.push(`→ loops back to ${stageId}`);
        }
        return this;
    }
    /* ─────────────────────────── Streaming API ─────────────────────────── */
    onStream(handler) {
        this._streamHandlers.onToken = handler;
        return this;
    }
    onStreamStart(handler) {
        this._streamHandlers.onStart = handler;
        return this;
    }
    onStreamEnd(handler) {
        this._streamHandlers.onEnd = handler;
        return this;
    }
    /* ─────────────────────────── Extractor API ─────────────────────────── */
    addTraversalExtractor(extractor) {
        this._extractor = extractor;
        return this;
    }
    addBuildTimeExtractor(extractor) {
        this._buildTimeExtractor = extractor;
        return this;
    }
    getBuildTimeExtractorErrors() {
        return this._buildTimeExtractorErrors;
    }
    /* ─────────────────────────── Output API ─────────────────────────── */
    /**
     * Compile to FlowChart (returns pre-built structures).
     * _Requirements: flowchart-builder-simplification 4.4, 5.7_
     * _Requirements: incremental-type-computation 3.1, 3.3, 3.4_
     */
    build() {
        var _a, _b, _c, _d, _e, _f;
        const root = (_a = this._root) !== null && _a !== void 0 ? _a : fail('empty tree; call start() first');
        const rootSpec = (_b = this._rootSpec) !== null && _b !== void 0 ? _b : fail('empty spec; call start() first');
        // Convert subflow defs map to plain object
        const subflows = {};
        for (const [key, def] of this._subflowDefs) {
            subflows[key] = def;
        }
        // Build the pre-built description string from accumulated parts
        const rootName = (_f = (_d = (_c = this._root) === null || _c === void 0 ? void 0 : _c.displayName) !== null && _d !== void 0 ? _d : (_e = this._root) === null || _e === void 0 ? void 0 : _e.name) !== null && _f !== void 0 ? _f : 'Pipeline';
        const description = this._descriptionParts.length > 0
            ? `Pipeline: ${rootName}\nSteps:\n${this._descriptionParts.join('\n')}`
            : '';
        // Return _rootSpec directly - O(1) instead of O(n)
        // Type computation and extractor application already done incrementally
        return {
            root,
            stageMap: this._stageMap,
            extractor: this._extractor,
            buildTimeStructure: rootSpec,
            ...(Object.keys(subflows).length > 0 ? { subflows } : {}),
            ...(this._enableNarrative ? { enableNarrative: true } : {}),
            description,
            stageDescriptions: new Map(this._stageDescriptions),
        };
    }
    /**
     * Emit pure JSON spec (returns pre-built structure).
     * _Requirements: flowchart-builder-simplification 4.5_
     * _Requirements: incremental-type-computation 3.1_
     */
    toSpec() {
        var _a;
        const rootSpec = (_a = this._rootSpec) !== null && _a !== void 0 ? _a : fail('empty tree; call start() first');
        // Return _rootSpec directly - type computation and extractor already applied incrementally
        return rootSpec;
    }
    /**
     * Convenience: build & execute.
     */
    async execute(scopeFactory, opts) {
        // Set narrative flag before build() so it's included in the FlowChart object.
        // WHY: execute() is a convenience that combines build + run. When the consumer
        // passes enableNarrative in opts, we need to set the builder field before
        // build() serializes it into the FlowChart.
        // _Requirements: pipeline-narrative-generation 1.4_
        if (opts === null || opts === void 0 ? void 0 : opts.enableNarrative) {
            this._enableNarrative = true;
        }
        const flowChart = this.build();
        const executor = new FlowChartExecutor_1.FlowChartExecutor(flowChart, scopeFactory, opts === null || opts === void 0 ? void 0 : opts.defaults, opts === null || opts === void 0 ? void 0 : opts.initial, opts === null || opts === void 0 ? void 0 : opts.readOnly, opts === null || opts === void 0 ? void 0 : opts.throttlingErrorChecker, this._streamHandlers, opts === null || opts === void 0 ? void 0 : opts.scopeProtectionMode);
        return await executor.run();
    }
    /**
     * Mermaid diagram generator.
     */
    toMermaid() {
        var _a;
        const lines = ['flowchart TD'];
        const idOf = (k) => (k || '').replace(/[^a-zA-Z0-9_]/g, '_') || '_';
        const root = (_a = this._root) !== null && _a !== void 0 ? _a : fail('empty tree; call start() first');
        const walk = (n) => {
            var _a, _b, _c;
            const nid = idOf((_a = n.id) !== null && _a !== void 0 ? _a : n.name);
            lines.push(`${nid}["${n.name}"]`);
            for (const c of n.children || []) {
                const cid = idOf((_b = c.id) !== null && _b !== void 0 ? _b : c.name);
                lines.push(`${nid} --> ${cid}`);
                walk(c);
            }
            if (n.next) {
                const mid = idOf((_c = n.next.id) !== null && _c !== void 0 ? _c : n.next.name);
                lines.push(`${nid} --> ${mid}`);
                walk(n.next);
            }
        };
        walk(root);
        return lines.join('\n');
    }
    /* ─────────────────────────── Internals ─────────────────────────── */
    _needCursor() {
        var _a;
        return (_a = this._cursor) !== null && _a !== void 0 ? _a : fail('cursor undefined; call start() first');
    }
    _needCursorSpec() {
        var _a;
        return (_a = this._cursorSpec) !== null && _a !== void 0 ? _a : fail('cursor undefined; call start() first');
    }
    /**
     * Apply build-time extractor to a single node immediately.
     * If no extractor registered, returns spec as-is.
     * _Requirements: incremental-type-computation 3.2_
     */
    _applyExtractorToNode(spec) {
        var _a;
        if (!this._buildTimeExtractor) {
            return spec;
        }
        try {
            return this._buildTimeExtractor(spec);
        }
        catch (error) {
            console.error('[FlowChartBuilder] Build-time extractor error:', error);
            this._buildTimeExtractorErrors.push({
                message: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error),
                error,
            });
            return spec;
        }
    }
    /** Add a function to the shared stageMap; fail on conflicting names. */
    _addToMap(name, fn) {
        if (this._stageMap.has(name)) {
            const existing = this._stageMap.get(name);
            if (existing !== fn)
                fail(`stageMap collision for '${name}'`);
        }
        this._stageMap.set(name, fn);
    }
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
    _mergeStageMap(other, prefix) {
        for (const [k, v] of other) {
            const key = prefix ? `${prefix}/${k}` : k;
            if (this._stageMap.has(key)) {
                const existing = this._stageMap.get(key);
                if (existing !== v)
                    fail(`stageMap collision while mounting flowchart at '${key}'`);
            }
            else {
                this._stageMap.set(key, v);
            }
        }
    }
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
    _prefixNodeTree(node, prefix) {
        if (!node)
            return node;
        const clone = { ...node };
        clone.name = `${prefix}/${node.name}`;
        if (clone.subflowId)
            clone.subflowId = `${prefix}/${clone.subflowId}`;
        if (clone.next)
            clone.next = this._prefixNodeTree(clone.next, prefix);
        if (clone.children) {
            clone.children = clone.children.map((c) => this._prefixNodeTree(c, prefix));
        }
        return clone;
    }
    /**
     * Append a subflow description line to _descriptionParts.
     *
     * WHY: Both addSubFlowChart and addSubFlowChartNext need the same
     * description accumulation logic, so it's extracted here.
     */
    _appendSubflowDescription(id, displayName, subflow) {
        this._stepCounter++;
        this._stageStepMap.set(id, this._stepCounter);
        if (subflow.description) {
            this._descriptionParts.push(`${this._stepCounter}. [Sub-Execution: ${displayName}] — ${subflow.description}`);
            // Indent sub-steps from the subflow's description if it has multi-line Steps:
            const lines = subflow.description.split('\n');
            const stepsIdx = lines.findIndex((l) => l.startsWith('Steps:'));
            if (stepsIdx >= 0) {
                for (let i = stepsIdx + 1; i < lines.length; i++) {
                    if (lines[i].trim()) {
                        this._descriptionParts.push(`   ${lines[i]}`);
                    }
                }
            }
        }
        else {
            this._descriptionParts.push(`${this._stepCounter}. [Sub-Execution: ${displayName}]`);
        }
    }
}
exports.FlowChartBuilder = FlowChartBuilder;
/* ============================================================================
 * Factory Function
 * ========================================================================== */
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
function flowChart(name, fn, id, displayName, buildTimeExtractor, description) {
    return new FlowChartBuilder(buildTimeExtractor).start(name, fn, id, displayName, description);
}
exports.flowChart = flowChart;
/* ============================================================================
 * Spec to StageNode Converter
 * ========================================================================== */
/**
 * Convert a pure JSON FlowChartSpec to a StageNode tree.
 * Used by backends to reconstruct the tree from a spec received from frontend.
 *
 * Note: nextNodeDecider is intentionally omitted - runtime uses your BE decider.
 */
function specToStageNode(spec) {
    const inflate = (s) => {
        var _a;
        return ({
            name: s.name,
            id: s.id,
            children: ((_a = s.children) === null || _a === void 0 ? void 0 : _a.length) ? s.children.map(inflate) : undefined,
            next: s.next ? inflate(s.next) : undefined,
        });
    };
    return inflate(spec);
}
exports.specToStageNode = specToStageNode;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRmxvd0NoYXJ0QnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jb3JlL2J1aWxkZXIvRmxvd0NoYXJ0QnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F5Qkc7OztBQUlILHFFQUFrRTtBQXNMbEU7O2dGQUVnRjtBQUVoRixNQUFNLElBQUksR0FBRyxDQUFDLEdBQVcsRUFBUyxFQUFFO0lBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDL0MsQ0FBQyxDQUFDO0FBWUY7O2dGQUVnRjtBQUVoRjs7Ozs7Ozs7Ozs7Ozs7O0dBZUc7QUFDSCxNQUFhLFdBQVc7SUEyQnRCLFlBQ0UsT0FBdUMsRUFDdkMsT0FBZ0MsRUFDaEMsT0FBb0MsRUFDcEMsT0FBMEQsRUFDMUQsZUFBd0IsS0FBSyxFQUM3Qix5QkFBbUMsRUFBRSxFQUNyQywwQkFBK0MsSUFBSSxHQUFHLEVBQUUsRUFDeEQscUJBQTZCLENBQUMsRUFDOUIsa0JBQTJCO1FBL0JaLGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBbUIvQyxrRUFBa0U7UUFDakQsbUJBQWMsR0FBc0UsRUFBRSxDQUFDO1FBYXRHLElBQUksQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxlQUFlLEdBQUcsT0FBTyxDQUFDO1FBQy9CLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxzQkFBc0IsQ0FBQztRQUNyRCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsdUJBQXVCLENBQUM7UUFDdkQsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDO1FBQzdD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QVMsQ0FDdkIsSUFBWSxFQUNaLEVBQXdDLEVBQ3hDLEVBQVcsRUFDWCxXQUFvQixFQUNwQixrQkFBNEMsRUFDNUMsV0FBb0I7SUFFcEIsT0FBTyxJQUFJLGdCQUFnQixDQUFlLGtCQUFrQixDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUM5RyxDQUFDO0FBVEQsOEJBU0M7QUFHRDs7Z0ZBRWdGO0FBRWhGOzs7OztHQUtHO0FBQ0gsU0FBZ0IsZUFBZSxDQUFDLElBQW1CO0lBQ2pELE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBZ0IsRUFBdUIsRUFBRTs7UUFBQyxPQUFBLENBQUM7WUFDMUQsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO1lBQ1osRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ1IsUUFBUSxFQUFFLENBQUEsTUFBQSxDQUFDLENBQUMsUUFBUSwwQ0FBRSxNQUFNLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ2xFLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQzNDLENBQUMsQ0FBQTtLQUFBLENBQUM7SUFDSCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN2QixDQUFDO0FBUkQsMENBUUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEZsb3dDaGFydEJ1aWxkZXIudHNcbiAqXG4gKiBXSFk6IFRoaXMgaXMgdGhlIHByaW1hcnkgQVBJIGZvciBidWlsZGluZyBmbG93Y2hhcnQtYmFzZWQgcGlwZWxpbmVzLlxuICogSXQgcHJvdmlkZXMgYSBmbHVlbnQgYnVpbGRlciBwYXR0ZXJuIGZvciBjb25zdHJ1Y3RpbmcgU3RhZ2VOb2RlIHRyZWVzXG4gKiBhbmQgRmxvd0NoYXJ0U3BlYyBzdHJ1Y3R1cmVzIHRoYXQgY2FuIGJlIGV4ZWN1dGVkIGJ5IEZsb3dDaGFydEV4ZWN1dG9yLlxuICpcbiAqIFJFU1BPTlNJQklMSVRJRVM6XG4gKiAtIEJ1aWxkIFN0YWdlTm9kZSB0cmVlcyBkaXJlY3RseSAobm8gaW50ZXJtZWRpYXRlIGNsYXNzZXMpXG4gKiAtIEJ1aWxkIEZsb3dDaGFydFNwZWMgaW5jcmVtZW50YWxseSBhbG9uZ3NpZGUgU3RhZ2VOb2RlXG4gKiAtIFN1cHBvcnQgbGluZWFyIGNoYWluaW5nLCBicmFuY2hpbmcgKGRlY2lkZXIvc2VsZWN0b3IpLCBhbmQgc3ViZmxvdyBtb3VudGluZ1xuICogLSBNYW5hZ2Ugc3RhZ2UgZnVuY3Rpb24gcmVnaXN0cnkgYW5kIHN0cmVhbSBoYW5kbGVyc1xuICpcbiAqIERFU0lHTiBERUNJU0lPTlM6XG4gKiAtIFNpbXBsaWZpZWQgZnJvbSBvcmlnaW5hbDogbm8gX04gY2xhc3MsIG5vIHBhcmVudCBwb2ludGVyLCBubyBidWlsZCBjYWxsYmFja3NcbiAqIC0gUHJvbW90ZXMgc3ViZ3JhcGggY29tcG9zaXRpb24gb3ZlciBjYWxsYmFjay1iYXNlZCBuZXN0aW5nXG4gKiAtIEJ1aWxkcyBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgd2l0aCB0eXBlIGZpZWxkIGluY3JlbWVudGFsbHlcbiAqIC0gQXBwbGllcyBidWlsZFRpbWVFeHRyYWN0b3IgaW1tZWRpYXRlbHkgd2hlbiBub2RlcyBhcmUgY3JlYXRlZFxuICpcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBGbG93Q2hhcnRFeGVjdXRvcn0gLSBFeGVjdXRlcyB0aGUgYnVpbHQgZmxvd2NoYXJ0XG4gKiAtIHtAbGluayBQaXBlbGluZX0gLSBDb3JlIGV4ZWN1dGlvbiBlbmdpbmVcbiAqIC0ge0BsaW5rIFN0YWdlTm9kZX0gLSBUaGUgbm9kZSB0eXBlIGJ1aWx0IGJ5IHRoaXMgYnVpbGRlclxuICpcbiAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDEuMSwgMS40LCA0LjFfXG4gKi9cblxuLy8gSW1wb3J0IGZyb20gZXhlY3V0b3IgbW9kdWxlIChjYW5vbmljYWwgbG9jYXRpb24pXG5pbXBvcnQgdHlwZSB7IFNlbGVjdG9yLCBTdGFnZU5vZGUgfSBmcm9tICcuLi9leGVjdXRvci9QaXBlbGluZSc7XG5pbXBvcnQgeyBGbG93Q2hhcnRFeGVjdXRvciB9IGZyb20gJy4uL2V4ZWN1dG9yL0Zsb3dDaGFydEV4ZWN1dG9yJztcbmltcG9ydCB0eXBlIHtcbiAgUGlwZWxpbmVTdGFnZUZ1bmN0aW9uLFxuICBTdHJlYW1IYW5kbGVycyxcbiAgU3RyZWFtVG9rZW5IYW5kbGVyLFxuICBTdHJlYW1MaWZlY3ljbGVIYW5kbGVyLFxuICBUcmF2ZXJzYWxFeHRyYWN0b3IsXG4gIFN1YmZsb3dNb3VudE9wdGlvbnMsXG59IGZyb20gJy4uL2V4ZWN1dG9yL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgU2NvcGVGYWN0b3J5IH0gZnJvbSAnLi4vbWVtb3J5L3R5cGVzJztcbmltcG9ydCB0eXBlIHsgU2NvcGVQcm90ZWN0aW9uTW9kZSB9IGZyb20gJy4uLy4uL3Njb3BlL3Byb3RlY3Rpb24vdHlwZXMnO1xuXG4vLyBSZS1leHBvcnQgc3RyZWFtIHR5cGVzIGZvciBjb25zdW1lcnNcbmV4cG9ydCB0eXBlIHsgU3RyZWFtSGFuZGxlcnMsIFN0cmVhbVRva2VuSGFuZGxlciwgU3RyZWFtTGlmZWN5Y2xlSGFuZGxlciB9O1xuXG4vLyBSZS1leHBvcnQgU2VsZWN0b3IgdHlwZSBmb3IgY29uc3VtZXJzXG5leHBvcnQgdHlwZSB7IFNlbGVjdG9yIH07XG5cbi8vIFJlLWV4cG9ydCBTdWJmbG93TW91bnRPcHRpb25zIGZvciBjb25zdW1lcnNcbmV4cG9ydCB0eXBlIHsgU3ViZmxvd01vdW50T3B0aW9ucyB9O1xuXG4vKipcbiAqIFB1cmUgSlNPTiBGbG93IENoYXJ0IHNwZWMgZm9yIEZFIOKGkiBCRSB0cmFuc3BvcnQgKG5vIGZ1bmN0aW9ucy9jbG9zdXJlcykuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRmxvd0NoYXJ0U3BlYyB7XG4gIG5hbWU6IHN0cmluZztcbiAgaWQ/OiBzdHJpbmc7XG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuICAvKiogSHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2Ygd2hhdCB0aGlzIHN0YWdlIGRvZXMuICovXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBjaGlsZHJlbj86IEZsb3dDaGFydFNwZWNbXTtcbiAgbmV4dD86IEZsb3dDaGFydFNwZWM7XG4gIGhhc0RlY2lkZXI/OiBib29sZWFuO1xuICBoYXNTZWxlY3Rvcj86IGJvb2xlYW47XG4gIGJyYW5jaElkcz86IHN0cmluZ1tdO1xuICBsb29wVGFyZ2V0Pzogc3RyaW5nO1xuICBpc1N0cmVhbWluZz86IGJvb2xlYW47XG4gIHN0cmVhbUlkPzogc3RyaW5nO1xuICBpc1BhcmFsbGVsQ2hpbGQ/OiBib29sZWFuO1xuICBwYXJhbGxlbEdyb3VwSWQ/OiBzdHJpbmc7XG4gIGlzU3ViZmxvd1Jvb3Q/OiBib29sZWFuO1xuICBzdWJmbG93SWQ/OiBzdHJpbmc7XG4gIHN1YmZsb3dOYW1lPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIE1ldGFkYXRhIHByb3ZpZGVkIHRvIHRoZSBidWlsZC10aW1lIGV4dHJhY3RvciBmb3IgZWFjaCBub2RlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkVGltZU5vZGVNZXRhZGF0YSB7XG4gIG5hbWU6IHN0cmluZztcbiAgaWQ/OiBzdHJpbmc7XG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuICAvKiogSHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2Ygd2hhdCB0aGlzIHN0YWdlIGRvZXMuICovXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBjaGlsZHJlbj86IEJ1aWxkVGltZU5vZGVNZXRhZGF0YVtdO1xuICBuZXh0PzogQnVpbGRUaW1lTm9kZU1ldGFkYXRhO1xuICBoYXNEZWNpZGVyPzogYm9vbGVhbjtcbiAgaGFzU2VsZWN0b3I/OiBib29sZWFuO1xuICBicmFuY2hJZHM/OiBzdHJpbmdbXTtcbiAgbG9vcFRhcmdldD86IHN0cmluZztcbiAgaXNTdHJlYW1pbmc/OiBib29sZWFuO1xuICBzdHJlYW1JZD86IHN0cmluZztcbiAgaXNQYXJhbGxlbENoaWxkPzogYm9vbGVhbjtcbiAgcGFyYWxsZWxHcm91cElkPzogc3RyaW5nO1xuICBpc1N1YmZsb3dSb290PzogYm9vbGVhbjtcbiAgc3ViZmxvd0lkPzogc3RyaW5nO1xuICBzdWJmbG93TmFtZT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBCdWlsZC10aW1lIGV4dHJhY3RvciBmdW5jdGlvbiB0eXBlLlxuICovXG5leHBvcnQgdHlwZSBCdWlsZFRpbWVFeHRyYWN0b3I8VFJlc3VsdCA9IEZsb3dDaGFydFNwZWM+ID0gKFxuICBtZXRhZGF0YTogQnVpbGRUaW1lTm9kZU1ldGFkYXRhXG4pID0+IFRSZXN1bHQ7XG5cbi8qKlxuICogU2ltcGxpZmllZCBwYXJhbGxlbCBzcGVjIHdpdGhvdXQgYnVpbGQgY2FsbGJhY2suXG4gKiBfUmVxdWlyZW1lbnRzOiBmbG93Y2hhcnQtYnVpbGRlci1zaW1wbGlmaWNhdGlvbiAyLjJfXG4gKi9cbmV4cG9ydCB0eXBlIFNpbXBsaWZpZWRQYXJhbGxlbFNwZWM8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiA9IHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBkaXNwbGF5TmFtZT86IHN0cmluZztcbiAgZm4/OiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPjtcbiAgLy8gUkVNT1ZFRDogYnVpbGQ/OiAoYjogRmxvd0NoYXJ0QnVpbGRlcjxUT3V0LCBUU2NvcGU+KSA9PiB2b2lkO1xufTtcblxuLyoqXG4gKiBTZXJpYWxpemVkIHBpcGVsaW5lIHN0cnVjdHVyZSBmb3IgZnJvbnRlbmQgY29uc3VtcHRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlIHtcbiAgbmFtZTogc3RyaW5nO1xuICBpZD86IHN0cmluZztcbiAgdHlwZTogJ3N0YWdlJyB8ICdkZWNpZGVyJyB8ICdmb3JrJyB8ICdzdHJlYW1pbmcnO1xuICBkaXNwbGF5TmFtZT86IHN0cmluZztcbiAgLyoqIEh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIHdoYXQgdGhpcyBzdGFnZSBkb2VzLiAqL1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgY2hpbGRyZW4/OiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmVbXTtcbiAgbmV4dD86IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZTtcbiAgaGFzRGVjaWRlcj86IGJvb2xlYW47XG4gIGhhc1NlbGVjdG9yPzogYm9vbGVhbjtcbiAgYnJhbmNoSWRzPzogc3RyaW5nW107XG4gIGxvb3BUYXJnZXQ/OiBzdHJpbmc7XG4gIGlzU3RyZWFtaW5nPzogYm9vbGVhbjtcbiAgc3RyZWFtSWQ/OiBzdHJpbmc7XG4gIGlzUGFyYWxsZWxDaGlsZD86IGJvb2xlYW47XG4gIHBhcmFsbGVsR3JvdXBJZD86IHN0cmluZztcbiAgaXNTdWJmbG93Um9vdD86IGJvb2xlYW47XG4gIHN1YmZsb3dJZD86IHN0cmluZztcbiAgc3ViZmxvd05hbWU/OiBzdHJpbmc7XG4gIC8qKiBcbiAgICogQ29tcGxldGUgc3ViZmxvdyBzdHJ1Y3R1cmUgZm9yIGRyaWxsLWRvd24gdmlzdWFsaXphdGlvbi5cbiAgICogV2hlbiBhIHN1YmZsb3cgaXMgbW91bnRlZCwgdGhpcyBjb250YWlucyB0aGUgc3ViZmxvdydzIGludGVybmFsIHN0cnVjdHVyZVxuICAgKiAoaXRzIGZpcnN0IHN0YWdlIHdpdGggaXRzIG93biBJRCwgYW5kIHRoZSBmdWxsIG5leHQvY2hpbGRyZW4gY2hhaW4pLlxuICAgKiBUaGlzIGlzIHNlcGFyYXRlIGZyb20gdGhlIG1vdW50IG5vZGUgdG8gcHJlc2VydmUgdGhlIHN1YmZsb3cncyBvcmlnaW5hbCBJRHMuXG4gICAqIFxuICAgKiBUT0RPOiBQQVlMT0FEIE9QVElNSVpBVElPTiAtIENvbnNpZGVyIHJlbW92aW5nIHRoaXMgZmllbGQgdG8gcmVkdWNlIHBheWxvYWQgc2l6ZS5cbiAgICogRkUgY291bGQgbG9va3VwIHN0cnVjdHVyZSBmcm9tIHN1YmZsb3dSZXN1bHRzW3N1YmZsb3dJZF0ucGlwZWxpbmVTdHJ1Y3R1cmUgaW5zdGVhZC5cbiAgICogQ3VycmVudGx5IGtlcHQgYXMgZmFsbGJhY2sgZm9yIG5vbi1leGVjdXRlZCBzdWJmbG93cyAod2hlcmUgbm8gcnVudGltZSBkYXRhIGV4aXN0cykuXG4gICAqIFdoZW4gcmVtb3ZpbmcsIHVwZGF0ZSBGRSB1c2VUcmVlTGF5b3V0LnRzIHRvIGhhbmRsZSB0aGUgbG9va3VwIHByb3Blcmx5LlxuICAgKi9cbiAgc3ViZmxvd1N0cnVjdHVyZT86IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZTtcbiAgLyoqXG4gICAqIE51bWJlciBvZiB0aW1lcyB0aGlzIG5vZGUgd2FzIGV4ZWN1dGVkIGluIGEgbG9vcC5cbiAgICogT25seSBwcmVzZW50IHdoZW4gdGhlIG5vZGUgd2FzIHZpc2l0ZWQgbW9yZSB0aGFuIG9uY2UuXG4gICAqXG4gICAqIFdIWTogRW5hYmxlcyB0aGUgcnVudGltZSBwaXBlbGluZSBzdHJ1Y3R1cmUgdG8gdHJhY2sgbG9vcCBpdGVyYXRpb25zXG4gICAqIHNvIGNvbnN1bWVycyBjYW4gdmlzdWFsaXplIGhvdyBtYW55IHRpbWVzIGEgbG9vcGluZyBub2RlIHdhcyBleGVjdXRlZFxuICAgKiB3aXRob3V0IG5lZWRpbmcgZXh0ZXJuYWwgcmVjb25zdHJ1Y3Rpb24gZnJvbSBydW50aW1lIGRhdGEuXG4gICAqL1xuICBpdGVyYXRpb25Db3VudD86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBDb21waWxlZCBmbG93Y2hhcnQgcmVhZHkgZm9yIGV4ZWN1dGlvbi5cbiAqL1xuZXhwb3J0IHR5cGUgRmxvd0NoYXJ0PFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSB7XG4gIHJvb3Q6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+O1xuICBzdGFnZU1hcDogTWFwPHN0cmluZywgUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4+O1xuICBleHRyYWN0b3I/OiBUcmF2ZXJzYWxFeHRyYWN0b3I7XG4gIHN1YmZsb3dzPzogUmVjb3JkPHN0cmluZywgeyByb290OiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiB9PjtcbiAgYnVpbGRUaW1lU3RydWN0dXJlOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmU7XG4gIC8qKlxuICAgKiBXaGV0aGVyIG5hcnJhdGl2ZSBnZW5lcmF0aW9uIGlzIGVuYWJsZWQgYXQgYnVpbGQgdGltZS5cbiAgICpcbiAgICogV0hZOiBBbGxvd3MgY29uc3VtZXJzIHRvIGVuYWJsZSBuYXJyYXRpdmUgYXQgYnVpbGQgdGltZSB2aWEgRmxvd0NoYXJ0QnVpbGRlcixcbiAgICogc28gdGhlIEZsb3dDaGFydEV4ZWN1dG9yIGNhbiByZXNwZWN0IGl0IGFzIGEgZGVmYXVsdCB3aXRob3V0IHJlcXVpcmluZ1xuICAgKiBhbiBleHBsaWNpdCBlbmFibGVOYXJyYXRpdmUoKSBjYWxsLlxuICAgKlxuICAgKiBERVNJR046IEZsb3dDaGFydEV4ZWN1dG9yIHJlYWRzIHRoaXMgYXMgYSBkZWZhdWx0IGZvciBuYXJyYXRpdmVFbmFibGVkLlxuICAgKiBBbiBleHBsaWNpdCBlbmFibGVOYXJyYXRpdmUoKSBjYWxsIG9uIHRoZSBleGVjdXRvciB0YWtlcyBwcmVjZWRlbmNlLlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBwaXBlbGluZS1uYXJyYXRpdmUtZ2VuZXJhdGlvbiAxLjRfXG4gICAqL1xuICBlbmFibGVOYXJyYXRpdmU/OiBib29sZWFuO1xuICAvKiogUHJlLWJ1aWx0IGV4ZWN1dGlvbiBjb250ZXh0IGRlc2NyaXB0aW9uIHN0cmluZy4gRW1wdHkgc3RyaW5nIHdoZW4gbm8gZGVzY3JpcHRpb25zIHByb3ZpZGVkLiAqL1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAvKiogSW5kaXZpZHVhbCBzdGFnZSBkZXNjcmlwdGlvbnMga2V5ZWQgYnkgc3RhZ2UgbmFtZS4gRW1wdHkgbWFwIHdoZW4gbm8gZGVzY3JpcHRpb25zIHByb3ZpZGVkLiAqL1xuICBzdGFnZURlc2NyaXB0aW9uczogTWFwPHN0cmluZywgc3RyaW5nPjtcbn07XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgdGhlIGV4ZWN1dGUgc3VnYXIuXG4gKi9cbmV4cG9ydCB0eXBlIEV4ZWNPcHRpb25zID0ge1xuICBkZWZhdWx0cz86IHVua25vd247XG4gIGluaXRpYWw/OiB1bmtub3duO1xuICByZWFkT25seT86IHVua25vd247XG4gIHRocm90dGxpbmdFcnJvckNoZWNrZXI/OiAoZTogdW5rbm93bikgPT4gYm9vbGVhbjtcbiAgc2NvcGVQcm90ZWN0aW9uTW9kZT86IFNjb3BlUHJvdGVjdGlvbk1vZGU7XG4gIC8qKlxuICAgKiBFbmFibGUgbmFycmF0aXZlIGdlbmVyYXRpb24gYXQgYnVpbGQgdGltZS5cbiAgICpcbiAgICogV0hZOiBBbGxvd3MgY29uc3VtZXJzIHRvIG9wdCBpbnRvIG5hcnJhdGl2ZSB2aWEgdGhlIGJ1aWxkZXIncyBleGVjdXRlKClcbiAgICogY29udmVuaWVuY2UgbWV0aG9kLCB3aGljaCBzZXRzIHRoZSBmbGFnIG9uIHRoZSBGbG93Q2hhcnQgb2JqZWN0LlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBwaXBlbGluZS1uYXJyYXRpdmUtZ2VuZXJhdGlvbiAxLjRfXG4gICAqL1xuICBlbmFibGVOYXJyYXRpdmU/OiBib29sZWFuO1xufTtcblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogSW50ZXJuYWwgaGVscGVyc1xuICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cblxuY29uc3QgZmFpbCA9IChtc2c6IHN0cmluZyk6IG5ldmVyID0+IHtcbiAgdGhyb3cgbmV3IEVycm9yKGBbRmxvd0NoYXJ0QnVpbGRlcl0gJHttc2d9YCk7XG59O1xuXG4vKipcbiAqIEludGVybmFsIGN1cnNvciBzdGF0ZSAtIHRyYWNrcyBib3RoIFN0YWdlTm9kZSBhbmQgRmxvd0NoYXJ0U3BlYyB0b2dldGhlci5cbiAqIFRoaXMgcmVwbGFjZXMgdGhlIF9OIGNsYXNzIHdpdGggYSBzaW1wbGVyIHN0cnVjdHVyZS5cbiAqL1xuaW50ZXJmYWNlIEN1cnNvclN0YXRlPFRPdXQsIFRTY29wZT4ge1xuICBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPjtcbiAgc3BlYzogRmxvd0NoYXJ0U3BlYztcbn1cblxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBEZWNpZGVyTGlzdCAoc2ltcGxpZmllZCAtIG5vIGJ1aWxkIGNhbGxiYWNrcylcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXG5cbi8qKlxuICogRmx1ZW50IGhlbHBlciByZXR1cm5lZCBieSBhZGREZWNpZGVyIC8gYWRkRGVjaWRlckZ1bmN0aW9uIHRvIGFkZCBicmFuY2hlcy5cbiAqXG4gKiBXSFk6IFByb3ZpZGVzIGEgZmx1ZW50IEFQSSBmb3IgY29uZmlndXJpbmcgZGVjaWRlciBicmFuY2hlcyByZWdhcmRsZXNzIG9mXG4gKiB3aGV0aGVyIHRoZSBkZWNpZGVyIGlzIGxlZ2FjeSAob3V0cHV0LWJhc2VkKSBvciBzY29wZS1iYXNlZC4gVGhlIGBpc1Njb3BlQmFzZWRgXG4gKiBmbGFnIGNvbnRyb2xzIGhvdyBgZW5kKClgIHdpcmVzIHRoZSBub2RlIOKAlCBzZXR0aW5nIGBuZXh0Tm9kZURlY2lkZXJgIChsZWdhY3kpXG4gKiB2cyBgZGVjaWRlckZuYCAobmV3IHNjb3BlLWJhc2VkKS5cbiAqXG4gKiBERVNJR046IFJldXNlcyB0aGUgc2FtZSBjbGFzcyBmb3IgYm90aCBvbGQgYW5kIG5ldyBkZWNpZGVyIHR5cGVzLiBPbmx5IHRoZVxuICogY29uc3RydWN0b3IgcGFyYW1ldGVycyBhbmQgYGVuZCgpYCBiZWhhdmlvciBkaWZmZXIgYmFzZWQgb24gYGlzU2NvcGVCYXNlZGAuXG4gKiBBbGwgYnJhbmNoIG1ldGhvZHMgKGFkZEZ1bmN0aW9uQnJhbmNoLCBhZGRTdWJGbG93Q2hhcnRCcmFuY2gsIGFkZEJyYW5jaExpc3QsXG4gKiBzZXREZWZhdWx0KSByZW1haW4gaWRlbnRpY2FsIGZvciBib3RoIG1vZGVzLlxuICpcbiAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDIuMSwgNi4xLCA2LjMsIDYuNF9cbiAqIF9SZXF1aXJlbWVudHM6IGRlY2lkZXItZmlyc3QtY2xhc3Mtc3RhZ2UgNC40LCA1LjEsIDYuMl9cbiAqL1xuZXhwb3J0IGNsYXNzIERlY2lkZXJMaXN0PFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4ge1xuICBwcml2YXRlIHJlYWRvbmx5IGI6IEZsb3dDaGFydEJ1aWxkZXI8VE91dCwgVFNjb3BlPjtcbiAgcHJpdmF0ZSByZWFkb25seSBjdXJOb2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPjtcbiAgcHJpdmF0ZSByZWFkb25seSBjdXJTcGVjOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmU7XG4gIHByaXZhdGUgcmVhZG9ubHkgb3JpZ2luYWxEZWNpZGVyOiAoKG91dD86IFRPdXQpID0+IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPikgfCBudWxsO1xuICBwcml2YXRlIHJlYWRvbmx5IGJyYW5jaElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIGRlZmF1bHRJZD86IHN0cmluZztcblxuICAvKipcbiAgICogV2hldGhlciB0aGlzIERlY2lkZXJMaXN0IGlzIGZvciBhIHNjb3BlLWJhc2VkIGRlY2lkZXIgKGFkZERlY2lkZXJGdW5jdGlvbilcbiAgICogdnMgYSBsZWdhY3kgb3V0cHV0LWJhc2VkIGRlY2lkZXIgKGFkZERlY2lkZXIpLlxuICAgKlxuICAgKiBXSFk6IENvbnRyb2xzIGhvdyBgZW5kKClgIHdpcmVzIHRoZSBTdGFnZU5vZGUg4oCUIHNjb3BlLWJhc2VkIHNldHMgYGRlY2lkZXJGbiA9IHRydWVgXG4gICAqIHdoaWxlIGxlZ2FjeSB3cmFwcyB0aGUgZGVjaWRlciBmdW5jdGlvbiBhbmQgc2V0cyBgbmV4dE5vZGVEZWNpZGVyYC5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogZGVjaWRlci1maXJzdC1jbGFzcy1zdGFnZSA0LjQsIDUuMV9cbiAgICovXG4gIHByaXZhdGUgcmVhZG9ubHkgaXNTY29wZUJhc2VkOiBib29sZWFuO1xuXG4gIC8qIOKUgOKUgCBEZXNjcmlwdGlvbiBhY2N1bXVsYXRvciByZWZlcmVuY2VzIOKUgOKUgCAqL1xuICBwcml2YXRlIHJlYWRvbmx5IHBhcmVudERlc2NyaXB0aW9uUGFydHM6IHN0cmluZ1tdO1xuICBwcml2YXRlIHJlYWRvbmx5IHBhcmVudFN0YWdlRGVzY3JpcHRpb25zOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuICBwcml2YXRlIHJlYWRvbmx5IHJlc2VydmVkU3RlcE51bWJlcjogbnVtYmVyO1xuICBwcml2YXRlIHJlYWRvbmx5IGRlY2lkZXJEZXNjcmlwdGlvbj86IHN0cmluZztcbiAgLyoqIENvbGxlY3RlZCBicmFuY2ggaW5mbyBmb3IgZGVzY3JpcHRpb24gYWNjdW11bGF0aW9uIGF0IGVuZCgpICovXG4gIHByaXZhdGUgcmVhZG9ubHkgYnJhbmNoRGVzY0luZm86IEFycmF5PHsgaWQ6IHN0cmluZzsgZGlzcGxheU5hbWU/OiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0+ID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgYnVpbGRlcjogRmxvd0NoYXJ0QnVpbGRlcjxUT3V0LCBUU2NvcGU+LFxuICAgIGN1ck5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIGN1clNwZWM6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSxcbiAgICBkZWNpZGVyOiAoKG91dD86IFRPdXQpID0+IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPikgfCBudWxsLFxuICAgIGlzU2NvcGVCYXNlZDogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHBhcmVudERlc2NyaXB0aW9uUGFydHM6IHN0cmluZ1tdID0gW10sXG4gICAgcGFyZW50U3RhZ2VEZXNjcmlwdGlvbnM6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCksXG4gICAgcmVzZXJ2ZWRTdGVwTnVtYmVyOiBudW1iZXIgPSAwLFxuICAgIGRlY2lkZXJEZXNjcmlwdGlvbj86IHN0cmluZyxcbiAgKSB7XG4gICAgdGhpcy5iID0gYnVpbGRlcjtcbiAgICB0aGlzLmN1ck5vZGUgPSBjdXJOb2RlO1xuICAgIHRoaXMuY3VyU3BlYyA9IGN1clNwZWM7XG4gICAgdGhpcy5vcmlnaW5hbERlY2lkZXIgPSBkZWNpZGVyO1xuICAgIHRoaXMuaXNTY29wZUJhc2VkID0gaXNTY29wZUJhc2VkO1xuICAgIHRoaXMucGFyZW50RGVzY3JpcHRpb25QYXJ0cyA9IHBhcmVudERlc2NyaXB0aW9uUGFydHM7XG4gICAgdGhpcy5wYXJlbnRTdGFnZURlc2NyaXB0aW9ucyA9IHBhcmVudFN0YWdlRGVzY3JpcHRpb25zO1xuICAgIHRoaXMucmVzZXJ2ZWRTdGVwTnVtYmVyID0gcmVzZXJ2ZWRTdGVwTnVtYmVyO1xuICAgIHRoaXMuZGVjaWRlckRlc2NyaXB0aW9uID0gZGVjaWRlckRlc2NyaXB0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIHNpbXBsZSBmdW5jdGlvbiBicmFuY2ggKG5vIG5lc3RlZCBmbG93Y2hhcnQpLlxuICAgKiBSRU1PVkVEOiBidWlsZCBjYWxsYmFjayBwYXJhbWV0ZXJcbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gMi4xX1xuICAgKi9cbiAgYWRkRnVuY3Rpb25CcmFuY2goXG4gICAgaWQ6IHN0cmluZyxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgZm4/OiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPixcbiAgICBkaXNwbGF5TmFtZT86IHN0cmluZyxcbiAgICBkZXNjcmlwdGlvbj86IHN0cmluZyxcbiAgKTogRGVjaWRlckxpc3Q8VE91dCwgVFNjb3BlPiB7XG4gICAgaWYgKHRoaXMuYnJhbmNoSWRzLmhhcyhpZCkpIGZhaWwoYGR1cGxpY2F0ZSBkZWNpZGVyIGJyYW5jaCBpZCAnJHtpZH0nIHVuZGVyICcke3RoaXMuY3VyTm9kZS5uYW1lfSdgKTtcbiAgICB0aGlzLmJyYW5jaElkcy5hZGQoaWQpO1xuXG4gICAgLy8gQ3JlYXRlIFN0YWdlTm9kZSBkaXJlY3RseVxuICAgIGNvbnN0IG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+ID0geyBuYW1lOiBuYW1lID8/IGlkIH07XG4gICAgaWYgKGlkKSBub2RlLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBub2RlLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBub2RlLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gICAgaWYgKGZuKSB7XG4gICAgICBub2RlLmZuID0gZm47XG4gICAgICB0aGlzLmIuX2FkZFRvTWFwKG5hbWUsIGZuKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlIHdpdGggdHlwZT0nc3RhZ2UnIGFuZCBhcHBseSBleHRyYWN0b3JcbiAgICBsZXQgc3BlYzogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlID0geyBuYW1lOiBuYW1lID8/IGlkLCB0eXBlOiAnc3RhZ2UnIH07XG4gICAgaWYgKGlkKSBzcGVjLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBzcGVjLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBzcGVjLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gICAgXG4gICAgLy8gQXBwbHkgZXh0cmFjdG9yIGltbWVkaWF0ZWx5XG4gICAgc3BlYyA9IHRoaXMuYi5fYXBwbHlFeHRyYWN0b3JUb05vZGUoc3BlYyk7XG5cbiAgICAvLyBBZGQgdG8gcGFyZW50J3MgY2hpbGRyZW5cbiAgICB0aGlzLmN1ck5vZGUuY2hpbGRyZW4gPSB0aGlzLmN1ck5vZGUuY2hpbGRyZW4gfHwgW107XG4gICAgdGhpcy5jdXJOb2RlLmNoaWxkcmVuLnB1c2gobm9kZSk7XG4gICAgdGhpcy5jdXJTcGVjLmNoaWxkcmVuID0gdGhpcy5jdXJTcGVjLmNoaWxkcmVuIHx8IFtdO1xuICAgIHRoaXMuY3VyU3BlYy5jaGlsZHJlbi5wdXNoKHNwZWMpO1xuXG4gICAgLy8gVHJhY2sgYnJhbmNoIGluZm8gZm9yIGRlc2NyaXB0aW9uIGFjY3VtdWxhdGlvbiBhdCBlbmQoKVxuICAgIHRoaXMuYnJhbmNoRGVzY0luZm8ucHVzaCh7IGlkLCBkaXNwbGF5TmFtZSwgZGVzY3JpcHRpb24gfSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3VudCBhIHByZWJ1aWx0IGZsb3djaGFydCBhcyBhIGJyYW5jaC5cbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gNi4yX1xuICAgKiBfUmVxdWlyZW1lbnRzOiBzdWJmbG93LWlucHV0LW1hcHBpbmcgMS4yLCAxLjUsIDcuM19cbiAgICogXG4gICAqIElNUE9SVEFOVDogVGhpcyBjcmVhdGVzIGEgV1JBUFBFUiBub2RlIGZvciB0aGUgc3ViZmxvdyBtb3VudCBwb2ludC5cbiAgICogVGhlIHN1YmZsb3cncyBpbnRlcm5hbCBzdHJ1Y3R1cmUgaXMgcHJlc2VydmVkIGluIGBzdWJmbG93U3RydWN0dXJlYCBwcm9wZXJ0eSxcbiAgICogTk9UIG1lcmdlZCB3aXRoIHRoZSB3cmFwcGVyIG5vZGUuIFRoaXMgZW5zdXJlczpcbiAgICogMS4gVGhlIHN1YmZsb3cncyBmaXJzdCBzdGFnZSBrZWVwcyBpdHMgb3JpZ2luYWwgSURcbiAgICogMi4gVGhlIG1vdW50IHBvaW50IGhhcyBpdHMgb3duIGRpc3RpbmN0IElEIGZvciBuYXZpZ2F0aW9uXG4gICAqIDMuIERyaWxsLWRvd24gY2FuIGFjY2VzcyB0aGUgZnVsbCBzdWJmbG93IHN0cnVjdHVyZSB2aWEgYHN1YmZsb3dTdHJ1Y3R1cmVgXG4gICAqIFxuICAgKiBAcGFyYW0gaWQgLSBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhlIHN1YmZsb3cgbW91bnQgcG9pbnRcbiAgICogQHBhcmFtIHN1YmZsb3cgLSBUaGUgcHJlYnVpbHQgRmxvd0NoYXJ0IHRvIG1vdW50XG4gICAqIEBwYXJhbSBtb3VudE5hbWUgLSBPcHRpb25hbCBkaXNwbGF5IG5hbWUgZm9yIHRoZSBtb3VudCBwb2ludFxuICAgKiBAcGFyYW0gb3B0aW9ucyAtIE9wdGlvbmFsIGlucHV0L291dHB1dCBtYXBwaW5nIG9wdGlvbnMgZm9yIGRhdGEgZmxvdyBiZXR3ZWVuIHBhcmVudCBhbmQgc3ViZmxvd1xuICAgKi9cbiAgYWRkU3ViRmxvd0NoYXJ0QnJhbmNoKFxuICAgIGlkOiBzdHJpbmcsXG4gICAgc3ViZmxvdzogRmxvd0NoYXJ0PFRPdXQsIFRTY29wZT4sXG4gICAgbW91bnROYW1lPzogc3RyaW5nLFxuICAgIG9wdGlvbnM/OiBTdWJmbG93TW91bnRPcHRpb25zLFxuICApOiBEZWNpZGVyTGlzdDxUT3V0LCBUU2NvcGU+IHtcbiAgICBpZiAodGhpcy5icmFuY2hJZHMuaGFzKGlkKSkgZmFpbChgZHVwbGljYXRlIGRlY2lkZXIgYnJhbmNoIGlkICcke2lkfScgdW5kZXIgJyR7dGhpcy5jdXJOb2RlLm5hbWV9J2ApO1xuICAgIHRoaXMuYnJhbmNoSWRzLmFkZChpZCk7XG5cbiAgICBjb25zdCBkaXNwbGF5TmFtZSA9IG1vdW50TmFtZSB8fCBpZDtcblxuICAgIC8vIE5hbWVzcGFjZSB0aGUgc3ViZmxvdydzIHN0YWdlIG5hbWVzIHdpdGggbW91bnQgaWQgdG8gcHJldmVudCBjb2xsaXNpb25zXG4gICAgY29uc3QgcHJlZml4ZWRSb290ID0gKHRoaXMuYiBhcyBhbnkpLl9wcmVmaXhOb2RlVHJlZShzdWJmbG93LnJvb3QsIGlkKTtcblxuICAgIC8vIFJlZ2lzdGVyIHN1YmZsb3cgZGVmaW5pdGlvbiB3aXRoIHByZWZpeGVkIHJvb3RcbiAgICBpZiAoIXRoaXMuYi5fc3ViZmxvd0RlZnMuaGFzKGlkKSkge1xuICAgICAgdGhpcy5iLl9zdWJmbG93RGVmcy5zZXQoaWQsIHsgcm9vdDogcHJlZml4ZWRSb290IH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSByZWZlcmVuY2UgU3RhZ2VOb2RlXG4gICAgY29uc3Qgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gPSB7XG4gICAgICBuYW1lOiBkaXNwbGF5TmFtZSxcbiAgICAgIGlkLFxuICAgICAgaXNTdWJmbG93Um9vdDogdHJ1ZSxcbiAgICAgIHN1YmZsb3dJZDogaWQsXG4gICAgICBzdWJmbG93TmFtZTogZGlzcGxheU5hbWUsXG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHN1YmZsb3dNb3VudE9wdGlvbnMgaWYgcHJvdmlkZWRcbiAgICBpZiAob3B0aW9ucykge1xuICAgICAgbm9kZS5zdWJmbG93TW91bnRPcHRpb25zID0gb3B0aW9ucztcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgYSBXUkFQUEVSIHNwZWMgZm9yIHRoZSBzdWJmbG93IG1vdW50IHBvaW50LlxuICAgIC8vIENSSVRJQ0FMOiBXZSBkbyBOT1Qgc3ByZWFkIHN1YmZsb3cuYnVpbGRUaW1lU3RydWN0dXJlIGhlcmUhXG4gICAgLy8gSW5zdGVhZCwgd2Ugc3RvcmUgdGhlIHN1YmZsb3cncyBzdHJ1Y3R1cmUgaW4gYHN1YmZsb3dTdHJ1Y3R1cmVgIHByb3BlcnR5LlxuICAgIC8vIFRoaXMgcHJlc2VydmVzIHRoZSBzdWJmbG93J3MgZmlyc3Qgc3RhZ2UgSUQgYW5kIGNyZWF0ZXMgYSBjbGVhciBib3VuZGFyeS5cbiAgICBjb25zdCBzcGVjOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgPSB7XG4gICAgICBuYW1lOiBkaXNwbGF5TmFtZSxcbiAgICAgIHR5cGU6ICdzdGFnZScsXG4gICAgICBpZCxcbiAgICAgIGRpc3BsYXlOYW1lLFxuICAgICAgaXNTdWJmbG93Um9vdDogdHJ1ZSxcbiAgICAgIHN1YmZsb3dJZDogaWQsXG4gICAgICBzdWJmbG93TmFtZTogZGlzcGxheU5hbWUsXG4gICAgICAvLyBTdG9yZSB0aGUgQ09NUExFVEUgc3ViZmxvdyBzdHJ1Y3R1cmUgZm9yIGRyaWxsLWRvd24gdmlzdWFsaXphdGlvblxuICAgICAgc3ViZmxvd1N0cnVjdHVyZTogc3ViZmxvdy5idWlsZFRpbWVTdHJ1Y3R1cmUsXG4gICAgfTtcblxuICAgIC8vIEFkZCB0byBwYXJlbnQncyBjaGlsZHJlblxuICAgIHRoaXMuY3VyTm9kZS5jaGlsZHJlbiA9IHRoaXMuY3VyTm9kZS5jaGlsZHJlbiB8fCBbXTtcbiAgICB0aGlzLmN1ck5vZGUuY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICB0aGlzLmN1clNwZWMuY2hpbGRyZW4gPSB0aGlzLmN1clNwZWMuY2hpbGRyZW4gfHwgW107XG4gICAgdGhpcy5jdXJTcGVjLmNoaWxkcmVuLnB1c2goc3BlYyk7XG5cbiAgICAvLyBNZXJnZSBzdGFnZSBtYXBzIHdpdGggbmFtZXNwYWNlIHByZWZpeFxuICAgIHRoaXMuYi5fbWVyZ2VTdGFnZU1hcChzdWJmbG93LnN0YWdlTWFwLCBpZCk7XG5cbiAgICAvLyBNZXJnZSBuZXN0ZWQgc3ViZmxvd3Mgd2l0aCBuYW1lc3BhY2UgcHJlZml4XG4gICAgaWYgKHN1YmZsb3cuc3ViZmxvd3MpIHtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgZGVmXSBvZiBPYmplY3QuZW50cmllcyhzdWJmbG93LnN1YmZsb3dzKSkge1xuICAgICAgICBjb25zdCBwcmVmaXhlZEtleSA9IGAke2lkfS8ke2tleX1gO1xuICAgICAgICBpZiAoIXRoaXMuYi5fc3ViZmxvd0RlZnMuaGFzKHByZWZpeGVkS2V5KSkge1xuICAgICAgICAgIHRoaXMuYi5fc3ViZmxvd0RlZnMuc2V0KHByZWZpeGVkS2V5LCB7XG4gICAgICAgICAgICByb290OiAodGhpcy5iIGFzIGFueSkuX3ByZWZpeE5vZGVUcmVlKFxuICAgICAgICAgICAgICBkZWYucm9vdCBhcyBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICApLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQWRkIG11bHRpcGxlIHNpbXBsZSBicmFuY2hlcy5cbiAgICogUkVNT1ZFRDogYnVpbGQgY2FsbGJhY2sgaW4gYnJhbmNoIHNwZWNcbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gMi4zX1xuICAgKi9cbiAgYWRkQnJhbmNoTGlzdChcbiAgICBicmFuY2hlczogQXJyYXk8e1xuICAgICAgaWQ6IHN0cmluZztcbiAgICAgIG5hbWU6IHN0cmluZztcbiAgICAgIGZuPzogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT47XG4gICAgICBkaXNwbGF5TmFtZT86IHN0cmluZztcbiAgICB9PixcbiAgKTogRGVjaWRlckxpc3Q8VE91dCwgVFNjb3BlPiB7XG4gICAgZm9yIChjb25zdCB7IGlkLCBuYW1lLCBmbiwgZGlzcGxheU5hbWUgfSBvZiBicmFuY2hlcykge1xuICAgICAgdGhpcy5hZGRGdW5jdGlvbkJyYW5jaChpZCwgbmFtZSwgZm4sIGRpc3BsYXlOYW1lKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogU2V0IGRlZmF1bHQgYnJhbmNoIGlkLlxuICAgKi9cbiAgc2V0RGVmYXVsdChpZDogc3RyaW5nKTogRGVjaWRlckxpc3Q8VE91dCwgVFNjb3BlPiB7XG4gICAgdGhpcy5kZWZhdWx0SWQgPSBpZDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBGaW5hbGl6ZSB0aGUgZGVjaWRlciBhbmQgcmV0dXJuIHRvIG1haW4gYnVpbGRlci5cbiAgICpcbiAgICogV0hZOiBXaXJlcyB0aGUgU3RhZ2VOb2RlIGRpZmZlcmVudGx5IGJhc2VkIG9uIHdoZXRoZXIgdGhpcyBpcyBhIHNjb3BlLWJhc2VkXG4gICAqIG9yIGxlZ2FjeSBkZWNpZGVyLiBTY29wZS1iYXNlZCBzZXRzIGBkZWNpZGVyRm4gPSB0cnVlYCAodGhlIGZuIElTIHRoZSBkZWNpZGVyKSxcbiAgICogd2hpbGUgbGVnYWN5IHdyYXBzIHRoZSBkZWNpZGVyIGZ1bmN0aW9uIHdpdGggZGVmYXVsdCBoYW5kbGluZyBhbmQgc2V0cyBgbmV4dE5vZGVEZWNpZGVyYC5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gNi40X1xuICAgKiBfUmVxdWlyZW1lbnRzOiBkZWNpZGVyLWZpcnN0LWNsYXNzLXN0YWdlIDQuNCwgNS4xLCA2LjJfXG4gICAqL1xuICBlbmQoKTogRmxvd0NoYXJ0QnVpbGRlcjxUT3V0LCBUU2NvcGU+IHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHRoaXMuY3VyTm9kZS5jaGlsZHJlbjtcbiAgICBpZiAoIWNoaWxkcmVuIHx8IGNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBbRmxvd0NoYXJ0QnVpbGRlcl0gZGVjaWRlciBhdCAnJHt0aGlzLmN1ck5vZGUubmFtZX0nIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBicmFuY2hgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc1Njb3BlQmFzZWQpIHtcbiAgICAgIC8vIFNjb3BlLWJhc2VkOiBtYXJrIG5vZGUncyBmbiBhcyB0aGUgZGVjaWRlciwgZG9uJ3Qgc2V0IG5leHROb2RlRGVjaWRlci5cbiAgICAgIC8vIFRoZSBmbiByZWNlaXZlcyAoc2NvcGUsIGJyZWFrRm4pIGFuZCByZXR1cm5zIGEgYnJhbmNoIElEIHN0cmluZy5cbiAgICAgIC8vIFBpcGVsaW5lL0RlY2lkZXJIYW5kbGVyIHdpbGwgdXNlIHRoZSBkZWNpZGVyRm4gZmxhZyB0byByb3V0ZSB0byB0aGVcbiAgICAgIC8vIHNjb3BlLWJhc2VkIGV4ZWN1dGlvbiBwYXRoLlxuICAgICAgLy8gX1JlcXVpcmVtZW50czogZGVjaWRlci1maXJzdC1jbGFzcy1zdGFnZSA1LjFfXG4gICAgICB0aGlzLmN1ck5vZGUuZGVjaWRlckZuID0gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTGVnYWN5OiB3cmFwIGRlY2lkZXIgd2l0aCBkZWZhdWx0IGhhbmRsaW5nLCBzZXQgbmV4dE5vZGVEZWNpZGVyXG4gICAgICBjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQoY2hpbGRyZW4ubWFwKChjKSA9PiBjLmlkKSk7XG4gICAgICBjb25zdCBmYWxsYmFja0lkID0gdGhpcy5kZWZhdWx0SWQ7XG5cbiAgICAgIHRoaXMuY3VyTm9kZS5uZXh0Tm9kZURlY2lkZXIgPSBhc3luYyAob3V0PzogVE91dCkgPT4ge1xuICAgICAgICBjb25zdCByYXcgPSB0aGlzLm9yaWdpbmFsRGVjaWRlciEob3V0KTtcbiAgICAgICAgY29uc3QgaWQgPSByYXcgaW5zdGFuY2VvZiBQcm9taXNlID8gYXdhaXQgcmF3IDogcmF3O1xuICAgICAgICBpZiAoaWQgJiYgdmFsaWRJZHMuaGFzKGlkKSkgcmV0dXJuIGlkO1xuICAgICAgICBpZiAoZmFsbGJhY2tJZCAmJiB2YWxpZElkcy5oYXMoZmFsbGJhY2tJZCkpIHJldHVybiBmYWxsYmFja0lkO1xuICAgICAgICByZXR1cm4gaWQ7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENvbW1vbjogc2V0IGJyYW5jaElkcyBhbmQgdHlwZSBvbiBzcGVjXG4gICAgdGhpcy5jdXJTcGVjLmJyYW5jaElkcyA9IGNoaWxkcmVuXG4gICAgICAubWFwKChjKSA9PiBjLmlkKVxuICAgICAgLmZpbHRlcigoaWQpOiBpZCBpcyBzdHJpbmcgPT4gdHlwZW9mIGlkID09PSAnc3RyaW5nJyAmJiBpZC5sZW5ndGggPiAwKTtcblxuICAgIC8vIFNldCB0eXBlIHRvICdkZWNpZGVyJyBub3cgdGhhdCB3ZSBrbm93IGl0IGhhcyBicmFuY2hlc1xuICAgIHRoaXMuY3VyU3BlYy50eXBlID0gJ2RlY2lkZXInO1xuXG4gICAgLy8gQWNjdW11bGF0ZSBkZXNjcmlwdGlvbiBsaW5lcyBmb3IgdGhlIGRlY2lkZXIgYW5kIGl0cyBicmFuY2hlc1xuICAgIGlmICh0aGlzLnJlc2VydmVkU3RlcE51bWJlciA+IDApIHtcbiAgICAgIGNvbnN0IGRlY2lkZXJMYWJlbCA9IHRoaXMuY3VyTm9kZS5kaXNwbGF5TmFtZSB8fCB0aGlzLmN1ck5vZGUubmFtZTtcbiAgICAgIGNvbnN0IGJyYW5jaElkTGlzdCA9IHRoaXMuYnJhbmNoRGVzY0luZm8ubWFwKChiKSA9PiBiLmlkKS5qb2luKCcsICcpO1xuICAgICAgY29uc3QgbWFpbkxpbmUgPSB0aGlzLmRlY2lkZXJEZXNjcmlwdGlvblxuICAgICAgICA/IGAke3RoaXMucmVzZXJ2ZWRTdGVwTnVtYmVyfS4gJHtkZWNpZGVyTGFiZWx9IOKAlCAke3RoaXMuZGVjaWRlckRlc2NyaXB0aW9ufWBcbiAgICAgICAgOiBgJHt0aGlzLnJlc2VydmVkU3RlcE51bWJlcn0uICR7ZGVjaWRlckxhYmVsfSDigJQgRGVjaWRlcyBiZXR3ZWVuOiAke2JyYW5jaElkTGlzdH1gO1xuICAgICAgdGhpcy5wYXJlbnREZXNjcmlwdGlvblBhcnRzLnB1c2gobWFpbkxpbmUpO1xuXG4gICAgICBpZiAodGhpcy5kZWNpZGVyRGVzY3JpcHRpb24pIHtcbiAgICAgICAgdGhpcy5wYXJlbnRTdGFnZURlc2NyaXB0aW9ucy5zZXQodGhpcy5jdXJOb2RlLm5hbWUsIHRoaXMuZGVjaWRlckRlc2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQXBwZW5kIGFycm93IGxpbmVzIGZvciBlYWNoIGJyYW5jaFxuICAgICAgZm9yIChjb25zdCBicmFuY2ggb2YgdGhpcy5icmFuY2hEZXNjSW5mbykge1xuICAgICAgICBjb25zdCBicmFuY2hUZXh0ID0gYnJhbmNoLmRlc2NyaXB0aW9uIHx8IGJyYW5jaC5kaXNwbGF5TmFtZTtcbiAgICAgICAgaWYgKGJyYW5jaFRleHQpIHtcbiAgICAgICAgICB0aGlzLnBhcmVudERlc2NyaXB0aW9uUGFydHMucHVzaChgICAg4oaSICR7YnJhbmNoLmlkfTogJHticmFuY2hUZXh0fWApO1xuICAgICAgICB9XG4gICAgICAgIC8vIFN0b3JlIGluZGl2aWR1YWwgYnJhbmNoIGRlc2NyaXB0aW9uc1xuICAgICAgICBpZiAoYnJhbmNoLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgdGhpcy5wYXJlbnRTdGFnZURlc2NyaXB0aW9ucy5zZXQoYnJhbmNoLmlkLCBicmFuY2guZGVzY3JpcHRpb24pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYjtcbiAgfVxufVxuXG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNlbGVjdG9yTGlzdCAoc2ltcGxpZmllZCAtIG5vIGJ1aWxkIGNhbGxiYWNrcylcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXG5cbi8qKlxuICogRmx1ZW50IGhlbHBlciByZXR1cm5lZCBieSBhZGRTZWxlY3RvciB0byBhZGQgYnJhbmNoZXMuXG4gKiBfUmVxdWlyZW1lbnRzOiBmbG93Y2hhcnQtYnVpbGRlci1zaW1wbGlmaWNhdGlvbiA2LjVfXG4gKi9cbmV4cG9ydCBjbGFzcyBTZWxlY3Rvckxpc3Q8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiB7XG4gIHByaXZhdGUgcmVhZG9ubHkgYjogRmxvd0NoYXJ0QnVpbGRlcjxUT3V0LCBUU2NvcGU+O1xuICBwcml2YXRlIHJlYWRvbmx5IGN1ck5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+O1xuICBwcml2YXRlIHJlYWRvbmx5IGN1clNwZWM6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZTtcbiAgcHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbFNlbGVjdG9yOiBTZWxlY3RvcjtcbiAgcHJpdmF0ZSByZWFkb25seSBicmFuY2hJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAvKiDilIDilIAgRGVzY3JpcHRpb24gYWNjdW11bGF0b3IgcmVmZXJlbmNlcyDilIDilIAgKi9cbiAgcHJpdmF0ZSByZWFkb25seSBwYXJlbnREZXNjcmlwdGlvblBhcnRzOiBzdHJpbmdbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBwYXJlbnRTdGFnZURlc2NyaXB0aW9uczogTWFwPHN0cmluZywgc3RyaW5nPjtcbiAgcHJpdmF0ZSByZWFkb25seSByZXNlcnZlZFN0ZXBOdW1iZXI6IG51bWJlcjtcbiAgLyoqIENvbGxlY3RlZCBicmFuY2ggaW5mbyBmb3IgZGVzY3JpcHRpb24gYWNjdW11bGF0aW9uIGF0IGVuZCgpICovXG4gIHByaXZhdGUgcmVhZG9ubHkgYnJhbmNoRGVzY0luZm86IEFycmF5PHsgaWQ6IHN0cmluZzsgZGlzcGxheU5hbWU/OiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0+ID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgYnVpbGRlcjogRmxvd0NoYXJ0QnVpbGRlcjxUT3V0LCBUU2NvcGU+LFxuICAgIGN1ck5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIGN1clNwZWM6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSxcbiAgICBzZWxlY3RvcjogU2VsZWN0b3IsXG4gICAgcGFyZW50RGVzY3JpcHRpb25QYXJ0czogc3RyaW5nW10gPSBbXSxcbiAgICBwYXJlbnRTdGFnZURlc2NyaXB0aW9uczogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKSxcbiAgICByZXNlcnZlZFN0ZXBOdW1iZXI6IG51bWJlciA9IDAsXG4gICkge1xuICAgIHRoaXMuYiA9IGJ1aWxkZXI7XG4gICAgdGhpcy5jdXJOb2RlID0gY3VyTm9kZTtcbiAgICB0aGlzLmN1clNwZWMgPSBjdXJTcGVjO1xuICAgIHRoaXMub3JpZ2luYWxTZWxlY3RvciA9IHNlbGVjdG9yO1xuICAgIHRoaXMucGFyZW50RGVzY3JpcHRpb25QYXJ0cyA9IHBhcmVudERlc2NyaXB0aW9uUGFydHM7XG4gICAgdGhpcy5wYXJlbnRTdGFnZURlc2NyaXB0aW9ucyA9IHBhcmVudFN0YWdlRGVzY3JpcHRpb25zO1xuICAgIHRoaXMucmVzZXJ2ZWRTdGVwTnVtYmVyID0gcmVzZXJ2ZWRTdGVwTnVtYmVyO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIHNpbXBsZSBmdW5jdGlvbiBicmFuY2ggKG5vIG5lc3RlZCBmbG93Y2hhcnQpLlxuICAgKi9cbiAgYWRkRnVuY3Rpb25CcmFuY2goXG4gICAgaWQ6IHN0cmluZyxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgZm4/OiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPixcbiAgICBkaXNwbGF5TmFtZT86IHN0cmluZyxcbiAgICBkZXNjcmlwdGlvbj86IHN0cmluZyxcbiAgKTogU2VsZWN0b3JMaXN0PFRPdXQsIFRTY29wZT4ge1xuICAgIGlmICh0aGlzLmJyYW5jaElkcy5oYXMoaWQpKSBmYWlsKGBkdXBsaWNhdGUgc2VsZWN0b3IgYnJhbmNoIGlkICcke2lkfScgdW5kZXIgJyR7dGhpcy5jdXJOb2RlLm5hbWV9J2ApO1xuICAgIHRoaXMuYnJhbmNoSWRzLmFkZChpZCk7XG5cbiAgICAvLyBDcmVhdGUgU3RhZ2VOb2RlIGRpcmVjdGx5XG4gICAgY29uc3Qgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gPSB7IG5hbWU6IG5hbWUgPz8gaWQgfTtcbiAgICBpZiAoaWQpIG5vZGUuaWQgPSBpZDtcbiAgICBpZiAoZGlzcGxheU5hbWUpIG5vZGUuZGlzcGxheU5hbWUgPSBkaXNwbGF5TmFtZTtcbiAgICBpZiAoZGVzY3JpcHRpb24pIG5vZGUuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcbiAgICBpZiAoZm4pIHtcbiAgICAgIG5vZGUuZm4gPSBmbjtcbiAgICAgIHRoaXMuYi5fYWRkVG9NYXAobmFtZSwgZm4pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgd2l0aCB0eXBlPSdzdGFnZScgYW5kIGFwcGx5IGV4dHJhY3RvclxuICAgIGxldCBzcGVjOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgPSB7IG5hbWU6IG5hbWUgPz8gaWQsIHR5cGU6ICdzdGFnZScgfTtcbiAgICBpZiAoaWQpIHNwZWMuaWQgPSBpZDtcbiAgICBpZiAoZGlzcGxheU5hbWUpIHNwZWMuZGlzcGxheU5hbWUgPSBkaXNwbGF5TmFtZTtcbiAgICBpZiAoZGVzY3JpcHRpb24pIHNwZWMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcbiAgICBcbiAgICAvLyBBcHBseSBleHRyYWN0b3IgaW1tZWRpYXRlbHlcbiAgICBzcGVjID0gdGhpcy5iLl9hcHBseUV4dHJhY3RvclRvTm9kZShzcGVjKTtcblxuICAgIC8vIEFkZCB0byBwYXJlbnQncyBjaGlsZHJlblxuICAgIHRoaXMuY3VyTm9kZS5jaGlsZHJlbiA9IHRoaXMuY3VyTm9kZS5jaGlsZHJlbiB8fCBbXTtcbiAgICB0aGlzLmN1ck5vZGUuY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICB0aGlzLmN1clNwZWMuY2hpbGRyZW4gPSB0aGlzLmN1clNwZWMuY2hpbGRyZW4gfHwgW107XG4gICAgdGhpcy5jdXJTcGVjLmNoaWxkcmVuLnB1c2goc3BlYyk7XG5cbiAgICAvLyBUcmFjayBicmFuY2ggaW5mbyBmb3IgZGVzY3JpcHRpb24gYWNjdW11bGF0aW9uIGF0IGVuZCgpXG4gICAgdGhpcy5icmFuY2hEZXNjSW5mby5wdXNoKHsgaWQsIGRpc3BsYXlOYW1lLCBkZXNjcmlwdGlvbiB9KTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIE1vdW50IGEgcHJlYnVpbHQgZmxvd2NoYXJ0IGFzIGEgYnJhbmNoLlxuICAgKiBfUmVxdWlyZW1lbnRzOiBzdWJmbG93LWlucHV0LW1hcHBpbmcgMS4yLCAxLjUsIDcuM19cbiAgICogXG4gICAqIElNUE9SVEFOVDogVGhpcyBjcmVhdGVzIGEgV1JBUFBFUiBub2RlIGZvciB0aGUgc3ViZmxvdyBtb3VudCBwb2ludC5cbiAgICogVGhlIHN1YmZsb3cncyBpbnRlcm5hbCBzdHJ1Y3R1cmUgaXMgcHJlc2VydmVkIGluIGBzdWJmbG93U3RydWN0dXJlYCBwcm9wZXJ0eSxcbiAgICogTk9UIG1lcmdlZCB3aXRoIHRoZSB3cmFwcGVyIG5vZGUuIFRoaXMgZW5zdXJlczpcbiAgICogMS4gVGhlIHN1YmZsb3cncyBmaXJzdCBzdGFnZSBrZWVwcyBpdHMgb3JpZ2luYWwgSURcbiAgICogMi4gVGhlIG1vdW50IHBvaW50IGhhcyBpdHMgb3duIGRpc3RpbmN0IElEIGZvciBuYXZpZ2F0aW9uXG4gICAqIDMuIERyaWxsLWRvd24gY2FuIGFjY2VzcyB0aGUgZnVsbCBzdWJmbG93IHN0cnVjdHVyZSB2aWEgYHN1YmZsb3dTdHJ1Y3R1cmVgXG4gICAqIFxuICAgKiBAcGFyYW0gaWQgLSBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhlIHN1YmZsb3cgbW91bnQgcG9pbnRcbiAgICogQHBhcmFtIHN1YmZsb3cgLSBUaGUgcHJlYnVpbHQgRmxvd0NoYXJ0IHRvIG1vdW50XG4gICAqIEBwYXJhbSBtb3VudE5hbWUgLSBPcHRpb25hbCBkaXNwbGF5IG5hbWUgZm9yIHRoZSBtb3VudCBwb2ludFxuICAgKiBAcGFyYW0gb3B0aW9ucyAtIE9wdGlvbmFsIGlucHV0L291dHB1dCBtYXBwaW5nIG9wdGlvbnMgZm9yIGRhdGEgZmxvdyBiZXR3ZWVuIHBhcmVudCBhbmQgc3ViZmxvd1xuICAgKi9cbiAgYWRkU3ViRmxvd0NoYXJ0QnJhbmNoKFxuICAgIGlkOiBzdHJpbmcsXG4gICAgc3ViZmxvdzogRmxvd0NoYXJ0PFRPdXQsIFRTY29wZT4sXG4gICAgbW91bnROYW1lPzogc3RyaW5nLFxuICAgIG9wdGlvbnM/OiBTdWJmbG93TW91bnRPcHRpb25zLFxuICApOiBTZWxlY3Rvckxpc3Q8VE91dCwgVFNjb3BlPiB7XG4gICAgaWYgKHRoaXMuYnJhbmNoSWRzLmhhcyhpZCkpIGZhaWwoYGR1cGxpY2F0ZSBzZWxlY3RvciBicmFuY2ggaWQgJyR7aWR9JyB1bmRlciAnJHt0aGlzLmN1ck5vZGUubmFtZX0nYCk7XG4gICAgdGhpcy5icmFuY2hJZHMuYWRkKGlkKTtcblxuICAgIGNvbnN0IGRpc3BsYXlOYW1lID0gbW91bnROYW1lIHx8IGlkO1xuXG4gICAgLy8gTmFtZXNwYWNlIHRoZSBzdWJmbG93J3Mgc3RhZ2UgbmFtZXMgd2l0aCBtb3VudCBpZCB0byBwcmV2ZW50IGNvbGxpc2lvbnNcbiAgICBjb25zdCBwcmVmaXhlZFJvb3QgPSAodGhpcy5iIGFzIGFueSkuX3ByZWZpeE5vZGVUcmVlKHN1YmZsb3cucm9vdCwgaWQpO1xuXG4gICAgLy8gUmVnaXN0ZXIgc3ViZmxvdyBkZWZpbml0aW9uIHdpdGggcHJlZml4ZWQgcm9vdFxuICAgIGlmICghdGhpcy5iLl9zdWJmbG93RGVmcy5oYXMoaWQpKSB7XG4gICAgICB0aGlzLmIuX3N1YmZsb3dEZWZzLnNldChpZCwgeyByb290OiBwcmVmaXhlZFJvb3QgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHJlZmVyZW5jZSBTdGFnZU5vZGVcbiAgICBjb25zdCBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiA9IHtcbiAgICAgIG5hbWU6IGRpc3BsYXlOYW1lLFxuICAgICAgaWQsXG4gICAgICBpc1N1YmZsb3dSb290OiB0cnVlLFxuICAgICAgc3ViZmxvd0lkOiBpZCxcbiAgICAgIHN1YmZsb3dOYW1lOiBkaXNwbGF5TmFtZSxcbiAgICB9O1xuXG4gICAgLy8gU3RvcmUgc3ViZmxvd01vdW50T3B0aW9ucyBpZiBwcm92aWRlZFxuICAgIGlmIChvcHRpb25zKSB7XG4gICAgICBub2RlLnN1YmZsb3dNb3VudE9wdGlvbnMgPSBvcHRpb25zO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBhIFdSQVBQRVIgc3BlYyBmb3IgdGhlIHN1YmZsb3cgbW91bnQgcG9pbnQuXG4gICAgLy8gQ1JJVElDQUw6IFdlIGRvIE5PVCBzcHJlYWQgc3ViZmxvdy5idWlsZFRpbWVTdHJ1Y3R1cmUgaGVyZSFcbiAgICAvLyBJbnN0ZWFkLCB3ZSBzdG9yZSB0aGUgc3ViZmxvdydzIHN0cnVjdHVyZSBpbiBgc3ViZmxvd1N0cnVjdHVyZWAgcHJvcGVydHkuXG4gICAgLy8gVGhpcyBwcmVzZXJ2ZXMgdGhlIHN1YmZsb3cncyBmaXJzdCBzdGFnZSBJRCBhbmQgY3JlYXRlcyBhIGNsZWFyIGJvdW5kYXJ5LlxuICAgIGNvbnN0IHNwZWM6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSA9IHtcbiAgICAgIG5hbWU6IGRpc3BsYXlOYW1lLFxuICAgICAgdHlwZTogJ3N0YWdlJyxcbiAgICAgIGlkLFxuICAgICAgZGlzcGxheU5hbWUsXG4gICAgICBpc1N1YmZsb3dSb290OiB0cnVlLFxuICAgICAgc3ViZmxvd0lkOiBpZCxcbiAgICAgIHN1YmZsb3dOYW1lOiBkaXNwbGF5TmFtZSxcbiAgICAgIC8vIFN0b3JlIHRoZSBDT01QTEVURSBzdWJmbG93IHN0cnVjdHVyZSBmb3IgZHJpbGwtZG93biB2aXN1YWxpemF0aW9uXG4gICAgICBzdWJmbG93U3RydWN0dXJlOiBzdWJmbG93LmJ1aWxkVGltZVN0cnVjdHVyZSxcbiAgICB9O1xuXG4gICAgLy8gQWRkIHRvIHBhcmVudCdzIGNoaWxkcmVuXG4gICAgdGhpcy5jdXJOb2RlLmNoaWxkcmVuID0gdGhpcy5jdXJOb2RlLmNoaWxkcmVuIHx8IFtdO1xuICAgIHRoaXMuY3VyTm9kZS5jaGlsZHJlbi5wdXNoKG5vZGUpO1xuICAgIHRoaXMuY3VyU3BlYy5jaGlsZHJlbiA9IHRoaXMuY3VyU3BlYy5jaGlsZHJlbiB8fCBbXTtcbiAgICB0aGlzLmN1clNwZWMuY2hpbGRyZW4ucHVzaChzcGVjKTtcblxuICAgIC8vIE1lcmdlIHN0YWdlIG1hcHMgd2l0aCBuYW1lc3BhY2UgcHJlZml4XG4gICAgdGhpcy5iLl9tZXJnZVN0YWdlTWFwKHN1YmZsb3cuc3RhZ2VNYXAsIGlkKTtcblxuICAgIC8vIE1lcmdlIG5lc3RlZCBzdWJmbG93cyB3aXRoIG5hbWVzcGFjZSBwcmVmaXhcbiAgICBpZiAoc3ViZmxvdy5zdWJmbG93cykge1xuICAgICAgZm9yIChjb25zdCBba2V5LCBkZWZdIG9mIE9iamVjdC5lbnRyaWVzKHN1YmZsb3cuc3ViZmxvd3MpKSB7XG4gICAgICAgIGNvbnN0IHByZWZpeGVkS2V5ID0gYCR7aWR9LyR7a2V5fWA7XG4gICAgICAgIGlmICghdGhpcy5iLl9zdWJmbG93RGVmcy5oYXMocHJlZml4ZWRLZXkpKSB7XG4gICAgICAgICAgdGhpcy5iLl9zdWJmbG93RGVmcy5zZXQocHJlZml4ZWRLZXksIHtcbiAgICAgICAgICAgIHJvb3Q6ICh0aGlzLmIgYXMgYW55KS5fcHJlZml4Tm9kZVRyZWUoXG4gICAgICAgICAgICAgIGRlZi5yb290IGFzIFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgbXVsdGlwbGUgc2ltcGxlIGJyYW5jaGVzLlxuICAgKi9cbiAgYWRkQnJhbmNoTGlzdChcbiAgICBicmFuY2hlczogQXJyYXk8e1xuICAgICAgaWQ6IHN0cmluZztcbiAgICAgIG5hbWU6IHN0cmluZztcbiAgICAgIGZuPzogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT47XG4gICAgICBkaXNwbGF5TmFtZT86IHN0cmluZztcbiAgICB9PixcbiAgKTogU2VsZWN0b3JMaXN0PFRPdXQsIFRTY29wZT4ge1xuICAgIGZvciAoY29uc3QgeyBpZCwgbmFtZSwgZm4sIGRpc3BsYXlOYW1lIH0gb2YgYnJhbmNoZXMpIHtcbiAgICAgIHRoaXMuYWRkRnVuY3Rpb25CcmFuY2goaWQsIG5hbWUsIGZuLCBkaXNwbGF5TmFtZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbmFsaXplIHRoZSBzZWxlY3RvciBhbmQgcmV0dXJuIHRvIG1haW4gYnVpbGRlci5cbiAgICovXG4gIGVuZCgpOiBGbG93Q2hhcnRCdWlsZGVyPFRPdXQsIFRTY29wZT4ge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5jdXJOb2RlLmNoaWxkcmVuO1xuICAgIGlmICghY2hpbGRyZW4gfHwgY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFtGbG93Q2hhcnRCdWlsZGVyXSBzZWxlY3RvciBhdCAnJHt0aGlzLmN1ck5vZGUubmFtZX0nIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBicmFuY2hgKTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSBzZWxlY3RvciBkaXJlY3RseVxuICAgIHRoaXMuY3VyTm9kZS5uZXh0Tm9kZVNlbGVjdG9yID0gdGhpcy5vcmlnaW5hbFNlbGVjdG9yO1xuXG4gICAgLy8gVXBkYXRlIGJyYW5jaCBJRHMgaW4gc3BlY1xuICAgIHRoaXMuY3VyU3BlYy5icmFuY2hJZHMgPSBjaGlsZHJlblxuICAgICAgLm1hcCgoYykgPT4gYy5pZClcbiAgICAgIC5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IHR5cGVvZiBpZCA9PT0gJ3N0cmluZycgJiYgaWQubGVuZ3RoID4gMCk7XG5cbiAgICAvLyBTZXQgdHlwZSB0byAnZGVjaWRlcicgbm93IHRoYXQgd2Uga25vdyBpdCBoYXMgYnJhbmNoZXNcbiAgICB0aGlzLmN1clNwZWMudHlwZSA9ICdkZWNpZGVyJztcblxuICAgIC8vIEFjY3VtdWxhdGUgZGVzY3JpcHRpb24gbGluZXMgZm9yIHRoZSBzZWxlY3RvciBhbmQgaXRzIGJyYW5jaGVzXG4gICAgaWYgKHRoaXMucmVzZXJ2ZWRTdGVwTnVtYmVyID4gMCkge1xuICAgICAgY29uc3Qgc2VsZWN0b3JMYWJlbCA9IHRoaXMuY3VyTm9kZS5kaXNwbGF5TmFtZSB8fCB0aGlzLmN1ck5vZGUubmFtZTtcbiAgICAgIGNvbnN0IGJyYW5jaElkTGlzdCA9IHRoaXMuYnJhbmNoRGVzY0luZm8ubWFwKChiKSA9PiBiLmlkKS5qb2luKCcsICcpO1xuICAgICAgY29uc3QgbWFpbkxpbmUgPSBgJHt0aGlzLnJlc2VydmVkU3RlcE51bWJlcn0uICR7c2VsZWN0b3JMYWJlbH0g4oCUIFNlbGVjdHMgZnJvbTogJHticmFuY2hJZExpc3R9YDtcbiAgICAgIHRoaXMucGFyZW50RGVzY3JpcHRpb25QYXJ0cy5wdXNoKG1haW5MaW5lKTtcblxuICAgICAgLy8gQXBwZW5kIGFycm93IGxpbmVzIGZvciBlYWNoIGJyYW5jaFxuICAgICAgZm9yIChjb25zdCBicmFuY2ggb2YgdGhpcy5icmFuY2hEZXNjSW5mbykge1xuICAgICAgICBjb25zdCBicmFuY2hUZXh0ID0gYnJhbmNoLmRlc2NyaXB0aW9uIHx8IGJyYW5jaC5kaXNwbGF5TmFtZTtcbiAgICAgICAgaWYgKGJyYW5jaFRleHQpIHtcbiAgICAgICAgICB0aGlzLnBhcmVudERlc2NyaXB0aW9uUGFydHMucHVzaChgICAg4oaSICR7YnJhbmNoLmlkfTogJHticmFuY2hUZXh0fWApO1xuICAgICAgICB9XG4gICAgICAgIC8vIFN0b3JlIGluZGl2aWR1YWwgYnJhbmNoIGRlc2NyaXB0aW9uc1xuICAgICAgICBpZiAoYnJhbmNoLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgdGhpcy5wYXJlbnRTdGFnZURlc2NyaXB0aW9ucy5zZXQoYnJhbmNoLmlkLCBicmFuY2guZGVzY3JpcHRpb24pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYjtcbiAgfVxufVxuXG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEZsb3dDaGFydEJ1aWxkZXIgKHNpbXBsaWZpZWQpXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xuXG4vKipcbiAqIFNpbXBsaWZpZWQgRmxvd0NoYXJ0QnVpbGRlciB0aGF0IGJ1aWxkcyBTdGFnZU5vZGUgYW5kIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSBkaXJlY3RseS5cbiAqIFxuICogS2V5IGRpZmZlcmVuY2VzIGZyb20gb3JpZ2luYWw6XG4gKiAtIE5vIF9OIGludGVybWVkaWF0ZSBjbGFzc1xuICogLSBObyBwYXJlbnQgcG9pbnRlciBvbiBub2Rlc1xuICogLSBObyBlbmQoKSBmb3IgbmF2aWdhdGlvbiAob25seSBEZWNpZGVyTGlzdC5lbmQoKSBhbmQgU2VsZWN0b3JMaXN0LmVuZCgpKVxuICogLSBObyBpbnRvKCkgbWV0aG9kXG4gKiAtIE5vIF9zcGF3bkF0KCkgbWV0aG9kXG4gKiAtIE5vIGJ1aWxkIGNhbGxiYWNrcyBpbiBhZGRGdW5jdGlvbkJyYW5jaCwgYWRkTGlzdE9mRnVuY3Rpb24sIGV0Yy5cbiAqIC0gQnVpbGRzIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSBkaXJlY3RseSB3aXRoIHR5cGUgZmllbGQgKGluY3JlbWVudGFsIHR5cGUgY29tcHV0YXRpb24pXG4gKiAtIEFwcGxpZXMgYnVpbGRUaW1lRXh0cmFjdG9yIGltbWVkaWF0ZWx5IHdoZW4gbm9kZXMgYXJlIGNyZWF0ZWQgKG5vdCBhdCBidWlsZCB0aW1lKVxuICogXG4gKiBfUmVxdWlyZW1lbnRzOiBmbG93Y2hhcnQtYnVpbGRlci1zaW1wbGlmaWNhdGlvbiAxLjEsIDMuMSwgMy4yLCAzLjMsIDMuNF9cbiAqIF9SZXF1aXJlbWVudHM6IGluY3JlbWVudGFsLXR5cGUtY29tcHV0YXRpb24gMS4xLCAyLjEsIDIuMiwgMy4xLCAzLjJfXG4gKi9cbmV4cG9ydCBjbGFzcyBGbG93Q2hhcnRCdWlsZGVyPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4ge1xuICAvLyBSb290IG5vZGUgKFN0YWdlTm9kZSkgLSBidWlsdCBpbmNyZW1lbnRhbGx5XG4gIHByaXZhdGUgX3Jvb3Q/OiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPjtcbiAgXG4gIC8vIFJvb3Qgc3BlYyAoU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlKSAtIGJ1aWx0IGluY3JlbWVudGFsbHkgd2l0aCB0eXBlIGZpZWxkXG4gIHByaXZhdGUgX3Jvb3RTcGVjPzogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlO1xuICBcbiAgLy8gQ3VycmVudCBjdXJzb3IgZm9yIGxpbmVhciBjaGFpbmluZ1xuICBwcml2YXRlIF9jdXJzb3I/OiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPjtcbiAgcHJpdmF0ZSBfY3Vyc29yU3BlYz86IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZTtcbiAgXG4gIC8vIFN0YWdlIGZ1bmN0aW9uIHJlZ2lzdHJ5XG4gIHByaXZhdGUgX3N0YWdlTWFwID0gbmV3IE1hcDxzdHJpbmcsIFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+PigpO1xuICBcbiAgLy8gU3ViZmxvdyBkZWZpbml0aW9ucyAoZm9yIHJlZmVyZW5jZS1iYXNlZCBtb3VudGluZylcbiAgX3N1YmZsb3dEZWZzID0gbmV3IE1hcDxzdHJpbmcsIHsgcm9vdDogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gfT4oKTtcbiAgXG4gIC8vIFN0cmVhbSBoYW5kbGVyc1xuICBwcml2YXRlIF9zdHJlYW1IYW5kbGVyczogU3RyZWFtSGFuZGxlcnMgPSB7fTtcbiAgXG4gIC8vIEV4dHJhY3RvcnNcbiAgcHJpdmF0ZSBfZXh0cmFjdG9yPzogVHJhdmVyc2FsRXh0cmFjdG9yO1xuICBwcml2YXRlIF9idWlsZFRpbWVFeHRyYWN0b3I/OiBCdWlsZFRpbWVFeHRyYWN0b3I8YW55PjtcbiAgcHJpdmF0ZSBfYnVpbGRUaW1lRXh0cmFjdG9yRXJyb3JzOiBBcnJheTx7IG1lc3NhZ2U6IHN0cmluZzsgZXJyb3I6IHVua25vd24gfT4gPSBbXTtcblxuICAvKipcbiAgICogV2hldGhlciBuYXJyYXRpdmUgZ2VuZXJhdGlvbiBpcyBlbmFibGVkIGF0IGJ1aWxkIHRpbWUuXG4gICAqXG4gICAqIFdIWTogU3RvcmVkIGFzIGEgZmllbGQgc28gc2V0RW5hYmxlTmFycmF0aXZlKCkgb3IgZXhlY3V0ZShvcHRzKSBjYW4gc2V0IGl0XG4gICAqIGJlZm9yZSBidWlsZCgpIGlzIGNhbGxlZC4gYnVpbGQoKSBpbmNsdWRlcyBpdCBpbiB0aGUgRmxvd0NoYXJ0IG9iamVjdC5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcGlwZWxpbmUtbmFycmF0aXZlLWdlbmVyYXRpb24gMS40X1xuICAgKi9cbiAgcHJpdmF0ZSBfZW5hYmxlTmFycmF0aXZlID0gZmFsc2U7XG5cbiAgLyog4pSA4pSAIERlc2NyaXB0aW9uIGFjY3VtdWxhdG9yIGZpZWxkcyDilIDilIAgKi9cblxuICAvKiogQWNjdW11bGF0ZWQgZGVzY3JpcHRpb24gbGluZXMsIGJ1aWx0IGluY3JlbWVudGFsbHkgYXMgc3RhZ2VzIGFyZSBhZGRlZC4gKi9cbiAgcHJpdmF0ZSBfZGVzY3JpcHRpb25QYXJ0czogc3RyaW5nW10gPSBbXTtcblxuICAvKiogQ3VycmVudCBzdGVwIG51bWJlciBmb3IgZGVzY3JpcHRpb24gbnVtYmVyaW5nLiAqL1xuICBwcml2YXRlIF9zdGVwQ291bnRlciA9IDA7XG5cbiAgLyoqIE1hcCBvZiBzdGFnZSBuYW1lIOKGkiBpbmRpdmlkdWFsIGRlc2NyaXB0aW9uIGZvciBVSSB0b29sdGlwcy4gKi9cbiAgcHJpdmF0ZSBfc3RhZ2VEZXNjcmlwdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG4gIC8qKiBNYXAgb2Ygc3RhZ2UgbmFtZSDihpIgc3RlcCBudW1iZXIgZm9yIGxvb3BUbyBzdGVwLW51bWJlciBsb29rdXAuICovXG4gIHByaXZhdGUgX3N0YWdlU3RlcE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cbiAgLyoqXG4gICAqIEluY3JlbWVudCBzdGVwIGNvdW50ZXIsIGZvcm1hdCBhIGRlc2NyaXB0aW9uIGxpbmUsIGFuZCBwdXNoIHRvIF9kZXNjcmlwdGlvblBhcnRzLlxuICAgKlxuICAgKiBXSFk6IENlbnRyYWxpemVzIHRoZSBpbmNyZW1lbnRhbCBkZXNjcmlwdGlvbiBhY2N1bXVsYXRpb24gbG9naWMgc28gZXZlcnlcbiAgICogYnVpbGRlciBtZXRob2QgKHN0YXJ0LCBhZGRGdW5jdGlvbiwgYWRkU3RyZWFtaW5nRnVuY3Rpb24sIGV0Yy4pIHVzZXMgdGhlXG4gICAqIHNhbWUgZm9ybWF0dGluZyBhbmQgYm9va2tlZXBpbmcuXG4gICAqXG4gICAqIEBwYXJhbSBkaXNwbGF5TmFtZSAtIFRoZSBkaXNwbGF5IG5hbWUgKGZhbGxzIGJhY2sgdG8gbmFtZSlcbiAgICogQHBhcmFtIG5hbWUgLSBUaGUgc3RhZ2UgbmFtZSAodXNlZCBhcyBrZXkgaW4gbWFwcylcbiAgICogQHBhcmFtIGRlc2NyaXB0aW9uIC0gT3B0aW9uYWwgaHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb25cbiAgICovXG4gIHByaXZhdGUgX2FwcGVuZERlc2NyaXB0aW9uTGluZShkaXNwbGF5TmFtZTogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5fc3RlcENvdW50ZXIrKztcbiAgICB0aGlzLl9zdGFnZVN0ZXBNYXAuc2V0KG5hbWUsIHRoaXMuX3N0ZXBDb3VudGVyKTtcbiAgICBjb25zdCBsYWJlbCA9IGRpc3BsYXlOYW1lIHx8IG5hbWU7XG4gICAgY29uc3QgbGluZSA9IGRlc2NyaXB0aW9uXG4gICAgICA/IGAke3RoaXMuX3N0ZXBDb3VudGVyfS4gJHtsYWJlbH0g4oCUICR7ZGVzY3JpcHRpb259YFxuICAgICAgOiBgJHt0aGlzLl9zdGVwQ291bnRlcn0uICR7bGFiZWx9YDtcbiAgICB0aGlzLl9kZXNjcmlwdGlvblBhcnRzLnB1c2gobGluZSk7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSB7XG4gICAgICB0aGlzLl9zdGFnZURlc2NyaXB0aW9ucy5zZXQobmFtZSwgZGVzY3JpcHRpb24pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBFbmFibGUgbmFycmF0aXZlIGdlbmVyYXRpb24gYXQgYnVpbGQgdGltZS5cbiAgICpcbiAgICogV0hZOiBBbGxvd3MgY29uc3VtZXJzIHRvIG9wdCBpbnRvIG5hcnJhdGl2ZSB2aWEgdGhlIGJ1aWxkZXIgQVBJLFxuICAgKiBzbyB0aGUgcmVzdWx0aW5nIEZsb3dDaGFydCBjYXJyaWVzIHRoZSBmbGFnIGFuZCBGbG93Q2hhcnRFeGVjdXRvclxuICAgKiByZXNwZWN0cyBpdCBhcyBhIGRlZmF1bHQgd2l0aG91dCByZXF1aXJpbmcgYW4gZXhwbGljaXRcbiAgICogZW5hYmxlTmFycmF0aXZlKCkgY2FsbCBvbiB0aGUgZXhlY3V0b3IuXG4gICAqXG4gICAqIERFU0lHTjogRmx1ZW50IEFQSSDigJQgcmV0dXJucyBgdGhpc2AgZm9yIGNoYWluaW5nLlxuICAgKlxuICAgKiBAcmV0dXJucyB0aGlzIGJ1aWxkZXIgZm9yIGNoYWluaW5nXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgY2hhcnQgPSBmbG93Q2hhcnQoJ2VudHJ5JywgZW50cnlGbilcbiAgICogICAuYWRkRnVuY3Rpb24oJ3Byb2Nlc3MnLCBwcm9jZXNzRm4pXG4gICAqICAgLnNldEVuYWJsZU5hcnJhdGl2ZSgpXG4gICAqICAgLmJ1aWxkKCk7XG4gICAqIC8vIGNoYXJ0LmVuYWJsZU5hcnJhdGl2ZSA9PT0gdHJ1ZVxuICAgKiBgYGBcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogcGlwZWxpbmUtbmFycmF0aXZlLWdlbmVyYXRpb24gMS40X1xuICAgKi9cbiAgc2V0RW5hYmxlTmFycmF0aXZlKCk6IHRoaXMge1xuICAgIHRoaXMuX2VuYWJsZU5hcnJhdGl2ZSA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IEZsb3dDaGFydEJ1aWxkZXIuXG4gICAqIEBwYXJhbSBidWlsZFRpbWVFeHRyYWN0b3IgT3B0aW9uYWwgZXh0cmFjdG9yIHRvIGFwcGx5IHRvIGVhY2ggbm9kZSBhcyBpdCdzIGNyZWF0ZWQuXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgUGFzcyB0aGlzIGluIHRoZSBjb25zdHJ1Y3RvciB0byBlbnN1cmUgaXQncyBhcHBsaWVkIHRvIEFMTCBub2Rlcy5cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAzLjJfXG4gICAqL1xuICBjb25zdHJ1Y3RvcihidWlsZFRpbWVFeHRyYWN0b3I/OiBCdWlsZFRpbWVFeHRyYWN0b3I8YW55Pikge1xuICAgIGlmIChidWlsZFRpbWVFeHRyYWN0b3IpIHtcbiAgICAgIHRoaXMuX2J1aWxkVGltZUV4dHJhY3RvciA9IGJ1aWxkVGltZUV4dHJhY3RvcjtcbiAgICB9XG4gIH1cblxuICAvKiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgTGluZWFyIENoYWluaW5nIEFQSSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgKi9cblxuICAvKipcbiAgICogRGVmaW5lIHRoZSByb290IGZ1bmN0aW9uIG9mIHRoZSBmbG93LlxuICAgKiBfUmVxdWlyZW1lbnRzOiBmbG93Y2hhcnQtYnVpbGRlci1zaW1wbGlmaWNhdGlvbiA0LjEsIDUuMV9cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAxLjFfXG4gICAqL1xuICBzdGFydChcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgZm4/OiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPixcbiAgICBpZD86IHN0cmluZyxcbiAgICBkaXNwbGF5TmFtZT86IHN0cmluZyxcbiAgICBkZXNjcmlwdGlvbj86IHN0cmluZyxcbiAgKTogdGhpcyB7XG4gICAgaWYgKHRoaXMuX3Jvb3QpIGZhaWwoJ3Jvb3QgYWxyZWFkeSBkZWZpbmVkOyBjcmVhdGUgYSBuZXcgYnVpbGRlcicpO1xuXG4gICAgLy8gQ3JlYXRlIFN0YWdlTm9kZSBkaXJlY3RseVxuICAgIGNvbnN0IG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+ID0geyBuYW1lIH07XG4gICAgaWYgKGlkKSBub2RlLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBub2RlLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBub2RlLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gICAgaWYgKGZuKSB7XG4gICAgICBub2RlLmZuID0gZm47XG4gICAgICB0aGlzLl9hZGRUb01hcChuYW1lLCBmbik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSB3aXRoIHR5cGU9J3N0YWdlJyBhbmQgYXBwbHkgZXh0cmFjdG9yXG4gICAgbGV0IHNwZWM6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSA9IHsgbmFtZSwgdHlwZTogJ3N0YWdlJyB9O1xuICAgIGlmIChpZCkgc3BlYy5pZCA9IGlkO1xuICAgIGlmIChkaXNwbGF5TmFtZSkgc3BlYy5kaXNwbGF5TmFtZSA9IGRpc3BsYXlOYW1lO1xuICAgIGlmIChkZXNjcmlwdGlvbikgc3BlYy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuICAgIFxuICAgIC8vIEFwcGx5IGV4dHJhY3RvciBpbW1lZGlhdGVseVxuICAgIHNwZWMgPSB0aGlzLl9hcHBseUV4dHJhY3RvclRvTm9kZShzcGVjKTtcblxuICAgIHRoaXMuX3Jvb3QgPSBub2RlO1xuICAgIHRoaXMuX3Jvb3RTcGVjID0gc3BlYztcbiAgICB0aGlzLl9jdXJzb3IgPSBub2RlO1xuICAgIHRoaXMuX2N1cnNvclNwZWMgPSBzcGVjO1xuXG4gICAgLy8gQWNjdW11bGF0ZSBkZXNjcmlwdGlvbiBsaW5lXG4gICAgdGhpcy5fYXBwZW5kRGVzY3JpcHRpb25MaW5lKGRpc3BsYXlOYW1lIHx8IG5hbWUsIG5hbWUsIGRlc2NyaXB0aW9uKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEFwcGVuZCBhIGxpbmVhciBcIm5leHRcIiBmdW5jdGlvbiBhbmQgbW92ZSB0byBpdC5cbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gNC4yLCA1LjJfXG4gICAqIF9SZXF1aXJlbWVudHM6IGluY3JlbWVudGFsLXR5cGUtY29tcHV0YXRpb24gMS4yX1xuICAgKi9cbiAgYWRkRnVuY3Rpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGZuPzogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4sXG4gICAgaWQ/OiBzdHJpbmcsXG4gICAgZGlzcGxheU5hbWU/OiBzdHJpbmcsXG4gICAgZGVzY3JpcHRpb24/OiBzdHJpbmcsXG4gICk6IHRoaXMge1xuICAgIGNvbnN0IGN1ciA9IHRoaXMuX25lZWRDdXJzb3IoKTtcbiAgICBjb25zdCBjdXJTcGVjID0gdGhpcy5fbmVlZEN1cnNvclNwZWMoKTtcblxuICAgIC8vIENyZWF0ZSBTdGFnZU5vZGUgZGlyZWN0bHlcbiAgICBjb25zdCBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiA9IHsgbmFtZSB9O1xuICAgIGlmIChpZCkgbm9kZS5pZCA9IGlkO1xuICAgIGlmIChkaXNwbGF5TmFtZSkgbm9kZS5kaXNwbGF5TmFtZSA9IGRpc3BsYXlOYW1lO1xuICAgIGlmIChkZXNjcmlwdGlvbikgbm9kZS5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuICAgIGlmIChmbikge1xuICAgICAgbm9kZS5mbiA9IGZuO1xuICAgICAgdGhpcy5fYWRkVG9NYXAobmFtZSwgZm4pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgd2l0aCB0eXBlPSdzdGFnZScgYW5kIGFwcGx5IGV4dHJhY3RvclxuICAgIGxldCBzcGVjOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgPSB7IG5hbWUsIHR5cGU6ICdzdGFnZScgfTtcbiAgICBpZiAoaWQpIHNwZWMuaWQgPSBpZDtcbiAgICBpZiAoZGlzcGxheU5hbWUpIHNwZWMuZGlzcGxheU5hbWUgPSBkaXNwbGF5TmFtZTtcbiAgICBpZiAoZGVzY3JpcHRpb24pIHNwZWMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcbiAgICBcbiAgICAvLyBBcHBseSBleHRyYWN0b3IgaW1tZWRpYXRlbHlcbiAgICBzcGVjID0gdGhpcy5fYXBwbHlFeHRyYWN0b3JUb05vZGUoc3BlYyk7XG5cbiAgICAvLyBMaW5rIHRvIGN1cnJlbnQgbm9kZVxuICAgIGN1ci5uZXh0ID0gbm9kZTtcbiAgICBjdXJTcGVjLm5leHQgPSBzcGVjO1xuXG4gICAgLy8gTW92ZSBjdXJzb3JcbiAgICB0aGlzLl9jdXJzb3IgPSBub2RlO1xuICAgIHRoaXMuX2N1cnNvclNwZWMgPSBzcGVjO1xuXG4gICAgLy8gQWNjdW11bGF0ZSBkZXNjcmlwdGlvbiBsaW5lXG4gICAgdGhpcy5fYXBwZW5kRGVzY3JpcHRpb25MaW5lKGRpc3BsYXlOYW1lIHx8IG5hbWUsIG5hbWUsIGRlc2NyaXB0aW9uKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIHN0cmVhbWluZyBmdW5jdGlvbi5cbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gNS4zX1xuICAgKiBfUmVxdWlyZW1lbnRzOiBpbmNyZW1lbnRhbC10eXBlLWNvbXB1dGF0aW9uIDEuM19cbiAgICovXG4gIGFkZFN0cmVhbWluZ0Z1bmN0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBzdHJlYW1JZD86IHN0cmluZyxcbiAgICBmbj86IFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+LFxuICAgIGlkPzogc3RyaW5nLFxuICAgIGRpc3BsYXlOYW1lPzogc3RyaW5nLFxuICAgIGRlc2NyaXB0aW9uPzogc3RyaW5nLFxuICApOiB0aGlzIHtcbiAgICBjb25zdCBjdXIgPSB0aGlzLl9uZWVkQ3Vyc29yKCk7XG4gICAgY29uc3QgY3VyU3BlYyA9IHRoaXMuX25lZWRDdXJzb3JTcGVjKCk7XG5cbiAgICAvLyBDcmVhdGUgU3RhZ2VOb2RlIGRpcmVjdGx5IHdpdGggc3RyZWFtaW5nIHByb3BlcnRpZXNcbiAgICBjb25zdCBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiA9IHtcbiAgICAgIG5hbWUsXG4gICAgICBpc1N0cmVhbWluZzogdHJ1ZSxcbiAgICAgIHN0cmVhbUlkOiBzdHJlYW1JZCA/PyBuYW1lLFxuICAgIH07XG4gICAgaWYgKGlkKSBub2RlLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBub2RlLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBub2RlLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gICAgaWYgKGZuKSB7XG4gICAgICBub2RlLmZuID0gZm47XG4gICAgICB0aGlzLl9hZGRUb01hcChuYW1lLCBmbik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSB3aXRoIHR5cGU9J3N0cmVhbWluZycgYW5kIGFwcGx5IGV4dHJhY3RvclxuICAgIGxldCBzcGVjOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgPSB7XG4gICAgICBuYW1lLFxuICAgICAgdHlwZTogJ3N0cmVhbWluZycsXG4gICAgICBpc1N0cmVhbWluZzogdHJ1ZSxcbiAgICAgIHN0cmVhbUlkOiBzdHJlYW1JZCA/PyBuYW1lLFxuICAgIH07XG4gICAgaWYgKGlkKSBzcGVjLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBzcGVjLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBzcGVjLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gICAgXG4gICAgLy8gQXBwbHkgZXh0cmFjdG9yIGltbWVkaWF0ZWx5XG4gICAgc3BlYyA9IHRoaXMuX2FwcGx5RXh0cmFjdG9yVG9Ob2RlKHNwZWMpO1xuXG4gICAgLy8gTGluayB0byBjdXJyZW50IG5vZGVcbiAgICBjdXIubmV4dCA9IG5vZGU7XG4gICAgY3VyU3BlYy5uZXh0ID0gc3BlYztcblxuICAgIC8vIE1vdmUgY3Vyc29yXG4gICAgdGhpcy5fY3Vyc29yID0gbm9kZTtcbiAgICB0aGlzLl9jdXJzb3JTcGVjID0gc3BlYztcblxuICAgIC8vIEFjY3VtdWxhdGUgZGVzY3JpcHRpb24gbGluZVxuICAgIHRoaXMuX2FwcGVuZERlc2NyaXB0aW9uTGluZShkaXNwbGF5TmFtZSB8fCBuYW1lLCBuYW1lLCBkZXNjcmlwdGlvbik7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCBCcmFuY2hpbmcgQVBJIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqL1xuXG4gIC8qKlxuICAgKiBBZGQgYSBsZWdhY3kgb3V0cHV0LWJhc2VkIGRlY2lkZXIg4oCUIHJldHVybnMgRGVjaWRlckxpc3QgZm9yIGFkZGluZyBicmFuY2hlcy5cbiAgICpcbiAgICogV0hZOiBUaGlzIGlzIHRoZSBvcmlnaW5hbCBkZWNpZGVyIEFQSSB3aGVyZSB0aGUgZGVjaWRlciBmdW5jdGlvbiByZWNlaXZlc1xuICAgKiB0aGUgcHJldmlvdXMgc3RhZ2UncyBvdXRwdXQgYW5kIHJldHVybnMgYSBicmFuY2ggSUQuIEtlcHQgZm9yIGJhY2t3YXJkXG4gICAqIGNvbXBhdGliaWxpdHkgd2l0aCBleGlzdGluZyBjb25zdW1lcnMuXG4gICAqXG4gICAqIEBkZXByZWNhdGVkIFVzZSB7QGxpbmsgYWRkRGVjaWRlckZ1bmN0aW9ufSBpbnN0ZWFkLiBUaGUgbmV3IEFQSSBtYWtlcyB0aGUgZGVjaWRlclxuICAgKiBhIGZpcnN0LWNsYXNzIHN0YWdlIGZ1bmN0aW9uIHRoYXQgcmVhZHMgZnJvbSBzY29wZSwgcHJvdmlkaW5nIGJldHRlciBkZWNvdXBsaW5nLFxuICAgKiBkZWJ1ZyB2aXNpYmlsaXR5LCBhbmQgYWxpZ25tZW50IHdpdGggbW9kZXJuIHN0YXRlLWJhc2VkIHJvdXRpbmcgcGF0dGVybnMuXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDYuMV9cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAxLjRfXG4gICAqIF9SZXF1aXJlbWVudHM6IGRlY2lkZXItZmlyc3QtY2xhc3Mtc3RhZ2UgNC4xLCA0LjJfXG4gICAqL1xuICBhZGREZWNpZGVyKFxuICAgIGRlY2lkZXI6IChvdXQ/OiBUT3V0KSA9PiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz4sXG4gICk6IERlY2lkZXJMaXN0PFRPdXQsIFRTY29wZT4ge1xuICAgIGNvbnN0IGN1ciA9IHRoaXMuX25lZWRDdXJzb3IoKTtcbiAgICBjb25zdCBjdXJTcGVjID0gdGhpcy5fbmVlZEN1cnNvclNwZWMoKTtcblxuICAgIGlmIChjdXIubmV4dE5vZGVEZWNpZGVyKSBmYWlsKGBkZWNpZGVyIGFscmVhZHkgZGVmaW5lZCBhdCAnJHtjdXIubmFtZX0nYCk7XG4gICAgaWYgKGN1ci5kZWNpZGVyRm4pIGZhaWwoYGRlY2lkZXIgYWxyZWFkeSBkZWZpbmVkIGF0ICcke2N1ci5uYW1lfSdgKTtcbiAgICBpZiAoY3VyLm5leHROb2RlU2VsZWN0b3IpIGZhaWwoYGRlY2lkZXIgYW5kIHNlbGVjdG9yIGFyZSBtdXR1YWxseSBleGNsdXNpdmUgYXQgJyR7Y3VyLm5hbWV9J2ApO1xuXG4gICAgLy8gTWFyayBhcyBkZWNpZGVyIGluIHNwZWMgKHR5cGUgd2lsbCBiZSBzZXQgdG8gJ2RlY2lkZXInIGluIERlY2lkZXJMaXN0LmVuZCgpKVxuICAgIGN1clNwZWMuaGFzRGVjaWRlciA9IHRydWU7XG5cbiAgICAvLyBSZXNlcnZlIGEgc3RlcCBudW1iZXIgZm9yIHRoZSBkZWNpZGVyIOKAlCB0aGUgZnVsbCBkZXNjcmlwdGlvbiBsaW5lXG4gICAgLy8gKGluY2x1ZGluZyBicmFuY2ggbmFtZXMpIGlzIGRlZmVycmVkIHRvIERlY2lkZXJMaXN0LmVuZCgpXG4gICAgdGhpcy5fc3RlcENvdW50ZXIrKztcbiAgICB0aGlzLl9zdGFnZVN0ZXBNYXAuc2V0KGN1ci5uYW1lLCB0aGlzLl9zdGVwQ291bnRlcik7XG5cbiAgICByZXR1cm4gbmV3IERlY2lkZXJMaXN0PFRPdXQsIFRTY29wZT4oXG4gICAgICB0aGlzLCBjdXIsIGN1clNwZWMsIGRlY2lkZXIsIGZhbHNlLFxuICAgICAgdGhpcy5fZGVzY3JpcHRpb25QYXJ0cywgdGhpcy5fc3RhZ2VEZXNjcmlwdGlvbnMsIHRoaXMuX3N0ZXBDb3VudGVyLFxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgc2NvcGUtYmFzZWQgZGVjaWRlciBmdW5jdGlvbiDigJQgcmV0dXJucyBEZWNpZGVyTGlzdCBmb3IgYWRkaW5nIGJyYW5jaGVzLlxuICAgKlxuICAgKiBXSFk6IE1ha2VzIHRoZSBkZWNpZGVyIGEgZmlyc3QtY2xhc3Mgc3RhZ2UgZnVuY3Rpb24gdGhhdCByZWFkcyBmcm9tIHNjb3BlXG4gICAqIChzaGFyZWQgc3RhdGUpIGluc3RlYWQgb2YgdGhlIHByZXZpb3VzIHN0YWdlJ3Mgb3V0cHV0LiBUaGlzIGRlY291cGxlcyB0aGVcbiAgICogZGVjaWRlciBmcm9tIHRoZSBwcmVjZWRpbmcgc3RhZ2UncyByZXR1cm4gdHlwZSwgcHJvdmlkZXMgZGVidWcgdmlzaWJpbGl0eVxuICAgKiAoc3RlcCBudW1iZXIsIGV4dHJhY3RvciBjYWxsLCBzbmFwc2hvdCksIGFuZCBhbGlnbnMgd2l0aCBob3cgTGFuZ0dyYXBoXG4gICAqIHJlYWRzIGZyb20gc3RhdGUgYW5kIEFpcmZsb3cgcmVhZHMgZnJvbSBYQ29tLlxuICAgKlxuICAgKiBERVNJR046IFRoZSBkZWNpZGVyIGZ1bmN0aW9uIElTIHRoZSBzdGFnZSBmdW5jdGlvbiDigJQgaXRzIHJldHVybiB2YWx1ZSAoYSBzdHJpbmcpXG4gICAqIGlzIHRoZSBicmFuY2ggSUQuIE5vIHNlcGFyYXRlIGRlY2lkZXIgaW52b2NhdGlvbiBzdGVwLiBUaGUgZnVuY3Rpb24gaXMgcmVnaXN0ZXJlZFxuICAgKiBpbiB0aGUgc3RhZ2VNYXAgbGlrZSBhbnkgb3RoZXIgc3RhZ2UsIGFuZCBgZGVjaWRlckZuID0gdHJ1ZWAgb24gdGhlIFN0YWdlTm9kZVxuICAgKiB0ZWxscyBQaXBlbGluZSB0byBpbnRlcnByZXQgdGhlIHJldHVybiB2YWx1ZSBhcyBhIGJyYW5jaCBJRC5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUgLSBTdGFnZSBuYW1lIGZvciB0aGUgZGVjaWRlciBub2RlXG4gICAqIEBwYXJhbSBmbiAtIFN0YWdlIGZ1bmN0aW9uIHRoYXQgcmVjZWl2ZXMgKHNjb3BlLCBicmVha0ZuKSBhbmQgcmV0dXJucyBhIGJyYW5jaCBJRCBzdHJpbmdcbiAgICogQHBhcmFtIGlkIC0gT3B0aW9uYWwgc3RhYmxlIElEIGZvciB0aGUgbm9kZSAoZm9yIGRlYnVnIFVJLCB0aW1lLXRyYXZlbCwgZXRjLilcbiAgICogQHBhcmFtIGRpc3BsYXlOYW1lIC0gT3B0aW9uYWwgZGlzcGxheSBuYW1lIGZvciBVSSB2aXN1YWxpemF0aW9uXG4gICAqIEByZXR1cm5zIERlY2lkZXJMaXN0IGZvciBmbHVlbnQgYnJhbmNoIGNvbmZpZ3VyYXRpb25cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBmbG93Q2hhcnQoJ2VudHJ5JywgZW50cnlGbilcbiAgICogICAuYWRkRGVjaWRlckZ1bmN0aW9uKCdSb3V0ZURlY2lkZXInLCBhc3luYyAoc2NvcGUpID0+IHtcbiAgICogICAgIGNvbnN0IHR5cGUgPSBzY29wZS5nZXQoJ3R5cGUnKTtcbiAgICogICAgIHJldHVybiB0eXBlID09PSAnZXhwcmVzcycgPyAnZXhwcmVzcy1icmFuY2gnIDogJ3N0YW5kYXJkLWJyYW5jaCc7XG4gICAqICAgfSwgJ3JvdXRlLWRlY2lkZXInKVxuICAgKiAgICAgLmFkZEZ1bmN0aW9uQnJhbmNoKCdleHByZXNzLWJyYW5jaCcsICdFeHByZXNzJywgZXhwcmVzc0ZuKVxuICAgKiAgICAgLmFkZEZ1bmN0aW9uQnJhbmNoKCdzdGFuZGFyZC1icmFuY2gnLCAnU3RhbmRhcmQnLCBzdGFuZGFyZEZuKVxuICAgKiAgIC5lbmQoKVxuICAgKiAgIC5idWlsZCgpO1xuICAgKiBgYGBcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogZGVjaWRlci1maXJzdC1jbGFzcy1zdGFnZSAxLjEsIDEuMiwgMS4zLCAxLjQsIDEuNSwgNi4xX1xuICAgKi9cbiAgYWRkRGVjaWRlckZ1bmN0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBmbjogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4sXG4gICAgaWQ/OiBzdHJpbmcsXG4gICAgZGlzcGxheU5hbWU/OiBzdHJpbmcsXG4gICAgZGVzY3JpcHRpb24/OiBzdHJpbmcsXG4gICk6IERlY2lkZXJMaXN0PFRPdXQsIFRTY29wZT4ge1xuICAgIGNvbnN0IGN1ciA9IHRoaXMuX25lZWRDdXJzb3IoKTtcbiAgICBjb25zdCBjdXJTcGVjID0gdGhpcy5fbmVlZEN1cnNvclNwZWMoKTtcblxuICAgIGlmIChjdXIubmV4dE5vZGVEZWNpZGVyKSBmYWlsKGBkZWNpZGVyIGFscmVhZHkgZGVmaW5lZCBhdCAnJHtjdXIubmFtZX0nYCk7XG4gICAgaWYgKGN1ci5kZWNpZGVyRm4pIGZhaWwoYGRlY2lkZXIgYWxyZWFkeSBkZWZpbmVkIGF0ICcke2N1ci5uYW1lfSdgKTtcbiAgICBpZiAoY3VyLm5leHROb2RlU2VsZWN0b3IpIGZhaWwoYGRlY2lkZXIgYW5kIHNlbGVjdG9yIGFyZSBtdXR1YWxseSBleGNsdXNpdmUgYXQgJyR7Y3VyLm5hbWV9J2ApO1xuXG4gICAgLy8gQ3JlYXRlIFN0YWdlTm9kZSB3aXRoIHRoZSBkZWNpZGVyIGZ1bmN0aW9uIGFzIHRoZSBzdGFnZSBmdW5jdGlvblxuICAgIGNvbnN0IG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+ID0geyBuYW1lIH07XG4gICAgaWYgKGlkKSBub2RlLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBub2RlLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBub2RlLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gICAgbm9kZS5mbiA9IGZuO1xuXG4gICAgLy8gUmVnaXN0ZXIgZm4gaW4gc3RhZ2VNYXAgc28gUGlwZWxpbmUgY2FuIHJlc29sdmUgaXQgZHVyaW5nIGV4ZWN1dGlvblxuICAgIC8vIF9SZXF1aXJlbWVudHM6IGRlY2lkZXItZmlyc3QtY2xhc3Mtc3RhZ2UgMS4zX1xuICAgIHRoaXMuX2FkZFRvTWFwKG5hbWUsIGZuKTtcblxuICAgIC8vIENyZWF0ZSBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgd2l0aCBoYXNEZWNpZGVyOiB0cnVlXG4gICAgLy8gVHlwZSB3aWxsIGJlIHNldCB0byAnZGVjaWRlcicgaW4gRGVjaWRlckxpc3QuZW5kKClcbiAgICAvLyBfUmVxdWlyZW1lbnRzOiBkZWNpZGVyLWZpcnN0LWNsYXNzLXN0YWdlIDYuMV9cbiAgICBsZXQgc3BlYzogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlID0geyBuYW1lLCB0eXBlOiAnc3RhZ2UnLCBoYXNEZWNpZGVyOiB0cnVlIH07XG4gICAgaWYgKGlkKSBzcGVjLmlkID0gaWQ7XG4gICAgaWYgKGRpc3BsYXlOYW1lKSBzcGVjLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBzcGVjLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cbiAgICAvLyBBcHBseSBidWlsZC10aW1lIGV4dHJhY3RvciB0byB0aGUgbm9kZVxuICAgIC8vIF9SZXF1aXJlbWVudHM6IGRlY2lkZXItZmlyc3QtY2xhc3Mtc3RhZ2UgNi4zX1xuICAgIHNwZWMgPSB0aGlzLl9hcHBseUV4dHJhY3RvclRvTm9kZShzcGVjKTtcblxuICAgIC8vIExpbmsgdG8gY3VycmVudCBub2RlIGFzIG5leHRcbiAgICBjdXIubmV4dCA9IG5vZGU7XG4gICAgY3VyU3BlYy5uZXh0ID0gc3BlYztcblxuICAgIC8vIE1vdmUgY3Vyc29yIHRvIHRoZSBuZXcgZGVjaWRlciBub2RlXG4gICAgdGhpcy5fY3Vyc29yID0gbm9kZTtcbiAgICB0aGlzLl9jdXJzb3JTcGVjID0gc3BlYztcblxuICAgIC8vIFJlc2VydmUgYSBzdGVwIG51bWJlciBmb3IgdGhlIGRlY2lkZXIg4oCUIHRoZSBmdWxsIGRlc2NyaXB0aW9uIGxpbmVcbiAgICAvLyAoaW5jbHVkaW5nIGJyYW5jaCBuYW1lcykgaXMgZGVmZXJyZWQgdG8gRGVjaWRlckxpc3QuZW5kKClcbiAgICB0aGlzLl9zdGVwQ291bnRlcisrO1xuICAgIHRoaXMuX3N0YWdlU3RlcE1hcC5zZXQobmFtZSwgdGhpcy5fc3RlcENvdW50ZXIpO1xuXG4gICAgLy8gUmV0dXJuIERlY2lkZXJMaXN0IHdpdGggaXNTY29wZUJhc2VkID0gdHJ1ZSBhbmQgZGVjaWRlciA9IG51bGxcbiAgICAvLyAobm8gbGVnYWN5IGRlY2lkZXIgZnVuY3Rpb24g4oCUIHRoZSBmbiBJUyB0aGUgZGVjaWRlcilcbiAgICAvLyBQYXNzIHJlc2VydmVkIHN0ZXAgbnVtYmVyIGFuZCBkZXNjcmlwdGlvbiBhY2N1bXVsYXRvciByZWZlcmVuY2VzXG4gICAgLy8gX1JlcXVpcmVtZW50czogZGVjaWRlci1maXJzdC1jbGFzcy1zdGFnZSAxLjJfXG4gICAgcmV0dXJuIG5ldyBEZWNpZGVyTGlzdDxUT3V0LCBUU2NvcGU+KFxuICAgICAgdGhpcywgbm9kZSwgc3BlYywgbnVsbCwgdHJ1ZSxcbiAgICAgIHRoaXMuX2Rlc2NyaXB0aW9uUGFydHMsIHRoaXMuX3N0YWdlRGVzY3JpcHRpb25zLCB0aGlzLl9zdGVwQ291bnRlciwgZGVzY3JpcHRpb24sXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBzZWxlY3RvciAtIHJldHVybnMgU2VsZWN0b3JMaXN0IGZvciBhZGRpbmcgYnJhbmNoZXMuXG4gICAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDYuNV9cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAxLjVfXG4gICAqL1xuICBhZGRTZWxlY3RvcihzZWxlY3RvcjogU2VsZWN0b3IpOiBTZWxlY3Rvckxpc3Q8VE91dCwgVFNjb3BlPiB7XG4gICAgY29uc3QgY3VyID0gdGhpcy5fbmVlZEN1cnNvcigpO1xuICAgIGNvbnN0IGN1clNwZWMgPSB0aGlzLl9uZWVkQ3Vyc29yU3BlYygpO1xuXG4gICAgaWYgKGN1ci5uZXh0Tm9kZVNlbGVjdG9yKSBmYWlsKGBzZWxlY3RvciBhbHJlYWR5IGRlZmluZWQgYXQgJyR7Y3VyLm5hbWV9J2ApO1xuICAgIGlmIChjdXIubmV4dE5vZGVEZWNpZGVyKSBmYWlsKGBkZWNpZGVyIGFuZCBzZWxlY3RvciBhcmUgbXV0dWFsbHkgZXhjbHVzaXZlIGF0ICcke2N1ci5uYW1lfSdgKTtcblxuICAgIC8vIE1hcmsgYXMgc2VsZWN0b3IgaW4gc3BlYyAodHlwZSB3aWxsIGJlIHNldCB0byAnZGVjaWRlcicgaW4gU2VsZWN0b3JMaXN0LmVuZCgpKVxuICAgIGN1clNwZWMuaGFzU2VsZWN0b3IgPSB0cnVlO1xuXG4gICAgLy8gUmVzZXJ2ZSBhIHN0ZXAgbnVtYmVyIGZvciB0aGUgc2VsZWN0b3Ig4oCUIHRoZSBmdWxsIGRlc2NyaXB0aW9uIGxpbmVcbiAgICAvLyAoaW5jbHVkaW5nIGJyYW5jaCBuYW1lcykgaXMgZGVmZXJyZWQgdG8gU2VsZWN0b3JMaXN0LmVuZCgpXG4gICAgdGhpcy5fc3RlcENvdW50ZXIrKztcbiAgICB0aGlzLl9zdGFnZVN0ZXBNYXAuc2V0KGN1ci5uYW1lLCB0aGlzLl9zdGVwQ291bnRlcik7XG5cbiAgICByZXR1cm4gbmV3IFNlbGVjdG9yTGlzdDxUT3V0LCBUU2NvcGU+KFxuICAgICAgdGhpcywgY3VyLCBjdXJTcGVjLCBzZWxlY3RvcixcbiAgICAgIHRoaXMuX2Rlc2NyaXB0aW9uUGFydHMsIHRoaXMuX3N0YWdlRGVzY3JpcHRpb25zLCB0aGlzLl9zdGVwQ291bnRlcixcbiAgICApO1xuICB9XG5cblxuICAvKiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgU3ViZmxvdyBNb3VudGluZyBBUEkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAICovXG5cbiAgLyoqXG4gICAqIE1vdW50IGEgcHJlYnVpbHQgZmxvd2NoYXJ0IGFzIGEgY2hpbGQgKGZvcmsgcGF0dGVybikuXG4gICAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDUuNF9cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAxLjcsIDQuMV9cbiAgICogX1JlcXVpcmVtZW50czogc3ViZmxvdy1pbnB1dC1tYXBwaW5nIDEuMSwgMS41LCA3LjNfXG4gICAqIFxuICAgKiBJTVBPUlRBTlQ6IFRoaXMgY3JlYXRlcyBhIFdSQVBQRVIgbm9kZSBmb3IgdGhlIHN1YmZsb3cgbW91bnQgcG9pbnQuXG4gICAqIFRoZSBzdWJmbG93J3MgaW50ZXJuYWwgc3RydWN0dXJlIGlzIHByZXNlcnZlZCBpbiBgc3ViZmxvd1N0cnVjdHVyZWAgcHJvcGVydHksXG4gICAqIE5PVCBtZXJnZWQgd2l0aCB0aGUgd3JhcHBlciBub2RlLiBUaGlzIGVuc3VyZXM6XG4gICAqIDEuIFRoZSBzdWJmbG93J3MgZmlyc3Qgc3RhZ2Uga2VlcHMgaXRzIG9yaWdpbmFsIElEXG4gICAqIDIuIFRoZSBtb3VudCBwb2ludCBoYXMgaXRzIG93biBkaXN0aW5jdCBJRCBmb3IgbmF2aWdhdGlvblxuICAgKiAzLiBEcmlsbC1kb3duIGNhbiBhY2Nlc3MgdGhlIGZ1bGwgc3ViZmxvdyBzdHJ1Y3R1cmUgdmlhIGBzdWJmbG93U3RydWN0dXJlYFxuICAgKiBcbiAgICogQHBhcmFtIGlkIC0gVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSBzdWJmbG93IG1vdW50IHBvaW50XG4gICAqIEBwYXJhbSBzdWJmbG93IC0gVGhlIHByZWJ1aWx0IEZsb3dDaGFydCB0byBtb3VudFxuICAgKiBAcGFyYW0gbW91bnROYW1lIC0gT3B0aW9uYWwgZGlzcGxheSBuYW1lIGZvciB0aGUgbW91bnQgcG9pbnRcbiAgICogQHBhcmFtIG9wdGlvbnMgLSBPcHRpb25hbCBpbnB1dC9vdXRwdXQgbWFwcGluZyBvcHRpb25zIGZvciBkYXRhIGZsb3cgYmV0d2VlbiBwYXJlbnQgYW5kIHN1YmZsb3dcbiAgICovXG4gIGFkZFN1YkZsb3dDaGFydChcbiAgICBpZDogc3RyaW5nLFxuICAgIHN1YmZsb3c6IEZsb3dDaGFydDxUT3V0LCBUU2NvcGU+LFxuICAgIG1vdW50TmFtZT86IHN0cmluZyxcbiAgICBvcHRpb25zPzogU3ViZmxvd01vdW50T3B0aW9ucyxcbiAgKTogdGhpcyB7XG4gICAgY29uc3QgY3VyID0gdGhpcy5fbmVlZEN1cnNvcigpO1xuICAgIGNvbnN0IGN1clNwZWMgPSB0aGlzLl9uZWVkQ3Vyc29yU3BlYygpO1xuXG4gICAgaWYgKGN1ci5jaGlsZHJlbj8uc29tZSgoYykgPT4gYy5pZCA9PT0gaWQpKSB7XG4gICAgICBmYWlsKGBkdXBsaWNhdGUgY2hpbGQgaWQgJyR7aWR9JyB1bmRlciAnJHtjdXIubmFtZX0nYCk7XG4gICAgfVxuXG4gICAgY29uc3QgZGlzcGxheU5hbWUgPSBtb3VudE5hbWUgfHwgaWQ7XG4gICAgY29uc3QgZm9ya0lkID0gY3VyLmlkID8/IGN1ci5uYW1lO1xuXG4gICAgLy8gTmFtZXNwYWNlIHRoZSBzdWJmbG93J3Mgc3RhZ2UgbmFtZXMgd2l0aCBtb3VudCBpZCB0byBwcmV2ZW50XG4gICAgLy8gY29sbGlzaW9ucyB3aGVuIG11bHRpcGxlIHN1YmZsb3dzIHNoYXJlIHRoZSBzYW1lIHN0YWdlIG5hbWVzXG4gICAgLy8gKGUuZy4sIHR3byBTaW1wbGVBZ2VudHMgYm90aCBoYXZpbmcgXCJTZWVkU2NvcGVcIikuXG4gICAgY29uc3QgcHJlZml4ZWRSb290ID0gdGhpcy5fcHJlZml4Tm9kZVRyZWUoc3ViZmxvdy5yb290LCBpZCk7XG5cbiAgICAvLyBSZWdpc3RlciBzdWJmbG93IGRlZmluaXRpb24gd2l0aCBwcmVmaXhlZCByb290XG4gICAgaWYgKCF0aGlzLl9zdWJmbG93RGVmcy5oYXMoaWQpKSB7XG4gICAgICB0aGlzLl9zdWJmbG93RGVmcy5zZXQoaWQsIHsgcm9vdDogcHJlZml4ZWRSb290IH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSByZWZlcmVuY2UgU3RhZ2VOb2RlXG4gICAgY29uc3Qgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gPSB7XG4gICAgICBuYW1lOiBkaXNwbGF5TmFtZSxcbiAgICAgIGlkLFxuICAgICAgaXNTdWJmbG93Um9vdDogdHJ1ZSxcbiAgICAgIHN1YmZsb3dJZDogaWQsXG4gICAgICBzdWJmbG93TmFtZTogZGlzcGxheU5hbWUsXG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHN1YmZsb3dNb3VudE9wdGlvbnMgaWYgcHJvdmlkZWRcbiAgICBpZiAob3B0aW9ucykge1xuICAgICAgbm9kZS5zdWJmbG93TW91bnRPcHRpb25zID0gb3B0aW9ucztcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgYSBXUkFQUEVSIHNwZWMgZm9yIHRoZSBzdWJmbG93IG1vdW50IHBvaW50LlxuICAgIC8vIENSSVRJQ0FMOiBXZSBkbyBOT1Qgc3ByZWFkIHN1YmZsb3cuYnVpbGRUaW1lU3RydWN0dXJlIGhlcmUhXG4gICAgLy8gSW5zdGVhZCwgd2Ugc3RvcmUgdGhlIHN1YmZsb3cncyBzdHJ1Y3R1cmUgaW4gYHN1YmZsb3dTdHJ1Y3R1cmVgIHByb3BlcnR5LlxuICAgIC8vIFRoaXMgcHJlc2VydmVzIHRoZSBzdWJmbG93J3MgZmlyc3Qgc3RhZ2UgSUQgYW5kIGNyZWF0ZXMgYSBjbGVhciBib3VuZGFyeS5cbiAgICBsZXQgc3BlYzogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlID0ge1xuICAgICAgbmFtZTogZGlzcGxheU5hbWUsXG4gICAgICB0eXBlOiAnc3RhZ2UnLFxuICAgICAgaWQsXG4gICAgICBkaXNwbGF5TmFtZSxcbiAgICAgIGlzU3ViZmxvd1Jvb3Q6IHRydWUsXG4gICAgICBzdWJmbG93SWQ6IGlkLFxuICAgICAgc3ViZmxvd05hbWU6IGRpc3BsYXlOYW1lLFxuICAgICAgaXNQYXJhbGxlbENoaWxkOiB0cnVlLFxuICAgICAgcGFyYWxsZWxHcm91cElkOiBmb3JrSWQsXG4gICAgICAvLyBTdG9yZSB0aGUgQ09NUExFVEUgc3ViZmxvdyBzdHJ1Y3R1cmUgZm9yIGRyaWxsLWRvd24gdmlzdWFsaXphdGlvblxuICAgICAgc3ViZmxvd1N0cnVjdHVyZTogc3ViZmxvdy5idWlsZFRpbWVTdHJ1Y3R1cmUsXG4gICAgfTtcblxuICAgIC8vIEFwcGx5IGV4dHJhY3RvciB0byB0aGUgcmVmZXJlbmNlIHNwZWNcbiAgICBzcGVjID0gdGhpcy5fYXBwbHlFeHRyYWN0b3JUb05vZGUoc3BlYyk7XG5cbiAgICAvLyBTZXQgcGFyZW50IHR5cGUgdG8gJ2ZvcmsnIHNpbmNlIGl0IGhhcyBjaGlsZHJlblxuICAgIGN1clNwZWMudHlwZSA9ICdmb3JrJztcblxuICAgIC8vIEFkZCB0byBwYXJlbnQncyBjaGlsZHJlblxuICAgIGN1ci5jaGlsZHJlbiA9IGN1ci5jaGlsZHJlbiB8fCBbXTtcbiAgICBjdXIuY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICBjdXJTcGVjLmNoaWxkcmVuID0gY3VyU3BlYy5jaGlsZHJlbiB8fCBbXTtcbiAgICBjdXJTcGVjLmNoaWxkcmVuLnB1c2goc3BlYyk7XG5cbiAgICAvLyBNZXJnZSBzdGFnZSBtYXBzIHdpdGggbmFtZXNwYWNlIHByZWZpeFxuICAgIHRoaXMuX21lcmdlU3RhZ2VNYXAoc3ViZmxvdy5zdGFnZU1hcCwgaWQpO1xuXG4gICAgLy8gTWVyZ2UgbmVzdGVkIHN1YmZsb3dzIHdpdGggbmFtZXNwYWNlIHByZWZpeFxuICAgIGlmIChzdWJmbG93LnN1YmZsb3dzKSB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIGRlZl0gb2YgT2JqZWN0LmVudHJpZXMoc3ViZmxvdy5zdWJmbG93cykpIHtcbiAgICAgICAgY29uc3QgcHJlZml4ZWRLZXkgPSBgJHtpZH0vJHtrZXl9YDtcbiAgICAgICAgaWYgKCF0aGlzLl9zdWJmbG93RGVmcy5oYXMocHJlZml4ZWRLZXkpKSB7XG4gICAgICAgICAgdGhpcy5fc3ViZmxvd0RlZnMuc2V0KHByZWZpeGVkS2V5LCB7XG4gICAgICAgICAgICByb290OiB0aGlzLl9wcmVmaXhOb2RlVHJlZShcbiAgICAgICAgICAgICAgZGVmLnJvb3QgYXMgU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFjY3VtdWxhdGUgc3ViZmxvdyBkZXNjcmlwdGlvbiBsaW5lXG4gICAgdGhpcy5fYXBwZW5kU3ViZmxvd0Rlc2NyaXB0aW9uKGlkLCBkaXNwbGF5TmFtZSwgc3ViZmxvdyk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3VudCBhIHByZWJ1aWx0IGZsb3djaGFydCBhcyBuZXh0IChsaW5lYXIgY29udGludWF0aW9uKS5cbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gNS41X1xuICAgKiBfUmVxdWlyZW1lbnRzOiBpbmNyZW1lbnRhbC10eXBlLWNvbXB1dGF0aW9uIDQuNF9cbiAgICogX1JlcXVpcmVtZW50czogc3ViZmxvdy1pbnB1dC1tYXBwaW5nIDEuMywgMS41LCA3LjNfXG4gICAqIFxuICAgKiBJTVBPUlRBTlQ6IFRoaXMgY3JlYXRlcyBhIFdSQVBQRVIgbm9kZSBmb3IgdGhlIHN1YmZsb3cgbW91bnQgcG9pbnQuXG4gICAqIFRoZSBzdWJmbG93J3MgaW50ZXJuYWwgc3RydWN0dXJlIGlzIHByZXNlcnZlZCBpbiBgc3ViZmxvd1N0cnVjdHVyZWAgcHJvcGVydHksXG4gICAqIE5PVCBtZXJnZWQgd2l0aCB0aGUgd3JhcHBlciBub2RlLiBUaGlzIGVuc3VyZXM6XG4gICAqIDEuIFRoZSBzdWJmbG93J3MgZmlyc3Qgc3RhZ2Uga2VlcHMgaXRzIG9yaWdpbmFsIElEXG4gICAqIDIuIFRoZSBtb3VudCBwb2ludCBoYXMgaXRzIG93biBkaXN0aW5jdCBJRCBmb3IgbmF2aWdhdGlvblxuICAgKiAzLiBEcmlsbC1kb3duIGNhbiBhY2Nlc3MgdGhlIGZ1bGwgc3ViZmxvdyBzdHJ1Y3R1cmUgdmlhIGBzdWJmbG93U3RydWN0dXJlYFxuICAgKiBcbiAgICogQHBhcmFtIGlkIC0gVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSBzdWJmbG93IG1vdW50IHBvaW50XG4gICAqIEBwYXJhbSBzdWJmbG93IC0gVGhlIHByZWJ1aWx0IEZsb3dDaGFydCB0byBtb3VudFxuICAgKiBAcGFyYW0gbW91bnROYW1lIC0gT3B0aW9uYWwgZGlzcGxheSBuYW1lIGZvciB0aGUgbW91bnQgcG9pbnRcbiAgICogQHBhcmFtIG9wdGlvbnMgLSBPcHRpb25hbCBpbnB1dC9vdXRwdXQgbWFwcGluZyBvcHRpb25zIGZvciBkYXRhIGZsb3cgYmV0d2VlbiBwYXJlbnQgYW5kIHN1YmZsb3dcbiAgICovXG4gIGFkZFN1YkZsb3dDaGFydE5leHQoXG4gICAgaWQ6IHN0cmluZyxcbiAgICBzdWJmbG93OiBGbG93Q2hhcnQ8VE91dCwgVFNjb3BlPixcbiAgICBtb3VudE5hbWU/OiBzdHJpbmcsXG4gICAgb3B0aW9ucz86IFN1YmZsb3dNb3VudE9wdGlvbnMsXG4gICk6IHRoaXMge1xuICAgIGNvbnN0IGN1ciA9IHRoaXMuX25lZWRDdXJzb3IoKTtcbiAgICBjb25zdCBjdXJTcGVjID0gdGhpcy5fbmVlZEN1cnNvclNwZWMoKTtcblxuICAgIGlmIChjdXIubmV4dCkge1xuICAgICAgZmFpbChgY2Fubm90IGFkZCBzdWJmbG93IGFzIG5leHQgd2hlbiBuZXh0IGlzIGFscmVhZHkgZGVmaW5lZCBhdCAnJHtjdXIubmFtZX0nYCk7XG4gICAgfVxuXG4gICAgY29uc3QgZGlzcGxheU5hbWUgPSBtb3VudE5hbWUgfHwgaWQ7XG5cbiAgICAvLyBOYW1lc3BhY2UgdGhlIHN1YmZsb3cncyBzdGFnZSBuYW1lcyB3aXRoIG1vdW50IGlkIHRvIHByZXZlbnRcbiAgICAvLyBjb2xsaXNpb25zIHdoZW4gbXVsdGlwbGUgc3ViZmxvd3Mgc2hhcmUgdGhlIHNhbWUgc3RhZ2UgbmFtZXMuXG4gICAgY29uc3QgcHJlZml4ZWRSb290ID0gdGhpcy5fcHJlZml4Tm9kZVRyZWUoc3ViZmxvdy5yb290LCBpZCk7XG5cbiAgICAvLyBSZWdpc3RlciBzdWJmbG93IGRlZmluaXRpb24gd2l0aCBwcmVmaXhlZCByb290XG4gICAgaWYgKCF0aGlzLl9zdWJmbG93RGVmcy5oYXMoaWQpKSB7XG4gICAgICB0aGlzLl9zdWJmbG93RGVmcy5zZXQoaWQsIHsgcm9vdDogcHJlZml4ZWRSb290IH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSByZWZlcmVuY2UgU3RhZ2VOb2RlXG4gICAgY29uc3Qgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gPSB7XG4gICAgICBuYW1lOiBkaXNwbGF5TmFtZSxcbiAgICAgIGlkLFxuICAgICAgaXNTdWJmbG93Um9vdDogdHJ1ZSxcbiAgICAgIHN1YmZsb3dJZDogaWQsXG4gICAgICBzdWJmbG93TmFtZTogZGlzcGxheU5hbWUsXG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHN1YmZsb3dNb3VudE9wdGlvbnMgaWYgcHJvdmlkZWRcbiAgICBpZiAob3B0aW9ucykge1xuICAgICAgbm9kZS5zdWJmbG93TW91bnRPcHRpb25zID0gb3B0aW9ucztcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgYSBXUkFQUEVSIHNwZWMgZm9yIHRoZSBzdWJmbG93IG1vdW50IHBvaW50LlxuICAgIC8vIENSSVRJQ0FMOiBXZSBkbyBOT1Qgc3ByZWFkIHN1YmZsb3cuYnVpbGRUaW1lU3RydWN0dXJlIGhlcmUhXG4gICAgLy8gSW5zdGVhZCwgd2Ugc3RvcmUgdGhlIHN1YmZsb3cncyBzdHJ1Y3R1cmUgaW4gYHN1YmZsb3dTdHJ1Y3R1cmVgIHByb3BlcnR5LlxuICAgIC8vIFRoaXMgcHJlc2VydmVzIHRoZSBzdWJmbG93J3MgZmlyc3Qgc3RhZ2UgSUQgYW5kIGNyZWF0ZXMgYSBjbGVhciBib3VuZGFyeS5cbiAgICBsZXQgYXR0YWNoZWRTcGVjOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUgPSB7XG4gICAgICBuYW1lOiBkaXNwbGF5TmFtZSxcbiAgICAgIHR5cGU6ICdzdGFnZScsXG4gICAgICBpZCxcbiAgICAgIGRpc3BsYXlOYW1lLFxuICAgICAgaXNTdWJmbG93Um9vdDogdHJ1ZSxcbiAgICAgIHN1YmZsb3dJZDogaWQsXG4gICAgICBzdWJmbG93TmFtZTogZGlzcGxheU5hbWUsXG4gICAgICAvLyBTdG9yZSB0aGUgQ09NUExFVEUgc3ViZmxvdyBzdHJ1Y3R1cmUgZm9yIGRyaWxsLWRvd24gdmlzdWFsaXphdGlvblxuICAgICAgc3ViZmxvd1N0cnVjdHVyZTogc3ViZmxvdy5idWlsZFRpbWVTdHJ1Y3R1cmUsXG4gICAgfTtcblxuICAgIC8vIEFwcGx5IGV4dHJhY3RvciB0byB0aGUgYXR0YWNoZWQgc3BlY1xuICAgIGF0dGFjaGVkU3BlYyA9IHRoaXMuX2FwcGx5RXh0cmFjdG9yVG9Ob2RlKGF0dGFjaGVkU3BlYyk7XG5cbiAgICAvLyBTZXQgYXMgbmV4dCAobGluZWFyIGNvbnRpbnVhdGlvbilcbiAgICBjdXIubmV4dCA9IG5vZGU7XG4gICAgY3VyU3BlYy5uZXh0ID0gYXR0YWNoZWRTcGVjO1xuXG4gICAgLy8gTW92ZSBjdXJzb3IgdG8gdGhlIHJlZmVyZW5jZSBub2RlIEFORCB0aGUgYXR0YWNoZWQgc3BlYy5cbiAgICAvLyBJTVBPUlRBTlQ6IFdlIHVzZSB0aGUgU0FNRSBhdHRhY2hlZFNwZWMgb2JqZWN0IGZvciB0aGUgY3Vyc29yIHNvIHRoYXRcbiAgICAvLyBzdWJzZXF1ZW50IGFkZEZ1bmN0aW9uIGNhbGxzIHdpbGwgY29ycmVjdGx5IHNldCBhdHRhY2hlZFNwZWMubmV4dCxcbiAgICAvLyB3aGljaCBpcyB3aGF0IGFwcGVhcnMgaW4gYnVpbGRUaW1lU3RydWN0dXJlLlxuICAgIHRoaXMuX2N1cnNvciA9IG5vZGU7XG4gICAgdGhpcy5fY3Vyc29yU3BlYyA9IGF0dGFjaGVkU3BlYztcblxuICAgIC8vIE1lcmdlIHN0YWdlIG1hcHMgd2l0aCBuYW1lc3BhY2UgcHJlZml4XG4gICAgdGhpcy5fbWVyZ2VTdGFnZU1hcChzdWJmbG93LnN0YWdlTWFwLCBpZCk7XG5cbiAgICAvLyBNZXJnZSBuZXN0ZWQgc3ViZmxvd3Mgd2l0aCBuYW1lc3BhY2UgcHJlZml4XG4gICAgaWYgKHN1YmZsb3cuc3ViZmxvd3MpIHtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgZGVmXSBvZiBPYmplY3QuZW50cmllcyhzdWJmbG93LnN1YmZsb3dzKSkge1xuICAgICAgICBjb25zdCBwcmVmaXhlZEtleSA9IGAke2lkfS8ke2tleX1gO1xuICAgICAgICBpZiAoIXRoaXMuX3N1YmZsb3dEZWZzLmhhcyhwcmVmaXhlZEtleSkpIHtcbiAgICAgICAgICB0aGlzLl9zdWJmbG93RGVmcy5zZXQocHJlZml4ZWRLZXksIHtcbiAgICAgICAgICAgIHJvb3Q6IHRoaXMuX3ByZWZpeE5vZGVUcmVlKFxuICAgICAgICAgICAgICBkZWYucm9vdCBhcyBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICApLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQWNjdW11bGF0ZSBzdWJmbG93IGRlc2NyaXB0aW9uIGxpbmVcbiAgICB0aGlzLl9hcHBlbmRTdWJmbG93RGVzY3JpcHRpb24oaWQsIGRpc3BsYXlOYW1lLCBzdWJmbG93KTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBwYXJhbGxlbCBjaGlsZHJlbiAoZm9yaykgLSBzaW1wbGlmaWVkLCBubyBidWlsZCBjYWxsYmFja3MuXG4gICAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDIuMl9cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAxLjZfXG4gICAqL1xuICBhZGRMaXN0T2ZGdW5jdGlvbihjaGlsZHJlbjogU2ltcGxpZmllZFBhcmFsbGVsU3BlYzxUT3V0LCBUU2NvcGU+W10pOiB0aGlzIHtcbiAgICBjb25zdCBjdXIgPSB0aGlzLl9uZWVkQ3Vyc29yKCk7XG4gICAgY29uc3QgY3VyU3BlYyA9IHRoaXMuX25lZWRDdXJzb3JTcGVjKCk7XG4gICAgY29uc3QgZm9ya0lkID0gY3VyLmlkID8/IGN1ci5uYW1lO1xuXG4gICAgLy8gU2V0IHBhcmVudCB0eXBlIHRvICdmb3JrJyBzaW5jZSBpdCBoYXMgY2hpbGRyZW5cbiAgICBjdXJTcGVjLnR5cGUgPSAnZm9yayc7XG5cbiAgICBmb3IgKGNvbnN0IHsgaWQsIG5hbWUsIGRpc3BsYXlOYW1lLCBmbiB9IG9mIGNoaWxkcmVuKSB7XG4gICAgICBpZiAoIWlkKSBmYWlsKGBjaGlsZCBpZCByZXF1aXJlZCB1bmRlciAnJHtjdXIubmFtZX0nYCk7XG4gICAgICBpZiAoY3VyLmNoaWxkcmVuPy5zb21lKChjKSA9PiBjLmlkID09PSBpZCkpIHtcbiAgICAgICAgZmFpbChgZHVwbGljYXRlIGNoaWxkIGlkICcke2lkfScgdW5kZXIgJyR7Y3VyLm5hbWV9J2ApO1xuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgU3RhZ2VOb2RlIGRpcmVjdGx5XG4gICAgICBjb25zdCBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiA9IHsgbmFtZTogbmFtZSA/PyBpZCB9O1xuICAgICAgaWYgKGlkKSBub2RlLmlkID0gaWQ7XG4gICAgICBpZiAoZGlzcGxheU5hbWUpIG5vZGUuZGlzcGxheU5hbWUgPSBkaXNwbGF5TmFtZTtcbiAgICAgIGlmIChmbikge1xuICAgICAgICBub2RlLmZuID0gZm47XG4gICAgICAgIHRoaXMuX2FkZFRvTWFwKG5hbWUsIGZuKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSB3aXRoIHR5cGU9J3N0YWdlJyBhbmQgYXBwbHkgZXh0cmFjdG9yXG4gICAgICBsZXQgc3BlYzogU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlID0ge1xuICAgICAgICBuYW1lOiBuYW1lID8/IGlkLFxuICAgICAgICB0eXBlOiAnc3RhZ2UnLFxuICAgICAgICBpc1BhcmFsbGVsQ2hpbGQ6IHRydWUsXG4gICAgICAgIHBhcmFsbGVsR3JvdXBJZDogZm9ya0lkLFxuICAgICAgfTtcbiAgICAgIGlmIChpZCkgc3BlYy5pZCA9IGlkO1xuICAgICAgaWYgKGRpc3BsYXlOYW1lKSBzcGVjLmRpc3BsYXlOYW1lID0gZGlzcGxheU5hbWU7XG4gICAgICBcbiAgICAgIC8vIEFwcGx5IGV4dHJhY3RvciBpbW1lZGlhdGVseVxuICAgICAgc3BlYyA9IHRoaXMuX2FwcGx5RXh0cmFjdG9yVG9Ob2RlKHNwZWMpO1xuXG4gICAgICAvLyBBZGQgdG8gcGFyZW50J3MgY2hpbGRyZW5cbiAgICAgIGN1ci5jaGlsZHJlbiA9IGN1ci5jaGlsZHJlbiB8fCBbXTtcbiAgICAgIGN1ci5jaGlsZHJlbi5wdXNoKG5vZGUpO1xuICAgICAgY3VyU3BlYy5jaGlsZHJlbiA9IGN1clNwZWMuY2hpbGRyZW4gfHwgW107XG4gICAgICBjdXJTcGVjLmNoaWxkcmVuLnB1c2goc3BlYyk7XG4gICAgfVxuXG4gICAgLy8gQWNjdW11bGF0ZSBwYXJhbGxlbCBkZXNjcmlwdGlvbiBsaW5lXG4gICAgY29uc3QgY2hpbGROYW1lcyA9IGNoaWxkcmVuLm1hcCgoYykgPT4gYy5kaXNwbGF5TmFtZSB8fCBjLm5hbWUgfHwgYy5pZCkuam9pbignLCAnKTtcbiAgICB0aGlzLl9zdGVwQ291bnRlcisrO1xuICAgIHRoaXMuX2Rlc2NyaXB0aW9uUGFydHMucHVzaChgJHt0aGlzLl9zdGVwQ291bnRlcn0uIFJ1bnMgaW4gcGFyYWxsZWw6ICR7Y2hpbGROYW1lc31gKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyog4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIExvb3AgQVBJIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqL1xuXG4gIC8qKlxuICAgKiBTZXQgYSBsb29wIHRhcmdldCBmb3IgdGhlIGN1cnJlbnQgbm9kZS5cbiAgICogX1JlcXVpcmVtZW50czogZmxvd2NoYXJ0LWJ1aWxkZXItc2ltcGxpZmljYXRpb24gNS42X1xuICAgKiBfUmVxdWlyZW1lbnRzOiBpbmNyZW1lbnRhbC10eXBlLWNvbXB1dGF0aW9uIDYuMV9cbiAgICovXG4gIGxvb3BUbyhzdGFnZUlkOiBzdHJpbmcpOiB0aGlzIHtcbiAgICBjb25zdCBjdXIgPSB0aGlzLl9uZWVkQ3Vyc29yKCk7XG4gICAgY29uc3QgY3VyU3BlYyA9IHRoaXMuX25lZWRDdXJzb3JTcGVjKCk7XG5cbiAgICBpZiAoY3VyU3BlYy5sb29wVGFyZ2V0KSBmYWlsKGBsb29wVG8gYWxyZWFkeSBkZWZpbmVkIGF0ICcke2N1ci5uYW1lfSdgKTtcbiAgICBpZiAoY3VyLm5leHQpIGZhaWwoYGNhbm5vdCBzZXQgbG9vcFRvIHdoZW4gbmV4dCBpcyBhbHJlYWR5IGRlZmluZWQgYXQgJyR7Y3VyLm5hbWV9J2ApO1xuXG4gICAgLy8gU2V0IGxvb3AgdGFyZ2V0IGluIGJvdGggc3RydWN0dXJlcyB3aXRoIHR5cGU9J3N0YWdlJ1xuICAgIGN1ci5uZXh0ID0geyBuYW1lOiBzdGFnZUlkLCBpZDogc3RhZ2VJZCB9O1xuICAgIGN1clNwZWMubG9vcFRhcmdldCA9IHN0YWdlSWQ7XG4gICAgY3VyU3BlYy5uZXh0ID0geyBuYW1lOiBzdGFnZUlkLCBpZDogc3RhZ2VJZCwgdHlwZTogJ3N0YWdlJyB9O1xuXG4gICAgLy8gQWNjdW11bGF0ZSBsb29wLWJhY2sgZGVzY3JpcHRpb24gbGluZVxuICAgIGNvbnN0IHRhcmdldFN0ZXAgPSB0aGlzLl9zdGFnZVN0ZXBNYXAuZ2V0KHN0YWdlSWQpO1xuICAgIGlmICh0YXJnZXRTdGVwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRoaXMuX2Rlc2NyaXB0aW9uUGFydHMucHVzaChg4oaSIGxvb3BzIGJhY2sgdG8gc3RlcCAke3RhcmdldFN0ZXB9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX2Rlc2NyaXB0aW9uUGFydHMucHVzaChg4oaSIGxvb3BzIGJhY2sgdG8gJHtzdGFnZUlkfWApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cblxuICAvKiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgU3RyZWFtaW5nIEFQSSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgKi9cblxuICBvblN0cmVhbShoYW5kbGVyOiBTdHJlYW1Ub2tlbkhhbmRsZXIpOiB0aGlzIHtcbiAgICB0aGlzLl9zdHJlYW1IYW5kbGVycy5vblRva2VuID0gaGFuZGxlcjtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIG9uU3RyZWFtU3RhcnQoaGFuZGxlcjogU3RyZWFtTGlmZWN5Y2xlSGFuZGxlcik6IHRoaXMge1xuICAgIHRoaXMuX3N0cmVhbUhhbmRsZXJzLm9uU3RhcnQgPSBoYW5kbGVyO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgb25TdHJlYW1FbmQoaGFuZGxlcjogU3RyZWFtTGlmZWN5Y2xlSGFuZGxlcik6IHRoaXMge1xuICAgIHRoaXMuX3N0cmVhbUhhbmRsZXJzLm9uRW5kID0gaGFuZGxlcjtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCBFeHRyYWN0b3IgQVBJIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqL1xuXG4gIGFkZFRyYXZlcnNhbEV4dHJhY3RvcjxUUmVzdWx0ID0gdW5rbm93bj4oXG4gICAgZXh0cmFjdG9yOiBUcmF2ZXJzYWxFeHRyYWN0b3I8VFJlc3VsdD4sXG4gICk6IHRoaXMge1xuICAgIHRoaXMuX2V4dHJhY3RvciA9IGV4dHJhY3RvcjtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGFkZEJ1aWxkVGltZUV4dHJhY3RvcjxUUmVzdWx0ID0gRmxvd0NoYXJ0U3BlYz4oXG4gICAgZXh0cmFjdG9yOiBCdWlsZFRpbWVFeHRyYWN0b3I8VFJlc3VsdD4sXG4gICk6IHRoaXMge1xuICAgIHRoaXMuX2J1aWxkVGltZUV4dHJhY3RvciA9IGV4dHJhY3RvcjtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGdldEJ1aWxkVGltZUV4dHJhY3RvckVycm9ycygpOiBBcnJheTx7IG1lc3NhZ2U6IHN0cmluZzsgZXJyb3I6IHVua25vd24gfT4ge1xuICAgIHJldHVybiB0aGlzLl9idWlsZFRpbWVFeHRyYWN0b3JFcnJvcnM7XG4gIH1cblxuICAvKiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgT3V0cHV0IEFQSSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgKi9cblxuICAvKipcbiAgICogQ29tcGlsZSB0byBGbG93Q2hhcnQgKHJldHVybnMgcHJlLWJ1aWx0IHN0cnVjdHVyZXMpLlxuICAgKiBfUmVxdWlyZW1lbnRzOiBmbG93Y2hhcnQtYnVpbGRlci1zaW1wbGlmaWNhdGlvbiA0LjQsIDUuN19cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAzLjEsIDMuMywgMy40X1xuICAgKi9cbiAgYnVpbGQoKTogRmxvd0NoYXJ0PFRPdXQsIFRTY29wZT4ge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLl9yb290ID8/IGZhaWwoJ2VtcHR5IHRyZWU7IGNhbGwgc3RhcnQoKSBmaXJzdCcpO1xuICAgIGNvbnN0IHJvb3RTcGVjID0gdGhpcy5fcm9vdFNwZWMgPz8gZmFpbCgnZW1wdHkgc3BlYzsgY2FsbCBzdGFydCgpIGZpcnN0Jyk7XG5cbiAgICAvLyBDb252ZXJ0IHN1YmZsb3cgZGVmcyBtYXAgdG8gcGxhaW4gb2JqZWN0XG4gICAgY29uc3Qgc3ViZmxvd3M6IFJlY29yZDxzdHJpbmcsIHsgcm9vdDogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gfT4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIGRlZl0gb2YgdGhpcy5fc3ViZmxvd0RlZnMpIHtcbiAgICAgIHN1YmZsb3dzW2tleV0gPSBkZWY7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgdGhlIHByZS1idWlsdCBkZXNjcmlwdGlvbiBzdHJpbmcgZnJvbSBhY2N1bXVsYXRlZCBwYXJ0c1xuICAgIGNvbnN0IHJvb3ROYW1lID0gdGhpcy5fcm9vdD8uZGlzcGxheU5hbWUgPz8gdGhpcy5fcm9vdD8ubmFtZSA/PyAnUGlwZWxpbmUnO1xuICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5fZGVzY3JpcHRpb25QYXJ0cy5sZW5ndGggPiAwXG4gICAgICA/IGBQaXBlbGluZTogJHtyb290TmFtZX1cXG5TdGVwczpcXG4ke3RoaXMuX2Rlc2NyaXB0aW9uUGFydHMuam9pbignXFxuJyl9YFxuICAgICAgOiAnJztcblxuICAgIC8vIFJldHVybiBfcm9vdFNwZWMgZGlyZWN0bHkgLSBPKDEpIGluc3RlYWQgb2YgTyhuKVxuICAgIC8vIFR5cGUgY29tcHV0YXRpb24gYW5kIGV4dHJhY3RvciBhcHBsaWNhdGlvbiBhbHJlYWR5IGRvbmUgaW5jcmVtZW50YWxseVxuICAgIHJldHVybiB7XG4gICAgICByb290LFxuICAgICAgc3RhZ2VNYXA6IHRoaXMuX3N0YWdlTWFwLFxuICAgICAgZXh0cmFjdG9yOiB0aGlzLl9leHRyYWN0b3IsXG4gICAgICBidWlsZFRpbWVTdHJ1Y3R1cmU6IHJvb3RTcGVjLFxuICAgICAgLi4uKE9iamVjdC5rZXlzKHN1YmZsb3dzKS5sZW5ndGggPiAwID8geyBzdWJmbG93cyB9IDoge30pLFxuICAgICAgLi4uKHRoaXMuX2VuYWJsZU5hcnJhdGl2ZSA/IHsgZW5hYmxlTmFycmF0aXZlOiB0cnVlIH0gOiB7fSksXG4gICAgICBkZXNjcmlwdGlvbixcbiAgICAgIHN0YWdlRGVzY3JpcHRpb25zOiBuZXcgTWFwKHRoaXMuX3N0YWdlRGVzY3JpcHRpb25zKSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEVtaXQgcHVyZSBKU09OIHNwZWMgKHJldHVybnMgcHJlLWJ1aWx0IHN0cnVjdHVyZSkuXG4gICAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDQuNV9cbiAgICogX1JlcXVpcmVtZW50czogaW5jcmVtZW50YWwtdHlwZS1jb21wdXRhdGlvbiAzLjFfXG4gICAqL1xuICB0b1NwZWM8VFJlc3VsdCA9IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZT4oKTogVFJlc3VsdCB7XG4gICAgY29uc3Qgcm9vdFNwZWMgPSB0aGlzLl9yb290U3BlYyA/PyBmYWlsKCdlbXB0eSB0cmVlOyBjYWxsIHN0YXJ0KCkgZmlyc3QnKTtcbiAgICAvLyBSZXR1cm4gX3Jvb3RTcGVjIGRpcmVjdGx5IC0gdHlwZSBjb21wdXRhdGlvbiBhbmQgZXh0cmFjdG9yIGFscmVhZHkgYXBwbGllZCBpbmNyZW1lbnRhbGx5XG4gICAgcmV0dXJuIHJvb3RTcGVjIGFzIFRSZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogQ29udmVuaWVuY2U6IGJ1aWxkICYgZXhlY3V0ZS5cbiAgICovXG4gIGFzeW5jIGV4ZWN1dGUoc2NvcGVGYWN0b3J5OiBTY29wZUZhY3Rvcnk8VFNjb3BlPiwgb3B0cz86IEV4ZWNPcHRpb25zKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZXQgbmFycmF0aXZlIGZsYWcgYmVmb3JlIGJ1aWxkKCkgc28gaXQncyBpbmNsdWRlZCBpbiB0aGUgRmxvd0NoYXJ0IG9iamVjdC5cbiAgICAvLyBXSFk6IGV4ZWN1dGUoKSBpcyBhIGNvbnZlbmllbmNlIHRoYXQgY29tYmluZXMgYnVpbGQgKyBydW4uIFdoZW4gdGhlIGNvbnN1bWVyXG4gICAgLy8gcGFzc2VzIGVuYWJsZU5hcnJhdGl2ZSBpbiBvcHRzLCB3ZSBuZWVkIHRvIHNldCB0aGUgYnVpbGRlciBmaWVsZCBiZWZvcmVcbiAgICAvLyBidWlsZCgpIHNlcmlhbGl6ZXMgaXQgaW50byB0aGUgRmxvd0NoYXJ0LlxuICAgIC8vIF9SZXF1aXJlbWVudHM6IHBpcGVsaW5lLW5hcnJhdGl2ZS1nZW5lcmF0aW9uIDEuNF9cbiAgICBpZiAob3B0cz8uZW5hYmxlTmFycmF0aXZlKSB7XG4gICAgICB0aGlzLl9lbmFibGVOYXJyYXRpdmUgPSB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBmbG93Q2hhcnQgPSB0aGlzLmJ1aWxkKCk7XG4gICAgY29uc3QgZXhlY3V0b3IgPSBuZXcgRmxvd0NoYXJ0RXhlY3V0b3I8VE91dCwgVFNjb3BlPihcbiAgICAgIGZsb3dDaGFydCxcbiAgICAgIHNjb3BlRmFjdG9yeSxcbiAgICAgIG9wdHM/LmRlZmF1bHRzLFxuICAgICAgb3B0cz8uaW5pdGlhbCxcbiAgICAgIG9wdHM/LnJlYWRPbmx5LFxuICAgICAgb3B0cz8udGhyb3R0bGluZ0Vycm9yQ2hlY2tlcixcbiAgICAgIHRoaXMuX3N0cmVhbUhhbmRsZXJzLFxuICAgICAgb3B0cz8uc2NvcGVQcm90ZWN0aW9uTW9kZSxcbiAgICApO1xuICAgIHJldHVybiBhd2FpdCBleGVjdXRvci5ydW4oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNZXJtYWlkIGRpYWdyYW0gZ2VuZXJhdG9yLlxuICAgKi9cbiAgdG9NZXJtYWlkKCk6IHN0cmluZyB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gWydmbG93Y2hhcnQgVEQnXTtcbiAgICBjb25zdCBpZE9mID0gKGs6IHN0cmluZykgPT4gKGsgfHwgJycpLnJlcGxhY2UoL1teYS16QS1aMC05X10vZywgJ18nKSB8fCAnXyc7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMuX3Jvb3QgPz8gZmFpbCgnZW1wdHkgdHJlZTsgY2FsbCBzdGFydCgpIGZpcnN0Jyk7XG5cbiAgICBjb25zdCB3YWxrID0gKG46IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+KSA9PiB7XG4gICAgICBjb25zdCBuaWQgPSBpZE9mKG4uaWQgPz8gbi5uYW1lKTtcbiAgICAgIGxpbmVzLnB1c2goYCR7bmlkfVtcIiR7bi5uYW1lfVwiXWApO1xuICAgICAgZm9yIChjb25zdCBjIG9mIG4uY2hpbGRyZW4gfHwgW10pIHtcbiAgICAgICAgY29uc3QgY2lkID0gaWRPZihjLmlkID8/IGMubmFtZSk7XG4gICAgICAgIGxpbmVzLnB1c2goYCR7bmlkfSAtLT4gJHtjaWR9YCk7XG4gICAgICAgIHdhbGsoYyk7XG4gICAgICB9XG4gICAgICBpZiAobi5uZXh0KSB7XG4gICAgICAgIGNvbnN0IG1pZCA9IGlkT2Yobi5uZXh0LmlkID8/IG4ubmV4dC5uYW1lKTtcbiAgICAgICAgbGluZXMucHVzaChgJHtuaWR9IC0tPiAke21pZH1gKTtcbiAgICAgICAgd2FsayhuLm5leHQpO1xuICAgICAgfVxuICAgIH07XG4gICAgd2Fsayhyb290KTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG4gIH1cblxuICAvKiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgSW50ZXJuYWxzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqL1xuXG4gIHByaXZhdGUgX25lZWRDdXJzb3IoKTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4ge1xuICAgIHJldHVybiB0aGlzLl9jdXJzb3IgPz8gZmFpbCgnY3Vyc29yIHVuZGVmaW5lZDsgY2FsbCBzdGFydCgpIGZpcnN0Jyk7XG4gIH1cblxuICBwcml2YXRlIF9uZWVkQ3Vyc29yU3BlYygpOiBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUge1xuICAgIHJldHVybiB0aGlzLl9jdXJzb3JTcGVjID8/IGZhaWwoJ2N1cnNvciB1bmRlZmluZWQ7IGNhbGwgc3RhcnQoKSBmaXJzdCcpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IGJ1aWxkLXRpbWUgZXh0cmFjdG9yIHRvIGEgc2luZ2xlIG5vZGUgaW1tZWRpYXRlbHkuXG4gICAqIElmIG5vIGV4dHJhY3RvciByZWdpc3RlcmVkLCByZXR1cm5zIHNwZWMgYXMtaXMuXG4gICAqIF9SZXF1aXJlbWVudHM6IGluY3JlbWVudGFsLXR5cGUtY29tcHV0YXRpb24gMy4yX1xuICAgKi9cbiAgX2FwcGx5RXh0cmFjdG9yVG9Ob2RlKHNwZWM6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSk6IFNlcmlhbGl6ZWRQaXBlbGluZVN0cnVjdHVyZSB7XG4gICAgaWYgKCF0aGlzLl9idWlsZFRpbWVFeHRyYWN0b3IpIHtcbiAgICAgIHJldHVybiBzcGVjO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHRoaXMuX2J1aWxkVGltZUV4dHJhY3RvcihzcGVjIGFzIGFueSkgYXMgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tGbG93Q2hhcnRCdWlsZGVyXSBCdWlsZC10aW1lIGV4dHJhY3RvciBlcnJvcjonLCBlcnJvcik7XG4gICAgICB0aGlzLl9idWlsZFRpbWVFeHRyYWN0b3JFcnJvcnMucHVzaCh7XG4gICAgICAgIG1lc3NhZ2U6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvciksXG4gICAgICAgIGVycm9yLFxuICAgICAgfSk7XG4gICAgICByZXR1cm4gc3BlYztcbiAgICB9XG4gIH1cblxuICAvKiogQWRkIGEgZnVuY3Rpb24gdG8gdGhlIHNoYXJlZCBzdGFnZU1hcDsgZmFpbCBvbiBjb25mbGljdGluZyBuYW1lcy4gKi9cbiAgX2FkZFRvTWFwKG5hbWU6IHN0cmluZywgZm46IFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+KSB7XG4gICAgaWYgKHRoaXMuX3N0YWdlTWFwLmhhcyhuYW1lKSkge1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zdGFnZU1hcC5nZXQobmFtZSk7XG4gICAgICBpZiAoZXhpc3RpbmcgIT09IGZuKSBmYWlsKGBzdGFnZU1hcCBjb2xsaXNpb24gZm9yICcke25hbWV9J2ApO1xuICAgIH1cbiAgICB0aGlzLl9zdGFnZU1hcC5zZXQobmFtZSwgZm4pO1xuICB9XG5cbiAgLyoqXG4gICAqIE1lcmdlIGFub3RoZXIgZmxvdydzIHN0YWdlTWFwOyB0aHJvdyBvbiBuYW1lIGNvbGxpc2lvbnMuXG4gICAqXG4gICAqIFdIWTogV2hlbiBtb3VudGluZyBzdWJmbG93cywgdGhlaXIgc3RhZ2UgZnVuY3Rpb25zIG5lZWQgdG8gYmUgYWNjZXNzaWJsZVxuICAgKiBmcm9tIHRoZSBwYXJlbnQncyBzaGFyZWQgc3RhZ2VNYXAuIEFuIG9wdGlvbmFsIGBwcmVmaXhgIHBhcmFtZXRlclxuICAgKiBuYW1lc3BhY2VzIGFsbCBrZXlzIChlLmcuLCBcImNsYXNzaWZ5L1NlZWRTY29wZVwiKSB0byBwcmV2ZW50IGNvbGxpc2lvbnNcbiAgICogd2hlbiBtdWx0aXBsZSBzdWJmbG93cyBzaGFyZSB0aGUgc2FtZSBzdGFnZSBuYW1lcy5cbiAgICpcbiAgICogQHBhcmFtIG90aGVyIC0gVGhlIHN0YWdlTWFwIHRvIG1lcmdlIGluXG4gICAqIEBwYXJhbSBwcmVmaXggLSBPcHRpb25hbCBuYW1lc3BhY2UgcHJlZml4IGZvciBhbGwga2V5cyAoZS5nLiwgbW91bnQgaWQpXG4gICAqL1xuICBfbWVyZ2VTdGFnZU1hcChcbiAgICBvdGhlcjogTWFwPHN0cmluZywgUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4+LFxuICAgIHByZWZpeD86IHN0cmluZyxcbiAgKSB7XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2Ygb3RoZXIpIHtcbiAgICAgIGNvbnN0IGtleSA9IHByZWZpeCA/IGAke3ByZWZpeH0vJHtrfWAgOiBrO1xuICAgICAgaWYgKHRoaXMuX3N0YWdlTWFwLmhhcyhrZXkpKSB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc3RhZ2VNYXAuZ2V0KGtleSk7XG4gICAgICAgIGlmIChleGlzdGluZyAhPT0gdikgZmFpbChgc3RhZ2VNYXAgY29sbGlzaW9uIHdoaWxlIG1vdW50aW5nIGZsb3djaGFydCBhdCAnJHtrZXl9J2ApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fc3RhZ2VNYXAuc2V0KGtleSwgdik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlZXAtY2xvbmUgYSBTdGFnZU5vZGUgdHJlZSwgcHJlZml4aW5nIGFsbCBgbmFtZWAgKHN0YWdlTWFwIGtleSkgYW5kXG4gICAqIGBzdWJmbG93SWRgIHByb3BlcnRpZXMgc28gdGhlIHRyZWUgcmVmZXJlbmNlcyB0aGUgbmFtZXNwYWNlZCBzdGFnZU1hcC5cbiAgICpcbiAgICogV0hZOiBXaGVuIHR3byBzdWJmbG93cyBoYXZlIGlkZW50aWNhbGx5LW5hbWVkIHN0YWdlcyAoZS5nLiwgYm90aCBoYXZlXG4gICAqIFwiU2VlZFNjb3BlXCIpLCBwcmVmaXhpbmcgYXZvaWRzIHN0YWdlTWFwIGNvbGxpc2lvbnMuIFRoZSBjbG9uZWQgdHJlZVxuICAgKiBpcyBzdG9yZWQgaW4gX3N1YmZsb3dEZWZzIHNvIHJ1bnRpbWUgZXhlY3V0aW9uIHVzZXMgdGhlIHByZWZpeGVkIG5hbWVzLlxuICAgKlxuICAgKiBAcGFyYW0gbm9kZSAtIFJvb3Qgb2YgdGhlIHRyZWUgdG8gY2xvbmVcbiAgICogQHBhcmFtIHByZWZpeCAtIE5hbWVzcGFjZSBwcmVmaXggKGUuZy4sIHRoZSBtb3VudCBpZCBcImNsYXNzaWZ5XCIpXG4gICAqIEByZXR1cm5zIEEgbmV3IHRyZWUgd2l0aCBhbGwgbmFtZXMgcHJlZml4ZWRcbiAgICovXG4gIHByaXZhdGUgX3ByZWZpeE5vZGVUcmVlKFxuICAgIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIHByZWZpeDogc3RyaW5nLFxuICApOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiB7XG4gICAgaWYgKCFub2RlKSByZXR1cm4gbm9kZTtcbiAgICBjb25zdCBjbG9uZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gPSB7IC4uLm5vZGUgfTtcbiAgICBjbG9uZS5uYW1lID0gYCR7cHJlZml4fS8ke25vZGUubmFtZX1gO1xuICAgIGlmIChjbG9uZS5zdWJmbG93SWQpIGNsb25lLnN1YmZsb3dJZCA9IGAke3ByZWZpeH0vJHtjbG9uZS5zdWJmbG93SWR9YDtcbiAgICBpZiAoY2xvbmUubmV4dCkgY2xvbmUubmV4dCA9IHRoaXMuX3ByZWZpeE5vZGVUcmVlKGNsb25lLm5leHQsIHByZWZpeCk7XG4gICAgaWYgKGNsb25lLmNoaWxkcmVuKSB7XG4gICAgICBjbG9uZS5jaGlsZHJlbiA9IGNsb25lLmNoaWxkcmVuLm1hcCgoYykgPT5cbiAgICAgICAgdGhpcy5fcHJlZml4Tm9kZVRyZWUoYywgcHJlZml4KSxcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBjbG9uZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBcHBlbmQgYSBzdWJmbG93IGRlc2NyaXB0aW9uIGxpbmUgdG8gX2Rlc2NyaXB0aW9uUGFydHMuXG4gICAqXG4gICAqIFdIWTogQm90aCBhZGRTdWJGbG93Q2hhcnQgYW5kIGFkZFN1YkZsb3dDaGFydE5leHQgbmVlZCB0aGUgc2FtZVxuICAgKiBkZXNjcmlwdGlvbiBhY2N1bXVsYXRpb24gbG9naWMsIHNvIGl0J3MgZXh0cmFjdGVkIGhlcmUuXG4gICAqL1xuICBwcml2YXRlIF9hcHBlbmRTdWJmbG93RGVzY3JpcHRpb24oXG4gICAgaWQ6IHN0cmluZyxcbiAgICBkaXNwbGF5TmFtZTogc3RyaW5nLFxuICAgIHN1YmZsb3c6IEZsb3dDaGFydDxUT3V0LCBUU2NvcGU+LFxuICApOiB2b2lkIHtcbiAgICB0aGlzLl9zdGVwQ291bnRlcisrO1xuICAgIHRoaXMuX3N0YWdlU3RlcE1hcC5zZXQoaWQsIHRoaXMuX3N0ZXBDb3VudGVyKTtcbiAgICBpZiAoc3ViZmxvdy5kZXNjcmlwdGlvbikge1xuICAgICAgdGhpcy5fZGVzY3JpcHRpb25QYXJ0cy5wdXNoKFxuICAgICAgICBgJHt0aGlzLl9zdGVwQ291bnRlcn0uIFtTdWItRXhlY3V0aW9uOiAke2Rpc3BsYXlOYW1lfV0g4oCUICR7c3ViZmxvdy5kZXNjcmlwdGlvbn1gLFxuICAgICAgKTtcbiAgICAgIC8vIEluZGVudCBzdWItc3RlcHMgZnJvbSB0aGUgc3ViZmxvdydzIGRlc2NyaXB0aW9uIGlmIGl0IGhhcyBtdWx0aS1saW5lIFN0ZXBzOlxuICAgICAgY29uc3QgbGluZXMgPSBzdWJmbG93LmRlc2NyaXB0aW9uLnNwbGl0KCdcXG4nKTtcbiAgICAgIGNvbnN0IHN0ZXBzSWR4ID0gbGluZXMuZmluZEluZGV4KChsKSA9PiBsLnN0YXJ0c1dpdGgoJ1N0ZXBzOicpKTtcbiAgICAgIGlmIChzdGVwc0lkeCA+PSAwKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSBzdGVwc0lkeCArIDE7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmIChsaW5lc1tpXS50cmltKCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2Rlc2NyaXB0aW9uUGFydHMucHVzaChgICAgJHtsaW5lc1tpXX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fZGVzY3JpcHRpb25QYXJ0cy5wdXNoKGAke3RoaXMuX3N0ZXBDb3VudGVyfS4gW1N1Yi1FeGVjdXRpb246ICR7ZGlzcGxheU5hbWV9XWApO1xuICAgIH1cbiAgfVxufVxuXG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEZhY3RvcnkgRnVuY3Rpb25cbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXG5cbi8qKlxuICogQ29udmVuaWVuY2UgZmFjdG9yeSB0byBjcmVhdGUgYSBGbG93Q2hhcnRCdWlsZGVyIHdpdGggc3RhcnQoKSBhbHJlYWR5IGNhbGxlZC5cbiAqIFJlY29tbWVuZGVkIHdheSB0byBjcmVhdGUgZmxvd3MuXG4gKiBcbiAqIF9SZXF1aXJlbWVudHM6IGZsb3djaGFydC1idWlsZGVyLXNpbXBsaWZpY2F0aW9uIDcuMV9cbiAqIF9SZXF1aXJlbWVudHM6IGluY3JlbWVudGFsLXR5cGUtY29tcHV0YXRpb24gMy4yX1xuICogXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogLy8gU2ltcGxlIGJyYW5jaFxuICogY29uc3QgYnJhbmNoQSA9IGZsb3dDaGFydCgnaGFuZGxlQScsIGhhbmRsZUFGbilcbiAqICAgLmFkZEZ1bmN0aW9uKCdzdGVwQTEnLCBzdGVwQTFGbilcbiAqICAgLmJ1aWxkKCk7XG4gKiBcbiAqIC8vIE1haW4gZmxvdyB3aXRoIHN1YmZsb3cgYnJhbmNoZXNcbiAqIGNvbnN0IG1haW4gPSBmbG93Q2hhcnQoJ2VudHJ5JywgZW50cnlGbilcbiAqICAgLmFkZERlY2lkZXIoZGVjaWRlckZuKVxuICogICAgIC5hZGRTdWJGbG93Q2hhcnRCcmFuY2goJ2JyYW5jaEEnLCBicmFuY2hBKVxuICogICAuZW5kKClcbiAqICAgLmJ1aWxkKCk7XG4gKiBcbiAqIC8vIFdpdGggY3VzdG9tIGV4dHJhY3RvciAoYXBwbGllZCB0byBhbGwgbm9kZXMpXG4gKiBjb25zdCBjdXN0b21FeHRyYWN0b3IgPSAobm9kZSkgPT4gKHsgLi4ubm9kZSwgY3VzdG9tOiB0cnVlIH0pO1xuICogY29uc3QgZmxvdyA9IGZsb3dDaGFydCgnZW50cnknLCBlbnRyeUZuLCAnaWQnLCAnZGlzcGxheScsIGN1c3RvbUV4dHJhY3RvcilcbiAqICAgLmFkZEZ1bmN0aW9uKCduZXh0JywgbmV4dEZuKVxuICogICAuYnVpbGQoKTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gZmxvd0NoYXJ0PFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4oXG4gIG5hbWU6IHN0cmluZyxcbiAgZm4/OiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPixcbiAgaWQ/OiBzdHJpbmcsXG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nLFxuICBidWlsZFRpbWVFeHRyYWN0b3I/OiBCdWlsZFRpbWVFeHRyYWN0b3I8YW55PixcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmcsXG4pOiBGbG93Q2hhcnRCdWlsZGVyPFRPdXQsIFRTY29wZT4ge1xuICByZXR1cm4gbmV3IEZsb3dDaGFydEJ1aWxkZXI8VE91dCwgVFNjb3BlPihidWlsZFRpbWVFeHRyYWN0b3IpLnN0YXJ0KG5hbWUsIGZuLCBpZCwgZGlzcGxheU5hbWUsIGRlc2NyaXB0aW9uKTtcbn1cblxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTcGVjIHRvIFN0YWdlTm9kZSBDb252ZXJ0ZXJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXG5cbi8qKlxuICogQ29udmVydCBhIHB1cmUgSlNPTiBGbG93Q2hhcnRTcGVjIHRvIGEgU3RhZ2VOb2RlIHRyZWUuXG4gKiBVc2VkIGJ5IGJhY2tlbmRzIHRvIHJlY29uc3RydWN0IHRoZSB0cmVlIGZyb20gYSBzcGVjIHJlY2VpdmVkIGZyb20gZnJvbnRlbmQuXG4gKiBcbiAqIE5vdGU6IG5leHROb2RlRGVjaWRlciBpcyBpbnRlbnRpb25hbGx5IG9taXR0ZWQgLSBydW50aW1lIHVzZXMgeW91ciBCRSBkZWNpZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3BlY1RvU3RhZ2VOb2RlKHNwZWM6IEZsb3dDaGFydFNwZWMpOiBTdGFnZU5vZGU8YW55LCBhbnk+IHtcbiAgY29uc3QgaW5mbGF0ZSA9IChzOiBGbG93Q2hhcnRTcGVjKTogU3RhZ2VOb2RlPGFueSwgYW55PiA9PiAoe1xuICAgIG5hbWU6IHMubmFtZSxcbiAgICBpZDogcy5pZCxcbiAgICBjaGlsZHJlbjogcy5jaGlsZHJlbj8ubGVuZ3RoID8gcy5jaGlsZHJlbi5tYXAoaW5mbGF0ZSkgOiB1bmRlZmluZWQsXG4gICAgbmV4dDogcy5uZXh0ID8gaW5mbGF0ZShzLm5leHQpIDogdW5kZWZpbmVkLFxuICB9KTtcbiAgcmV0dXJuIGluZmxhdGUoc3BlYyk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIExlZ2FjeSBUeXBlIEFsaWFzZXMgKGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5KVxuICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBVc2UgRmxvd0NoYXJ0IGluc3RlYWQuIFRoaXMgYWxpYXMgZXhpc3RzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LlxuICovXG5leHBvcnQgdHlwZSBCdWlsdEZsb3c8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiA9IEZsb3dDaGFydDxUT3V0LCBUU2NvcGU+O1xuXG4vKipcbiAqIEEgc3RhZ2UgZnVuY3Rpb24gKHJlbGF4ZWQgZ2VuZXJpY3MgZm9yIGJ1aWxkZXIgZXJnb25vbWljcykuXG4gKi9cbmV4cG9ydCB0eXBlIFN0YWdlRm4gPSBQaXBlbGluZVN0YWdlRnVuY3Rpb248YW55LCBhbnk+O1xuXG4vKipcbiAqIExlZ2FjeSBQYXJhbGxlbFNwZWMgd2l0aCBidWlsZCBjYWxsYmFjayAoZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkpLlxuICogQGRlcHJlY2F0ZWQgVXNlIFNpbXBsaWZpZWRQYXJhbGxlbFNwZWMgaW5zdGVhZC5cbiAqL1xuZXhwb3J0IHR5cGUgUGFyYWxsZWxTcGVjPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSBTaW1wbGlmaWVkUGFyYWxsZWxTcGVjPFRPdXQsIFRTY29wZT4gJiB7XG4gIC8qKiBAZGVwcmVjYXRlZCBCdWlsZCBjYWxsYmFja3MgYXJlIG5vIGxvbmdlciBzdXBwb3J0ZWQuIFVzZSBhZGRTdWJGbG93Q2hhcnRCcmFuY2ggaW5zdGVhZC4gKi9cbiAgYnVpbGQ/OiBuZXZlcjtcbn07XG5cbi8qKlxuICogQSBicmFuY2ggYm9keSBmb3IgZGVjaWRlcnMuXG4gKiBAZGVwcmVjYXRlZCBVc2UgYWRkU3ViRmxvd0NoYXJ0QnJhbmNoIGZvciBuZXN0ZWQgZmxvd2NoYXJ0cy5cbiAqL1xuZXhwb3J0IHR5cGUgQnJhbmNoQm9keTxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+ID1cbiAgfCB7IG5hbWU/OiBzdHJpbmc7IGZuPzogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4gfVxuICB8ICgoYjogRmxvd0NoYXJ0QnVpbGRlcjxUT3V0LCBUU2NvcGU+KSA9PiB2b2lkKTtcblxuLyoqXG4gKiBCcmFuY2ggc3BlYyBmb3IgZGVjaWRlcnMuXG4gKiBAZGVwcmVjYXRlZCBVc2UgYWRkU3ViRmxvd0NoYXJ0QnJhbmNoIGZvciBuZXN0ZWQgZmxvd2NoYXJ0cy5cbiAqL1xuZXhwb3J0IHR5cGUgQnJhbmNoU3BlYzxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+ID0gUmVjb3JkPHN0cmluZywgQnJhbmNoQm9keTxUT3V0LCBUU2NvcGU+PjtcblxuLyoqXG4gKiBBIHJlZmVyZW5jZSBub2RlIHRoYXQgcG9pbnRzIHRvIGEgc3ViZmxvdyBkZWZpbml0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFN1YmZsb3dSZWYge1xuICAkcmVmOiBzdHJpbmc7XG4gIG1vdW50SWQ6IHN0cmluZztcbiAgZGlzcGxheU5hbWU/OiBzdHJpbmc7XG59XG4iXX0=