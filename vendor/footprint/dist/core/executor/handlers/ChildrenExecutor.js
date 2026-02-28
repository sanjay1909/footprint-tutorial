"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildrenExecutor = void 0;
const logger_1 = require("../../../utils/logger");
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
class ChildrenExecutor {
    constructor(ctx, executeNode) {
        this.ctx = ctx;
        this.executeNode = executeNode;
    }
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
    async executeNodeChildren(node, context, parentBreakFlag, pipelineId) {
        var _a, _b, _c;
        let breakCount = 0;
        const totalChildren = (_b = (_a = node.children) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
        // Append narrative sentence for the fork (all children in parallel)
        // WHY: Captures the fan-out so the reader knows which paths ran concurrently.
        // _Requirements: 5.1_
        const allChildren = (_c = node.children) !== null && _c !== void 0 ? _c : [];
        const childDisplayNames = allChildren.map((c) => c.displayName || c.name);
        this.ctx.narrativeGenerator.onFork(node.displayName || node.name, childDisplayNames);
        const childPromises = allChildren.map((child) => {
            const pipelineIdForChild = pipelineId || child.id;
            const childContext = context.createChild(pipelineIdForChild, child.id, child.name);
            const childBreakFlag = { shouldBreak: false };
            // WHY: Track break count to propagate break to parent when ALL children break
            const updateParentBreakFlag = () => {
                if (childBreakFlag.shouldBreak)
                    breakCount += 1;
                if (parentBreakFlag && breakCount === totalChildren)
                    parentBreakFlag.shouldBreak = true;
            };
            return this.executeNode(child, childContext, childBreakFlag, pipelineIdForChild)
                .then((result) => {
                childContext.commit();
                updateParentBreakFlag();
                return { id: child.id, result, isError: false };
            })
                .catch((error) => {
                childContext.commit();
                updateParentBreakFlag();
                logger_1.logger.info(`TREE PIPELINE: executeNodeChildren - Error for id: ${child === null || child === void 0 ? void 0 : child.id}`, { error });
                // WHY: Flag throttling errors in context for graceful degradation
                if (this.ctx.throttlingErrorChecker && this.ctx.throttlingErrorChecker(error)) {
                    childContext.updateObject(['monitor'], 'isThrottled', true);
                }
                return { id: child.id, result: error, isError: true };
            });
        });
        const settled = await Promise.allSettled(childPromises);
        const childrenResults = {};
        settled.forEach((s) => {
            if (s.status === 'fulfilled') {
                const { id, result, isError } = s.value;
                // Store the full NodeResultType including id
                childrenResults[id] = { id, result, isError: isError !== null && isError !== void 0 ? isError : false };
            }
            else {
                logger_1.logger.error(`Execution failed: ${s.reason}`);
            }
        });
        return childrenResults;
    }
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
    async executeSelectedChildren(selector, children, input, context, branchPath) {
        // Invoke selector
        const selectorResult = await selector(input);
        // Normalize to array (selector can return single ID or array)
        const selectedIds = Array.isArray(selectorResult) ? selectorResult : [selectorResult];
        // Record selection in debug info for visualization
        context.addLog('selectedChildIds', selectedIds);
        context.addLog('selectorPattern', 'multi-choice');
        // Empty selection - skip children execution
        if (selectedIds.length === 0) {
            context.addLog('skippedAllChildren', true);
            return {};
        }
        // Filter to selected children
        const selectedChildren = children.filter((c) => selectedIds.includes(c.id));
        // Validate all IDs found (fail fast on invalid IDs)
        if (selectedChildren.length !== selectedIds.length) {
            const childIds = children.map((c) => c.id);
            const missing = selectedIds.filter((id) => !childIds.includes(id));
            const errorMessage = `Selector returned unknown child IDs: ${missing.join(', ')}. Available: ${childIds.join(', ')}`;
            logger_1.logger.error(`Error in pipeline (${branchPath}):`, { error: errorMessage });
            context.addError('selectorError', errorMessage);
            throw new Error(errorMessage);
        }
        // Record skipped children for visualization
        const skippedIds = children.filter((c) => !selectedIds.includes(c.id)).map((c) => c.id);
        if (skippedIds.length > 0) {
            context.addLog('skippedChildIds', skippedIds);
        }
        // Log flow control decision for selector multi-choice
        const selectedNames = selectedChildren.map((c) => c.displayName || c.name).join(', ');
        context.addFlowDebugMessage('selected', `Running ${selectedNames} (${selectedChildren.length} of ${children.length} matched)`, {
            count: selectedChildren.length,
            targetStage: selectedChildren.map((c) => c.name),
        });
        // Append narrative sentence for the selector (subset of children)
        // WHY: Captures which children were selected and how many were available,
        // so the reader understands the selection decision.
        // _Requirements: 5.2_
        const selectedDisplayNames = selectedChildren.map((c) => c.displayName || c.name);
        this.ctx.narrativeGenerator.onSelected(context.stageName || 'selector', selectedDisplayNames, children.length);
        // Execute selected children in parallel using existing logic
        // WHY: Reuse executeNodeChildren to avoid duplicating parallel execution logic
        const tempNode = { name: 'selector-temp', children: selectedChildren };
        return await this.executeNodeChildren(tempNode, context, undefined, branchPath);
    }
}
exports.ChildrenExecutor = ChildrenExecutor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hpbGRyZW5FeGVjdXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9jb3JlL2V4ZWN1dG9yL2hhbmRsZXJzL0NoaWxkcmVuRXhlY3V0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F3Qkc7OztBQUdILGtEQUErQztBQW1CL0M7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7QUFDSCxNQUFhLGdCQUFnQjtJQUMzQixZQUNVLEdBQWtDLEVBQ2xDLFdBQXdDO1FBRHhDLFFBQUcsR0FBSCxHQUFHLENBQStCO1FBQ2xDLGdCQUFXLEdBQVgsV0FBVyxDQUE2QjtJQUMvQyxDQUFDO0lBRUo7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQWtCRztJQUNILEtBQUssQ0FBQyxtQkFBbUIsQ0FDdkIsSUFBNkIsRUFDN0IsT0FBcUIsRUFDckIsZUFBMEMsRUFDMUMsVUFBbUI7O1FBRW5CLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNuQixNQUFNLGFBQWEsR0FBRyxNQUFBLE1BQUEsSUFBSSxDQUFDLFFBQVEsMENBQUUsTUFBTSxtQ0FBSSxDQUFDLENBQUM7UUFFakQsb0VBQW9FO1FBQ3BFLDhFQUE4RTtRQUM5RSxzQkFBc0I7UUFDdEIsTUFBTSxXQUFXLEdBQUcsTUFBQSxJQUFJLENBQUMsUUFBUSxtQ0FBSSxFQUFFLENBQUM7UUFDeEMsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUVyRixNQUFNLGFBQWEsR0FBOEIsV0FBVyxDQUFDLEdBQUcs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QUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1NBQ2pELENBQ0YsQ0FBQztRQUVGLGtFQUFrRTtRQUNsRSwwRUFBMEU7UUFDMUUsb0RBQW9EO1FBQ3BELHNCQUFzQjtRQUN0QixNQUFNLG9CQUFvQixHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQ3BDLE9BQU8sQ0FBQyxTQUFTLElBQUksVUFBVSxFQUMvQixvQkFBb0IsRUFDcEIsUUFBUSxDQUFDLE1BQU0sQ0FDaEIsQ0FBQztRQUVGLDZEQUE2RDtRQUM3RCwrRUFBK0U7UUFDL0UsTUFBTSxRQUFRLEdBQTRCLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztRQUNoRyxPQUFPLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7Q0FDRjtBQWpMRCw0Q0FpTEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENoaWxkcmVuRXhlY3V0b3IudHNcbiAqXG4gKiBXSFk6IEhhbmRsZXMgcGFyYWxsZWwgY2hpbGRyZW4gZXhlY3V0aW9uIGFuZCBzZWxlY3Rvci1iYXNlZCBicmFuY2hpbmcgZm9yIHRoZSBQaXBlbGluZS5cbiAqIFRoaXMgbW9kdWxlIGlzIGV4dHJhY3RlZCBmcm9tIFBpcGVsaW5lLnRzIGZvbGxvd2luZyB0aGUgU2luZ2xlIFJlc3BvbnNpYmlsaXR5IFByaW5jaXBsZSxcbiAqIGlzb2xhdGluZyB0aGUgY29uY2VybnMgb2YgcGFyYWxsZWwgZXhlY3V0aW9uIGZyb20gcGlwZWxpbmUgdHJhdmVyc2FsLlxuICpcbiAqIFJFU1BPTlNJQklMSVRJRVM6XG4gKiAtIEV4ZWN1dGUgYWxsIGNoaWxkcmVuIGluIHBhcmFsbGVsIHVzaW5nIFByb21pc2UuYWxsU2V0dGxlZFxuICogLSBFeGVjdXRlIHNlbGVjdGVkIGNoaWxkcmVuIGJhc2VkIG9uIHNlbGVjdG9yIG91dHB1dCAobXVsdGktY2hvaWNlIGJyYW5jaGluZylcbiAqIC0gSGFuZGxlIHRocm90dGxpbmcgZXJyb3IgZmxhZ2dpbmcgZm9yIHJhdGUtbGltaXRlZCBvcGVyYXRpb25zXG4gKiAtIEFnZ3JlZ2F0ZSByZXN1bHRzIGludG8geyBjaGlsZElkOiB7IHJlc3VsdCwgaXNFcnJvciB9IH0gc3RydWN0dXJlXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gVXNlcyBQcm9taXNlLmFsbFNldHRsZWQgdG8gZW5zdXJlIGFsbCBjaGlsZHJlbiBjb21wbGV0ZSBldmVuIGlmIHNvbWUgZmFpbFxuICogLSBUaHJvdHRsaW5nIGVycm9ycyBhcmUgZmxhZ2dlZCBpbiBjb250ZXh0IHJhdGhlciB0aGFuIHRocm93biwgYWxsb3dpbmcgZ3JhY2VmdWwgZGVncmFkYXRpb25cbiAqIC0gU2VsZWN0b3IgdmFsaWRhdGlvbiBoYXBwZW5zIGJlZm9yZSBleGVjdXRpb24gdG8gZmFpbCBmYXN0IG9uIGludmFsaWQgSURzXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIFBpcGVsaW5lfSAtIE9yY2hlc3RyYXRlcyB3aGVuIGNoaWxkcmVuIGFyZSBleGVjdXRlZFxuICogLSB7QGxpbmsgU3RhZ2VDb250ZXh0fSAtIFByb3ZpZGVzIGNoaWxkIGNvbnRleHQgY3JlYXRpb24gYW5kIHBhdGNoIG1hbmFnZW1lbnRcbiAqIC0ge0BsaW5rIE5vZGVSZXNvbHZlcn0gLSBVc2VkIGZvciBub2RlIGxvb2t1cCBpbiBzZWxlY3RvciBzY2VuYXJpb3NcbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiAyLjEsIDIuMiwgMi4zLCAyLjQsIDIuNV9cbiAqL1xuXG5pbXBvcnQgeyBTdGFnZUNvbnRleHQgfSBmcm9tICcuLi8uLi9tZW1vcnkvU3RhZ2VDb250ZXh0JztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvZ2dlcic7XG5pbXBvcnQgeyBQaXBlbGluZUNvbnRleHQsIE5vZGVSZXN1bHRUeXBlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBTdGFnZU5vZGUsIFNlbGVjdG9yIH0gZnJvbSAnLi4vUGlwZWxpbmUnO1xuXG4vKipcbiAqIEV4ZWN1dGVOb2RlRm5cbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogQ2FsbGJhY2sgdHlwZSBmb3IgZXhlY3V0aW5nIGEgc2luZ2xlIG5vZGUuXG4gKlxuICogV0hZOiBQYXNzZWQgZnJvbSBQaXBlbGluZSB0byBhdm9pZCBjaXJjdWxhciBkZXBlbmRlbmN5LiBUaGlzIGFsbG93c1xuICogQ2hpbGRyZW5FeGVjdXRvciB0byByZWN1cnNpdmVseSBleGVjdXRlIGNoaWxkIG5vZGVzIHdpdGhvdXQgaW1wb3J0aW5nIFBpcGVsaW5lLlxuICovXG5leHBvcnQgdHlwZSBFeGVjdXRlTm9kZUZuPFRPdXQgPSBhbnksIFRTY29wZSA9IGFueT4gPSAoXG4gIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICBicmFuY2hQYXRoPzogc3RyaW5nLFxuKSA9PiBQcm9taXNlPGFueT47XG5cbi8qKlxuICogQ2hpbGRyZW5FeGVjdXRvclxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBIYW5kbGVzIHBhcmFsbGVsIGNoaWxkcmVuIGV4ZWN1dGlvbiBhbmQgc2VsZWN0b3ItYmFzZWQgYnJhbmNoaW5nLlxuICpcbiAqIFdIWTogQ2VudHJhbGl6ZXMgYWxsIHBhcmFsbGVsIGV4ZWN1dGlvbiBsb2dpYyBpbiBvbmUgcGxhY2UsIG1ha2luZyBpdCBlYXNpZXJcbiAqIHRvIHVuZGVyc3RhbmQgYW5kIHRlc3QgaG93IGNoaWxkcmVuIGFyZSBleGVjdXRlZCBkdXJpbmcgZm9yayBvcGVyYXRpb25zLlxuICpcbiAqIERFU0lHTjogVXNlcyBQaXBlbGluZUNvbnRleHQgZm9yIGFjY2VzcyB0byB0aHJvdHRsaW5nIGNoZWNrZXIsIGVuYWJsaW5nXG4gKiBkZXBlbmRlbmN5IGluamVjdGlvbiBmb3IgdGVzdGluZy5cbiAqXG4gKiBAdGVtcGxhdGUgVE91dCAtIE91dHB1dCB0eXBlIG9mIHBpcGVsaW5lIHN0YWdlc1xuICogQHRlbXBsYXRlIFRTY29wZSAtIFNjb3BlIHR5cGUgcGFzc2VkIHRvIHN0YWdlc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBleGVjdXRvciA9IG5ldyBDaGlsZHJlbkV4ZWN1dG9yKHBpcGVsaW5lQ29udGV4dCwgZXhlY3V0ZU5vZGVGbik7XG4gKiBjb25zdCByZXN1bHRzID0gYXdhaXQgZXhlY3V0b3IuZXhlY3V0ZU5vZGVDaGlsZHJlbihub2RlLCBjb250ZXh0KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgQ2hpbGRyZW5FeGVjdXRvcjxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+IHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IFBpcGVsaW5lQ29udGV4dDxUT3V0LCBUU2NvcGU+LFxuICAgIHByaXZhdGUgZXhlY3V0ZU5vZGU6IEV4ZWN1dGVOb2RlRm48VE91dCwgVFNjb3BlPixcbiAgKSB7fVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGFsbCBjaGlsZHJlbiBpbiBwYXJhbGxlbDsgYWx3YXlzIGNvbW1pdCBlYWNoIGNoaWxkIHBhdGNoIG9uIHNldHRsZS5cbiAgICpcbiAgICogV0hZOiBGb3JrIG5vZGVzIG5lZWQgdG8gZXhlY3V0ZSBhbGwgY2hpbGRyZW4gY29uY3VycmVudGx5IGZvciBwZXJmb3JtYW5jZS5cbiAgICogVXNpbmcgUHJvbWlzZS5hbGxTZXR0bGVkIGVuc3VyZXMgYWxsIGNoaWxkcmVuIGNvbXBsZXRlIGV2ZW4gaWYgc29tZSBmYWlsLFxuICAgKiBhbGxvd2luZyB0aGUgcGlwZWxpbmUgdG8gY29udGludWUgd2l0aCBwYXJ0aWFsIHJlc3VsdHMuXG4gICAqXG4gICAqIERFU0lHTjogQWdncmVnYXRlcyBhIGB7IGNoaWxkSWQ6IHsgcmVzdWx0LCBpc0Vycm9yIH0gfWAgb2JqZWN0IChzaW1pbGFyIHRvXG4gICAqIGBQcm9taXNlLmFsbFNldHRsZWRgKS4gSWYgYHRocm90dGxpbmdFcnJvckNoZWNrZXJgIGlzIHByb3ZpZGVkLCB3ZSBmbGFnXG4gICAqIGBtb25pdG9yLmlzVGhyb3R0bGVkID0gdHJ1ZWAgaW4gdGhlIGNoaWxkIGNvbnRleHQgd2hlbiBpdCBtYXRjaGVzIHRoZSB0aHJvd24gZXJyb3IuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gUGFyZW50IG5vZGUgY29udGFpbmluZyBjaGlsZHJlbiB0byBleGVjdXRlXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gUGFyZW50IHN0YWdlIGNvbnRleHRcbiAgICogQHBhcmFtIHBhcmVudEJyZWFrRmxhZyAtIE9wdGlvbmFsIGJyZWFrIGZsYWcgdG8gcHJvcGFnYXRlIHdoZW4gYWxsIGNoaWxkcmVuIGJyZWFrXG4gICAqIEBwYXJhbSBwaXBlbGluZUlkIC0gUGlwZWxpbmUgSUQgZm9yIGNoaWxkIGNvbnRleHQgY3JlYXRpb25cbiAgICogQHJldHVybnMgT2JqZWN0IG1hcHBpbmcgY2hpbGQgSURzIHRvIHRoZWlyIHJlc3VsdHNcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMi4xLCAyLjNfXG4gICAqL1xuICBhc3luYyBleGVjdXRlTm9kZUNoaWxkcmVuKFxuICAgIG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgICBwYXJlbnRCcmVha0ZsYWc/OiB7IHNob3VsZEJyZWFrOiBib29sZWFuIH0sXG4gICAgcGlwZWxpbmVJZD86IHN0cmluZyxcbiAgKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBOb2RlUmVzdWx0VHlwZT4+IHtcbiAgICBsZXQgYnJlYWtDb3VudCA9IDA7XG4gICAgY29uc3QgdG90YWxDaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4/Lmxlbmd0aCA/PyAwO1xuXG4gICAgLy8gQXBwZW5kIG5hcnJhdGl2ZSBzZW50ZW5jZSBmb3IgdGhlIGZvcmsgKGFsbCBjaGlsZHJlbiBpbiBwYXJhbGxlbClcbiAgICAvLyBXSFk6IENhcHR1cmVzIHRoZSBmYW4tb3V0IHNvIHRoZSByZWFkZXIga25vd3Mgd2hpY2ggcGF0aHMgcmFuIGNvbmN1cnJlbnRseS5cbiAgICAvLyBfUmVxdWlyZW1lbnRzOiA1LjFfXG4gICAgY29uc3QgYWxsQ2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuID8/IFtdO1xuICAgIGNvbnN0IGNoaWxkRGlzcGxheU5hbWVzID0gYWxsQ2hpbGRyZW4ubWFwKChjKSA9PiBjLmRpc3BsYXlOYW1lIHx8IGMubmFtZSk7XG4gICAgdGhpcy5jdHgubmFycmF0aXZlR2VuZXJhdG9yLm9uRm9yayhub2RlLmRpc3BsYXlOYW1lIHx8IG5vZGUubmFtZSwgY2hpbGREaXNwbGF5TmFtZXMpO1xuXG4gICAgY29uc3QgY2hpbGRQcm9taXNlczogUHJvbWlzZTxOb2RlUmVzdWx0VHlwZT5bXSA9IGFsbENoaWxkcmVuLm1hcCgoY2hpbGQ6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+KSA9PiB7XG4gICAgICBjb25zdCBwaXBlbGluZUlkRm9yQ2hpbGQgPSBwaXBlbGluZUlkIHx8IGNoaWxkLmlkO1xuICAgICAgY29uc3QgY2hpbGRDb250ZXh0ID0gY29udGV4dC5jcmVhdGVDaGlsZChwaXBlbGluZUlkRm9yQ2hpbGQgYXMgc3RyaW5nLCBjaGlsZC5pZCBhcyBzdHJpbmcsIGNoaWxkLm5hbWUpO1xuICAgICAgY29uc3QgY2hpbGRCcmVha0ZsYWcgPSB7IHNob3VsZEJyZWFrOiBmYWxzZSB9O1xuXG4gICAgICAvLyBXSFk6IFRyYWNrIGJyZWFrIGNvdW50IHRvIHByb3BhZ2F0ZSBicmVhayB0byBwYXJlbnQgd2hlbiBBTEwgY2hpbGRyZW4gYnJlYWtcbiAgICAgIGNvbnN0IHVwZGF0ZVBhcmVudEJyZWFrRmxhZyA9ICgpID0+IHtcbiAgICAgICAgaWYgKGNoaWxkQnJlYWtGbGFnLnNob3VsZEJyZWFrKSBicmVha0NvdW50ICs9IDE7XG4gICAgICAgIGlmIChwYXJlbnRCcmVha0ZsYWcgJiYgYnJlYWtDb3VudCA9PT0gdG90YWxDaGlsZHJlbikgcGFyZW50QnJlYWtGbGFnLnNob3VsZEJyZWFrID0gdHJ1ZTtcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVOb2RlKGNoaWxkLCBjaGlsZENvbnRleHQsIGNoaWxkQnJlYWtGbGFnLCBwaXBlbGluZUlkRm9yQ2hpbGQpXG4gICAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBjaGlsZENvbnRleHQuY29tbWl0KCk7XG4gICAgICAgICAgdXBkYXRlUGFyZW50QnJlYWtGbGFnKCk7XG4gICAgICAgICAgcmV0dXJuIHsgaWQ6IGNoaWxkLmlkISwgcmVzdWx0LCBpc0Vycm9yOiBmYWxzZSB9O1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgY2hpbGRDb250ZXh0LmNvbW1pdCgpO1xuICAgICAgICAgIHVwZGF0ZVBhcmVudEJyZWFrRmxhZygpO1xuICAgICAgICAgIGxvZ2dlci5pbmZvKGBUUkVFIFBJUEVMSU5FOiBleGVjdXRlTm9kZUNoaWxkcmVuIC0gRXJyb3IgZm9yIGlkOiAke2NoaWxkPy5pZH1gLCB7IGVycm9yIH0pO1xuICAgICAgICAgIC8vIFdIWTogRmxhZyB0aHJvdHRsaW5nIGVycm9ycyBpbiBjb250ZXh0IGZvciBncmFjZWZ1bCBkZWdyYWRhdGlvblxuICAgICAgICAgIGlmICh0aGlzLmN0eC50aHJvdHRsaW5nRXJyb3JDaGVja2VyICYmIHRoaXMuY3R4LnRocm90dGxpbmdFcnJvckNoZWNrZXIoZXJyb3IpKSB7XG4gICAgICAgICAgICBjaGlsZENvbnRleHQudXBkYXRlT2JqZWN0KFsnbW9uaXRvciddLCAnaXNUaHJvdHRsZWQnLCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgaWQ6IGNoaWxkLmlkISwgcmVzdWx0OiBlcnJvciwgaXNFcnJvcjogdHJ1ZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNldHRsZWQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoY2hpbGRQcm9taXNlcyk7XG5cbiAgICBjb25zdCBjaGlsZHJlblJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIE5vZGVSZXN1bHRUeXBlPiA9IHt9O1xuICAgIHNldHRsZWQuZm9yRWFjaCgocykgPT4ge1xuICAgICAgaWYgKHMuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuICAgICAgICBjb25zdCB7IGlkLCByZXN1bHQsIGlzRXJyb3IgfSA9IHMudmFsdWU7XG4gICAgICAgIC8vIFN0b3JlIHRoZSBmdWxsIE5vZGVSZXN1bHRUeXBlIGluY2x1ZGluZyBpZFxuICAgICAgICBjaGlsZHJlblJlc3VsdHNbaWRdID0geyBpZCwgcmVzdWx0LCBpc0Vycm9yOiBpc0Vycm9yID8/IGZhbHNlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEV4ZWN1dGlvbiBmYWlsZWQ6ICR7cy5yZWFzb259YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY2hpbGRyZW5SZXN1bHRzO1xuICB9XG5cbiAgLyoqXG4gICAqIEV4ZWN1dGUgc2VsZWN0ZWQgY2hpbGRyZW4gYmFzZWQgb24gc2VsZWN0b3IgcmVzdWx0LlxuICAgKlxuICAgKiBXSFk6IFNlbGVjdG9yIGVuYWJsZXMgbXVsdGktY2hvaWNlIGJyYW5jaGluZyB3aGVyZSBvbmx5IGEgc3Vic2V0IG9mIGNoaWxkcmVuXG4gICAqIGFyZSBleGVjdXRlZCBiYXNlZCBvbiBydW50aW1lIGNvbmRpdGlvbnMuIFRoaXMgaXMgbW9yZSBmbGV4aWJsZSB0aGFuIGRlY2lkZXJcbiAgICogKHdoaWNoIHBpY2tzIGV4YWN0bHkgb25lKSBvciBmb3JrICh3aGljaCBleGVjdXRlcyBhbGwpLlxuICAgKlxuICAgKiBERVNJR046IFVubGlrZSBleGVjdXRlTm9kZUNoaWxkcmVuICh3aGljaCBleGVjdXRlcyBBTEwgY2hpbGRyZW4pLCB0aGlzIG1ldGhvZDpcbiAgICogMS4gSW52b2tlcyB0aGUgc2VsZWN0b3IgdG8gZGV0ZXJtaW5lIHdoaWNoIGNoaWxkcmVuIHRvIGV4ZWN1dGVcbiAgICogMi4gVmFsaWRhdGVzIGFsbCByZXR1cm5lZCBJRHMgZXhpc3QgaW4gdGhlIGNoaWxkcmVuIGFycmF5IChmYWlsIGZhc3QpXG4gICAqIDMuIEV4ZWN1dGVzIG9ubHkgdGhlIHNlbGVjdGVkIGNoaWxkcmVuIGluIHBhcmFsbGVsXG4gICAqIDQuIFJlY29yZHMgc2VsZWN0aW9uIGluZm8gaW4gY29udGV4dCBkZWJ1ZyBpbmZvIGZvciB2aXN1YWxpemF0aW9uXG4gICAqXG4gICAqIEBwYXJhbSBzZWxlY3RvciAtIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyBzZWxlY3RlZCBjaGlsZCBJRChzKVxuICAgKiBAcGFyYW0gY2hpbGRyZW4gLSBBcnJheSBvZiBjaGlsZCBub2RlcyB0byBzZWxlY3QgZnJvbVxuICAgKiBAcGFyYW0gaW5wdXQgLSBJbnB1dCB0byBwYXNzIHRvIHRoZSBzZWxlY3RvciBmdW5jdGlvblxuICAgKiBAcGFyYW0gY29udGV4dCAtIEN1cnJlbnQgc3RhZ2UgY29udGV4dFxuICAgKiBAcGFyYW0gYnJhbmNoUGF0aCAtIFBpcGVsaW5lIGJyYW5jaCBwYXRoIGZvciBsb2dnaW5nXG4gICAqIEByZXR1cm5zIE9iamVjdCBtYXBwaW5nIGNoaWxkIElEcyB0byB0aGVpciByZXN1bHRzXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDIuMl9cbiAgICovXG4gIGFzeW5jIGV4ZWN1dGVTZWxlY3RlZENoaWxkcmVuKFxuICAgIHNlbGVjdG9yOiBTZWxlY3RvcixcbiAgICBjaGlsZHJlbjogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT5bXSxcbiAgICBpbnB1dDogYW55LFxuICAgIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgICBicmFuY2hQYXRoOiBzdHJpbmcsXG4gICk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgTm9kZVJlc3VsdFR5cGU+PiB7XG4gICAgLy8gSW52b2tlIHNlbGVjdG9yXG4gICAgY29uc3Qgc2VsZWN0b3JSZXN1bHQgPSBhd2FpdCBzZWxlY3RvcihpbnB1dCk7XG5cbiAgICAvLyBOb3JtYWxpemUgdG8gYXJyYXkgKHNlbGVjdG9yIGNhbiByZXR1cm4gc2luZ2xlIElEIG9yIGFycmF5KVxuICAgIGNvbnN0IHNlbGVjdGVkSWRzID0gQXJyYXkuaXNBcnJheShzZWxlY3RvclJlc3VsdCkgPyBzZWxlY3RvclJlc3VsdCA6IFtzZWxlY3RvclJlc3VsdF07XG5cbiAgICAvLyBSZWNvcmQgc2VsZWN0aW9uIGluIGRlYnVnIGluZm8gZm9yIHZpc3VhbGl6YXRpb25cbiAgICBjb250ZXh0LmFkZExvZygnc2VsZWN0ZWRDaGlsZElkcycsIHNlbGVjdGVkSWRzKTtcbiAgICBjb250ZXh0LmFkZExvZygnc2VsZWN0b3JQYXR0ZXJuJywgJ211bHRpLWNob2ljZScpO1xuXG4gICAgLy8gRW1wdHkgc2VsZWN0aW9uIC0gc2tpcCBjaGlsZHJlbiBleGVjdXRpb25cbiAgICBpZiAoc2VsZWN0ZWRJZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb250ZXh0LmFkZExvZygnc2tpcHBlZEFsbENoaWxkcmVuJywgdHJ1ZSk7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgLy8gRmlsdGVyIHRvIHNlbGVjdGVkIGNoaWxkcmVuXG4gICAgY29uc3Qgc2VsZWN0ZWRDaGlsZHJlbiA9IGNoaWxkcmVuLmZpbHRlcigoYykgPT4gc2VsZWN0ZWRJZHMuaW5jbHVkZXMoYy5pZCEpKTtcblxuICAgIC8vIFZhbGlkYXRlIGFsbCBJRHMgZm91bmQgKGZhaWwgZmFzdCBvbiBpbnZhbGlkIElEcylcbiAgICBpZiAoc2VsZWN0ZWRDaGlsZHJlbi5sZW5ndGggIT09IHNlbGVjdGVkSWRzLmxlbmd0aCkge1xuICAgICAgY29uc3QgY2hpbGRJZHMgPSBjaGlsZHJlbi5tYXAoKGMpID0+IGMuaWQpO1xuICAgICAgY29uc3QgbWlzc2luZyA9IHNlbGVjdGVkSWRzLmZpbHRlcigoaWQpID0+ICFjaGlsZElkcy5pbmNsdWRlcyhpZCkpO1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gYFNlbGVjdG9yIHJldHVybmVkIHVua25vd24gY2hpbGQgSURzOiAke21pc3Npbmcuam9pbignLCAnKX0uIEF2YWlsYWJsZTogJHtjaGlsZElkcy5qb2luKCcsICcpfWA7XG4gICAgICBsb2dnZXIuZXJyb3IoYEVycm9yIGluIHBpcGVsaW5lICgke2JyYW5jaFBhdGh9KTpgLCB7IGVycm9yOiBlcnJvck1lc3NhZ2UgfSk7XG4gICAgICBjb250ZXh0LmFkZEVycm9yKCdzZWxlY3RvckVycm9yJywgZXJyb3JNZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpO1xuICAgIH1cblxuICAgIC8vIFJlY29yZCBza2lwcGVkIGNoaWxkcmVuIGZvciB2aXN1YWxpemF0aW9uXG4gICAgY29uc3Qgc2tpcHBlZElkcyA9IGNoaWxkcmVuLmZpbHRlcigoYykgPT4gIXNlbGVjdGVkSWRzLmluY2x1ZGVzKGMuaWQhKSkubWFwKChjKSA9PiBjLmlkKTtcbiAgICBpZiAoc2tpcHBlZElkcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb250ZXh0LmFkZExvZygnc2tpcHBlZENoaWxkSWRzJywgc2tpcHBlZElkcyk7XG4gICAgfVxuXG4gICAgLy8gTG9nIGZsb3cgY29udHJvbCBkZWNpc2lvbiBmb3Igc2VsZWN0b3IgbXVsdGktY2hvaWNlXG4gICAgY29uc3Qgc2VsZWN0ZWROYW1lcyA9IHNlbGVjdGVkQ2hpbGRyZW4ubWFwKChjKSA9PiBjLmRpc3BsYXlOYW1lIHx8IGMubmFtZSkuam9pbignLCAnKTtcbiAgICBjb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoXG4gICAgICAnc2VsZWN0ZWQnLFxuICAgICAgYFJ1bm5pbmcgJHtzZWxlY3RlZE5hbWVzfSAoJHtzZWxlY3RlZENoaWxkcmVuLmxlbmd0aH0gb2YgJHtjaGlsZHJlbi5sZW5ndGh9IG1hdGNoZWQpYCxcbiAgICAgIHtcbiAgICAgICAgY291bnQ6IHNlbGVjdGVkQ2hpbGRyZW4ubGVuZ3RoLFxuICAgICAgICB0YXJnZXRTdGFnZTogc2VsZWN0ZWRDaGlsZHJlbi5tYXAoKGMpID0+IGMubmFtZSksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBcHBlbmQgbmFycmF0aXZlIHNlbnRlbmNlIGZvciB0aGUgc2VsZWN0b3IgKHN1YnNldCBvZiBjaGlsZHJlbilcbiAgICAvLyBXSFk6IENhcHR1cmVzIHdoaWNoIGNoaWxkcmVuIHdlcmUgc2VsZWN0ZWQgYW5kIGhvdyBtYW55IHdlcmUgYXZhaWxhYmxlLFxuICAgIC8vIHNvIHRoZSByZWFkZXIgdW5kZXJzdGFuZHMgdGhlIHNlbGVjdGlvbiBkZWNpc2lvbi5cbiAgICAvLyBfUmVxdWlyZW1lbnRzOiA1LjJfXG4gICAgY29uc3Qgc2VsZWN0ZWREaXNwbGF5TmFtZXMgPSBzZWxlY3RlZENoaWxkcmVuLm1hcCgoYykgPT4gYy5kaXNwbGF5TmFtZSB8fCBjLm5hbWUpO1xuICAgIHRoaXMuY3R4Lm5hcnJhdGl2ZUdlbmVyYXRvci5vblNlbGVjdGVkKFxuICAgICAgY29udGV4dC5zdGFnZU5hbWUgfHwgJ3NlbGVjdG9yJyxcbiAgICAgIHNlbGVjdGVkRGlzcGxheU5hbWVzLFxuICAgICAgY2hpbGRyZW4ubGVuZ3RoLFxuICAgICk7XG5cbiAgICAvLyBFeGVjdXRlIHNlbGVjdGVkIGNoaWxkcmVuIGluIHBhcmFsbGVsIHVzaW5nIGV4aXN0aW5nIGxvZ2ljXG4gICAgLy8gV0hZOiBSZXVzZSBleGVjdXRlTm9kZUNoaWxkcmVuIHRvIGF2b2lkIGR1cGxpY2F0aW5nIHBhcmFsbGVsIGV4ZWN1dGlvbiBsb2dpY1xuICAgIGNvbnN0IHRlbXBOb2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiA9IHsgbmFtZTogJ3NlbGVjdG9yLXRlbXAnLCBjaGlsZHJlbjogc2VsZWN0ZWRDaGlsZHJlbiB9O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVOb2RlQ2hpbGRyZW4odGVtcE5vZGUsIGNvbnRleHQsIHVuZGVmaW5lZCwgYnJhbmNoUGF0aCk7XG4gIH1cbn1cbiJdfQ==