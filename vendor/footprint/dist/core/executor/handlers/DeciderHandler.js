"use strict";
/**
 * DeciderHandler.ts
 *
 * WHY: Handles decider evaluation and branching for the Pipeline.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of decider handling from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Execute decider nodes (stage → commit → decider → chosen child)
 * - Create decider scope context when stage function exists
 * - Log flow control decisions for decider branches
 * - Use NodeResolver.getNextNode to pick chosen child
 *
 * DESIGN DECISIONS:
 * - Decider evaluation happens AFTER stage execution (if present)
 * - Decider context is created right before invoking the decider for proper scoping
 * - Flow control messages include rationale when available for debugging
 *
 * DOES NOT HANDLE:
 * - Stage execution (uses runStage callback)
 * - Commit logic (caller handles via context.commitPatch())
 * - Extractor calls (caller handles via callExtractor())
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates when deciders are evaluated
 * - {@link NodeResolver} - Used to pick the chosen child via getNextNode
 * - {@link StageContext} - Used for debug info and context creation
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeciderHandler = void 0;
const logger_1 = require("../../../utils/logger");
/**
 * DeciderHandler
 * ------------------------------------------------------------------
 * Handles decider evaluation and branching.
 *
 * WHY: Deciders are a common pattern in pipelines for conditional branching.
 * This class centralizes all decider-related logic in one place.
 *
 * DESIGN: Uses callbacks for stage execution and node execution to avoid
 * circular dependencies with Pipeline.
 *
 * @template TOut - The output type of stage functions
 * @template TScope - The scope type passed to stage functions
 *
 * @example
 * ```typescript
 * const handler = new DeciderHandler(pipelineContext, nodeResolver);
 * const result = await handler.handle(node, stageFunc, context, breakFlag, branchPath, ...callbacks);
 * ```
 */
class DeciderHandler {
    constructor(ctx, nodeResolver) {
        this.ctx = ctx;
        this.nodeResolver = nodeResolver;
    }
    /**
     * Handle a decider node.
     *
     * WHY: Decider nodes need special handling because they:
     * 1. May have an optional stage function that runs first
     * 2. Evaluate a decider function to pick exactly one child
     * 3. Continue execution with only the chosen child
     *
     * DESIGN: Execution order: stage (optional) → commit → decider → chosen child
     *
     * @param node - The decider node (has nextNodeDecider)
     * @param stageFunc - The stage function (may be undefined)
     * @param context - The stage context
     * @param breakFlag - Break flag for propagation
     * @param branchPath - Branch path for logging
     * @param runStage - Callback to run the stage function
     * @param executeNode - Callback to execute the chosen child
     * @param callExtractor - Callback to call the extractor
     * @param getStagePath - Callback to get the stage path
     * @returns The result of executing the chosen child
     *
     * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
     */
    async handle(node, stageFunc, context, breakFlag, branchPath, runStage, executeNode, callExtractor, getStagePath) {
        var _a, _b;
        const breakFn = () => (breakFlag.shouldBreak = true);
        let stageOutput;
        // Execute stage if present (stage → commit → decider → chosen child)
        if (stageFunc) {
            try {
                stageOutput = await runStage(node, stageFunc, context, breakFn);
            }
            catch (error) {
                context.commit(); // commit partial patch for forensic data
                // Pass undefined for stageOutput and error details for enrichment
                // WHY: On error path, there's no successful output, but we capture
                // the error info so enriched snapshots include what went wrong.
                // _Requirements: single-pass-debug-structure 1.4_
                callExtractor(node, context, getStagePath(node, branchPath, context.stageName), undefined, {
                    type: 'stageExecutionError',
                    message: error.toString(),
                });
                logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${node.name}]:`, { error });
                context.addError('stageExecutionError', error.toString());
                // Append narrative error sentence for the decider failure
                // _Requirements: 10.2_
                this.ctx.narrativeGenerator.onError(node.name, error.toString(), node.displayName);
                throw error;
            }
            context.commit();
            // Pass stageOutput so enriched snapshots capture the stage's return value
            // _Requirements: single-pass-debug-structure 1.3_
            callExtractor(node, context, getStagePath(node, branchPath, context.stageName), stageOutput);
            if (breakFlag.shouldBreak) {
                logger_1.logger.info(`Execution stopped in pipeline (${branchPath}) after ${node.name} due to break condition.`);
                return stageOutput;
            }
        }
        // When there's no stage function, the decider node still needs a snapshot
        // so it appears in the debug UI execution flow (e.g., step 5 "Decider").
        // WHY: Without this, decider-only nodes are invisible in the Incremental_Debug_Map
        // because callExtractor is only called inside the `if (stageFunc)` block above.
        if (!stageFunc) {
            callExtractor(node, context, getStagePath(node, branchPath, context.stageName), undefined);
        }
        // Create/mark decider scope right before invoking the decider
        // WHY: Proper scoping ensures decider debug info is in the right context
        const deciderStageContext = stageFunc
            ? context.createDecider(branchPath, 'decider')
            : context.setAsDecider();
        // Use NodeResolver to pick the chosen child
        const chosen = await this.nodeResolver.getNextNode(node.nextNodeDecider, node.children, stageOutput, context);
        // Log flow control decision for decider branch
        // WHY: Narrative style helps with debugging — explain the condition, not just the choice
        const rationale = (_b = (_a = context.debug) === null || _a === void 0 ? void 0 : _a.logContext) === null || _b === void 0 ? void 0 : _b.deciderRationale;
        const chosenName = chosen.displayName || chosen.name;
        const branchDescription = rationale
            ? `Based on: ${rationale} → chose ${chosenName} path.`
            : `Evaluated conditions → chose ${chosenName} path.`;
        context.addFlowDebugMessage('branch', branchDescription, {
            targetStage: chosen.name,
            rationale,
        });
        // Append narrative sentence for the decision
        // WHY: Decision points are the most valuable part of the narrative for LLM context
        // engineering — knowing *why* a branch was taken lets even a cheaper model reason
        // about the execution.
        // _Requirements: 4.1, 4.3_
        this.ctx.narrativeGenerator.onDecision(node.name, chosen.name, chosen.displayName, rationale, node.description);
        deciderStageContext.commit();
        // Continue execution with the chosen child
        // WHY: We create the next context from deciderStageContext (not the original context)
        // so the chosen child gets its own node in the context tree. Previously, calling
        // context.createNext() would return the already-set decider context (since createNext
        // returns existing this.next if set), causing the chosen child to share the decider's
        // context node and be invisible in the execution order / treeContext serialization.
        const nextStageContext = deciderStageContext.createNext(branchPath, chosen.name);
        return executeNode(chosen, nextStageContext, breakFlag, branchPath);
    }
    /**
     * Handle a scope-based decider node (created via `addDeciderFunction`).
     *
     * WHY: Scope-based deciders are first-class stage functions — the decider IS the stage.
     * Unlike legacy deciders where the stage and decider are separate invocations,
     * here the stage function receives (scope, breakFn) and returns a branch ID string.
     * This aligns with how LangGraph reads from state and Airflow reads from XCom.
     *
     * DESIGN: Execution order: runStage(fn) → commit → callExtractor → resolve child → log → executeNode(child)
     *
     * Key differences from `handle()`:
     * 1. Stage function is required (it IS the decider)
     * 2. Stage output (string) IS the branch ID — no separate decider invocation
     * 3. Child resolution is direct ID matching against `node.children` with default fallback
     * 4. No `NodeResolver.getNextNode()` call needed
     * 5. No separate `createDecider()` context — the stage context IS the decider context
     *
     * @param node - The decider node (has `deciderFn = true`, `fn` defined, `children` defined)
     * @param stageFunc - The stage function that returns a branch ID string (required)
     * @param context - The stage context
     * @param breakFlag - Break flag for propagation
     * @param branchPath - Branch path for logging
     * @param runStage - Callback to run the stage function
     * @param executeNode - Callback to execute the chosen child
     * @param callExtractor - Callback to call the extractor
     * @param getStagePath - Callback to get the stage path
     * @returns The result of executing the chosen child
     *
     * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5_
     */
    async handleScopeBased(node, stageFunc, context, breakFlag, branchPath, runStage, executeNode, callExtractor, getStagePath) {
        var _a, _b;
        const breakFn = () => (breakFlag.shouldBreak = true);
        // Execute the decider's stage function — its return value IS the branch ID
        // WHY: The decider function reads from scope and returns a string branch ID,
        // making it a proper stage with full scope access, step number, and debug visibility.
        let branchId;
        try {
            const stageOutput = await runStage(node, stageFunc, context, breakFn);
            branchId = String(stageOutput);
        }
        catch (error) {
            // Commit partial patch for forensic data
            // WHY: Even on error, we persist any scope writes the decider made
            // so debug tools can inspect what happened before the failure.
            context.commit();
            callExtractor(node, context, getStagePath(node, branchPath, context.stageName), undefined, {
                type: 'stageExecutionError',
                message: error.toString(),
            });
            logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${node.name}]:`, { error });
            context.addError('stageExecutionError', error.toString());
            // Append narrative error sentence for the scope-based decider failure
            // _Requirements: 10.2_
            this.ctx.narrativeGenerator.onError(node.name, error.toString(), node.displayName);
            throw error;
        }
        // Commit the decider's scope writes before selecting the branch
        // WHY: Ensures downstream stages see the decider's committed state,
        // and the extractor captures the post-commit scope snapshot.
        // _Requirements: 2.6_
        context.commit();
        // Call extractor with the branch ID as stageOutput so it appears in enriched snapshots
        callExtractor(node, context, getStagePath(node, branchPath, context.stageName), branchId);
        // If break was called during the decider, stop execution
        if (breakFlag.shouldBreak) {
            logger_1.logger.info(`Execution stopped in pipeline (${branchPath}) after ${node.name} due to break condition.`);
            return branchId;
        }
        // Resolve child by matching branch ID against node.children
        // WHY: Direct ID matching with default fallback — no NodeResolver needed
        // because the decider function already returned the exact branch ID.
        // _Requirements: 2.2, 2.4_
        const children = node.children;
        let chosen = children.find((child) => child.id === branchId);
        // Fall back to default branch if the returned ID doesn't match any child
        // WHY: The default branch (set via `setDefault()`) acts as a catch-all
        // for unexpected branch IDs, preventing runtime errors.
        // _Requirements: 2.4_
        if (!chosen) {
            const defaultChild = children.find((child) => child.id === 'default');
            if (defaultChild) {
                chosen = defaultChild;
            }
            else {
                const errorMessage = `Scope-based decider '${node.name}' returned branch ID '${branchId}' which doesn't match any child and no default branch is set`;
                context.addError('deciderError', errorMessage);
                throw new Error(errorMessage);
            }
        }
        // Log flow control decision for decider branch
        // WHY: Narrative style helps with debugging — the message should explain
        // WHICH condition led to this branch, not just say "chose X path".
        // We read deciderRationale from StageMetadata (debug logs) instead of scope
        // because the WriteBuffer has a stale-read bug: after commit() resets the
        // buffer's workingCopy to baseSnapshot, getValue reads the stale baseSnapshot
        // value from a previous iteration instead of falling through to GlobalStore.
        // StageMetadata is per-context and doesn't have this issue.
        // _Requirements: 3.5_
        const chosenName = chosen.displayName || chosen.name;
        const wasDefault = chosen.id !== branchId;
        const rationale = (_b = (_a = context.debug) === null || _a === void 0 ? void 0 : _a.logContext) === null || _b === void 0 ? void 0 : _b.deciderRationale;
        let branchReason;
        if (wasDefault) {
            branchReason = `Returned '${branchId}' (no match), fell back to default → ${chosenName} path.`;
        }
        else if (rationale) {
            branchReason = `Based on: ${rationale} → chose ${chosenName} path.`;
        }
        else {
            branchReason = `Evaluated scope and returned '${branchId}' → chose ${chosenName} path.`;
        }
        context.addFlowDebugMessage('branch', branchReason, {
            targetStage: chosen.name,
            rationale: rationale || `returned branchId: ${branchId}`,
        });
        // Append narrative sentence for the scope-based decision
        // WHY: Scope-based deciders are first-class decisions — the narrative should
        // capture the branch chosen and rationale just like legacy deciders.
        // _Requirements: 4.2, 4.3_
        this.ctx.narrativeGenerator.onDecision(node.name, chosen.name, chosen.displayName, rationale, node.description);
        // Continue execution with the chosen child
        // WHY: Create next context from the current context so the chosen child
        // gets its own node in the context tree for proper debug visibility.
        const nextStageContext = context.createNext(branchPath, chosen.name);
        return executeNode(chosen, nextStageContext, breakFlag, branchPath);
    }
}
exports.DeciderHandler = DeciderHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVjaWRlckhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9oYW5kbGVycy9EZWNpZGVySGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBNkJHOzs7QUFHSCxrREFBK0M7QUFxRS9DOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHO0FBQ0gsTUFBYSxjQUFjO0lBQ3pCLFlBQ21CLEdBQWtDLEVBQ2xDLFlBQXdDO1FBRHhDLFFBQUcsR0FBSCxHQUFHLENBQStCO1FBQ2xDLGlCQUFZLEdBQVosWUFBWSxDQUE0QjtJQUN4RCxDQUFDO0lBRUo7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FzQkc7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUNWLElBQTZCLEVBQzdCLFNBQTBELEVBQzFELE9BQXFCLEVBQ3JCLFNBQW1DLEVBQ25DLFVBQThCLEVBQzlCLFFBQWtDLEVBQ2xDLFdBQXdDLEVBQ3hDLGFBQTRDLEVBQzVDLFlBQTBDOztRQUUxQyxNQUFNLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDckQsSUFBSSxXQUE2QixDQUFDO1FBRWxDLHFFQUFxRTtRQUNyRSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDO2dCQUNILFdBQVcsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsRSxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMseUNBQXlDO2dCQUMzRCxrRUFBa0U7Z0JBQ2xFLG1FQUFtRTtnQkFDbkUsZ0VBQWdFO2dCQUNoRSxrREFBa0Q7Z0JBQ2xELGFBQWEsQ0FBQyxJQUFJLEVBQUUsT0FB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LENBQUM7UUFDcEYsSUFBSSxZQUFvQixDQUFDO1FBQ3pCLElBQUksVUFBVSxFQUFFLENBQUM7WUFDZixZQUFZLEdBQUcsYUFBYSxRQUFRLHdDQUF3QyxVQUFVLFFBQVEsQ0FBQztRQUNqRyxDQUFDO2FBQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNyQixZQUFZLEdBQUcsYUFBYSxTQUFTLFlBQVksVUFBVSxRQUFRLENBQUM7UUFDdEUsQ0FBQzthQUFNLENBQUM7WUFDTixZQUFZLEdBQUcsaUNBQWlDLFFBQVEsYUFBYSxVQUFVLFFBQVEsQ0FBQztRQUMxRixDQUFDO1FBQ0QsT0FBTyxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxZQUFZLEVBQUU7WUFDbEQsV0FBVyxFQUFFLE1BQU0sQ0FBQyxJQUFJO1lBQ3hCLFNBQVMsRUFBRSxTQUFTLElBQUksc0JBQXNCLFFBQVEsRUFBRTtTQUN6RCxDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsNkVBQTZFO1FBQzdFLHFFQUFxRTtRQUNyRSwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVoSCwyQ0FBMkM7UUFDM0Msd0VBQXdFO1FBQ3hFLHFFQUFxRTtRQUNyRSxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsVUFBb0IsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0UsT0FBTyxXQUFXLENBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN0RSxDQUFDO0NBQ0Y7QUE3UUQsd0NBNlFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBEZWNpZGVySGFuZGxlci50c1xuICpcbiAqIFdIWTogSGFuZGxlcyBkZWNpZGVyIGV2YWx1YXRpb24gYW5kIGJyYW5jaGluZyBmb3IgdGhlIFBpcGVsaW5lLlxuICogVGhpcyBtb2R1bGUgaXMgZXh0cmFjdGVkIGZyb20gUGlwZWxpbmUudHMgZm9sbG93aW5nIHRoZSBTaW5nbGUgUmVzcG9uc2liaWxpdHkgUHJpbmNpcGxlLFxuICogaXNvbGF0aW5nIHRoZSBjb25jZXJucyBvZiBkZWNpZGVyIGhhbmRsaW5nIGZyb20gcGlwZWxpbmUgdHJhdmVyc2FsLlxuICpcbiAqIFJFU1BPTlNJQklMSVRJRVM6XG4gKiAtIEV4ZWN1dGUgZGVjaWRlciBub2RlcyAoc3RhZ2Ug4oaSIGNvbW1pdCDihpIgZGVjaWRlciDihpIgY2hvc2VuIGNoaWxkKVxuICogLSBDcmVhdGUgZGVjaWRlciBzY29wZSBjb250ZXh0IHdoZW4gc3RhZ2UgZnVuY3Rpb24gZXhpc3RzXG4gKiAtIExvZyBmbG93IGNvbnRyb2wgZGVjaXNpb25zIGZvciBkZWNpZGVyIGJyYW5jaGVzXG4gKiAtIFVzZSBOb2RlUmVzb2x2ZXIuZ2V0TmV4dE5vZGUgdG8gcGljayBjaG9zZW4gY2hpbGRcbiAqXG4gKiBERVNJR04gREVDSVNJT05TOlxuICogLSBEZWNpZGVyIGV2YWx1YXRpb24gaGFwcGVucyBBRlRFUiBzdGFnZSBleGVjdXRpb24gKGlmIHByZXNlbnQpXG4gKiAtIERlY2lkZXIgY29udGV4dCBpcyBjcmVhdGVkIHJpZ2h0IGJlZm9yZSBpbnZva2luZyB0aGUgZGVjaWRlciBmb3IgcHJvcGVyIHNjb3BpbmdcbiAqIC0gRmxvdyBjb250cm9sIG1lc3NhZ2VzIGluY2x1ZGUgcmF0aW9uYWxlIHdoZW4gYXZhaWxhYmxlIGZvciBkZWJ1Z2dpbmdcbiAqXG4gKiBET0VTIE5PVCBIQU5ETEU6XG4gKiAtIFN0YWdlIGV4ZWN1dGlvbiAodXNlcyBydW5TdGFnZSBjYWxsYmFjaylcbiAqIC0gQ29tbWl0IGxvZ2ljIChjYWxsZXIgaGFuZGxlcyB2aWEgY29udGV4dC5jb21taXRQYXRjaCgpKVxuICogLSBFeHRyYWN0b3IgY2FsbHMgKGNhbGxlciBoYW5kbGVzIHZpYSBjYWxsRXh0cmFjdG9yKCkpXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIFBpcGVsaW5lfSAtIE9yY2hlc3RyYXRlcyB3aGVuIGRlY2lkZXJzIGFyZSBldmFsdWF0ZWRcbiAqIC0ge0BsaW5rIE5vZGVSZXNvbHZlcn0gLSBVc2VkIHRvIHBpY2sgdGhlIGNob3NlbiBjaGlsZCB2aWEgZ2V0TmV4dE5vZGVcbiAqIC0ge0BsaW5rIFN0YWdlQ29udGV4dH0gLSBVc2VkIGZvciBkZWJ1ZyBpbmZvIGFuZCBjb250ZXh0IGNyZWF0aW9uXG4gKlxuICogX1JlcXVpcmVtZW50czogMi4xLCAyLjIsIDIuMywgMi40LCAyLjUsIDIuNl9cbiAqL1xuXG5pbXBvcnQgeyBTdGFnZUNvbnRleHQgfSBmcm9tICcuLi8uLi9tZW1vcnkvU3RhZ2VDb250ZXh0JztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvZ2dlcic7XG5pbXBvcnQgdHlwZSB7IFN0YWdlTm9kZSwgRGVjaWRlciB9IGZyb20gJy4uL1BpcGVsaW5lJztcbmltcG9ydCB0eXBlIHsgTm9kZVJlc29sdmVyIH0gZnJvbSAnLi9Ob2RlUmVzb2x2ZXInO1xuaW1wb3J0IHR5cGUgeyBQaXBlbGluZUNvbnRleHQsIFBpcGVsaW5lU3RhZ2VGdW5jdGlvbiwgU3RhZ2VTbmFwc2hvdCB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBDYWxsYmFjayB0eXBlIGZvciBydW5uaW5nIGEgc3RhZ2Ugd2l0aCBjb21taXQgYW5kIGV4dHJhY3Rvci5cbiAqXG4gKiBXSFk6IFVzZWQgYnkgRGVjaWRlckhhbmRsZXIgdG8gcnVuIHRoZSBvcHRpb25hbCBzdGFnZSBiZWZvcmUgZGVjaWRlciBldmFsdWF0aW9uLlxuICogVGhpcyBhdm9pZHMgY2lyY3VsYXIgZGVwZW5kZW5jeSB3aXRoIFBpcGVsaW5lLlxuICovXG5leHBvcnQgdHlwZSBSdW5TdGFnZUZuPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSAoXG4gIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICBzdGFnZUZ1bmM6IFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+LFxuICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gIGJyZWFrRm46ICgpID0+IHZvaWQsXG4pID0+IFByb21pc2U8VE91dD47XG5cbi8qKlxuICogQ2FsbGJhY2sgdHlwZSBmb3IgZXhlY3V0aW5nIGEgbm9kZS5cbiAqXG4gKiBXSFk6IFVzZWQgYnkgRGVjaWRlckhhbmRsZXIgdG8gY29udGludWUgZXhlY3V0aW9uIGFmdGVyIGNob29zaW5nIGEgYnJhbmNoLlxuICogVGhpcyBhdm9pZHMgY2lyY3VsYXIgZGVwZW5kZW5jeSB3aXRoIFBpcGVsaW5lLlxuICovXG5leHBvcnQgdHlwZSBFeGVjdXRlTm9kZUZuPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSAoXG4gIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICBicmFuY2hQYXRoPzogc3RyaW5nLFxuKSA9PiBQcm9taXNlPGFueT47XG5cbi8qKlxuICogQ2FsbGJhY2sgdHlwZSBmb3IgY2FsbGluZyB0aGUgZXh0cmFjdG9yLlxuICpcbiAqIFdIWTogVXNlZCBieSBEZWNpZGVySGFuZGxlciB0byBjYWxsIHRoZSBleHRyYWN0b3IgYWZ0ZXIgc3RhZ2UgZXhlY3V0aW9uLlxuICogVGhpcyBhdm9pZHMgY2lyY3VsYXIgZGVwZW5kZW5jeSB3aXRoIFBpcGVsaW5lLlxuICpcbiAqIEBwYXJhbSBub2RlIC0gVGhlIHN0YWdlIG5vZGVcbiAqIEBwYXJhbSBjb250ZXh0IC0gVGhlIHN0YWdlIGNvbnRleHQgKGFmdGVyIGNvbW1pdClcbiAqIEBwYXJhbSBzdGFnZVBhdGggLSBUaGUgZnVsbCBwYXRoIHRvIHRoaXMgc3RhZ2VcbiAqIEBwYXJhbSBzdGFnZU91dHB1dCAtIFRoZSBzdGFnZSBmdW5jdGlvbidzIHJldHVybiB2YWx1ZSAodW5kZWZpbmVkIG9uIGVycm9yIG9yIG5vLWZ1bmN0aW9uIG5vZGVzKVxuICogICBfUmVxdWlyZW1lbnRzOiBzaW5nbGUtcGFzcy1kZWJ1Zy1zdHJ1Y3R1cmUgMS4zX1xuICogQHBhcmFtIGVycm9ySW5mbyAtIEVycm9yIGRldGFpbHMgd2hlbiB0aGUgc3RhZ2UgdGhyZXcgZHVyaW5nIGV4ZWN1dGlvblxuICogICBfUmVxdWlyZW1lbnRzOiBzaW5nbGUtcGFzcy1kZWJ1Zy1zdHJ1Y3R1cmUgMS40X1xuICovXG5leHBvcnQgdHlwZSBDYWxsRXh0cmFjdG9yRm48VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiA9IChcbiAgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgc3RhZ2VQYXRoOiBzdHJpbmcsXG4gIHN0YWdlT3V0cHV0PzogdW5rbm93bixcbiAgZXJyb3JJbmZvPzogeyB0eXBlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9LFxuKSA9PiB2b2lkO1xuXG4vKipcbiAqIENhbGxiYWNrIHR5cGUgZm9yIGdldHRpbmcgdGhlIHN0YWdlIHBhdGguXG4gKlxuICogV0hZOiBVc2VkIGJ5IERlY2lkZXJIYW5kbGVyIHRvIGdlbmVyYXRlIHRoZSBzdGFnZSBwYXRoIGZvciBleHRyYWN0b3IuXG4gKiBUaGlzIGF2b2lkcyBjaXJjdWxhciBkZXBlbmRlbmN5IHdpdGggUGlwZWxpbmUuXG4gKlxuICogQHBhcmFtIG5vZGUgLSBUaGUgc3RhZ2Ugbm9kZVxuICogQHBhcmFtIGJyYW5jaFBhdGggLSBUaGUgYnJhbmNoIHBhdGggcHJlZml4XG4gKiBAcGFyYW0gY29udGV4dFN0YWdlTmFtZSAtIE9wdGlvbmFsIHN0YWdlIG5hbWUgZnJvbSBTdGFnZUNvbnRleHQgKGluY2x1ZGVzIGl0ZXJhdGlvbiBzdWZmaXgpXG4gKi9cbmV4cG9ydCB0eXBlIEdldFN0YWdlUGF0aEZuPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSAoXG4gIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICBicmFuY2hQYXRoPzogc3RyaW5nLFxuICBjb250ZXh0U3RhZ2VOYW1lPzogc3RyaW5nLFxuKSA9PiBzdHJpbmc7XG5cbi8qKlxuICogRGVjaWRlckhhbmRsZXJcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogSGFuZGxlcyBkZWNpZGVyIGV2YWx1YXRpb24gYW5kIGJyYW5jaGluZy5cbiAqXG4gKiBXSFk6IERlY2lkZXJzIGFyZSBhIGNvbW1vbiBwYXR0ZXJuIGluIHBpcGVsaW5lcyBmb3IgY29uZGl0aW9uYWwgYnJhbmNoaW5nLlxuICogVGhpcyBjbGFzcyBjZW50cmFsaXplcyBhbGwgZGVjaWRlci1yZWxhdGVkIGxvZ2ljIGluIG9uZSBwbGFjZS5cbiAqXG4gKiBERVNJR046IFVzZXMgY2FsbGJhY2tzIGZvciBzdGFnZSBleGVjdXRpb24gYW5kIG5vZGUgZXhlY3V0aW9uIHRvIGF2b2lkXG4gKiBjaXJjdWxhciBkZXBlbmRlbmNpZXMgd2l0aCBQaXBlbGluZS5cbiAqXG4gKiBAdGVtcGxhdGUgVE91dCAtIFRoZSBvdXRwdXQgdHlwZSBvZiBzdGFnZSBmdW5jdGlvbnNcbiAqIEB0ZW1wbGF0ZSBUU2NvcGUgLSBUaGUgc2NvcGUgdHlwZSBwYXNzZWQgdG8gc3RhZ2UgZnVuY3Rpb25zXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGhhbmRsZXIgPSBuZXcgRGVjaWRlckhhbmRsZXIocGlwZWxpbmVDb250ZXh0LCBub2RlUmVzb2x2ZXIpO1xuICogY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGUobm9kZSwgc3RhZ2VGdW5jLCBjb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgsIC4uLmNhbGxiYWNrcyk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIERlY2lkZXJIYW5kbGVyPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4ge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHJlYWRvbmx5IGN0eDogUGlwZWxpbmVDb250ZXh0PFRPdXQsIFRTY29wZT4sXG4gICAgcHJpdmF0ZSByZWFkb25seSBub2RlUmVzb2x2ZXI6IE5vZGVSZXNvbHZlcjxUT3V0LCBUU2NvcGU+LFxuICApIHt9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBhIGRlY2lkZXIgbm9kZS5cbiAgICpcbiAgICogV0hZOiBEZWNpZGVyIG5vZGVzIG5lZWQgc3BlY2lhbCBoYW5kbGluZyBiZWNhdXNlIHRoZXk6XG4gICAqIDEuIE1heSBoYXZlIGFuIG9wdGlvbmFsIHN0YWdlIGZ1bmN0aW9uIHRoYXQgcnVucyBmaXJzdFxuICAgKiAyLiBFdmFsdWF0ZSBhIGRlY2lkZXIgZnVuY3Rpb24gdG8gcGljayBleGFjdGx5IG9uZSBjaGlsZFxuICAgKiAzLiBDb250aW51ZSBleGVjdXRpb24gd2l0aCBvbmx5IHRoZSBjaG9zZW4gY2hpbGRcbiAgICpcbiAgICogREVTSUdOOiBFeGVjdXRpb24gb3JkZXI6IHN0YWdlIChvcHRpb25hbCkg4oaSIGNvbW1pdCDihpIgZGVjaWRlciDihpIgY2hvc2VuIGNoaWxkXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIGRlY2lkZXIgbm9kZSAoaGFzIG5leHROb2RlRGVjaWRlcilcbiAgICogQHBhcmFtIHN0YWdlRnVuYyAtIFRoZSBzdGFnZSBmdW5jdGlvbiAobWF5IGJlIHVuZGVmaW5lZClcbiAgICogQHBhcmFtIGNvbnRleHQgLSBUaGUgc3RhZ2UgY29udGV4dFxuICAgKiBAcGFyYW0gYnJlYWtGbGFnIC0gQnJlYWsgZmxhZyBmb3IgcHJvcGFnYXRpb25cbiAgICogQHBhcmFtIGJyYW5jaFBhdGggLSBCcmFuY2ggcGF0aCBmb3IgbG9nZ2luZ1xuICAgKiBAcGFyYW0gcnVuU3RhZ2UgLSBDYWxsYmFjayB0byBydW4gdGhlIHN0YWdlIGZ1bmN0aW9uXG4gICAqIEBwYXJhbSBleGVjdXRlTm9kZSAtIENhbGxiYWNrIHRvIGV4ZWN1dGUgdGhlIGNob3NlbiBjaGlsZFxuICAgKiBAcGFyYW0gY2FsbEV4dHJhY3RvciAtIENhbGxiYWNrIHRvIGNhbGwgdGhlIGV4dHJhY3RvclxuICAgKiBAcGFyYW0gZ2V0U3RhZ2VQYXRoIC0gQ2FsbGJhY2sgdG8gZ2V0IHRoZSBzdGFnZSBwYXRoXG4gICAqIEByZXR1cm5zIFRoZSByZXN1bHQgb2YgZXhlY3V0aW5nIHRoZSBjaG9zZW4gY2hpbGRcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMi4xLCAyLjIsIDIuMywgMi40LCAyLjVfXG4gICAqL1xuICBhc3luYyBoYW5kbGUoXG4gICAgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gICAgc3RhZ2VGdW5jOiBQaXBlbGluZVN0YWdlRnVuY3Rpb248VE91dCwgVFNjb3BlPiB8IHVuZGVmaW5lZCxcbiAgICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gICAgYnJlYWtGbGFnOiB7IHNob3VsZEJyZWFrOiBib29sZWFuIH0sXG4gICAgYnJhbmNoUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgIHJ1blN0YWdlOiBSdW5TdGFnZUZuPFRPdXQsIFRTY29wZT4sXG4gICAgZXhlY3V0ZU5vZGU6IEV4ZWN1dGVOb2RlRm48VE91dCwgVFNjb3BlPixcbiAgICBjYWxsRXh0cmFjdG9yOiBDYWxsRXh0cmFjdG9yRm48VE91dCwgVFNjb3BlPixcbiAgICBnZXRTdGFnZVBhdGg6IEdldFN0YWdlUGF0aEZuPFRPdXQsIFRTY29wZT4sXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgYnJlYWtGbiA9ICgpID0+IChicmVha0ZsYWcuc2hvdWxkQnJlYWsgPSB0cnVlKTtcbiAgICBsZXQgc3RhZ2VPdXRwdXQ6IFRPdXQgfCB1bmRlZmluZWQ7XG5cbiAgICAvLyBFeGVjdXRlIHN0YWdlIGlmIHByZXNlbnQgKHN0YWdlIOKGkiBjb21taXQg4oaSIGRlY2lkZXIg4oaSIGNob3NlbiBjaGlsZClcbiAgICBpZiAoc3RhZ2VGdW5jKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzdGFnZU91dHB1dCA9IGF3YWl0IHJ1blN0YWdlKG5vZGUsIHN0YWdlRnVuYywgY29udGV4dCwgYnJlYWtGbik7XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIGNvbnRleHQuY29tbWl0KCk7IC8vIGNvbW1pdCBwYXJ0aWFsIHBhdGNoIGZvciBmb3JlbnNpYyBkYXRhXG4gICAgICAgIC8vIFBhc3MgdW5kZWZpbmVkIGZvciBzdGFnZU91dHB1dCBhbmQgZXJyb3IgZGV0YWlscyBmb3IgZW5yaWNobWVudFxuICAgICAgICAvLyBXSFk6IE9uIGVycm9yIHBhdGgsIHRoZXJlJ3Mgbm8gc3VjY2Vzc2Z1bCBvdXRwdXQsIGJ1dCB3ZSBjYXB0dXJlXG4gICAgICAgIC8vIHRoZSBlcnJvciBpbmZvIHNvIGVucmljaGVkIHNuYXBzaG90cyBpbmNsdWRlIHdoYXQgd2VudCB3cm9uZy5cbiAgICAgICAgLy8gX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuNF9cbiAgICAgICAgY2FsbEV4dHJhY3Rvcihub2RlLCBjb250ZXh0LCBnZXRTdGFnZVBhdGgobm9kZSwgYnJhbmNoUGF0aCwgY29udGV4dC5zdGFnZU5hbWUpLCB1bmRlZmluZWQsIHtcbiAgICAgICAgICB0eXBlOiAnc3RhZ2VFeGVjdXRpb25FcnJvcicsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IudG9TdHJpbmcoKSxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gcGlwZWxpbmUgKCR7YnJhbmNoUGF0aH0pIHN0YWdlIFske25vZGUubmFtZX1dOmAsIHsgZXJyb3IgfSk7XG4gICAgICAgIGNvbnRleHQuYWRkRXJyb3IoJ3N0YWdlRXhlY3V0aW9uRXJyb3InLCBlcnJvci50b1N0cmluZygpKTtcbiAgICAgICAgLy8gQXBwZW5kIG5hcnJhdGl2ZSBlcnJvciBzZW50ZW5jZSBmb3IgdGhlIGRlY2lkZXIgZmFpbHVyZVxuICAgICAgICAvLyBfUmVxdWlyZW1lbnRzOiAxMC4yX1xuICAgICAgICB0aGlzLmN0eC5uYXJyYXRpdmVHZW5lcmF0b3Iub25FcnJvcihub2RlLm5hbWUsIGVycm9yLnRvU3RyaW5nKCksIG5vZGUuZGlzcGxheU5hbWUpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIGNvbnRleHQuY29tbWl0KCk7XG4gICAgICAvLyBQYXNzIHN0YWdlT3V0cHV0IHNvIGVucmljaGVkIHNuYXBzaG90cyBjYXB0dXJlIHRoZSBzdGFnZSdzIHJldHVybiB2YWx1ZVxuICAgICAgLy8gX1JlcXVpcmVtZW50czogc2luZ2xlLXBhc3MtZGVidWctc3RydWN0dXJlIDEuM19cbiAgICAgIGNhbGxFeHRyYWN0b3Iobm9kZSwgY29udGV4dCwgZ2V0U3RhZ2VQYXRoKG5vZGUsIGJyYW5jaFBhdGgsIGNvbnRleHQuc3RhZ2VOYW1lKSwgc3RhZ2VPdXRwdXQpO1xuXG4gICAgICBpZiAoYnJlYWtGbGFnLnNob3VsZEJyZWFrKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKGBFeGVjdXRpb24gc3RvcHBlZCBpbiBwaXBlbGluZSAoJHticmFuY2hQYXRofSkgYWZ0ZXIgJHtub2RlLm5hbWV9IGR1ZSB0byBicmVhayBjb25kaXRpb24uYCk7XG4gICAgICAgIHJldHVybiBzdGFnZU91dHB1dDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXaGVuIHRoZXJlJ3Mgbm8gc3RhZ2UgZnVuY3Rpb24sIHRoZSBkZWNpZGVyIG5vZGUgc3RpbGwgbmVlZHMgYSBzbmFwc2hvdFxuICAgIC8vIHNvIGl0IGFwcGVhcnMgaW4gdGhlIGRlYnVnIFVJIGV4ZWN1dGlvbiBmbG93IChlLmcuLCBzdGVwIDUgXCJEZWNpZGVyXCIpLlxuICAgIC8vIFdIWTogV2l0aG91dCB0aGlzLCBkZWNpZGVyLW9ubHkgbm9kZXMgYXJlIGludmlzaWJsZSBpbiB0aGUgSW5jcmVtZW50YWxfRGVidWdfTWFwXG4gICAgLy8gYmVjYXVzZSBjYWxsRXh0cmFjdG9yIGlzIG9ubHkgY2FsbGVkIGluc2lkZSB0aGUgYGlmIChzdGFnZUZ1bmMpYCBibG9jayBhYm92ZS5cbiAgICBpZiAoIXN0YWdlRnVuYykge1xuICAgICAgY2FsbEV4dHJhY3Rvcihub2RlLCBjb250ZXh0LCBnZXRTdGFnZVBhdGgobm9kZSwgYnJhbmNoUGF0aCwgY29udGV4dC5zdGFnZU5hbWUpLCB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZS9tYXJrIGRlY2lkZXIgc2NvcGUgcmlnaHQgYmVmb3JlIGludm9raW5nIHRoZSBkZWNpZGVyXG4gICAgLy8gV0hZOiBQcm9wZXIgc2NvcGluZyBlbnN1cmVzIGRlY2lkZXIgZGVidWcgaW5mbyBpcyBpbiB0aGUgcmlnaHQgY29udGV4dFxuICAgIGNvbnN0IGRlY2lkZXJTdGFnZUNvbnRleHQgPSBzdGFnZUZ1bmNcbiAgICAgID8gY29udGV4dC5jcmVhdGVEZWNpZGVyKGJyYW5jaFBhdGggYXMgc3RyaW5nLCAnZGVjaWRlcicpXG4gICAgICA6IGNvbnRleHQuc2V0QXNEZWNpZGVyKCk7XG5cbiAgICAvLyBVc2UgTm9kZVJlc29sdmVyIHRvIHBpY2sgdGhlIGNob3NlbiBjaGlsZFxuICAgIGNvbnN0IGNob3NlbiA9IGF3YWl0IHRoaXMubm9kZVJlc29sdmVyLmdldE5leHROb2RlKFxuICAgICAgbm9kZS5uZXh0Tm9kZURlY2lkZXIgYXMgRGVjaWRlcixcbiAgICAgIG5vZGUuY2hpbGRyZW4gYXMgU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT5bXSxcbiAgICAgIHN0YWdlT3V0cHV0LFxuICAgICAgY29udGV4dCxcbiAgICApO1xuXG4gICAgLy8gTG9nIGZsb3cgY29udHJvbCBkZWNpc2lvbiBmb3IgZGVjaWRlciBicmFuY2hcbiAgICAvLyBXSFk6IE5hcnJhdGl2ZSBzdHlsZSBoZWxwcyB3aXRoIGRlYnVnZ2luZyDigJQgZXhwbGFpbiB0aGUgY29uZGl0aW9uLCBub3QganVzdCB0aGUgY2hvaWNlXG4gICAgY29uc3QgcmF0aW9uYWxlID0gY29udGV4dC5kZWJ1Zz8ubG9nQ29udGV4dD8uZGVjaWRlclJhdGlvbmFsZSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgY29uc3QgY2hvc2VuTmFtZSA9IGNob3Nlbi5kaXNwbGF5TmFtZSB8fCBjaG9zZW4ubmFtZTtcbiAgICBjb25zdCBicmFuY2hEZXNjcmlwdGlvbiA9IHJhdGlvbmFsZVxuICAgICAgPyBgQmFzZWQgb246ICR7cmF0aW9uYWxlfSDihpIgY2hvc2UgJHtjaG9zZW5OYW1lfSBwYXRoLmBcbiAgICAgIDogYEV2YWx1YXRlZCBjb25kaXRpb25zIOKGkiBjaG9zZSAke2Nob3Nlbk5hbWV9IHBhdGguYDtcbiAgICBjb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoJ2JyYW5jaCcsIGJyYW5jaERlc2NyaXB0aW9uLCB7XG4gICAgICB0YXJnZXRTdGFnZTogY2hvc2VuLm5hbWUsXG4gICAgICByYXRpb25hbGUsXG4gICAgfSk7XG5cbiAgICAvLyBBcHBlbmQgbmFycmF0aXZlIHNlbnRlbmNlIGZvciB0aGUgZGVjaXNpb25cbiAgICAvLyBXSFk6IERlY2lzaW9uIHBvaW50cyBhcmUgdGhlIG1vc3QgdmFsdWFibGUgcGFydCBvZiB0aGUgbmFycmF0aXZlIGZvciBMTE0gY29udGV4dFxuICAgIC8vIGVuZ2luZWVyaW5nIOKAlCBrbm93aW5nICp3aHkqIGEgYnJhbmNoIHdhcyB0YWtlbiBsZXRzIGV2ZW4gYSBjaGVhcGVyIG1vZGVsIHJlYXNvblxuICAgIC8vIGFib3V0IHRoZSBleGVjdXRpb24uXG4gICAgLy8gX1JlcXVpcmVtZW50czogNC4xLCA0LjNfXG4gICAgdGhpcy5jdHgubmFycmF0aXZlR2VuZXJhdG9yLm9uRGVjaXNpb24obm9kZS5uYW1lLCBjaG9zZW4ubmFtZSwgY2hvc2VuLmRpc3BsYXlOYW1lLCByYXRpb25hbGUsIG5vZGUuZGVzY3JpcHRpb24pO1xuXG4gICAgZGVjaWRlclN0YWdlQ29udGV4dC5jb21taXQoKTtcblxuICAgIC8vIENvbnRpbnVlIGV4ZWN1dGlvbiB3aXRoIHRoZSBjaG9zZW4gY2hpbGRcbiAgICAvLyBXSFk6IFdlIGNyZWF0ZSB0aGUgbmV4dCBjb250ZXh0IGZyb20gZGVjaWRlclN0YWdlQ29udGV4dCAobm90IHRoZSBvcmlnaW5hbCBjb250ZXh0KVxuICAgIC8vIHNvIHRoZSBjaG9zZW4gY2hpbGQgZ2V0cyBpdHMgb3duIG5vZGUgaW4gdGhlIGNvbnRleHQgdHJlZS4gUHJldmlvdXNseSwgY2FsbGluZ1xuICAgIC8vIGNvbnRleHQuY3JlYXRlTmV4dCgpIHdvdWxkIHJldHVybiB0aGUgYWxyZWFkeS1zZXQgZGVjaWRlciBjb250ZXh0IChzaW5jZSBjcmVhdGVOZXh0XG4gICAgLy8gcmV0dXJucyBleGlzdGluZyB0aGlzLm5leHQgaWYgc2V0KSwgY2F1c2luZyB0aGUgY2hvc2VuIGNoaWxkIHRvIHNoYXJlIHRoZSBkZWNpZGVyJ3NcbiAgICAvLyBjb250ZXh0IG5vZGUgYW5kIGJlIGludmlzaWJsZSBpbiB0aGUgZXhlY3V0aW9uIG9yZGVyIC8gdHJlZUNvbnRleHQgc2VyaWFsaXphdGlvbi5cbiAgICBjb25zdCBuZXh0U3RhZ2VDb250ZXh0ID0gZGVjaWRlclN0YWdlQ29udGV4dC5jcmVhdGVOZXh0KGJyYW5jaFBhdGggYXMgc3RyaW5nLCBjaG9zZW4ubmFtZSk7XG4gICAgcmV0dXJuIGV4ZWN1dGVOb2RlKGNob3NlbiwgbmV4dFN0YWdlQ29udGV4dCwgYnJlYWtGbGFnLCBicmFuY2hQYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgYSBzY29wZS1iYXNlZCBkZWNpZGVyIG5vZGUgKGNyZWF0ZWQgdmlhIGBhZGREZWNpZGVyRnVuY3Rpb25gKS5cbiAgICpcbiAgICogV0hZOiBTY29wZS1iYXNlZCBkZWNpZGVycyBhcmUgZmlyc3QtY2xhc3Mgc3RhZ2UgZnVuY3Rpb25zIOKAlCB0aGUgZGVjaWRlciBJUyB0aGUgc3RhZ2UuXG4gICAqIFVubGlrZSBsZWdhY3kgZGVjaWRlcnMgd2hlcmUgdGhlIHN0YWdlIGFuZCBkZWNpZGVyIGFyZSBzZXBhcmF0ZSBpbnZvY2F0aW9ucyxcbiAgICogaGVyZSB0aGUgc3RhZ2UgZnVuY3Rpb24gcmVjZWl2ZXMgKHNjb3BlLCBicmVha0ZuKSBhbmQgcmV0dXJucyBhIGJyYW5jaCBJRCBzdHJpbmcuXG4gICAqIFRoaXMgYWxpZ25zIHdpdGggaG93IExhbmdHcmFwaCByZWFkcyBmcm9tIHN0YXRlIGFuZCBBaXJmbG93IHJlYWRzIGZyb20gWENvbS5cbiAgICpcbiAgICogREVTSUdOOiBFeGVjdXRpb24gb3JkZXI6IHJ1blN0YWdlKGZuKSDihpIgY29tbWl0IOKGkiBjYWxsRXh0cmFjdG9yIOKGkiByZXNvbHZlIGNoaWxkIOKGkiBsb2cg4oaSIGV4ZWN1dGVOb2RlKGNoaWxkKVxuICAgKlxuICAgKiBLZXkgZGlmZmVyZW5jZXMgZnJvbSBgaGFuZGxlKClgOlxuICAgKiAxLiBTdGFnZSBmdW5jdGlvbiBpcyByZXF1aXJlZCAoaXQgSVMgdGhlIGRlY2lkZXIpXG4gICAqIDIuIFN0YWdlIG91dHB1dCAoc3RyaW5nKSBJUyB0aGUgYnJhbmNoIElEIOKAlCBubyBzZXBhcmF0ZSBkZWNpZGVyIGludm9jYXRpb25cbiAgICogMy4gQ2hpbGQgcmVzb2x1dGlvbiBpcyBkaXJlY3QgSUQgbWF0Y2hpbmcgYWdhaW5zdCBgbm9kZS5jaGlsZHJlbmAgd2l0aCBkZWZhdWx0IGZhbGxiYWNrXG4gICAqIDQuIE5vIGBOb2RlUmVzb2x2ZXIuZ2V0TmV4dE5vZGUoKWAgY2FsbCBuZWVkZWRcbiAgICogNS4gTm8gc2VwYXJhdGUgYGNyZWF0ZURlY2lkZXIoKWAgY29udGV4dCDigJQgdGhlIHN0YWdlIGNvbnRleHQgSVMgdGhlIGRlY2lkZXIgY29udGV4dFxuICAgKlxuICAgKiBAcGFyYW0gbm9kZSAtIFRoZSBkZWNpZGVyIG5vZGUgKGhhcyBgZGVjaWRlckZuID0gdHJ1ZWAsIGBmbmAgZGVmaW5lZCwgYGNoaWxkcmVuYCBkZWZpbmVkKVxuICAgKiBAcGFyYW0gc3RhZ2VGdW5jIC0gVGhlIHN0YWdlIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIGJyYW5jaCBJRCBzdHJpbmcgKHJlcXVpcmVkKVxuICAgKiBAcGFyYW0gY29udGV4dCAtIFRoZSBzdGFnZSBjb250ZXh0XG4gICAqIEBwYXJhbSBicmVha0ZsYWcgLSBCcmVhayBmbGFnIGZvciBwcm9wYWdhdGlvblxuICAgKiBAcGFyYW0gYnJhbmNoUGF0aCAtIEJyYW5jaCBwYXRoIGZvciBsb2dnaW5nXG4gICAqIEBwYXJhbSBydW5TdGFnZSAtIENhbGxiYWNrIHRvIHJ1biB0aGUgc3RhZ2UgZnVuY3Rpb25cbiAgICogQHBhcmFtIGV4ZWN1dGVOb2RlIC0gQ2FsbGJhY2sgdG8gZXhlY3V0ZSB0aGUgY2hvc2VuIGNoaWxkXG4gICAqIEBwYXJhbSBjYWxsRXh0cmFjdG9yIC0gQ2FsbGJhY2sgdG8gY2FsbCB0aGUgZXh0cmFjdG9yXG4gICAqIEBwYXJhbSBnZXRTdGFnZVBhdGggLSBDYWxsYmFjayB0byBnZXQgdGhlIHN0YWdlIHBhdGhcbiAgICogQHJldHVybnMgVGhlIHJlc3VsdCBvZiBleGVjdXRpbmcgdGhlIGNob3NlbiBjaGlsZFxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiAyLjEsIDIuMiwgMi4zLCAyLjQsIDIuNSwgMi42LCAzLjVfXG4gICAqL1xuICBhc3luYyBoYW5kbGVTY29wZUJhc2VkKFxuICAgIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIHN0YWdlRnVuYzogUGlwZWxpbmVTdGFnZUZ1bmN0aW9uPFRPdXQsIFRTY29wZT4sXG4gICAgY29udGV4dDogU3RhZ2VDb250ZXh0LFxuICAgIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICAgIGJyYW5jaFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBydW5TdGFnZTogUnVuU3RhZ2VGbjxUT3V0LCBUU2NvcGU+LFxuICAgIGV4ZWN1dGVOb2RlOiBFeGVjdXRlTm9kZUZuPFRPdXQsIFRTY29wZT4sXG4gICAgY2FsbEV4dHJhY3RvcjogQ2FsbEV4dHJhY3RvckZuPFRPdXQsIFRTY29wZT4sXG4gICAgZ2V0U3RhZ2VQYXRoOiBHZXRTdGFnZVBhdGhGbjxUT3V0LCBUU2NvcGU+LFxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGJyZWFrRm4gPSAoKSA9PiAoYnJlYWtGbGFnLnNob3VsZEJyZWFrID0gdHJ1ZSk7XG5cbiAgICAvLyBFeGVjdXRlIHRoZSBkZWNpZGVyJ3Mgc3RhZ2UgZnVuY3Rpb24g4oCUIGl0cyByZXR1cm4gdmFsdWUgSVMgdGhlIGJyYW5jaCBJRFxuICAgIC8vIFdIWTogVGhlIGRlY2lkZXIgZnVuY3Rpb24gcmVhZHMgZnJvbSBzY29wZSBhbmQgcmV0dXJucyBhIHN0cmluZyBicmFuY2ggSUQsXG4gICAgLy8gbWFraW5nIGl0IGEgcHJvcGVyIHN0YWdlIHdpdGggZnVsbCBzY29wZSBhY2Nlc3MsIHN0ZXAgbnVtYmVyLCBhbmQgZGVidWcgdmlzaWJpbGl0eS5cbiAgICBsZXQgYnJhbmNoSWQ6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3RhZ2VPdXRwdXQgPSBhd2FpdCBydW5TdGFnZShub2RlLCBzdGFnZUZ1bmMsIGNvbnRleHQsIGJyZWFrRm4pO1xuICAgICAgYnJhbmNoSWQgPSBTdHJpbmcoc3RhZ2VPdXRwdXQpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIC8vIENvbW1pdCBwYXJ0aWFsIHBhdGNoIGZvciBmb3JlbnNpYyBkYXRhXG4gICAgICAvLyBXSFk6IEV2ZW4gb24gZXJyb3IsIHdlIHBlcnNpc3QgYW55IHNjb3BlIHdyaXRlcyB0aGUgZGVjaWRlciBtYWRlXG4gICAgICAvLyBzbyBkZWJ1ZyB0b29scyBjYW4gaW5zcGVjdCB3aGF0IGhhcHBlbmVkIGJlZm9yZSB0aGUgZmFpbHVyZS5cbiAgICAgIGNvbnRleHQuY29tbWl0KCk7XG4gICAgICBjYWxsRXh0cmFjdG9yKG5vZGUsIGNvbnRleHQsIGdldFN0YWdlUGF0aChub2RlLCBicmFuY2hQYXRoLCBjb250ZXh0LnN0YWdlTmFtZSksIHVuZGVmaW5lZCwge1xuICAgICAgICB0eXBlOiAnc3RhZ2VFeGVjdXRpb25FcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLnRvU3RyaW5nKCksXG4gICAgICB9KTtcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gcGlwZWxpbmUgKCR7YnJhbmNoUGF0aH0pIHN0YWdlIFske25vZGUubmFtZX1dOmAsIHsgZXJyb3IgfSk7XG4gICAgICBjb250ZXh0LmFkZEVycm9yKCdzdGFnZUV4ZWN1dGlvbkVycm9yJywgZXJyb3IudG9TdHJpbmcoKSk7XG4gICAgICAvLyBBcHBlbmQgbmFycmF0aXZlIGVycm9yIHNlbnRlbmNlIGZvciB0aGUgc2NvcGUtYmFzZWQgZGVjaWRlciBmYWlsdXJlXG4gICAgICAvLyBfUmVxdWlyZW1lbnRzOiAxMC4yX1xuICAgICAgdGhpcy5jdHgubmFycmF0aXZlR2VuZXJhdG9yLm9uRXJyb3Iobm9kZS5uYW1lLCBlcnJvci50b1N0cmluZygpLCBub2RlLmRpc3BsYXlOYW1lKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIC8vIENvbW1pdCB0aGUgZGVjaWRlcidzIHNjb3BlIHdyaXRlcyBiZWZvcmUgc2VsZWN0aW5nIHRoZSBicmFuY2hcbiAgICAvLyBXSFk6IEVuc3VyZXMgZG93bnN0cmVhbSBzdGFnZXMgc2VlIHRoZSBkZWNpZGVyJ3MgY29tbWl0dGVkIHN0YXRlLFxuICAgIC8vIGFuZCB0aGUgZXh0cmFjdG9yIGNhcHR1cmVzIHRoZSBwb3N0LWNvbW1pdCBzY29wZSBzbmFwc2hvdC5cbiAgICAvLyBfUmVxdWlyZW1lbnRzOiAyLjZfXG4gICAgY29udGV4dC5jb21taXQoKTtcblxuICAgIC8vIENhbGwgZXh0cmFjdG9yIHdpdGggdGhlIGJyYW5jaCBJRCBhcyBzdGFnZU91dHB1dCBzbyBpdCBhcHBlYXJzIGluIGVucmljaGVkIHNuYXBzaG90c1xuICAgIGNhbGxFeHRyYWN0b3Iobm9kZSwgY29udGV4dCwgZ2V0U3RhZ2VQYXRoKG5vZGUsIGJyYW5jaFBhdGgsIGNvbnRleHQuc3RhZ2VOYW1lKSwgYnJhbmNoSWQpO1xuXG4gICAgLy8gSWYgYnJlYWsgd2FzIGNhbGxlZCBkdXJpbmcgdGhlIGRlY2lkZXIsIHN0b3AgZXhlY3V0aW9uXG4gICAgaWYgKGJyZWFrRmxhZy5zaG91bGRCcmVhaykge1xuICAgICAgbG9nZ2VyLmluZm8oYEV4ZWN1dGlvbiBzdG9wcGVkIGluIHBpcGVsaW5lICgke2JyYW5jaFBhdGh9KSBhZnRlciAke25vZGUubmFtZX0gZHVlIHRvIGJyZWFrIGNvbmRpdGlvbi5gKTtcbiAgICAgIHJldHVybiBicmFuY2hJZDtcbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIGNoaWxkIGJ5IG1hdGNoaW5nIGJyYW5jaCBJRCBhZ2FpbnN0IG5vZGUuY2hpbGRyZW5cbiAgICAvLyBXSFk6IERpcmVjdCBJRCBtYXRjaGluZyB3aXRoIGRlZmF1bHQgZmFsbGJhY2sg4oCUIG5vIE5vZGVSZXNvbHZlciBuZWVkZWRcbiAgICAvLyBiZWNhdXNlIHRoZSBkZWNpZGVyIGZ1bmN0aW9uIGFscmVhZHkgcmV0dXJuZWQgdGhlIGV4YWN0IGJyYW5jaCBJRC5cbiAgICAvLyBfUmVxdWlyZW1lbnRzOiAyLjIsIDIuNF9cbiAgICBjb25zdCBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4gYXMgU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT5bXTtcbiAgICBsZXQgY2hvc2VuID0gY2hpbGRyZW4uZmluZCgoY2hpbGQpID0+IGNoaWxkLmlkID09PSBicmFuY2hJZCk7XG5cbiAgICAvLyBGYWxsIGJhY2sgdG8gZGVmYXVsdCBicmFuY2ggaWYgdGhlIHJldHVybmVkIElEIGRvZXNuJ3QgbWF0Y2ggYW55IGNoaWxkXG4gICAgLy8gV0hZOiBUaGUgZGVmYXVsdCBicmFuY2ggKHNldCB2aWEgYHNldERlZmF1bHQoKWApIGFjdHMgYXMgYSBjYXRjaC1hbGxcbiAgICAvLyBmb3IgdW5leHBlY3RlZCBicmFuY2ggSURzLCBwcmV2ZW50aW5nIHJ1bnRpbWUgZXJyb3JzLlxuICAgIC8vIF9SZXF1aXJlbWVudHM6IDIuNF9cbiAgICBpZiAoIWNob3Nlbikge1xuICAgICAgY29uc3QgZGVmYXVsdENoaWxkID0gY2hpbGRyZW4uZmluZCgoY2hpbGQpID0+IGNoaWxkLmlkID09PSAnZGVmYXVsdCcpO1xuICAgICAgaWYgKGRlZmF1bHRDaGlsZCkge1xuICAgICAgICBjaG9zZW4gPSBkZWZhdWx0Q2hpbGQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBgU2NvcGUtYmFzZWQgZGVjaWRlciAnJHtub2RlLm5hbWV9JyByZXR1cm5lZCBicmFuY2ggSUQgJyR7YnJhbmNoSWR9JyB3aGljaCBkb2Vzbid0IG1hdGNoIGFueSBjaGlsZCBhbmQgbm8gZGVmYXVsdCBicmFuY2ggaXMgc2V0YDtcbiAgICAgICAgY29udGV4dC5hZGRFcnJvcignZGVjaWRlckVycm9yJywgZXJyb3JNZXNzYWdlKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycm9yTWVzc2FnZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTG9nIGZsb3cgY29udHJvbCBkZWNpc2lvbiBmb3IgZGVjaWRlciBicmFuY2hcbiAgICAvLyBXSFk6IE5hcnJhdGl2ZSBzdHlsZSBoZWxwcyB3aXRoIGRlYnVnZ2luZyDigJQgdGhlIG1lc3NhZ2Ugc2hvdWxkIGV4cGxhaW5cbiAgICAvLyBXSElDSCBjb25kaXRpb24gbGVkIHRvIHRoaXMgYnJhbmNoLCBub3QganVzdCBzYXkgXCJjaG9zZSBYIHBhdGhcIi5cbiAgICAvLyBXZSByZWFkIGRlY2lkZXJSYXRpb25hbGUgZnJvbSBTdGFnZU1ldGFkYXRhIChkZWJ1ZyBsb2dzKSBpbnN0ZWFkIG9mIHNjb3BlXG4gICAgLy8gYmVjYXVzZSB0aGUgV3JpdGVCdWZmZXIgaGFzIGEgc3RhbGUtcmVhZCBidWc6IGFmdGVyIGNvbW1pdCgpIHJlc2V0cyB0aGVcbiAgICAvLyBidWZmZXIncyB3b3JraW5nQ29weSB0byBiYXNlU25hcHNob3QsIGdldFZhbHVlIHJlYWRzIHRoZSBzdGFsZSBiYXNlU25hcHNob3RcbiAgICAvLyB2YWx1ZSBmcm9tIGEgcHJldmlvdXMgaXRlcmF0aW9uIGluc3RlYWQgb2YgZmFsbGluZyB0aHJvdWdoIHRvIEdsb2JhbFN0b3JlLlxuICAgIC8vIFN0YWdlTWV0YWRhdGEgaXMgcGVyLWNvbnRleHQgYW5kIGRvZXNuJ3QgaGF2ZSB0aGlzIGlzc3VlLlxuICAgIC8vIF9SZXF1aXJlbWVudHM6IDMuNV9cbiAgICBjb25zdCBjaG9zZW5OYW1lID0gY2hvc2VuLmRpc3BsYXlOYW1lIHx8IGNob3Nlbi5uYW1lO1xuICAgIGNvbnN0IHdhc0RlZmF1bHQgPSBjaG9zZW4uaWQgIT09IGJyYW5jaElkO1xuICAgIGNvbnN0IHJhdGlvbmFsZSA9IGNvbnRleHQuZGVidWc/LmxvZ0NvbnRleHQ/LmRlY2lkZXJSYXRpb25hbGUgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGxldCBicmFuY2hSZWFzb246IHN0cmluZztcbiAgICBpZiAod2FzRGVmYXVsdCkge1xuICAgICAgYnJhbmNoUmVhc29uID0gYFJldHVybmVkICcke2JyYW5jaElkfScgKG5vIG1hdGNoKSwgZmVsbCBiYWNrIHRvIGRlZmF1bHQg4oaSICR7Y2hvc2VuTmFtZX0gcGF0aC5gO1xuICAgIH0gZWxzZSBpZiAocmF0aW9uYWxlKSB7XG4gICAgICBicmFuY2hSZWFzb24gPSBgQmFzZWQgb246ICR7cmF0aW9uYWxlfSDihpIgY2hvc2UgJHtjaG9zZW5OYW1lfSBwYXRoLmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyYW5jaFJlYXNvbiA9IGBFdmFsdWF0ZWQgc2NvcGUgYW5kIHJldHVybmVkICcke2JyYW5jaElkfScg4oaSIGNob3NlICR7Y2hvc2VuTmFtZX0gcGF0aC5gO1xuICAgIH1cbiAgICBjb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoJ2JyYW5jaCcsIGJyYW5jaFJlYXNvbiwge1xuICAgICAgdGFyZ2V0U3RhZ2U6IGNob3Nlbi5uYW1lLFxuICAgICAgcmF0aW9uYWxlOiByYXRpb25hbGUgfHwgYHJldHVybmVkIGJyYW5jaElkOiAke2JyYW5jaElkfWAsXG4gICAgfSk7XG5cbiAgICAvLyBBcHBlbmQgbmFycmF0aXZlIHNlbnRlbmNlIGZvciB0aGUgc2NvcGUtYmFzZWQgZGVjaXNpb25cbiAgICAvLyBXSFk6IFNjb3BlLWJhc2VkIGRlY2lkZXJzIGFyZSBmaXJzdC1jbGFzcyBkZWNpc2lvbnMg4oCUIHRoZSBuYXJyYXRpdmUgc2hvdWxkXG4gICAgLy8gY2FwdHVyZSB0aGUgYnJhbmNoIGNob3NlbiBhbmQgcmF0aW9uYWxlIGp1c3QgbGlrZSBsZWdhY3kgZGVjaWRlcnMuXG4gICAgLy8gX1JlcXVpcmVtZW50czogNC4yLCA0LjNfXG4gICAgdGhpcy5jdHgubmFycmF0aXZlR2VuZXJhdG9yLm9uRGVjaXNpb24obm9kZS5uYW1lLCBjaG9zZW4ubmFtZSwgY2hvc2VuLmRpc3BsYXlOYW1lLCByYXRpb25hbGUsIG5vZGUuZGVzY3JpcHRpb24pO1xuXG4gICAgLy8gQ29udGludWUgZXhlY3V0aW9uIHdpdGggdGhlIGNob3NlbiBjaGlsZFxuICAgIC8vIFdIWTogQ3JlYXRlIG5leHQgY29udGV4dCBmcm9tIHRoZSBjdXJyZW50IGNvbnRleHQgc28gdGhlIGNob3NlbiBjaGlsZFxuICAgIC8vIGdldHMgaXRzIG93biBub2RlIGluIHRoZSBjb250ZXh0IHRyZWUgZm9yIHByb3BlciBkZWJ1ZyB2aXNpYmlsaXR5LlxuICAgIGNvbnN0IG5leHRTdGFnZUNvbnRleHQgPSBjb250ZXh0LmNyZWF0ZU5leHQoYnJhbmNoUGF0aCBhcyBzdHJpbmcsIGNob3Nlbi5uYW1lKTtcbiAgICByZXR1cm4gZXhlY3V0ZU5vZGUoY2hvc2VuLCBuZXh0U3RhZ2VDb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgpO1xuICB9XG59XG4iXX0=