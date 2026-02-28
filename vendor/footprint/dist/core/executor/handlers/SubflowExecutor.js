"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubflowExecutor = void 0;
const StageContext_1 = require("../../memory/StageContext");
const PipelineRuntime_1 = require("../../memory/PipelineRuntime");
const logger_1 = require("../../../utils/logger");
const Pipeline_1 = require("../Pipeline");
const StageRunner_1 = require("./StageRunner");
const SubflowInputMapper_1 = require("./SubflowInputMapper");
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
class SubflowExecutor {
    constructor(ctx, nodeResolver, executeStage, callExtractor, getStageFn) {
        this.ctx = ctx;
        this.nodeResolver = nodeResolver;
        this.executeStage = executeStage;
        this.callExtractor = callExtractor;
        this.getStageFn = getStageFn;
    }
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
    async executeSubflow(node, parentContext, breakFlag, branchPath, subflowResultsMap) {
        var _a, _b;
        const subflowId = node.subflowId;
        const subflowName = (_a = node.subflowName) !== null && _a !== void 0 ? _a : node.name;
        // Log flow control decision for subflow entry
        parentContext.addFlowDebugMessage('subflow', `Entering ${subflowName} subflow`, {
            targetStage: subflowId,
        });
        // Narrative: mark subflow entry for human-readable story
        // WHY: Captures the nesting boundary so the reader can follow nested execution contexts
        // _Requirements: 7.1_
        this.ctx.narrativeGenerator.onSubflowEntry(subflowName);
        // Mark parent stage as subflow container
        parentContext.addLog('isSubflowContainer', true);
        parentContext.addLog('subflowId', subflowId);
        parentContext.addLog('subflowName', subflowName);
        // ─────────────────────────── Input Mapping ───────────────────────────
        // Compute mapped input BEFORE creating PipelineRuntime so it can be
        // passed as initialContext. This ensures the data is in the GlobalStore
        // from the start, avoiding WriteBuffer base-snapshot staleness issues.
        const mountOptions = node.subflowMountOptions;
        let mappedInput = {};
        if (mountOptions) {
            try {
                const parentScope = parentContext.getScope();
                mappedInput = (0, SubflowInputMapper_1.getInitialScopeValues)(parentScope, mountOptions);
                if (Object.keys(mappedInput).length > 0) {
                    parentContext.addLog('mappedInput', mappedInput);
                }
            }
            catch (error) {
                parentContext.addError('inputMapperError', error.toString());
                logger_1.logger.error(`Error in inputMapper for subflow (${subflowId}):`, { error });
                throw error;
            }
        }
        // Create isolated context for subflow
        // WHY: Each subflow gets its own PipelineRuntime with its own GlobalStore.
        const nestedContext = new PipelineRuntime_1.PipelineRuntime(node.name);
        let nestedRootContext = nestedContext.rootStageContext;
        // Seed subflow's GlobalStore with inputMapper data
        // WHY: The inputMapper transforms parent scope data into the subflow's
        // initial state. We seed THEN refresh the rootStageContext so its
        // WriteBuffer base snapshot includes the seeded data.
        if (Object.keys(mappedInput).length > 0) {
            (0, SubflowInputMapper_1.seedSubflowGlobalStore)(nestedContext, mappedInput);
            // Refresh rootStageContext so its WriteBuffer sees the committed data
            // WHY: seedSubflowGlobalStore commits to GlobalStore, but the original
            // rootStageContext's WriteBuffer has a stale base snapshot from before
            // seeding. Creating a fresh context from the updated GlobalStore ensures
            // downstream stages (SeedScope, AssemblePrompt) can read the seeded values.
            nestedRootContext = new StageContext_1.StageContext('', nestedRootContext.stageName, nestedContext.globalStore, '', nestedContext.executionHistory);
            nestedContext.rootStageContext = nestedRootContext;
        }
        // ─────────────────────── Create Subflow PipelineContext ───────────────────────
        // WHY: Create a new PipelineContext for the subflow with readOnlyContext = mappedInput
        // This ensures StageRunner passes mappedInput to ScopeFactory, so subflow stages
        // can access inputMapper values via their scope.
        const subflowCtx = (0, SubflowInputMapper_1.createSubflowPipelineContext)(this.ctx, nestedContext, mappedInput);
        // Log the readOnlyContext for debugging
        parentContext.addLog('subflowReadOnlyContext', mappedInput);
        // Create isolated break flag (subflow break doesn't propagate to parent)
        const subflowBreakFlag = { shouldBreak: false };
        let subflowOutput;
        let subflowError;
        // Create a copy of the node for subflow execution
        // Clear isSubflowRoot to prevent infinite recursion in executeSubflowInternal
        // 
        // WHY: We need to determine if `next` is part of the subflow's internal structure
        // or a continuation after the subflow.
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const subflowNode = {
            ...node,
            isSubflowRoot: false, // Clear to prevent re-detection as subflow
            // For subflows with children (fork pattern), strip `next` - it's the continuation
            // For subflows without children (linear pattern), keep `next` - it's internal chain
            next: hasChildren ? undefined : node.next,
        };
        try {
            // Store reference to subflowResultsMap for nested subflows
            this.subflowResultsMap = subflowResultsMap;
            // Store the subflow root for node resolution within the subflow
            this.currentSubflowRoot = subflowNode;
            // Store the subflow context for stage execution within the subflow
            this.currentSubflowCtx = subflowCtx;
            // Execute subflow using nested context
            subflowOutput = await this.executeSubflowInternal(subflowNode, nestedRootContext, subflowBreakFlag, subflowId);
        }
        catch (error) {
            subflowError = error;
            parentContext.addError('subflowError', error.toString());
            logger_1.logger.error(`Error in subflow (${subflowId}):`, { error });
        }
        finally {
            // Clear the subflow root reference to avoid stale references
            this.currentSubflowRoot = undefined;
            // Clear the subflow context reference
            this.currentSubflowCtx = undefined;
        }
        // Serialize subflow's execution data
        const subflowTreeContext = nestedContext.getSnapshot();
        // ─────────────────────────── Output Mapping ───────────────────────────
        // Apply output mapping if subflow completed successfully and outputMapper is provided.
        //
        // WHY: The subflow's output must be written to the CALLER's scope, not the
        // child branch's scope. When a subflow runs inside a ChildrenExecutor child
        // (e.g., tool-social-media-agent), parentContext has a tool-specific pipelineId
        // like 'tool-social-media-agent'. Writing to that namespace puts data at
        // ['pipelines', 'tool-social-media-agent', 'agent', 'messages'] — unreachable
        // by the parent agent which reads from ['agent', 'messages'] (root namespace).
        //
        // FIX: Walk up the context tree to find the ancestor with the root pipelineId
        // (empty string). This is the context that owns the parent agent's scope.
        // The output mapping writes go there so the parent agent sees the sub-agent's
        // result in its conversation history.
        if (!subflowError && (mountOptions === null || mountOptions === void 0 ? void 0 : mountOptions.outputMapper)) {
            try {
                // Find the correct context for output mapping writes.
                // When parentContext is a child branch (non-empty pipelineId), walk up
                // to the ancestor that owns the caller's scope (root pipelineId = '').
                let outputContext = parentContext;
                if (parentContext.pipelineId && parentContext.pipelineId !== '' && parentContext.parent) {
                    outputContext = parentContext.parent;
                }
                const parentScope = outputContext.getScope();
                const mappedOutput = (0, SubflowInputMapper_1.applyOutputMapping)(subflowOutput, parentScope, outputContext, mountOptions);
                // Log mapped output for debugging (on the original parentContext for visibility)
                if (mappedOutput && Object.keys(mappedOutput).length > 0) {
                    parentContext.addLog('mappedOutput', mappedOutput);
                    parentContext.addLog('outputMappingTarget', outputContext.pipelineId || '(root)');
                }
                // Commit the output context's writes (may be different from parentContext)
                outputContext.commit();
            }
            catch (error) {
                // Log outputMapper error but don't re-throw (non-fatal)
                parentContext.addError('outputMapperError', error.toString());
                logger_1.logger.error(`Error in outputMapper for subflow (${subflowId}):`, { error });
                // Don't re-throw - output mapping errors are non-fatal
            }
        }
        // Create SubflowResult (execution data only, no structure)
        const subflowResult = {
            subflowId,
            subflowName,
            treeContext: {
                globalContext: subflowTreeContext.globalContext,
                stageContexts: subflowTreeContext.stageContexts,
                history: subflowTreeContext.history,
            },
            parentStageId: parentContext.getStageId(),
        };
        // Attach the subflow's buildTimeStructure if available in the subflows dictionary.
        // WHY: Enables the debug UI to render the subflow's flowchart as a nested
        // visualization. The buildTimeStructure is stored alongside the root node
        // when the subflow was registered (e.g., by AgentBuilder for sub-agent tools).
        const subflowDef = (_b = this.ctx.subflows) === null || _b === void 0 ? void 0 : _b[subflowId];
        if (subflowDef && subflowDef.buildTimeStructure) {
            subflowResult.pipelineStructure = subflowDef.buildTimeStructure;
        }
        // Store in parent stage's debugInfo for drill-down
        parentContext.addLog('subflowResult', subflowResult);
        parentContext.addLog('hasSubflowData', true);
        // Add to collection for API response
        subflowResultsMap.set(subflowId, subflowResult);
        // Log flow control decision for subflow exit
        parentContext.addFlowDebugMessage('subflow', `Exiting ${subflowName} subflow`, {
            targetStage: subflowId,
        });
        // Narrative: mark subflow exit for human-readable story
        // WHY: Marks the return from a nested context back to the parent flow
        // _Requirements: 7.2_
        this.ctx.narrativeGenerator.onSubflowExit(subflowName);
        // Commit parent context patch
        parentContext.commit();
        // Re-throw if subflow errored
        if (subflowError) {
            throw subflowError;
        }
        return subflowOutput;
    }
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
    async executeSubflowInternal(node, context, breakFlag, branchPath) {
        var _a, _b;
        // Detect nested subflows and delegate to executeSubflow
        // WHY: Nested subflows need their own isolated context
        if (node.isSubflowRoot && node.subflowId) {
            const resolvedNode = this.nodeResolver.resolveSubflowReference(node);
            return await this.executeSubflow(resolvedNode, context, breakFlag, branchPath, this.subflowResultsMap);
        }
        // Get the stage function for the subflow root (if any)
        const stageFunc = this.getStageFn(node);
        const hasStageFunction = Boolean(stageFunc);
        const hasChildren = Boolean((_a = node.children) === null || _a === void 0 ? void 0 : _a.length);
        const hasNext = Boolean(node.next);
        const isDeciderNode = Boolean(node.nextNodeDecider);
        const breakFn = () => (breakFlag.shouldBreak = true);
        // Execute the subflow root's stage function if present
        let stageOutput;
        if (stageFunc) {
            try {
                // Use StageRunner with subflow context to ensure stages
                // receive mappedInput values via readOnlyContext → ScopeFactory
                if (this.currentSubflowCtx) {
                    const subflowStageRunner = new StageRunner_1.StageRunner(this.currentSubflowCtx);
                    stageOutput = await subflowStageRunner.run(node, stageFunc, context, breakFn);
                }
                else {
                    // Fallback to parent context (shouldn't happen in normal flow)
                    stageOutput = await this.executeStage(node, stageFunc, context, breakFn);
                }
            }
            catch (error) {
                context.commit();
                // Pass undefined for stageOutput and error details for enrichment
                // WHY: On error path, there's no successful output, but we capture
                // the error info so enriched snapshots include what went wrong.
                // _Requirements: single-pass-debug-structure 1.4_
                this.callExtractor(node, context, this.getStagePath(node, branchPath, context.stageName), undefined, {
                    type: 'stageExecutionError',
                    message: error.toString(),
                });
                context.addError('stageExecutionError', error.toString());
                throw error;
            }
            context.commit();
            // Pass stageOutput so enriched snapshots capture the stage's return value
            // _Requirements: single-pass-debug-structure 1.3_
            this.callExtractor(node, context, this.getStagePath(node, branchPath, context.stageName), stageOutput);
            if (breakFlag.shouldBreak) {
                return stageOutput;
            }
            // ───────────────────────── Handle dynamic stages ─────────────────────────
            // Check if the handler's return object is a StageNode for dynamic continuation.
            if (stageOutput && typeof stageOutput === 'object' && (0, Pipeline_1.isStageNodeReturn)(stageOutput)) {
                const dynamicNode = stageOutput;
                context.addLog('isDynamic', true);
                context.addLog('dynamicPattern', 'StageNodeReturn');
                // Handle dynamic children (fork pattern)
                if (dynamicNode.children && dynamicNode.children.length > 0) {
                    node.children = dynamicNode.children;
                    context.addLog('dynamicChildCount', dynamicNode.children.length);
                    context.addLog('dynamicChildIds', dynamicNode.children.map(c => c.id || c.name));
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
                // Handle dynamic next (linear continuation / loop-back)
                if (dynamicNode.next) {
                    node.next = dynamicNode.next;
                    context.addLog('hasDynamicNext', true);
                    const loopTargetId = dynamicNode.next.id || dynamicNode.next.name;
                    if (loopTargetId) {
                        context.addLog('loopTarget', loopTargetId);
                    }
                }
                // Clear stageOutput since the StageNode is the continuation, not the output
                stageOutput = undefined;
            }
        }
        // ───────────────────────── Children (if any) ─────────────────────────
        const hasChildrenAfterStage = Boolean((_b = node.children) === null || _b === void 0 ? void 0 : _b.length);
        const hasNextAfterStage = Boolean(node.next);
        const isDeciderNodeAfterStage = Boolean(node.nextNodeDecider);
        // Handle children (fork pattern)
        if (hasChildrenAfterStage) {
            if (isDeciderNodeAfterStage) {
                // Decider picks one child
                const chosen = await this.nodeResolver.getNextNode(node.nextNodeDecider, node.children, stageOutput, context);
                const nextStageContext = context.createNext('', chosen.name);
                const deciderResult = await this.executeSubflowInternal(chosen, nextStageContext, breakFlag, branchPath);
                if (!hasNextAfterStage)
                    return deciderResult;
            }
            else if (node.nextNodeSelector) {
                // Selector picks multiple children
                const nodeChildrenResults = await this.executeSelectedChildrenInternal(node.nextNodeSelector, node.children, stageOutput, context, branchPath, breakFlag);
                if (!hasNextAfterStage)
                    return nodeChildrenResults;
            }
            else {
                // Execute all children in parallel
                const nodeChildrenResults = await this.executeNodeChildrenInternal(node, context, branchPath, breakFlag);
                if (!hasNextAfterStage)
                    return nodeChildrenResults;
            }
        }
        // Handle linear next (including dynamic next from StageNode return)
        if (hasNextAfterStage) {
            let nextNode = node.next;
            // If the next node is a reference (has id but no fn), resolve it from the subflow structure
            // WHY: Critical for loop-back scenarios where the dynamic next only has name/id
            if (nextNode.id && !nextNode.fn) {
                let resolvedNode;
                if (this.currentSubflowRoot) {
                    resolvedNode = this.nodeResolver.findNodeById(nextNode.id, this.currentSubflowRoot);
                    if (resolvedNode) {
                        context.addLog('dynamicNextResolvedFrom', 'subflow');
                    }
                }
                // Fallback to main pipeline if not found in subflow
                if (!resolvedNode) {
                    resolvedNode = this.nodeResolver.findNodeById(nextNode.id);
                    if (resolvedNode) {
                        context.addLog('dynamicNextResolvedFrom', 'mainPipeline');
                    }
                }
                if (resolvedNode) {
                    nextNode = resolvedNode;
                    context.addLog('dynamicNextResolved', true);
                    context.addLog('dynamicNextTarget', nextNode.id);
                }
                else {
                    logger_1.logger.info(`Dynamic next node '${nextNode.id}' not found in subflow or main pipeline`);
                    context.addLog('dynamicNextResolved', false);
                    context.addLog('dynamicNextNotFound', nextNode.id);
                }
            }
            const nextStageContext = context.createNext('', nextNode.name);
            return await this.executeSubflowInternal(nextNode, nextStageContext, breakFlag, branchPath);
        }
        return stageOutput;
    }
    /**
     * Generate the stage path for extractor results.
     * Uses contextStageName (which includes iteration suffix) when it differs from base name.
     */
    getStagePath(node, branchPath, contextStageName) {
        var _a;
        const baseName = (_a = node.id) !== null && _a !== void 0 ? _a : node.name;
        const nodeId = (contextStageName && contextStageName !== node.name) ? contextStageName : baseName;
        if (!branchPath)
            return nodeId;
        return `${branchPath}.${nodeId}`;
    }
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
    async executeNodeChildrenInternal(node, context, branchPath, breakFlag) {
        var _a;
        const childPromises = ((_a = node.children) !== null && _a !== void 0 ? _a : []).map((child) => {
            const childContext = context.createChild('', child.id, child.name);
            const childBreakFlag = { shouldBreak: false };
            return this.executeSubflowInternal(child, childContext, childBreakFlag, branchPath)
                .then((result) => {
                childContext.commit();
                return { id: child.id, result, isError: false };
            })
                .catch((error) => {
                childContext.commit();
                logger_1.logger.info(`TREE PIPELINE: executeNodeChildrenInternal - Error for id: ${child === null || child === void 0 ? void 0 : child.id}`, { error });
                return { id: child.id, result: error, isError: true };
            });
        });
        const settled = await Promise.allSettled(childPromises);
        const childrenResults = {};
        settled.forEach((s) => {
            if (s.status === 'fulfilled') {
                const { id, result, isError } = s.value;
                childrenResults[id] = { id, result, isError };
            }
            else {
                logger_1.logger.error(`Execution failed: ${s.reason}`);
            }
        });
        return childrenResults;
    }
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
    async executeSelectedChildrenInternal(selector, children, input, context, branchPath, breakFlag) {
        // Invoke selector
        const selectorResult = await selector(input);
        // Normalize to array
        const selectedIds = Array.isArray(selectorResult) ? selectorResult : [selectorResult];
        // Record selection in debug info
        context.addLog('selectedChildIds', selectedIds);
        context.addLog('selectorPattern', 'multi-choice');
        // Empty selection - skip children execution
        if (selectedIds.length === 0) {
            context.addLog('skippedAllChildren', true);
            return {};
        }
        // Filter to selected children
        const selectedChildren = children.filter((c) => selectedIds.includes(c.id));
        // Validate all IDs found
        if (selectedChildren.length !== selectedIds.length) {
            const childIds = children.map((c) => c.id);
            const missing = selectedIds.filter((id) => !childIds.includes(id));
            const errorMessage = `Selector returned unknown child IDs: ${missing.join(', ')}. Available: ${childIds.join(', ')}`;
            logger_1.logger.error(`Error in subflow (${branchPath}):`, { error: errorMessage });
            context.addError('selectorError', errorMessage);
            throw new Error(errorMessage);
        }
        // Record skipped children for visualization
        const skippedIds = children.filter((c) => !selectedIds.includes(c.id)).map((c) => c.id);
        if (skippedIds.length > 0) {
            context.addLog('skippedChildIds', skippedIds);
        }
        // Execute selected children using internal version (for subflow context)
        const tempNode = { name: 'selector-temp', children: selectedChildren };
        return await this.executeNodeChildrenInternal(tempNode, context, branchPath, breakFlag);
    }
}
exports.SubflowExecutor = SubflowExecutor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3ViZmxvd0V4ZWN1dG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvZXhlY3V0b3IvaGFuZGxlcnMvU3ViZmxvd0V4ZWN1dG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBMkJHOzs7QUFFSCw0REFBeUQ7QUFDekQsa0VBQStEO0FBRS9ELGtEQUErQztBQUUvQywwQ0FBZ0Q7QUFFaEQsK0NBQTRDO0FBQzVDLDZEQUs4QjtBQXFEOUI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHO0FBQ0gsTUFBYSxlQUFlO0lBUzFCLFlBQ1UsR0FBa0MsRUFDbEMsWUFBd0MsRUFDeEMsWUFBMEMsRUFDMUMsYUFBNEMsRUFDNUMsVUFBc0M7UUFKdEMsUUFBRyxHQUFILEdBQUcsQ0FBK0I7UUFDbEMsaUJBQVksR0FBWixZQUFZLENBQTRCO1FBQ3hDLGlCQUFZLEdBQVosWUFBWSxDQUE4QjtRQUMxQyxrQkFBYSxHQUFiLGFBQWEsQ0FBK0I7UUFDNUMsZUFBVSxHQUFWLFVBQVUsQ0FBNEI7SUFDN0MsQ0FBQztJQUVKOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQTBCRztJQUNILEtBQUssQ0FBQyxjQUFjLENBQ2xCLElBQTZCLEVBQzdCLGFBQTJCLEVBQzNCLFNBQW1DLEVBQ25DLFVBQThCLEVBQzlCLGlCQUE2Qzs7UUFFN0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVUsQ0FBQztRQUNsQyxNQUFNLFdBQVcsR0FBRyxNQUFBLElBQUksQ0FBQyxXQUFXLG1DQUFJLElBQUksQ0FBQyxJQUFJLENBQUM7UUFFbEQsOENBQThDO1FBQzlDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsWUFBWSxXQUFXLFVBQVUsRUFBRTtZQUM5RSxXQUFXLEVBQUUsU0FBUztTQUN2QixDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsd0ZBQXdGO1FBQ3hGLHNCQUFz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RUFBRSxDQUFDLENBQUM7UUFDekYsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzFCLE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELHlFQUF5RTtRQUN6RSxNQUFNLFFBQVEsR0FBNEIsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ2hHLE9BQU8sTUFBTSxJQUFJLENBQUMsMkJBQTJCLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDMUYsQ0FBQztDQUNGO0FBeGxCRCwwQ0F3bEJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTdWJmbG93RXhlY3V0b3IudHNcbiAqXG4gKiBXSFk6IEhhbmRsZXMgc3ViZmxvdyBleGVjdXRpb24gd2l0aCBpc29sYXRlZCBQaXBlbGluZVJ1bnRpbWUgY29udGV4dHMuXG4gKiBUaGlzIG1vZHVsZSBpcyBleHRyYWN0ZWQgZnJvbSBQaXBlbGluZS50cyBmb2xsb3dpbmcgdGhlIFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUsXG4gKiBpc29sYXRpbmcgdGhlIGNvbmNlcm5zIG9mIHN1YmZsb3cgZXhlY3V0aW9uIGZyb20gbWFpbiBwaXBlbGluZSB0cmF2ZXJzYWwuXG4gKlxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gRXhlY3V0ZSBzdWJmbG93cyB3aXRoIGlzb2xhdGVkIFBpcGVsaW5lUnVudGltZSBjb250ZXh0c1xuICogLSBIYW5kbGUgc3RhZ2UgZXhlY3V0aW9uIHdpdGhpbiBzdWJmbG93IGNvbnRleHRzXG4gKiAtIEV4ZWN1dGUgY2hpbGRyZW4gd2l0aGluIHN1YmZsb3cgY29udGV4dHMgKGZvcmssIGRlY2lkZXIsIHNlbGVjdG9yIHBhdHRlcm5zKVxuICogLSBBcHBseSBpbnB1dC9vdXRwdXQgbWFwcGluZyBmb3Igc3ViZmxvd3MgKHZpYSBTdWJmbG93SW5wdXRNYXBwZXIpXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gRWFjaCBzdWJmbG93IGdldHMgaXRzIG93biBQaXBlbGluZVJ1bnRpbWUgd2l0aCBpdHMgb3duIEdsb2JhbFN0b3JlIGZvciBpc29sYXRpb25cbiAqIC0gTmVzdGVkIHN1YmZsb3dzIGFyZSBkZXRlY3RlZCBhbmQgZGVsZWdhdGVkIGJhY2sgdG8gZXhlY3V0ZVN1YmZsb3cgZm9yIHByb3BlciBpc29sYXRpb25cbiAqIC0gSW5wdXQgbWFwcGluZyBzZWVkcyB0aGUgc3ViZmxvdydzIEdsb2JhbFN0b3JlIGJlZm9yZSBleGVjdXRpb25cbiAqIC0gT3V0cHV0IG1hcHBpbmcgd3JpdGVzIGJhY2sgdG8gcGFyZW50IHNjb3BlIGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGxldGlvblxuICpcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBQaXBlbGluZX0gLSBPcmNoZXN0cmF0ZXMgd2hlbiBzdWJmbG93cyBhcmUgZXhlY3V0ZWRcbiAqIC0ge0BsaW5rIFBpcGVsaW5lUnVudGltZX0gLSBQcm92aWRlcyBpc29sYXRlZCBjb250ZXh0IGZvciBzdWJmbG93IGV4ZWN1dGlvblxuICogLSB7QGxpbmsgU3ViZmxvd0lucHV0TWFwcGVyfSAtIEhhbmRsZXMgaW5wdXQvb3V0cHV0IG1hcHBpbmcgYmV0d2VlbiBwYXJlbnQgYW5kIHN1YmZsb3dcbiAqIC0ge0BsaW5rIE5vZGVSZXNvbHZlcn0gLSBSZXNvbHZlcyBzdWJmbG93IHJlZmVyZW5jZXMgYW5kIG5vZGUgbG9va3Vwc1xuICpcbiAqIF9SZXF1aXJlbWVudHM6IDEuMSwgMS4yLCAxLjMsIDEuNCwgMS41LCAxLjZfXG4gKiBfUmVxdWlyZW1lbnRzOiBzdWJmbG93LWlucHV0LW1hcHBpbmcgOC41X1xuICovXG5cbmltcG9ydCB7IFN0YWdlQ29udGV4dCB9IGZyb20gJy4uLy4uL21lbW9yeS9TdGFnZUNvbnRleHQnO1xuaW1wb3J0IHsgUGlwZWxpbmVSdW50aW1lIH0gZnJvbSAnLi4vLi4vbWVtb3J5L1BpcGVsaW5lUnVudGltZSc7XG5pbXBvcnQgeyBQaXBlbGluZUNvbnRleHQsIFN1YmZsb3dSZXN1bHQsIE5vZGVSZXN1bHRUeXBlLCBQaXBlbGluZVN0YWdlRnVuY3Rpb24gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi8uLi8uLi91dGlscy9sb2dnZXInO1xuaW1wb3J0IHR5cGUgeyBTdGFnZU5vZGUsIFNlbGVjdG9yLCBEZWNpZGVyIH0gZnJvbSAnLi4vUGlwZWxpbmUnO1xuaW1wb3J0IHsgaXNTdGFnZU5vZGVSZXR1cm4gfSBmcm9tICcuLi9QaXBlbGluZSc7XG5pbXBvcnQgeyBOb2RlUmVzb2x2ZXIgfSBmcm9tICcuL05vZGVSZXNvbHZlcic7XG5pbXBvcnQgeyBTdGFnZVJ1bm5lciB9IGZyb20gJy4vU3RhZ2VSdW5uZXInO1xuaW1wb3J0IHtcbiAgZ2V0SW5pdGlhbFNjb3BlVmFsdWVzLFxuICBzZWVkU3ViZmxvd0dsb2JhbFN0b3JlLFxuICBhcHBseU91dHB1dE1hcHBpbmcsXG4gIGNyZWF0ZVN1YmZsb3dQaXBlbGluZUNvbnRleHQsXG59IGZyb20gJy4vU3ViZmxvd0lucHV0TWFwcGVyJztcblxuLyoqXG4gKiBFeGVjdXRlU3RhZ2VGblxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBDYWxsYmFjayB0eXBlIGZvciBleGVjdXRpbmcgYSBzdGFnZSBmdW5jdGlvbi5cbiAqXG4gKiBXSFk6IFBhc3NlZCBmcm9tIFBpcGVsaW5lIHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY3kuIFRoaXMgYWxsb3dzXG4gKiBTdWJmbG93RXhlY3V0b3IgdG8gZXhlY3V0ZSBzdGFnZXMgd2l0aG91dCBpbXBvcnRpbmcgUGlwZWxpbmUuXG4gKi9cbmV4cG9ydCB0eXBlIEV4ZWN1dGVTdGFnZUZuPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSAoXG4gIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICBzdGFnZUZ1bmM6IFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+LFxuICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gIGJyZWFrRm46ICgpID0+IHZvaWQsXG4pID0+IFByb21pc2U8VE91dD47XG5cbi8qKlxuICogQ2FsbEV4dHJhY3RvckZuXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIENhbGxiYWNrIHR5cGUgZm9yIGNhbGxpbmcgdGhlIHRyYXZlcnNhbCBleHRyYWN0b3IuXG4gKlxuICogV0hZOiBQYXNzZWQgZnJvbSBQaXBlbGluZSB0byBhdm9pZCBjaXJjdWxhciBkZXBlbmRlbmN5LiBUaGlzIGFsbG93c1xuICogU3ViZmxvd0V4ZWN1dG9yIHRvIGNhbGwgdGhlIGV4dHJhY3RvciB3aXRob3V0IGltcG9ydGluZyBQaXBlbGluZS5cbiAqXG4gKiBAcGFyYW0gbm9kZSAtIFRoZSBzdGFnZSBub2RlXG4gKiBAcGFyYW0gY29udGV4dCAtIFRoZSBzdGFnZSBjb250ZXh0IChhZnRlciBjb21taXQpXG4gKiBAcGFyYW0gc3RhZ2VQYXRoIC0gVGhlIGZ1bGwgcGF0aCB0byB0aGlzIHN0YWdlXG4gKiBAcGFyYW0gc3RhZ2VPdXRwdXQgLSBUaGUgc3RhZ2UgZnVuY3Rpb24ncyByZXR1cm4gdmFsdWUgKHVuZGVmaW5lZCBvbiBlcnJvciBvciBuby1mdW5jdGlvbiBub2RlcylcbiAqICAgX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuM19cbiAqIEBwYXJhbSBlcnJvckluZm8gLSBFcnJvciBkZXRhaWxzIHdoZW4gdGhlIHN0YWdlIHRocmV3IGR1cmluZyBleGVjdXRpb25cbiAqICAgX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuNF9cbiAqL1xuZXhwb3J0IHR5cGUgQ2FsbEV4dHJhY3RvckZuPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSAoXG4gIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gIHN0YWdlUGF0aDogc3RyaW5nLFxuICBzdGFnZU91dHB1dD86IHVua25vd24sXG4gIGVycm9ySW5mbz86IHsgdHlwZTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfSxcbikgPT4gdm9pZDtcblxuLyoqXG4gKiBHZXRTdGFnZUZuRm5cbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogQ2FsbGJhY2sgdHlwZSBmb3IgZ2V0dGluZyBhIHN0YWdlIGZ1bmN0aW9uIGZyb20gdGhlIHN0YWdlIG1hcC5cbiAqXG4gKiBXSFk6IFBhc3NlZCBmcm9tIFBpcGVsaW5lIHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY3kuIFRoaXMgYWxsb3dzXG4gKiBTdWJmbG93RXhlY3V0b3IgdG8gcmVzb2x2ZSBzdGFnZSBmdW5jdGlvbnMgd2l0aG91dCBpbXBvcnRpbmcgUGlwZWxpbmUuXG4gKi9cbmV4cG9ydCB0eXBlIEdldFN0YWdlRm5GbjxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+ID0gKFxuICBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbikgPT4gUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4gfCB1bmRlZmluZWQ7XG5cbi8qKlxuICogU3ViZmxvd0V4ZWN1dG9yXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIEhhbmRsZXMgc3ViZmxvdyBleGVjdXRpb24gd2l0aCBpc29sYXRlZCBQaXBlbGluZVJ1bnRpbWUgY29udGV4dHMuXG4gKlxuICogV0hZOiBTdWJmbG93cyBuZWVkIHRoZWlyIG93biBpc29sYXRlZCBjb250ZXh0IHRvIHByZXZlbnQgc3RhdGUgcG9sbHV0aW9uXG4gKiBiZXR3ZWVuIHRoZSBwYXJlbnQgcGlwZWxpbmUgYW5kIHRoZSBzdWJmbG93LiBUaGlzIGNsYXNzIG1hbmFnZXMgdGhhdCBpc29sYXRpb25cbiAqIHdoaWxlIHN0aWxsIGFsbG93aW5nIGRhdGEgdG8gZmxvdyBiZXR3ZWVuIHBhcmVudCBhbmQgc3ViZmxvdyB2aWEgaW5wdXQvb3V0cHV0IG1hcHBpbmcuXG4gKlxuICogREVTSUdOOiBVc2VzIFBpcGVsaW5lQ29udGV4dCBmb3IgYWNjZXNzIHRvIHNoYXJlZCBwaXBlbGluZSBzdGF0ZSwgZW5hYmxpbmdcbiAqIGRlcGVuZGVuY3kgaW5qZWN0aW9uIGZvciB0ZXN0aW5nLlxuICpcbiAqIEB0ZW1wbGF0ZSBUT3V0IC0gT3V0cHV0IHR5cGUgb2YgcGlwZWxpbmUgc3RhZ2VzXG4gKiBAdGVtcGxhdGUgVFNjb3BlIC0gU2NvcGUgdHlwZSBwYXNzZWQgdG8gc3RhZ2VzXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGV4ZWN1dG9yID0gbmV3IFN1YmZsb3dFeGVjdXRvcihjdHgsIG5vZGVSZXNvbHZlciwgZXhlY3V0ZVN0YWdlLCBjYWxsRXh0cmFjdG9yLCBnZXRTdGFnZUZuKTtcbiAqIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dG9yLmV4ZWN1dGVTdWJmbG93KHN1YmZsb3dOb2RlLCBwYXJlbnRDb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgsIHJlc3VsdHNNYXApO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBTdWJmbG93RXhlY3V0b3I8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiB7XG4gIC8qKlxuICAgKiBUaGUgY3VycmVudCBzdWJmbG93J3MgUGlwZWxpbmVDb250ZXh0LlxuICAgKiBTZXQgZHVyaW5nIGV4ZWN1dGVTdWJmbG93IGFuZCB1c2VkIGJ5IGV4ZWN1dGVTdWJmbG93SW50ZXJuYWwgZm9yIHN0YWdlIGV4ZWN1dGlvbi5cbiAgICogVGhpcyBlbnN1cmVzIHN0YWdlcyB3aXRoaW4gdGhlIHN1YmZsb3cgdXNlIHRoZSBzdWJmbG93J3MgcmVhZE9ubHlDb250ZXh0LlxuICAgKiBfUmVxdWlyZW1lbnRzOiBzdWJmbG93LXNjb3BlLWlzb2xhdGlvbiAxLjMsIDIuMl9cbiAgICovXG4gIHByaXZhdGUgY3VycmVudFN1YmZsb3dDdHg/OiBQaXBlbGluZUNvbnRleHQ8VE91dCwgVFNjb3BlPjtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogUGlwZWxpbmVDb250ZXh0PFRPdXQsIFRTY29wZT4sXG4gICAgcHJpdmF0ZSBub2RlUmVzb2x2ZXI6IE5vZGVSZXNvbHZlcjxUT3V0LCBUU2NvcGU+LFxuICAgIHByaXZhdGUgZXhlY3V0ZVN0YWdlOiBFeGVjdXRlU3RhZ2VGbjxUT3V0LCBUU2NvcGU+LFxuICAgIHByaXZhdGUgY2FsbEV4dHJhY3RvcjogQ2FsbEV4dHJhY3RvckZuPFRPdXQsIFRTY29wZT4sXG4gICAgcHJpdmF0ZSBnZXRTdGFnZUZuOiBHZXRTdGFnZUZuRm48VE91dCwgVFNjb3BlPixcbiAgKSB7fVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGEgc3ViZmxvdyB3aXRoIGlzb2xhdGVkIGNvbnRleHQuXG4gICAqXG4gICAqIFdIWTogU3ViZmxvd3MgbmVlZCB0aGVpciBvd24gUGlwZWxpbmVSdW50aW1lIHRvIHByZXZlbnQgc3RhdGUgcG9sbHV0aW9uLlxuICAgKiBUaGlzIG1ldGhvZCBjcmVhdGVzIHRoZSBpc29sYXRlZCBjb250ZXh0LCBhcHBsaWVzIGlucHV0IG1hcHBpbmcsIGV4ZWN1dGVzXG4gICAqIHRoZSBzdWJmbG93LCBhbmQgYXBwbGllcyBvdXRwdXQgbWFwcGluZy5cbiAgICpcbiAgICogREVTSUdOOiBUaGlzIG1ldGhvZDpcbiAgICogMS4gQ3JlYXRlcyBhIGZyZXNoIFBpcGVsaW5lUnVudGltZSBmb3IgdGhlIHN1YmZsb3dcbiAgICogMi4gQXBwbGllcyBpbnB1dCBtYXBwaW5nIHRvIHNlZWQgdGhlIHN1YmZsb3cncyBHbG9iYWxTdG9yZVxuICAgKiAzLiBFeGVjdXRlcyB0aGUgc3ViZmxvdydzIGludGVybmFsIHN0cnVjdHVyZSB1c2luZyB0aGUgbmVzdGVkIGNvbnRleHRcbiAgICogNC4gQXBwbGllcyBvdXRwdXQgbWFwcGluZyB0byB3cml0ZSByZXN1bHRzIGJhY2sgdG8gcGFyZW50IHNjb3BlXG4gICAqIDUuIFN0b3JlcyB0aGUgc3ViZmxvdydzIGV4ZWN1dGlvbiBkYXRhIGZvciBkZWJ1Z2dpbmcvdmlzdWFsaXphdGlvblxuICAgKlxuICAgKiBJTVBPUlRBTlQ6IFRoZSBzdWJmbG93J3MgYG5leHRgIGNoYWluIGlzIE5PVCBleGVjdXRlZCBpbnNpZGUgdGhlIHN1YmZsb3cuXG4gICAqIEFmdGVyIGV4ZWN1dGVTdWJmbG93IHJldHVybnMsIHRoZSBwYXJlbnQncyBleGVjdXRlTm9kZSBjb250aW51ZXMgd2l0aCBub2RlLm5leHQuXG4gICAqIFRoaXMgZW5zdXJlcyBzdGFnZXMgYWZ0ZXIgYSBzdWJmbG93IGV4ZWN1dGUgaW4gdGhlIHBhcmVudCdzIGNvbnRleHQuXG4gICAqXG4gICAqIEBwYXJhbSBzdWJmbG93Um9vdCAtIFRoZSBzdWJmbG93IHJvb3Qgbm9kZSAoaGFzIGlzU3ViZmxvd1Jvb3Q6IHRydWUpXG4gICAqIEBwYXJhbSBwYXJlbnRDb250ZXh0IC0gVGhlIHBhcmVudCBwaXBlbGluZSdzIFN0YWdlQ29udGV4dFxuICAgKiBAcGFyYW0gYnJlYWtGbGFnIC0gQnJlYWsgZmxhZyBmcm9tIHBhcmVudCAoc3ViZmxvdyBicmVhayBkb2Vzbid0IHByb3BhZ2F0ZSB1cClcbiAgICogQHBhcmFtIGJyYW5jaFBhdGggLSBQYXJlbnQncyBicmFuY2ggcGF0aCBmb3IgbG9nZ2luZ1xuICAgKiBAcGFyYW0gc3ViZmxvd1Jlc3VsdHNNYXAgLSBNYXAgdG8gc3RvcmUgc3ViZmxvdyByZXN1bHRzIChmcm9tIHBhcmVudCBQaXBlbGluZSlcbiAgICogQHJldHVybnMgVGhlIHN1YmZsb3cncyBmaW5hbCBvdXRwdXRcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMS4xLCAxLjVfXG4gICAqL1xuICBhc3luYyBleGVjdXRlU3ViZmxvdyhcbiAgICBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICBwYXJlbnRDb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gICAgYnJlYWtGbGFnOiB7IHNob3VsZEJyZWFrOiBib29sZWFuIH0sXG4gICAgYnJhbmNoUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgIHN1YmZsb3dSZXN1bHRzTWFwOiBNYXA8c3RyaW5nLCBTdWJmbG93UmVzdWx0PixcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBzdWJmbG93SWQgPSBub2RlLnN1YmZsb3dJZCE7XG4gICAgY29uc3Qgc3ViZmxvd05hbWUgPSBub2RlLnN1YmZsb3dOYW1lID8/IG5vZGUubmFtZTtcblxuICAgIC8vIExvZyBmbG93IGNvbnRyb2wgZGVjaXNpb24gZm9yIHN1YmZsb3cgZW50cnlcbiAgICBwYXJlbnRDb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoJ3N1YmZsb3cnLCBgRW50ZXJpbmcgJHtzdWJmbG93TmFtZX0gc3ViZmxvd2AsIHtcbiAgICAgIHRhcmdldFN0YWdlOiBzdWJmbG93SWQsXG4gICAgfSk7XG5cbiAgICAvLyBOYXJyYXRpdmU6IG1hcmsgc3ViZmxvdyBlbnRyeSBmb3IgaHVtYW4tcmVhZGFibGUgc3RvcnlcbiAgICAvLyBXSFk6IENhcHR1cmVzIHRoZSBuZXN0aW5nIGJvdW5kYXJ5IHNvIHRoZSByZWFkZXIgY2FuIGZvbGxvdyBuZXN0ZWQgZXhlY3V0aW9uIGNvbnRleHRzXG4gICAgLy8gX1JlcXVpcmVtZW50czogNy4xX1xuICAgIHRoaXMuY3R4Lm5hcnJhdGl2ZUdlbmVyYXRvci5vblN1YmZsb3dFbnRyeShzdWJmbG93TmFtZSk7XG5cbiAgICAvLyBNYXJrIHBhcmVudCBzdGFnZSBhcyBzdWJmbG93IGNvbnRhaW5lclxuICAgIHBhcmVudENvbnRleHQuYWRkTG9nKCdpc1N1YmZsb3dDb250YWluZXInLCB0cnVlKTtcbiAgICBwYXJlbnRDb250ZXh0LmFkZExvZygnc3ViZmxvd0lkJywgc3ViZmxvd0lkKTtcbiAgICBwYXJlbnRDb250ZXh0LmFkZExvZygnc3ViZmxvd05hbWUnLCBzdWJmbG93TmFtZSk7XG5cbiAgICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgSW5wdXQgTWFwcGluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBDb21wdXRlIG1hcHBlZCBpbnB1dCBCRUZPUkUgY3JlYXRpbmcgUGlwZWxpbmVSdW50aW1lIHNvIGl0IGNhbiBiZVxuICAgIC8vIHBhc3NlZCBhcyBpbml0aWFsQ29udGV4dC4gVGhpcyBlbnN1cmVzIHRoZSBkYXRhIGlzIGluIHRoZSBHbG9iYWxTdG9yZVxuICAgIC8vIGZyb20gdGhlIHN0YXJ0LCBhdm9pZGluZyBXcml0ZUJ1ZmZlciBiYXNlLXNuYXBzaG90IHN0YWxlbmVzcyBpc3N1ZXMuXG4gICAgY29uc3QgbW91bnRPcHRpb25zID0gbm9kZS5zdWJmbG93TW91bnRPcHRpb25zO1xuICAgIGxldCBtYXBwZWRJbnB1dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgICBcbiAgICBpZiAobW91bnRPcHRpb25zKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJlbnRTY29wZSA9IHBhcmVudENvbnRleHQuZ2V0U2NvcGUoKTtcbiAgICAgICAgbWFwcGVkSW5wdXQgPSBnZXRJbml0aWFsU2NvcGVWYWx1ZXMocGFyZW50U2NvcGUsIG1vdW50T3B0aW9ucyk7XG4gICAgICAgIFxuICAgICAgICBpZiAoT2JqZWN0LmtleXMobWFwcGVkSW5wdXQpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBwYXJlbnRDb250ZXh0LmFkZExvZygnbWFwcGVkSW5wdXQnLCBtYXBwZWRJbnB1dCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgcGFyZW50Q29udGV4dC5hZGRFcnJvcignaW5wdXRNYXBwZXJFcnJvcicsIGVycm9yLnRvU3RyaW5nKCkpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEVycm9yIGluIGlucHV0TWFwcGVyIGZvciBzdWJmbG93ICgke3N1YmZsb3dJZH0pOmAsIHsgZXJyb3IgfSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENyZWF0ZSBpc29sYXRlZCBjb250ZXh0IGZvciBzdWJmbG93XG4gICAgLy8gV0hZOiBFYWNoIHN1YmZsb3cgZ2V0cyBpdHMgb3duIFBpcGVsaW5lUnVudGltZSB3aXRoIGl0cyBvd24gR2xvYmFsU3RvcmUuXG4gICAgY29uc3QgbmVzdGVkQ29udGV4dCA9IG5ldyBQaXBlbGluZVJ1bnRpbWUobm9kZS5uYW1lKTtcbiAgICBsZXQgbmVzdGVkUm9vdENvbnRleHQgPSBuZXN0ZWRDb250ZXh0LnJvb3RTdGFnZUNvbnRleHQ7XG5cbiAgICAvLyBTZWVkIHN1YmZsb3cncyBHbG9iYWxTdG9yZSB3aXRoIGlucHV0TWFwcGVyIGRhdGFcbiAgICAvLyBXSFk6IFRoZSBpbnB1dE1hcHBlciB0cmFuc2Zvcm1zIHBhcmVudCBzY29wZSBkYXRhIGludG8gdGhlIHN1YmZsb3cnc1xuICAgIC8vIGluaXRpYWwgc3RhdGUuIFdlIHNlZWQgVEhFTiByZWZyZXNoIHRoZSByb290U3RhZ2VDb250ZXh0IHNvIGl0c1xuICAgIC8vIFdyaXRlQnVmZmVyIGJhc2Ugc25hcHNob3QgaW5jbHVkZXMgdGhlIHNlZWRlZCBkYXRhLlxuICAgIGlmIChPYmplY3Qua2V5cyhtYXBwZWRJbnB1dCkubGVuZ3RoID4gMCkge1xuICAgICAgc2VlZFN1YmZsb3dHbG9iYWxTdG9yZShuZXN0ZWRDb250ZXh0LCBtYXBwZWRJbnB1dCk7XG4gICAgICAvLyBSZWZyZXNoIHJvb3RTdGFnZUNvbnRleHQgc28gaXRzIFdyaXRlQnVmZmVyIHNlZXMgdGhlIGNvbW1pdHRlZCBkYXRhXG4gICAgICAvLyBXSFk6IHNlZWRTdWJmbG93R2xvYmFsU3RvcmUgY29tbWl0cyB0byBHbG9iYWxTdG9yZSwgYnV0IHRoZSBvcmlnaW5hbFxuICAgICAgLy8gcm9vdFN0YWdlQ29udGV4dCdzIFdyaXRlQnVmZmVyIGhhcyBhIHN0YWxlIGJhc2Ugc25hcHNob3QgZnJvbSBiZWZvcmVcbiAgICAgIC8vIHNlZWRpbmcuIENyZWF0aW5nIGEgZnJlc2ggY29udGV4dCBmcm9tIHRoZSB1cGRhdGVkIEdsb2JhbFN0b3JlIGVuc3VyZXNcbiAgICAgIC8vIGRvd25zdHJlYW0gc3RhZ2VzIChTZWVkU2NvcGUsIEFzc2VtYmxlUHJvbXB0KSBjYW4gcmVhZCB0aGUgc2VlZGVkIHZhbHVlcy5cbiAgICAgIG5lc3RlZFJvb3RDb250ZXh0ID0gbmV3IFN0YWdlQ29udGV4dCgnJywgbmVzdGVkUm9vdENvbnRleHQuc3RhZ2VOYW1lLCBuZXN0ZWRDb250ZXh0Lmdsb2JhbFN0b3JlLCAnJywgbmVzdGVkQ29udGV4dC5leGVjdXRpb25IaXN0b3J5KTtcbiAgICAgIG5lc3RlZENvbnRleHQucm9vdFN0YWdlQ29udGV4dCA9IG5lc3RlZFJvb3RDb250ZXh0O1xuICAgIH1cblxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCBDcmVhdGUgU3ViZmxvdyBQaXBlbGluZUNvbnRleHQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gV0hZOiBDcmVhdGUgYSBuZXcgUGlwZWxpbmVDb250ZXh0IGZvciB0aGUgc3ViZmxvdyB3aXRoIHJlYWRPbmx5Q29udGV4dCA9IG1hcHBlZElucHV0XG4gICAgLy8gVGhpcyBlbnN1cmVzIFN0YWdlUnVubmVyIHBhc3NlcyBtYXBwZWRJbnB1dCB0byBTY29wZUZhY3RvcnksIHNvIHN1YmZsb3cgc3RhZ2VzXG4gICAgLy8gY2FuIGFjY2VzcyBpbnB1dE1hcHBlciB2YWx1ZXMgdmlhIHRoZWlyIHNjb3BlLlxuICAgIGNvbnN0IHN1YmZsb3dDdHggPSBjcmVhdGVTdWJmbG93UGlwZWxpbmVDb250ZXh0KHRoaXMuY3R4LCBuZXN0ZWRDb250ZXh0LCBtYXBwZWRJbnB1dCk7XG4gICAgXG4gICAgLy8gTG9nIHRoZSByZWFkT25seUNvbnRleHQgZm9yIGRlYnVnZ2luZ1xuICAgIHBhcmVudENvbnRleHQuYWRkTG9nKCdzdWJmbG93UmVhZE9ubHlDb250ZXh0JywgbWFwcGVkSW5wdXQpO1xuXG4gICAgLy8gQ3JlYXRlIGlzb2xhdGVkIGJyZWFrIGZsYWcgKHN1YmZsb3cgYnJlYWsgZG9lc24ndCBwcm9wYWdhdGUgdG8gcGFyZW50KVxuICAgIGNvbnN0IHN1YmZsb3dCcmVha0ZsYWcgPSB7IHNob3VsZEJyZWFrOiBmYWxzZSB9O1xuXG4gICAgbGV0IHN1YmZsb3dPdXRwdXQ6IGFueTtcbiAgICBsZXQgc3ViZmxvd0Vycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuICAgIC8vIENyZWF0ZSBhIGNvcHkgb2YgdGhlIG5vZGUgZm9yIHN1YmZsb3cgZXhlY3V0aW9uXG4gICAgLy8gQ2xlYXIgaXNTdWJmbG93Um9vdCB0byBwcmV2ZW50IGluZmluaXRlIHJlY3Vyc2lvbiBpbiBleGVjdXRlU3ViZmxvd0ludGVybmFsXG4gICAgLy8gXG4gICAgLy8gV0hZOiBXZSBuZWVkIHRvIGRldGVybWluZSBpZiBgbmV4dGAgaXMgcGFydCBvZiB0aGUgc3ViZmxvdydzIGludGVybmFsIHN0cnVjdHVyZVxuICAgIC8vIG9yIGEgY29udGludWF0aW9uIGFmdGVyIHRoZSBzdWJmbG93LlxuICAgIGNvbnN0IGhhc0NoaWxkcmVuID0gQm9vbGVhbihub2RlLmNoaWxkcmVuICYmIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG4gICAgXG4gICAgY29uc3Qgc3ViZmxvd05vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+ID0ge1xuICAgICAgLi4ubm9kZSxcbiAgICAgIGlzU3ViZmxvd1Jvb3Q6IGZhbHNlLCAvLyBDbGVhciB0byBwcmV2ZW50IHJlLWRldGVjdGlvbiBhcyBzdWJmbG93XG4gICAgICAvLyBGb3Igc3ViZmxvd3Mgd2l0aCBjaGlsZHJlbiAoZm9yayBwYXR0ZXJuKSwgc3RyaXAgYG5leHRgIC0gaXQncyB0aGUgY29udGludWF0aW9uXG4gICAgICAvLyBGb3Igc3ViZmxvd3Mgd2l0aG91dCBjaGlsZHJlbiAobGluZWFyIHBhdHRlcm4pLCBrZWVwIGBuZXh0YCAtIGl0J3MgaW50ZXJuYWwgY2hhaW5cbiAgICAgIG5leHQ6IGhhc0NoaWxkcmVuID8gdW5kZWZpbmVkIDogbm9kZS5uZXh0LFxuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgLy8gU3RvcmUgcmVmZXJlbmNlIHRvIHN1YmZsb3dSZXN1bHRzTWFwIGZvciBuZXN0ZWQgc3ViZmxvd3NcbiAgICAgIHRoaXMuc3ViZmxvd1Jlc3VsdHNNYXAgPSBzdWJmbG93UmVzdWx0c01hcDtcbiAgICAgIFxuICAgICAgLy8gU3RvcmUgdGhlIHN1YmZsb3cgcm9vdCBmb3Igbm9kZSByZXNvbHV0aW9uIHdpdGhpbiB0aGUgc3ViZmxvd1xuICAgICAgdGhpcy5jdXJyZW50U3ViZmxvd1Jvb3QgPSBzdWJmbG93Tm9kZTtcbiAgICAgIFxuICAgICAgLy8gU3RvcmUgdGhlIHN1YmZsb3cgY29udGV4dCBmb3Igc3RhZ2UgZXhlY3V0aW9uIHdpdGhpbiB0aGUgc3ViZmxvd1xuICAgICAgdGhpcy5jdXJyZW50U3ViZmxvd0N0eCA9IHN1YmZsb3dDdHg7XG4gICAgICBcbiAgICAgIC8vIEV4ZWN1dGUgc3ViZmxvdyB1c2luZyBuZXN0ZWQgY29udGV4dFxuICAgICAgc3ViZmxvd091dHB1dCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVN1YmZsb3dJbnRlcm5hbChcbiAgICAgICAgc3ViZmxvd05vZGUsXG4gICAgICAgIG5lc3RlZFJvb3RDb250ZXh0LFxuICAgICAgICBzdWJmbG93QnJlYWtGbGFnLFxuICAgICAgICBzdWJmbG93SWQsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHN1YmZsb3dFcnJvciA9IGVycm9yO1xuICAgICAgcGFyZW50Q29udGV4dC5hZGRFcnJvcignc3ViZmxvd0Vycm9yJywgZXJyb3IudG9TdHJpbmcoKSk7XG4gICAgICBsb2dnZXIuZXJyb3IoYEVycm9yIGluIHN1YmZsb3cgKCR7c3ViZmxvd0lkfSk6YCwgeyBlcnJvciB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgLy8gQ2xlYXIgdGhlIHN1YmZsb3cgcm9vdCByZWZlcmVuY2UgdG8gYXZvaWQgc3RhbGUgcmVmZXJlbmNlc1xuICAgICAgdGhpcy5jdXJyZW50U3ViZmxvd1Jvb3QgPSB1bmRlZmluZWQ7XG4gICAgICAvLyBDbGVhciB0aGUgc3ViZmxvdyBjb250ZXh0IHJlZmVyZW5jZVxuICAgICAgdGhpcy5jdXJyZW50U3ViZmxvd0N0eCA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvLyBTZXJpYWxpemUgc3ViZmxvdydzIGV4ZWN1dGlvbiBkYXRhXG4gICAgY29uc3Qgc3ViZmxvd1RyZWVDb250ZXh0ID0gbmVzdGVkQ29udGV4dC5nZXRTbmFwc2hvdCgpO1xuXG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIE91dHB1dCBNYXBwaW5nIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIC8vIEFwcGx5IG91dHB1dCBtYXBwaW5nIGlmIHN1YmZsb3cgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSBhbmQgb3V0cHV0TWFwcGVyIGlzIHByb3ZpZGVkLlxuICAgIC8vXG4gICAgLy8gV0hZOiBUaGUgc3ViZmxvdydzIG91dHB1dCBtdXN0IGJlIHdyaXR0ZW4gdG8gdGhlIENBTExFUidzIHNjb3BlLCBub3QgdGhlXG4gICAgLy8gY2hpbGQgYnJhbmNoJ3Mgc2NvcGUuIFdoZW4gYSBzdWJmbG93IHJ1bnMgaW5zaWRlIGEgQ2hpbGRyZW5FeGVjdXRvciBjaGlsZFxuICAgIC8vIChlLmcuLCB0b29sLXNvY2lhbC1tZWRpYS1hZ2VudCksIHBhcmVudENvbnRleHQgaGFzIGEgdG9vbC1zcGVjaWZpYyBwaXBlbGluZUlkXG4gICAgLy8gbGlrZSAndG9vbC1zb2NpYWwtbWVkaWEtYWdlbnQnLiBXcml0aW5nIHRvIHRoYXQgbmFtZXNwYWNlIHB1dHMgZGF0YSBhdFxuICAgIC8vIFsncGlwZWxpbmVzJywgJ3Rvb2wtc29jaWFsLW1lZGlhLWFnZW50JywgJ2FnZW50JywgJ21lc3NhZ2VzJ10g4oCUIHVucmVhY2hhYmxlXG4gICAgLy8gYnkgdGhlIHBhcmVudCBhZ2VudCB3aGljaCByZWFkcyBmcm9tIFsnYWdlbnQnLCAnbWVzc2FnZXMnXSAocm9vdCBuYW1lc3BhY2UpLlxuICAgIC8vXG4gICAgLy8gRklYOiBXYWxrIHVwIHRoZSBjb250ZXh0IHRyZWUgdG8gZmluZCB0aGUgYW5jZXN0b3Igd2l0aCB0aGUgcm9vdCBwaXBlbGluZUlkXG4gICAgLy8gKGVtcHR5IHN0cmluZykuIFRoaXMgaXMgdGhlIGNvbnRleHQgdGhhdCBvd25zIHRoZSBwYXJlbnQgYWdlbnQncyBzY29wZS5cbiAgICAvLyBUaGUgb3V0cHV0IG1hcHBpbmcgd3JpdGVzIGdvIHRoZXJlIHNvIHRoZSBwYXJlbnQgYWdlbnQgc2VlcyB0aGUgc3ViLWFnZW50J3NcbiAgICAvLyByZXN1bHQgaW4gaXRzIGNvbnZlcnNhdGlvbiBoaXN0b3J5LlxuICAgIGlmICghc3ViZmxvd0Vycm9yICYmIG1vdW50T3B0aW9ucz8ub3V0cHV0TWFwcGVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICAvLyBGaW5kIHRoZSBjb3JyZWN0IGNvbnRleHQgZm9yIG91dHB1dCBtYXBwaW5nIHdyaXRlcy5cbiAgICAgICAgLy8gV2hlbiBwYXJlbnRDb250ZXh0IGlzIGEgY2hpbGQgYnJhbmNoIChub24tZW1wdHkgcGlwZWxpbmVJZCksIHdhbGsgdXBcbiAgICAgICAgLy8gdG8gdGhlIGFuY2VzdG9yIHRoYXQgb3ducyB0aGUgY2FsbGVyJ3Mgc2NvcGUgKHJvb3QgcGlwZWxpbmVJZCA9ICcnKS5cbiAgICAgICAgbGV0IG91dHB1dENvbnRleHQgPSBwYXJlbnRDb250ZXh0O1xuICAgICAgICBpZiAocGFyZW50Q29udGV4dC5waXBlbGluZUlkICYmIHBhcmVudENvbnRleHQucGlwZWxpbmVJZCAhPT0gJycgJiYgcGFyZW50Q29udGV4dC5wYXJlbnQpIHtcbiAgICAgICAgICBvdXRwdXRDb250ZXh0ID0gcGFyZW50Q29udGV4dC5wYXJlbnQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJlbnRTY29wZSA9IG91dHB1dENvbnRleHQuZ2V0U2NvcGUoKTtcbiAgICAgICAgY29uc3QgbWFwcGVkT3V0cHV0ID0gYXBwbHlPdXRwdXRNYXBwaW5nKHN1YmZsb3dPdXRwdXQsIHBhcmVudFNjb3BlLCBvdXRwdXRDb250ZXh0LCBtb3VudE9wdGlvbnMpO1xuICAgICAgICBcbiAgICAgICAgLy8gTG9nIG1hcHBlZCBvdXRwdXQgZm9yIGRlYnVnZ2luZyAob24gdGhlIG9yaWdpbmFsIHBhcmVudENvbnRleHQgZm9yIHZpc2liaWxpdHkpXG4gICAgICAgIGlmIChtYXBwZWRPdXRwdXQgJiYgT2JqZWN0LmtleXMobWFwcGVkT3V0cHV0KS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcGFyZW50Q29udGV4dC5hZGRMb2coJ21hcHBlZE91dHB1dCcsIG1hcHBlZE91dHB1dCk7XG4gICAgICAgICAgcGFyZW50Q29udGV4dC5hZGRMb2coJ291dHB1dE1hcHBpbmdUYXJnZXQnLCBvdXRwdXRDb250ZXh0LnBpcGVsaW5lSWQgfHwgJyhyb290KScpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBDb21taXQgdGhlIG91dHB1dCBjb250ZXh0J3Mgd3JpdGVzIChtYXkgYmUgZGlmZmVyZW50IGZyb20gcGFyZW50Q29udGV4dClcbiAgICAgICAgb3V0cHV0Q29udGV4dC5jb21taXQoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgLy8gTG9nIG91dHB1dE1hcHBlciBlcnJvciBidXQgZG9uJ3QgcmUtdGhyb3cgKG5vbi1mYXRhbClcbiAgICAgICAgcGFyZW50Q29udGV4dC5hZGRFcnJvcignb3V0cHV0TWFwcGVyRXJyb3InLCBlcnJvci50b1N0cmluZygpKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBFcnJvciBpbiBvdXRwdXRNYXBwZXIgZm9yIHN1YmZsb3cgKCR7c3ViZmxvd0lkfSk6YCwgeyBlcnJvciB9KTtcbiAgICAgICAgLy8gRG9uJ3QgcmUtdGhyb3cgLSBvdXRwdXQgbWFwcGluZyBlcnJvcnMgYXJlIG5vbi1mYXRhbFxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENyZWF0ZSBTdWJmbG93UmVzdWx0IChleGVjdXRpb24gZGF0YSBvbmx5LCBubyBzdHJ1Y3R1cmUpXG4gICAgY29uc3Qgc3ViZmxvd1Jlc3VsdDogU3ViZmxvd1Jlc3VsdCA9IHtcbiAgICAgIHN1YmZsb3dJZCxcbiAgICAgIHN1YmZsb3dOYW1lLFxuICAgICAgdHJlZUNvbnRleHQ6IHtcbiAgICAgICAgZ2xvYmFsQ29udGV4dDogc3ViZmxvd1RyZWVDb250ZXh0Lmdsb2JhbENvbnRleHQsXG4gICAgICAgIHN0YWdlQ29udGV4dHM6IHN1YmZsb3dUcmVlQ29udGV4dC5zdGFnZUNvbnRleHRzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICAgICAgIGhpc3Rvcnk6IHN1YmZsb3dUcmVlQ29udGV4dC5oaXN0b3J5LFxuICAgICAgfSxcbiAgICAgIHBhcmVudFN0YWdlSWQ6IHBhcmVudENvbnRleHQuZ2V0U3RhZ2VJZCgpLFxuICAgIH07XG5cbiAgICAvLyBBdHRhY2ggdGhlIHN1YmZsb3cncyBidWlsZFRpbWVTdHJ1Y3R1cmUgaWYgYXZhaWxhYmxlIGluIHRoZSBzdWJmbG93cyBkaWN0aW9uYXJ5LlxuICAgIC8vIFdIWTogRW5hYmxlcyB0aGUgZGVidWcgVUkgdG8gcmVuZGVyIHRoZSBzdWJmbG93J3MgZmxvd2NoYXJ0IGFzIGEgbmVzdGVkXG4gICAgLy8gdmlzdWFsaXphdGlvbi4gVGhlIGJ1aWxkVGltZVN0cnVjdHVyZSBpcyBzdG9yZWQgYWxvbmdzaWRlIHRoZSByb290IG5vZGVcbiAgICAvLyB3aGVuIHRoZSBzdWJmbG93IHdhcyByZWdpc3RlcmVkIChlLmcuLCBieSBBZ2VudEJ1aWxkZXIgZm9yIHN1Yi1hZ2VudCB0b29scykuXG4gICAgY29uc3Qgc3ViZmxvd0RlZiA9IHRoaXMuY3R4LnN1YmZsb3dzPy5bc3ViZmxvd0lkXTtcbiAgICBpZiAoc3ViZmxvd0RlZiAmJiAoc3ViZmxvd0RlZiBhcyBhbnkpLmJ1aWxkVGltZVN0cnVjdHVyZSkge1xuICAgICAgc3ViZmxvd1Jlc3VsdC5waXBlbGluZVN0cnVjdHVyZSA9IChzdWJmbG93RGVmIGFzIGFueSkuYnVpbGRUaW1lU3RydWN0dXJlO1xuICAgIH1cblxuICAgIC8vIFN0b3JlIGluIHBhcmVudCBzdGFnZSdzIGRlYnVnSW5mbyBmb3IgZHJpbGwtZG93blxuICAgIHBhcmVudENvbnRleHQuYWRkTG9nKCdzdWJmbG93UmVzdWx0Jywgc3ViZmxvd1Jlc3VsdCk7XG4gICAgcGFyZW50Q29udGV4dC5hZGRMb2coJ2hhc1N1YmZsb3dEYXRhJywgdHJ1ZSk7XG5cbiAgICAvLyBBZGQgdG8gY29sbGVjdGlvbiBmb3IgQVBJIHJlc3BvbnNlXG4gICAgc3ViZmxvd1Jlc3VsdHNNYXAuc2V0KHN1YmZsb3dJZCwgc3ViZmxvd1Jlc3VsdCk7XG5cbiAgICAvLyBMb2cgZmxvdyBjb250cm9sIGRlY2lzaW9uIGZvciBzdWJmbG93IGV4aXRcbiAgICBwYXJlbnRDb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoJ3N1YmZsb3cnLCBgRXhpdGluZyAke3N1YmZsb3dOYW1lfSBzdWJmbG93YCwge1xuICAgICAgdGFyZ2V0U3RhZ2U6IHN1YmZsb3dJZCxcbiAgICB9KTtcblxuICAgIC8vIE5hcnJhdGl2ZTogbWFyayBzdWJmbG93IGV4aXQgZm9yIGh1bWFuLXJlYWRhYmxlIHN0b3J5XG4gICAgLy8gV0hZOiBNYXJrcyB0aGUgcmV0dXJuIGZyb20gYSBuZXN0ZWQgY29udGV4dCBiYWNrIHRvIHRoZSBwYXJlbnQgZmxvd1xuICAgIC8vIF9SZXF1aXJlbWVudHM6IDcuMl9cbiAgICB0aGlzLmN0eC5uYXJyYXRpdmVHZW5lcmF0b3Iub25TdWJmbG93RXhpdChzdWJmbG93TmFtZSk7XG5cbiAgICAvLyBDb21taXQgcGFyZW50IGNvbnRleHQgcGF0Y2hcbiAgICBwYXJlbnRDb250ZXh0LmNvbW1pdCgpO1xuXG4gICAgLy8gUmUtdGhyb3cgaWYgc3ViZmxvdyBlcnJvcmVkXG4gICAgaWYgKHN1YmZsb3dFcnJvcikge1xuICAgICAgdGhyb3cgc3ViZmxvd0Vycm9yO1xuICAgIH1cblxuICAgIHJldHVybiBzdWJmbG93T3V0cHV0O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudCBzdWJmbG93J3Mgcm9vdCBub2RlLlxuICAgKiBVc2VkIGZvciBub2RlIHJlc29sdXRpb24gd2l0aGluIHRoZSBzdWJmbG93J3Mgc3RydWN0dXJlIChlLmcuLCBkeW5hbWljIG5leHQgbG9vcC1iYWNrKS5cbiAgICovXG4gIHByaXZhdGUgY3VycmVudFN1YmZsb3dSb290PzogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT47XG5cbiAgLyoqXG4gICAqIEludGVybmFsIGV4ZWN1dGlvbiB3aXRoaW4gc3ViZmxvdyBjb250ZXh0LlxuICAgKlxuICAgKiBXSFk6IFRoaXMgbWV0aG9kIG1pcnJvcnMgUGlwZWxpbmUuZXhlY3V0ZU5vZGUgYnV0IG9wZXJhdGVzIHdpdGhpbiB0aGUgc3ViZmxvdydzXG4gICAqIGlzb2xhdGVkIFBpcGVsaW5lUnVudGltZS4gSXQgaGFuZGxlcyBhbGwgdGhlIHNhbWUgcGF0dGVybnMgKHN0YWdlIGV4ZWN1dGlvbixcbiAgICogY2hpbGRyZW4sIGRlY2lkZXIsIHNlbGVjdG9yLCBsaW5lYXIgbmV4dCkgYnV0IHdpdGhpbiB0aGUgc3ViZmxvdydzIGNvbnRleHQuXG4gICAqXG4gICAqIERFU0lHTjogSGFuZGxlczpcbiAgICogLSBOZXN0ZWQgc3ViZmxvdyBkZXRlY3Rpb24gKGRlbGVnYXRlcyBiYWNrIHRvIGV4ZWN1dGVTdWJmbG93KVxuICAgKiAtIFN0YWdlIGZ1bmN0aW9uIGV4ZWN1dGlvblxuICAgKiAtIENoaWxkcmVuIGV4ZWN1dGlvbiAoZm9yaywgZGVjaWRlciwgc2VsZWN0b3IgcGF0dGVybnMpXG4gICAqIC0gTGluZWFyIG5leHQgY29udGludWF0aW9uXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIGN1cnJlbnQgbm9kZSB0byBleGVjdXRlIHdpdGhpbiB0aGUgc3ViZmxvd1xuICAgKiBAcGFyYW0gY29udGV4dCAtIFRoZSBzdWJmbG93J3Mgc3RhZ2UgY29udGV4dFxuICAgKiBAcGFyYW0gYnJlYWtGbGFnIC0gQnJlYWsgZmxhZyBmb3IgdGhlIHN1YmZsb3cgKGRvZXNuJ3QgcHJvcGFnYXRlIHRvIHBhcmVudClcbiAgICogQHBhcmFtIGJyYW5jaFBhdGggLSBCcmFuY2ggcGF0aCBmb3IgbG9nZ2luZ1xuICAgKiBAcmV0dXJucyBQcm9taXNlIHJlc29sdmluZyB0byB0aGUgc3RhZ2Ugb3V0cHV0IG9yIGNoaWxkcmVuIHJlc3VsdHNcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMS4yX1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU3ViZmxvd0ludGVybmFsKFxuICAgIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgICBicmVha0ZsYWc6IHsgc2hvdWxkQnJlYWs6IGJvb2xlYW4gfSxcbiAgICBicmFuY2hQYXRoOiBzdHJpbmcsXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gRGV0ZWN0IG5lc3RlZCBzdWJmbG93cyBhbmQgZGVsZWdhdGUgdG8gZXhlY3V0ZVN1YmZsb3dcbiAgICAvLyBXSFk6IE5lc3RlZCBzdWJmbG93cyBuZWVkIHRoZWlyIG93biBpc29sYXRlZCBjb250ZXh0XG4gICAgaWYgKG5vZGUuaXNTdWJmbG93Um9vdCAmJiBub2RlLnN1YmZsb3dJZCkge1xuICAgICAgY29uc3QgcmVzb2x2ZWROb2RlID0gdGhpcy5ub2RlUmVzb2x2ZXIucmVzb2x2ZVN1YmZsb3dSZWZlcmVuY2Uobm9kZSk7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlU3ViZmxvdyhyZXNvbHZlZE5vZGUsIGNvbnRleHQsIGJyZWFrRmxhZywgYnJhbmNoUGF0aCwgdGhpcy5zdWJmbG93UmVzdWx0c01hcCEpO1xuICAgIH1cblxuICAgIC8vIEdldCB0aGUgc3RhZ2UgZnVuY3Rpb24gZm9yIHRoZSBzdWJmbG93IHJvb3QgKGlmIGFueSlcbiAgICBjb25zdCBzdGFnZUZ1bmMgPSB0aGlzLmdldFN0YWdlRm4obm9kZSk7XG4gICAgY29uc3QgaGFzU3RhZ2VGdW5jdGlvbiA9IEJvb2xlYW4oc3RhZ2VGdW5jKTtcbiAgICBjb25zdCBoYXNDaGlsZHJlbiA9IEJvb2xlYW4obm9kZS5jaGlsZHJlbj8ubGVuZ3RoKTtcbiAgICBjb25zdCBoYXNOZXh0ID0gQm9vbGVhbihub2RlLm5leHQpO1xuICAgIGNvbnN0IGlzRGVjaWRlck5vZGUgPSBCb29sZWFuKG5vZGUubmV4dE5vZGVEZWNpZGVyKTtcblxuICAgIGNvbnN0IGJyZWFrRm4gPSAoKSA9PiAoYnJlYWtGbGFnLnNob3VsZEJyZWFrID0gdHJ1ZSk7XG5cbiAgICAvLyBFeGVjdXRlIHRoZSBzdWJmbG93IHJvb3QncyBzdGFnZSBmdW5jdGlvbiBpZiBwcmVzZW50XG4gICAgbGV0IHN0YWdlT3V0cHV0OiBUT3V0IHwgdW5kZWZpbmVkO1xuICAgIGlmIChzdGFnZUZ1bmMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFVzZSBTdGFnZVJ1bm5lciB3aXRoIHN1YmZsb3cgY29udGV4dCB0byBlbnN1cmUgc3RhZ2VzXG4gICAgICAgIC8vIHJlY2VpdmUgbWFwcGVkSW5wdXQgdmFsdWVzIHZpYSByZWFkT25seUNvbnRleHQg4oaSIFNjb3BlRmFjdG9yeVxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3ViZmxvd0N0eCkge1xuICAgICAgICAgIGNvbnN0IHN1YmZsb3dTdGFnZVJ1bm5lciA9IG5ldyBTdGFnZVJ1bm5lcjxUT3V0LCBUU2NvcGU+KHRoaXMuY3VycmVudFN1YmZsb3dDdHgpO1xuICAgICAgICAgIHN0YWdlT3V0cHV0ID0gYXdhaXQgc3ViZmxvd1N0YWdlUnVubmVyLnJ1bihub2RlLCBzdGFnZUZ1bmMsIGNvbnRleHQsIGJyZWFrRm4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIHBhcmVudCBjb250ZXh0IChzaG91bGRuJ3QgaGFwcGVuIGluIG5vcm1hbCBmbG93KVxuICAgICAgICAgIHN0YWdlT3V0cHV0ID0gYXdhaXQgdGhpcy5leGVjdXRlU3RhZ2Uobm9kZSwgc3RhZ2VGdW5jLCBjb250ZXh0LCBicmVha0ZuKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICBjb250ZXh0LmNvbW1pdCgpO1xuICAgICAgICAvLyBQYXNzIHVuZGVmaW5lZCBmb3Igc3RhZ2VPdXRwdXQgYW5kIGVycm9yIGRldGFpbHMgZm9yIGVucmljaG1lbnRcbiAgICAgICAgLy8gV0hZOiBPbiBlcnJvciBwYXRoLCB0aGVyZSdzIG5vIHN1Y2Nlc3NmdWwgb3V0cHV0LCBidXQgd2UgY2FwdHVyZVxuICAgICAgICAvLyB0aGUgZXJyb3IgaW5mbyBzbyBlbnJpY2hlZCBzbmFwc2hvdHMgaW5jbHVkZSB3aGF0IHdlbnQgd3JvbmcuXG4gICAgICAgIC8vIF9SZXF1aXJlbWVudHM6IHNpbmdsZS1wYXNzLWRlYnVnLXN0cnVjdHVyZSAxLjRfXG4gICAgICAgIHRoaXMuY2FsbEV4dHJhY3Rvcihub2RlLCBjb250ZXh0LCB0aGlzLmdldFN0YWdlUGF0aChub2RlLCBicmFuY2hQYXRoLCBjb250ZXh0LnN0YWdlTmFtZSksIHVuZGVmaW5lZCwge1xuICAgICAgICAgIHR5cGU6ICdzdGFnZUV4ZWN1dGlvbkVycm9yJyxcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci50b1N0cmluZygpLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGV4dC5hZGRFcnJvcignc3RhZ2VFeGVjdXRpb25FcnJvcicsIGVycm9yLnRvU3RyaW5nKCkpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIGNvbnRleHQuY29tbWl0KCk7XG4gICAgICAvLyBQYXNzIHN0YWdlT3V0cHV0IHNvIGVucmljaGVkIHNuYXBzaG90cyBjYXB0dXJlIHRoZSBzdGFnZSdzIHJldHVybiB2YWx1ZVxuICAgICAgLy8gX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuM19cbiAgICAgIHRoaXMuY2FsbEV4dHJhY3Rvcihub2RlLCBjb250ZXh0LCB0aGlzLmdldFN0YWdlUGF0aChub2RlLCBicmFuY2hQYXRoLCBjb250ZXh0LnN0YWdlTmFtZSksIHN0YWdlT3V0cHV0KTtcblxuICAgICAgaWYgKGJyZWFrRmxhZy5zaG91bGRCcmVhaykge1xuICAgICAgICByZXR1cm4gc3RhZ2VPdXRwdXQ7XG4gICAgICB9XG5cbiAgICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCBIYW5kbGUgZHluYW1pYyBzdGFnZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgICAvLyBDaGVjayBpZiB0aGUgaGFuZGxlcidzIHJldHVybiBvYmplY3QgaXMgYSBTdGFnZU5vZGUgZm9yIGR5bmFtaWMgY29udGludWF0aW9uLlxuICAgICAgaWYgKHN0YWdlT3V0cHV0ICYmIHR5cGVvZiBzdGFnZU91dHB1dCA9PT0gJ29iamVjdCcgJiYgaXNTdGFnZU5vZGVSZXR1cm4oc3RhZ2VPdXRwdXQpKSB7XG4gICAgICAgIGNvbnN0IGR5bmFtaWNOb2RlID0gc3RhZ2VPdXRwdXQgYXMgU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT47XG4gICAgICAgIGNvbnRleHQuYWRkTG9nKCdpc0R5bmFtaWMnLCB0cnVlKTtcbiAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNQYXR0ZXJuJywgJ1N0YWdlTm9kZVJldHVybicpO1xuXG4gICAgICAgIC8vIEhhbmRsZSBkeW5hbWljIGNoaWxkcmVuIChmb3JrIHBhdHRlcm4pXG4gICAgICAgIGlmIChkeW5hbWljTm9kZS5jaGlsZHJlbiAmJiBkeW5hbWljTm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgbm9kZS5jaGlsZHJlbiA9IGR5bmFtaWNOb2RlLmNoaWxkcmVuO1xuICAgICAgICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljQ2hpbGRDb3VudCcsIGR5bmFtaWNOb2RlLmNoaWxkcmVuLmxlbmd0aCk7XG4gICAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNDaGlsZElkcycsIGR5bmFtaWNOb2RlLmNoaWxkcmVuLm1hcChjID0+IGMuaWQgfHwgYy5uYW1lKSk7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgZHluYW1pYyBzZWxlY3RvciAobXVsdGktY2hvaWNlIGJyYW5jaGluZylcbiAgICAgICAgICBpZiAodHlwZW9mIGR5bmFtaWNOb2RlLm5leHROb2RlU2VsZWN0b3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIG5vZGUubmV4dE5vZGVTZWxlY3RvciA9IGR5bmFtaWNOb2RlLm5leHROb2RlU2VsZWN0b3I7XG4gICAgICAgICAgICBjb250ZXh0LmFkZExvZygnaGFzU2VsZWN0b3InLCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSGFuZGxlIGR5bmFtaWMgZGVjaWRlciAoc2luZ2xlLWNob2ljZSBicmFuY2hpbmcpXG4gICAgICAgICAgZWxzZSBpZiAodHlwZW9mIGR5bmFtaWNOb2RlLm5leHROb2RlRGVjaWRlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgbm9kZS5uZXh0Tm9kZURlY2lkZXIgPSBkeW5hbWljTm9kZS5uZXh0Tm9kZURlY2lkZXI7XG4gICAgICAgICAgICBjb250ZXh0LmFkZExvZygnaGFzRGVjaWRlcicsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhhbmRsZSBkeW5hbWljIG5leHQgKGxpbmVhciBjb250aW51YXRpb24gLyBsb29wLWJhY2spXG4gICAgICAgIGlmIChkeW5hbWljTm9kZS5uZXh0KSB7XG4gICAgICAgICAgbm9kZS5uZXh0ID0gZHluYW1pY05vZGUubmV4dDtcbiAgICAgICAgICBjb250ZXh0LmFkZExvZygnaGFzRHluYW1pY05leHQnLCB0cnVlKTtcbiAgICAgICAgICBjb25zdCBsb29wVGFyZ2V0SWQgPSBkeW5hbWljTm9kZS5uZXh0LmlkIHx8IGR5bmFtaWNOb2RlLm5leHQubmFtZTtcbiAgICAgICAgICBpZiAobG9vcFRhcmdldElkKSB7XG4gICAgICAgICAgICBjb250ZXh0LmFkZExvZygnbG9vcFRhcmdldCcsIGxvb3BUYXJnZXRJZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2xlYXIgc3RhZ2VPdXRwdXQgc2luY2UgdGhlIFN0YWdlTm9kZSBpcyB0aGUgY29udGludWF0aW9uLCBub3QgdGhlIG91dHB1dFxuICAgICAgICBzdGFnZU91dHB1dCA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgQ2hpbGRyZW4gKGlmIGFueSkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgaGFzQ2hpbGRyZW5BZnRlclN0YWdlID0gQm9vbGVhbihub2RlLmNoaWxkcmVuPy5sZW5ndGgpO1xuICAgIGNvbnN0IGhhc05leHRBZnRlclN0YWdlID0gQm9vbGVhbihub2RlLm5leHQpO1xuICAgIGNvbnN0IGlzRGVjaWRlck5vZGVBZnRlclN0YWdlID0gQm9vbGVhbihub2RlLm5leHROb2RlRGVjaWRlcik7XG5cbiAgICAvLyBIYW5kbGUgY2hpbGRyZW4gKGZvcmsgcGF0dGVybilcbiAgICBpZiAoaGFzQ2hpbGRyZW5BZnRlclN0YWdlKSB7XG4gICAgICBpZiAoaXNEZWNpZGVyTm9kZUFmdGVyU3RhZ2UpIHtcbiAgICAgICAgLy8gRGVjaWRlciBwaWNrcyBvbmUgY2hpbGRcbiAgICAgICAgY29uc3QgY2hvc2VuID0gYXdhaXQgdGhpcy5ub2RlUmVzb2x2ZXIuZ2V0TmV4dE5vZGUoXG4gICAgICAgICAgbm9kZS5uZXh0Tm9kZURlY2lkZXIgYXMgRGVjaWRlcixcbiAgICAgICAgICBub2RlLmNoaWxkcmVuISxcbiAgICAgICAgICBzdGFnZU91dHB1dCxcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICApO1xuICAgICAgICBjb25zdCBuZXh0U3RhZ2VDb250ZXh0ID0gY29udGV4dC5jcmVhdGVOZXh0KCcnLCBjaG9zZW4ubmFtZSk7XG4gICAgICAgIGNvbnN0IGRlY2lkZXJSZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVTdWJmbG93SW50ZXJuYWwoY2hvc2VuLCBuZXh0U3RhZ2VDb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgpO1xuICAgICAgICBpZiAoIWhhc05leHRBZnRlclN0YWdlKSByZXR1cm4gZGVjaWRlclJlc3VsdDtcbiAgICAgIH0gZWxzZSBpZiAobm9kZS5uZXh0Tm9kZVNlbGVjdG9yKSB7XG4gICAgICAgIC8vIFNlbGVjdG9yIHBpY2tzIG11bHRpcGxlIGNoaWxkcmVuXG4gICAgICAgIGNvbnN0IG5vZGVDaGlsZHJlblJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVTZWxlY3RlZENoaWxkcmVuSW50ZXJuYWwoXG4gICAgICAgICAgbm9kZS5uZXh0Tm9kZVNlbGVjdG9yLFxuICAgICAgICAgIG5vZGUuY2hpbGRyZW4hLFxuICAgICAgICAgIHN0YWdlT3V0cHV0LFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgYnJhbmNoUGF0aCxcbiAgICAgICAgICBicmVha0ZsYWcsXG4gICAgICAgICk7XG4gICAgICAgIGlmICghaGFzTmV4dEFmdGVyU3RhZ2UpIHJldHVybiBub2RlQ2hpbGRyZW5SZXN1bHRzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRXhlY3V0ZSBhbGwgY2hpbGRyZW4gaW4gcGFyYWxsZWxcbiAgICAgICAgY29uc3Qgbm9kZUNoaWxkcmVuUmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZU5vZGVDaGlsZHJlbkludGVybmFsKFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBicmFuY2hQYXRoLFxuICAgICAgICAgIGJyZWFrRmxhZyxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFoYXNOZXh0QWZ0ZXJTdGFnZSkgcmV0dXJuIG5vZGVDaGlsZHJlblJlc3VsdHM7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIGxpbmVhciBuZXh0IChpbmNsdWRpbmcgZHluYW1pYyBuZXh0IGZyb20gU3RhZ2VOb2RlIHJldHVybilcbiAgICBpZiAoaGFzTmV4dEFmdGVyU3RhZ2UpIHtcbiAgICAgIGxldCBuZXh0Tm9kZSA9IG5vZGUubmV4dCE7XG4gICAgICBcbiAgICAgIC8vIElmIHRoZSBuZXh0IG5vZGUgaXMgYSByZWZlcmVuY2UgKGhhcyBpZCBidXQgbm8gZm4pLCByZXNvbHZlIGl0IGZyb20gdGhlIHN1YmZsb3cgc3RydWN0dXJlXG4gICAgICAvLyBXSFk6IENyaXRpY2FsIGZvciBsb29wLWJhY2sgc2NlbmFyaW9zIHdoZXJlIHRoZSBkeW5hbWljIG5leHQgb25seSBoYXMgbmFtZS9pZFxuICAgICAgaWYgKG5leHROb2RlLmlkICYmICFuZXh0Tm9kZS5mbikge1xuICAgICAgICBsZXQgcmVzb2x2ZWROb2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN1YmZsb3dSb290KSB7XG4gICAgICAgICAgcmVzb2x2ZWROb2RlID0gdGhpcy5ub2RlUmVzb2x2ZXIuZmluZE5vZGVCeUlkKG5leHROb2RlLmlkLCB0aGlzLmN1cnJlbnRTdWJmbG93Um9vdCk7XG4gICAgICAgICAgaWYgKHJlc29sdmVkTm9kZSkge1xuICAgICAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNOZXh0UmVzb2x2ZWRGcm9tJywgJ3N1YmZsb3cnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIG1haW4gcGlwZWxpbmUgaWYgbm90IGZvdW5kIGluIHN1YmZsb3dcbiAgICAgICAgaWYgKCFyZXNvbHZlZE5vZGUpIHtcbiAgICAgICAgICByZXNvbHZlZE5vZGUgPSB0aGlzLm5vZGVSZXNvbHZlci5maW5kTm9kZUJ5SWQobmV4dE5vZGUuaWQpO1xuICAgICAgICAgIGlmIChyZXNvbHZlZE5vZGUpIHtcbiAgICAgICAgICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dFJlc29sdmVkRnJvbScsICdtYWluUGlwZWxpbmUnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChyZXNvbHZlZE5vZGUpIHtcbiAgICAgICAgICBuZXh0Tm9kZSA9IHJlc29sdmVkTm9kZTtcbiAgICAgICAgICBjb250ZXh0LmFkZExvZygnZHluYW1pY05leHRSZXNvbHZlZCcsIHRydWUpO1xuICAgICAgICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dFRhcmdldCcsIG5leHROb2RlLmlkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2dnZXIuaW5mbyhgRHluYW1pYyBuZXh0IG5vZGUgJyR7bmV4dE5vZGUuaWR9JyBub3QgZm91bmQgaW4gc3ViZmxvdyBvciBtYWluIHBpcGVsaW5lYCk7XG4gICAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNOZXh0UmVzb2x2ZWQnLCBmYWxzZSk7XG4gICAgICAgICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNOZXh0Tm90Rm91bmQnLCBuZXh0Tm9kZS5pZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgbmV4dFN0YWdlQ29udGV4dCA9IGNvbnRleHQuY3JlYXRlTmV4dCgnJywgbmV4dE5vZGUubmFtZSk7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlU3ViZmxvd0ludGVybmFsKG5leHROb2RlLCBuZXh0U3RhZ2VDb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgpO1xuICAgIH1cblxuICAgIHJldHVybiBzdGFnZU91dHB1dDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSB0aGUgc3RhZ2UgcGF0aCBmb3IgZXh0cmFjdG9yIHJlc3VsdHMuXG4gICAqIFVzZXMgY29udGV4dFN0YWdlTmFtZSAod2hpY2ggaW5jbHVkZXMgaXRlcmF0aW9uIHN1ZmZpeCkgd2hlbiBpdCBkaWZmZXJzIGZyb20gYmFzZSBuYW1lLlxuICAgKi9cbiAgcHJpdmF0ZSBnZXRTdGFnZVBhdGgobm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sIGJyYW5jaFBhdGg/OiBzdHJpbmcsIGNvbnRleHRTdGFnZU5hbWU/OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGJhc2VOYW1lID0gbm9kZS5pZCA/PyBub2RlLm5hbWU7XG4gICAgY29uc3Qgbm9kZUlkID0gKGNvbnRleHRTdGFnZU5hbWUgJiYgY29udGV4dFN0YWdlTmFtZSAhPT0gbm9kZS5uYW1lKSA/IGNvbnRleHRTdGFnZU5hbWUgOiBiYXNlTmFtZTtcbiAgICBpZiAoIWJyYW5jaFBhdGgpIHJldHVybiBub2RlSWQ7XG4gICAgcmV0dXJuIGAke2JyYW5jaFBhdGh9LiR7bm9kZUlkfWA7XG4gIH1cblxuICAvKipcbiAgICogUmVmZXJlbmNlIHRvIHRoZSBzdWJmbG93IHJlc3VsdHMgbWFwIGZyb20gdGhlIHBhcmVudCBQaXBlbGluZS5cbiAgICovXG4gIHByaXZhdGUgc3ViZmxvd1Jlc3VsdHNNYXA/OiBNYXA8c3RyaW5nLCBTdWJmbG93UmVzdWx0PjtcblxuICAvKipcbiAgICogRXhlY3V0ZSBjaGlsZHJlbiB3aXRoaW4gYSBzdWJmbG93J3MgY29udGV4dC5cbiAgICpcbiAgICogV0hZOiBTaW1pbGFyIHRvIENoaWxkcmVuRXhlY3V0b3IuZXhlY3V0ZU5vZGVDaGlsZHJlbiBidXQgdXNlcyBleGVjdXRlU3ViZmxvd0ludGVybmFsXG4gICAqIGZvciByZWN1cnNpb24sIGVuc3VyaW5nIG5lc3RlZCBzdWJmbG93cyBhcmUgcHJvcGVybHkgZGV0ZWN0ZWQuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gUGFyZW50IG5vZGUgY29udGFpbmluZyBjaGlsZHJlbiB0byBleGVjdXRlXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gQ3VycmVudCBzdGFnZSBjb250ZXh0IHdpdGhpbiB0aGUgc3ViZmxvd1xuICAgKiBAcGFyYW0gYnJhbmNoUGF0aCAtIEJyYW5jaCBwYXRoIGZvciBsb2dnaW5nXG4gICAqIEBwYXJhbSBicmVha0ZsYWcgLSBCcmVhayBmbGFnIGZvciB0aGUgc3ViZmxvd1xuICAgKiBAcmV0dXJucyBPYmplY3QgbWFwcGluZyBjaGlsZCBJRHMgdG8gdGhlaXIgcmVzdWx0c1xuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiAxLjNfXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVOb2RlQ2hpbGRyZW5JbnRlcm5hbChcbiAgICBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gICAgYnJhbmNoUGF0aDogc3RyaW5nLFxuICAgIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICApOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIE5vZGVSZXN1bHRUeXBlPj4ge1xuICAgIGNvbnN0IGNoaWxkUHJvbWlzZXM6IFByb21pc2U8Tm9kZVJlc3VsdFR5cGU+W10gPSAobm9kZS5jaGlsZHJlbiA/PyBbXSkubWFwKChjaGlsZDogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4pID0+IHtcbiAgICAgIGNvbnN0IGNoaWxkQ29udGV4dCA9IGNvbnRleHQuY3JlYXRlQ2hpbGQoJycsIGNoaWxkLmlkIGFzIHN0cmluZywgY2hpbGQubmFtZSk7XG4gICAgICBjb25zdCBjaGlsZEJyZWFrRmxhZyA9IHsgc2hvdWxkQnJlYWs6IGZhbHNlIH07XG5cbiAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVTdWJmbG93SW50ZXJuYWwoY2hpbGQsIGNoaWxkQ29udGV4dCwgY2hpbGRCcmVha0ZsYWcsIGJyYW5jaFBhdGgpXG4gICAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBjaGlsZENvbnRleHQuY29tbWl0KCk7XG4gICAgICAgICAgcmV0dXJuIHsgaWQ6IGNoaWxkLmlkISwgcmVzdWx0LCBpc0Vycm9yOiBmYWxzZSB9O1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgY2hpbGRDb250ZXh0LmNvbW1pdCgpO1xuICAgICAgICAgIGxvZ2dlci5pbmZvKGBUUkVFIFBJUEVMSU5FOiBleGVjdXRlTm9kZUNoaWxkcmVuSW50ZXJuYWwgLSBFcnJvciBmb3IgaWQ6ICR7Y2hpbGQ/LmlkfWAsIHsgZXJyb3IgfSk7XG4gICAgICAgICAgcmV0dXJuIHsgaWQ6IGNoaWxkLmlkISwgcmVzdWx0OiBlcnJvciwgaXNFcnJvcjogdHJ1ZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNldHRsZWQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoY2hpbGRQcm9taXNlcyk7XG5cbiAgICBjb25zdCBjaGlsZHJlblJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIE5vZGVSZXN1bHRUeXBlPiA9IHt9O1xuICAgIHNldHRsZWQuZm9yRWFjaCgocykgPT4ge1xuICAgICAgaWYgKHMuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuICAgICAgICBjb25zdCB7IGlkLCByZXN1bHQsIGlzRXJyb3IgfSA9IHMudmFsdWU7XG4gICAgICAgIGNoaWxkcmVuUmVzdWx0c1tpZF0gPSB7IGlkLCByZXN1bHQsIGlzRXJyb3IgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRXhlY3V0aW9uIGZhaWxlZDogJHtzLnJlYXNvbn1gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjaGlsZHJlblJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBzZWxlY3RlZCBjaGlsZHJlbiB3aXRoaW4gYSBzdWJmbG93J3MgY29udGV4dC5cbiAgICpcbiAgICogV0hZOiBTaW1pbGFyIHRvIENoaWxkcmVuRXhlY3V0b3IuZXhlY3V0ZVNlbGVjdGVkQ2hpbGRyZW4gYnV0IHVzZXMgZXhlY3V0ZVN1YmZsb3dJbnRlcm5hbFxuICAgKiBmb3IgcmVjdXJzaW9uLCBlbnN1cmluZyBuZXN0ZWQgc3ViZmxvd3MgYXJlIHByb3Blcmx5IGRldGVjdGVkLlxuICAgKlxuICAgKiBAcGFyYW0gc2VsZWN0b3IgLSBGdW5jdGlvbiB0aGF0IHJldHVybnMgc2VsZWN0ZWQgY2hpbGQgSUQocylcbiAgICogQHBhcmFtIGNoaWxkcmVuIC0gQXJyYXkgb2YgY2hpbGQgbm9kZXMgdG8gc2VsZWN0IGZyb21cbiAgICogQHBhcmFtIGlucHV0IC0gSW5wdXQgdG8gcGFzcyB0byB0aGUgc2VsZWN0b3IgZnVuY3Rpb25cbiAgICogQHBhcmFtIGNvbnRleHQgLSBDdXJyZW50IHN0YWdlIGNvbnRleHQgd2l0aGluIHRoZSBzdWJmbG93XG4gICAqIEBwYXJhbSBicmFuY2hQYXRoIC0gQnJhbmNoIHBhdGggZm9yIGxvZ2dpbmdcbiAgICogQHBhcmFtIGJyZWFrRmxhZyAtIEJyZWFrIGZsYWcgZm9yIHRoZSBzdWJmbG93XG4gICAqIEByZXR1cm5zIE9iamVjdCBtYXBwaW5nIGNoaWxkIElEcyB0byB0aGVpciByZXN1bHRzXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDEuNF9cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVNlbGVjdGVkQ2hpbGRyZW5JbnRlcm5hbChcbiAgICBzZWxlY3RvcjogU2VsZWN0b3IsXG4gICAgY2hpbGRyZW46IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+W10sXG4gICAgaW5wdXQ6IGFueSxcbiAgICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gICAgYnJhbmNoUGF0aDogc3RyaW5nLFxuICAgIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICApOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIE5vZGVSZXN1bHRUeXBlPj4ge1xuICAgIC8vIEludm9rZSBzZWxlY3RvclxuICAgIGNvbnN0IHNlbGVjdG9yUmVzdWx0ID0gYXdhaXQgc2VsZWN0b3IoaW5wdXQpO1xuXG4gICAgLy8gTm9ybWFsaXplIHRvIGFycmF5XG4gICAgY29uc3Qgc2VsZWN0ZWRJZHMgPSBBcnJheS5pc0FycmF5KHNlbGVjdG9yUmVzdWx0KSA/IHNlbGVjdG9yUmVzdWx0IDogW3NlbGVjdG9yUmVzdWx0XTtcblxuICAgIC8vIFJlY29yZCBzZWxlY3Rpb24gaW4gZGVidWcgaW5mb1xuICAgIGNvbnRleHQuYWRkTG9nKCdzZWxlY3RlZENoaWxkSWRzJywgc2VsZWN0ZWRJZHMpO1xuICAgIGNvbnRleHQuYWRkTG9nKCdzZWxlY3RvclBhdHRlcm4nLCAnbXVsdGktY2hvaWNlJyk7XG5cbiAgICAvLyBFbXB0eSBzZWxlY3Rpb24gLSBza2lwIGNoaWxkcmVuIGV4ZWN1dGlvblxuICAgIGlmIChzZWxlY3RlZElkcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnRleHQuYWRkTG9nKCdza2lwcGVkQWxsQ2hpbGRyZW4nLCB0cnVlKTtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBGaWx0ZXIgdG8gc2VsZWN0ZWQgY2hpbGRyZW5cbiAgICBjb25zdCBzZWxlY3RlZENoaWxkcmVuID0gY2hpbGRyZW4uZmlsdGVyKChjKSA9PiBzZWxlY3RlZElkcy5pbmNsdWRlcyhjLmlkISkpO1xuXG4gICAgLy8gVmFsaWRhdGUgYWxsIElEcyBmb3VuZFxuICAgIGlmIChzZWxlY3RlZENoaWxkcmVuLmxlbmd0aCAhPT0gc2VsZWN0ZWRJZHMubGVuZ3RoKSB7XG4gICAgICBjb25zdCBjaGlsZElkcyA9IGNoaWxkcmVuLm1hcCgoYykgPT4gYy5pZCk7XG4gICAgICBjb25zdCBtaXNzaW5nID0gc2VsZWN0ZWRJZHMuZmlsdGVyKChpZCkgPT4gIWNoaWxkSWRzLmluY2x1ZGVzKGlkKSk7XG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBgU2VsZWN0b3IgcmV0dXJuZWQgdW5rbm93biBjaGlsZCBJRHM6ICR7bWlzc2luZy5qb2luKCcsICcpfS4gQXZhaWxhYmxlOiAke2NoaWxkSWRzLmpvaW4oJywgJyl9YDtcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gc3ViZmxvdyAoJHticmFuY2hQYXRofSk6YCwgeyBlcnJvcjogZXJyb3JNZXNzYWdlIH0pO1xuICAgICAgY29udGV4dC5hZGRFcnJvcignc2VsZWN0b3JFcnJvcicsIGVycm9yTWVzc2FnZSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKTtcbiAgICB9XG5cbiAgICAvLyBSZWNvcmQgc2tpcHBlZCBjaGlsZHJlbiBmb3IgdmlzdWFsaXphdGlvblxuICAgIGNvbnN0IHNraXBwZWRJZHMgPSBjaGlsZHJlbi5maWx0ZXIoKGMpID0+ICFzZWxlY3RlZElkcy5pbmNsdWRlcyhjLmlkISkpLm1hcCgoYykgPT4gYy5pZCk7XG4gICAgaWYgKHNraXBwZWRJZHMubGVuZ3RoID4gMCkge1xuICAgICAgY29udGV4dC5hZGRMb2coJ3NraXBwZWRDaGlsZElkcycsIHNraXBwZWRJZHMpO1xuICAgIH1cblxuICAgIC8vIEV4ZWN1dGUgc2VsZWN0ZWQgY2hpbGRyZW4gdXNpbmcgaW50ZXJuYWwgdmVyc2lvbiAoZm9yIHN1YmZsb3cgY29udGV4dClcbiAgICBjb25zdCB0ZW1wTm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4gPSB7IG5hbWU6ICdzZWxlY3Rvci10ZW1wJywgY2hpbGRyZW46IHNlbGVjdGVkQ2hpbGRyZW4gfTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlTm9kZUNoaWxkcmVuSW50ZXJuYWwodGVtcE5vZGUsIGNvbnRleHQsIGJyYW5jaFBhdGgsIGJyZWFrRmxhZyk7XG4gIH1cbn1cbiJdfQ==