"use strict";
/**
 * LoopHandler.ts
 *
 * WHY: Handles dynamic next, iteration counting, and loop-back logic for the Pipeline.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of loop handling from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Manage iteration counters (iterationCounters map)
 * - Generate iterated stage names (e.g., "askLLM.1", "askLLM.2")
 * - Resolve dynamicNext (string reference, StageNode with fn, StageNode without fn)
 * - Log flow control decisions for loop-backs
 *
 * DESIGN DECISIONS:
 * - Iteration counters are per-node-ID, enabling multiple loops to the same node
 * - First visit uses base name, subsequent visits append iteration number
 * - Supports three dynamicNext patterns: string ID, StageNode with fn, StageNode reference
 *
 * DOES NOT HANDLE:
 * - Stage execution (uses executeNode callback)
 * - Commit logic (caller handles)
 * - Extractor calls (caller handles)
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates when loops are executed
 * - {@link NodeResolver} - Used to find target nodes by ID
 * - {@link StageContext} - Used for debug info and context creation
 *
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopHandler = void 0;
const logger_1 = require("../../../utils/logger");
/**
 * LoopHandler
 * ------------------------------------------------------------------
 * Handles dynamic next, iteration counting, and loop-back logic.
 *
 * WHY: Loops are a common pattern in pipelines (e.g., retry logic, iterative
 * refinement). This class centralizes all loop-related logic in one place.
 *
 * DESIGN: Uses iteration counters to generate unique stage names for each
 * visit to a node, enabling the context tree to track multiple executions.
 *
 * @template TOut - The output type of stage functions
 * @template TScope - The scope type passed to stage functions
 *
 * @example
 * ```typescript
 * const handler = new LoopHandler(pipelineContext, nodeResolver);
 * const result = await handler.handle(dynamicNext, node, context, breakFlag, branchPath, executeNode);
 * ```
 */
class LoopHandler {
    constructor(ctx, nodeResolver, onIterationUpdate) {
        this.ctx = ctx;
        this.nodeResolver = nodeResolver;
        /**
         * Iteration counter for loop support.
         * Tracks how many times each node ID has been visited (for context path generation).
         * Key: node.id, Value: iteration count (0 = first visit)
         */
        this.iterationCounters = new Map();
        this.onIterationUpdate = onIterationUpdate;
    }
    /**
     * Handle dynamic next (loop-back or dynamic continuation).
     *
     * WHY: Resolves dynamicNext based on its type to support multiple patterns:
     * - String: Reference to existing node by ID (resolve via NodeResolver.findNodeById)
     * - StageNode with fn: Execute directly (truly dynamic)
     * - StageNode without fn: Reference by ID (resolve via NodeResolver.findNodeById)
     *
     * @param dynamicNext - The dynamic next target (string ID or StageNode)
     * @param node - The current node (for error messages)
     * @param context - The stage context
     * @param breakFlag - Break flag for propagation
     * @param branchPath - Branch path for logging
     * @param executeNode - Callback to execute the target node
     * @returns The result of executing the target node
     *
     * _Requirements: 3.4, 3.5, 3.6, 3.7_
     */
    async handle(dynamicNext, node, context, breakFlag, branchPath, executeNode) {
        // If dynamicNext is a string, it's a reference to an existing node by ID
        if (typeof dynamicNext === 'string') {
            return this.handleStringReference(dynamicNext, node, context, breakFlag, branchPath, executeNode);
        }
        // If dynamicNext is a StageNode with fn, execute it directly (truly dynamic)
        if (dynamicNext.fn) {
            return this.handleDirectNode(dynamicNext, context, breakFlag, branchPath, executeNode);
        }
        // If dynamicNext is a StageNode without fn, it's a reference - look up by ID
        return this.handleNodeReference(dynamicNext, node, context, breakFlag, branchPath, executeNode);
    }
    /**
     * Handle dynamicNext as a string reference to an existing node.
     */
    async handleStringReference(nodeId, currentNode, context, breakFlag, branchPath, executeNode) {
        const targetNode = this.nodeResolver.findNodeById(nodeId);
        if (!targetNode) {
            const errorMessage = `dynamicNext target node not found: ${nodeId}`;
            logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${currentNode.name}]:`, { error: errorMessage });
            throw new Error(errorMessage);
        }
        const iteration = this.getAndIncrementIteration(nodeId);
        const iteratedStageName = this.getIteratedStageName(targetNode.name, iteration);
        context.addLog('dynamicNextTarget', nodeId);
        context.addLog('dynamicNextIteration', iteration);
        // Log flow control decision for loop
        context.addFlowDebugMessage('loop', `Looping back to ${targetNode.displayName || targetNode.name} (iteration ${iteration + 1})`, {
            targetStage: targetNode.name,
            iteration: iteration + 1,
        });
        // Narrative: record the loop-back with 1-based iteration number
        this.ctx.narrativeGenerator.onLoop(targetNode.name, targetNode.displayName, iteration + 1, targetNode.description);
        const nextStageContext = context.createNext(branchPath, iteratedStageName);
        return executeNode(targetNode, nextStageContext, breakFlag, branchPath);
    }
    /**
     * Handle dynamicNext as a direct StageNode with fn (truly dynamic).
     */
    async handleDirectNode(dynamicNode, context, breakFlag, branchPath, executeNode) {
        context.addLog('dynamicNextDirect', true);
        context.addLog('dynamicNextName', dynamicNode.name);
        // Log flow control decision for dynamic next
        context.addFlowDebugMessage('next', `Moving to ${dynamicNode.displayName || dynamicNode.name} stage (dynamic)`, {
            targetStage: dynamicNode.name,
        });
        const nextStageContext = context.createNext(branchPath, dynamicNode.name);
        return executeNode(dynamicNode, nextStageContext, breakFlag, branchPath);
    }
    /**
     * Handle dynamicNext as a StageNode reference (no fn, look up by ID).
     */
    async handleNodeReference(dynamicNode, currentNode, context, breakFlag, branchPath, executeNode) {
        const nextNodeId = dynamicNode.id;
        if (!nextNodeId) {
            const errorMessage = 'dynamicNext node must have an id when used as reference';
            logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${currentNode.name}]:`, { error: errorMessage });
            throw new Error(errorMessage);
        }
        const targetNode = this.nodeResolver.findNodeById(nextNodeId);
        if (!targetNode) {
            const errorMessage = `dynamicNext target node not found: ${nextNodeId}`;
            logger_1.logger.error(`Error in pipeline (${branchPath}) stage [${currentNode.name}]:`, { error: errorMessage });
            throw new Error(errorMessage);
        }
        const iteration = this.getAndIncrementIteration(nextNodeId);
        const iteratedStageName = this.getIteratedStageName(targetNode.name, iteration);
        context.addLog('dynamicNextTarget', nextNodeId);
        context.addLog('dynamicNextIteration', iteration);
        // Log flow control decision for loop
        context.addFlowDebugMessage('loop', `Looping back to ${targetNode.displayName || targetNode.name} (iteration ${iteration + 1})`, {
            targetStage: targetNode.name,
            iteration: iteration + 1,
        });
        // Narrative: record the loop-back with 1-based iteration number
        this.ctx.narrativeGenerator.onLoop(targetNode.name, targetNode.displayName, iteration + 1, targetNode.description);
        const nextStageContext = context.createNext(branchPath, iteratedStageName);
        return executeNode(targetNode, nextStageContext, breakFlag, branchPath);
    }
    /**
     * Get the next iteration number for a node and increment the counter.
     *
     * WHY: Enables tracking multiple visits to the same node in the context tree.
     * Returns 0 for first visit, 1 for second, etc.
     *
     * _Requirements: 3.2_
     */
    getAndIncrementIteration(nodeId) {
        var _a;
        const current = (_a = this.iterationCounters.get(nodeId)) !== null && _a !== void 0 ? _a : 0;
        this.iterationCounters.set(nodeId, current + 1);
        // Notify Pipeline to update runtime pipeline structure with iteration count
        // current + 1 is the total number of visits (1-based)
        // _Requirements: runtime-pipeline-structure 5.1_
        if (this.onIterationUpdate) {
            this.onIterationUpdate(nodeId, current + 1);
        }
        return current;
    }
    /**
     * Generate an iterated stage name for context tree.
     *
     * WHY: Creates unique names for each visit to enable proper context tree structure.
     * First visit: "askLLM", second: "askLLM.1", third: "askLLM.2"
     *
     * _Requirements: 3.3_
     */
    getIteratedStageName(baseName, iteration) {
        return iteration === 0 ? baseName : `${baseName}.${iteration}`;
    }
}
exports.LoopHandler = LoopHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9vcEhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9oYW5kbGVycy9Mb29wSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBNkJHOzs7QUFHSCxrREFBK0M7QUFrQi9DOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHO0FBQ0gsTUFBYSxXQUFXO0lBc0J0QixZQUNtQixHQUFrQyxFQUNsQyxZQUF3QyxFQUN6RCxpQkFBMkQ7UUFGMUMsUUFBRyxHQUFILEdBQUcsQ0FBK0I7UUFDbEMsaUJBQVksR0FBWixZQUFZLENBQTRCO1FBdkIzRDs7OztXQUlHO1FBQ0ssc0JBQWlCLEdBQXdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFxQnpELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQztJQUM3QyxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7O09BaUJHO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FDVixXQUE2QyxFQUM3QyxJQUE2QixFQUM3QixPQUFxQixFQUNyQixTQUFtQyxFQUNuQyxVQUE4QixFQUM5QixXQUF3QztRQUV4Qyx5RUFBeUU7UUFDekUsSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNwQyxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3BHLENBQUM7UUFFRCw2RUFBNkU7UUFDN0UsSUFBSSxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbkIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3pGLENBQUM7UUFFRCw2RUFBNkU7UUFDN0UsT0FBTyxJ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QUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7SUFDakUsQ0FBQztDQUNGO0FBOU1ELGtDQThNQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTG9vcEhhbmRsZXIudHNcbiAqXG4gKiBXSFk6IEhhbmRsZXMgZHluYW1pYyBuZXh0LCBpdGVyYXRpb24gY291bnRpbmcsIGFuZCBsb29wLWJhY2sgbG9naWMgZm9yIHRoZSBQaXBlbGluZS5cbiAqIFRoaXMgbW9kdWxlIGlzIGV4dHJhY3RlZCBmcm9tIFBpcGVsaW5lLnRzIGZvbGxvd2luZyB0aGUgU2luZ2xlIFJlc3BvbnNpYmlsaXR5IFByaW5jaXBsZSxcbiAqIGlzb2xhdGluZyB0aGUgY29uY2VybnMgb2YgbG9vcCBoYW5kbGluZyBmcm9tIHBpcGVsaW5lIHRyYXZlcnNhbC5cbiAqXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBNYW5hZ2UgaXRlcmF0aW9uIGNvdW50ZXJzIChpdGVyYXRpb25Db3VudGVycyBtYXApXG4gKiAtIEdlbmVyYXRlIGl0ZXJhdGVkIHN0YWdlIG5hbWVzIChlLmcuLCBcImFza0xMTS4xXCIsIFwiYXNrTExNLjJcIilcbiAqIC0gUmVzb2x2ZSBkeW5hbWljTmV4dCAoc3RyaW5nIHJlZmVyZW5jZSwgU3RhZ2VOb2RlIHdpdGggZm4sIFN0YWdlTm9kZSB3aXRob3V0IGZuKVxuICogLSBMb2cgZmxvdyBjb250cm9sIGRlY2lzaW9ucyBmb3IgbG9vcC1iYWNrc1xuICpcbiAqIERFU0lHTiBERUNJU0lPTlM6XG4gKiAtIEl0ZXJhdGlvbiBjb3VudGVycyBhcmUgcGVyLW5vZGUtSUQsIGVuYWJsaW5nIG11bHRpcGxlIGxvb3BzIHRvIHRoZSBzYW1lIG5vZGVcbiAqIC0gRmlyc3QgdmlzaXQgdXNlcyBiYXNlIG5hbWUsIHN1YnNlcXVlbnQgdmlzaXRzIGFwcGVuZCBpdGVyYXRpb24gbnVtYmVyXG4gKiAtIFN1cHBvcnRzIHRocmVlIGR5bmFtaWNOZXh0IHBhdHRlcm5zOiBzdHJpbmcgSUQsIFN0YWdlTm9kZSB3aXRoIGZuLCBTdGFnZU5vZGUgcmVmZXJlbmNlXG4gKlxuICogRE9FUyBOT1QgSEFORExFOlxuICogLSBTdGFnZSBleGVjdXRpb24gKHVzZXMgZXhlY3V0ZU5vZGUgY2FsbGJhY2spXG4gKiAtIENvbW1pdCBsb2dpYyAoY2FsbGVyIGhhbmRsZXMpXG4gKiAtIEV4dHJhY3RvciBjYWxscyAoY2FsbGVyIGhhbmRsZXMpXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIFBpcGVsaW5lfSAtIE9yY2hlc3RyYXRlcyB3aGVuIGxvb3BzIGFyZSBleGVjdXRlZFxuICogLSB7QGxpbmsgTm9kZVJlc29sdmVyfSAtIFVzZWQgdG8gZmluZCB0YXJnZXQgbm9kZXMgYnkgSURcbiAqIC0ge0BsaW5rIFN0YWdlQ29udGV4dH0gLSBVc2VkIGZvciBkZWJ1ZyBpbmZvIGFuZCBjb250ZXh0IGNyZWF0aW9uXG4gKlxuICogX1JlcXVpcmVtZW50czogMy4xLCAzLjIsIDMuMywgMy40LCAzLjUsIDMuNiwgMy43LCAzLjhfXG4gKi9cblxuaW1wb3J0IHsgU3RhZ2VDb250ZXh0IH0gZnJvbSAnLi4vLi4vbWVtb3J5L1N0YWdlQ29udGV4dCc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi8uLi8uLi91dGlscy9sb2dnZXInO1xuaW1wb3J0IHR5cGUgeyBTdGFnZU5vZGUgfSBmcm9tICcuLi9QaXBlbGluZSc7XG5pbXBvcnQgdHlwZSB7IE5vZGVSZXNvbHZlciB9IGZyb20gJy4vTm9kZVJlc29sdmVyJztcbmltcG9ydCB0eXBlIHsgUGlwZWxpbmVDb250ZXh0IH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIENhbGxiYWNrIHR5cGUgZm9yIGV4ZWN1dGluZyBhIG5vZGUuXG4gKlxuICogV0hZOiBVc2VkIGJ5IExvb3BIYW5kbGVyIHRvIGNvbnRpbnVlIGV4ZWN1dGlvbiBhZnRlciByZXNvbHZpbmcgZHluYW1pY05leHQuXG4gKiBUaGlzIGF2b2lkcyBjaXJjdWxhciBkZXBlbmRlbmN5IHdpdGggUGlwZWxpbmUuXG4gKi9cbmV4cG9ydCB0eXBlIEV4ZWN1dGVOb2RlRm48VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiA9IChcbiAgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgYnJlYWtGbGFnOiB7IHNob3VsZEJyZWFrOiBib29sZWFuIH0sXG4gIGJyYW5jaFBhdGg/OiBzdHJpbmcsXG4pID0+IFByb21pc2U8YW55PjtcblxuLyoqXG4gKiBMb29wSGFuZGxlclxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBIYW5kbGVzIGR5bmFtaWMgbmV4dCwgaXRlcmF0aW9uIGNvdW50aW5nLCBhbmQgbG9vcC1iYWNrIGxvZ2ljLlxuICpcbiAqIFdIWTogTG9vcHMgYXJlIGEgY29tbW9uIHBhdHRlcm4gaW4gcGlwZWxpbmVzIChlLmcuLCByZXRyeSBsb2dpYywgaXRlcmF0aXZlXG4gKiByZWZpbmVtZW50KS4gVGhpcyBjbGFzcyBjZW50cmFsaXplcyBhbGwgbG9vcC1yZWxhdGVkIGxvZ2ljIGluIG9uZSBwbGFjZS5cbiAqXG4gKiBERVNJR046IFVzZXMgaXRlcmF0aW9uIGNvdW50ZXJzIHRvIGdlbmVyYXRlIHVuaXF1ZSBzdGFnZSBuYW1lcyBmb3IgZWFjaFxuICogdmlzaXQgdG8gYSBub2RlLCBlbmFibGluZyB0aGUgY29udGV4dCB0cmVlIHRvIHRyYWNrIG11bHRpcGxlIGV4ZWN1dGlvbnMuXG4gKlxuICogQHRlbXBsYXRlIFRPdXQgLSBUaGUgb3V0cHV0IHR5cGUgb2Ygc3RhZ2UgZnVuY3Rpb25zXG4gKiBAdGVtcGxhdGUgVFNjb3BlIC0gVGhlIHNjb3BlIHR5cGUgcGFzc2VkIHRvIHN0YWdlIGZ1bmN0aW9uc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBoYW5kbGVyID0gbmV3IExvb3BIYW5kbGVyKHBpcGVsaW5lQ29udGV4dCwgbm9kZVJlc29sdmVyKTtcbiAqIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlKGR5bmFtaWNOZXh0LCBub2RlLCBjb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgsIGV4ZWN1dGVOb2RlKTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgTG9vcEhhbmRsZXI8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiB7XG4gIC8qKlxuICAgKiBJdGVyYXRpb24gY291bnRlciBmb3IgbG9vcCBzdXBwb3J0LlxuICAgKiBUcmFja3MgaG93IG1hbnkgdGltZXMgZWFjaCBub2RlIElEIGhhcyBiZWVuIHZpc2l0ZWQgKGZvciBjb250ZXh0IHBhdGggZ2VuZXJhdGlvbikuXG4gICAqIEtleTogbm9kZS5pZCwgVmFsdWU6IGl0ZXJhdGlvbiBjb3VudCAoMCA9IGZpcnN0IHZpc2l0KVxuICAgKi9cbiAgcHJpdmF0ZSBpdGVyYXRpb25Db3VudGVyczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoKTtcblxuICAvKipcbiAgICogT3B0aW9uYWwgY2FsbGJhY2sgaW52b2tlZCB3aGVuIGEgbm9kZSdzIGl0ZXJhdGlvbiBjb3VudCBjaGFuZ2VzLlxuICAgKlxuICAgKiBXSFk6IFBpcGVsaW5lIG5lZWRzIHRvIHVwZGF0ZSB0aGUgcnVudGltZSBwaXBlbGluZSBzdHJ1Y3R1cmUgd2l0aCBpdGVyYXRpb25cbiAgICogY291bnRzLCBidXQgTG9vcEhhbmRsZXIgb3ducyB0aGUgY291bnRlcnMuIFRoaXMgY2FsbGJhY2sgYnJpZGdlcyB0aGUgdHdvXG4gICAqIHdpdGhvdXQgY3JlYXRpbmcgYSBjaXJjdWxhciBkZXBlbmRlbmN5LlxuICAgKlxuICAgKiBAcGFyYW0gbm9kZUlkIC0gVGhlIG5vZGUgSUQgd2hvc2UgaXRlcmF0aW9uIGNvdW50IGNoYW5nZWRcbiAgICogQHBhcmFtIGNvdW50IC0gVGhlIG5ldyB0b3RhbCBpdGVyYXRpb24gY291bnQgKG51bWJlciBvZiB0aW1lcyB2aXNpdGVkKVxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBydW50aW1lLXBpcGVsaW5lLXN0cnVjdHVyZSA1LjFfXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IG9uSXRlcmF0aW9uVXBkYXRlPzogKG5vZGVJZDogc3RyaW5nLCBjb3VudDogbnVtYmVyKSA9PiB2b2lkO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcmVhZG9ubHkgY3R4OiBQaXBlbGluZUNvbnRleHQ8VE91dCwgVFNjb3BlPixcbiAgICBwcml2YXRlIHJlYWRvbmx5IG5vZGVSZXNvbHZlcjogTm9kZVJlc29sdmVyPFRPdXQsIFRTY29wZT4sXG4gICAgb25JdGVyYXRpb25VcGRhdGU/OiAobm9kZUlkOiBzdHJpbmcsIGNvdW50OiBudW1iZXIpID0+IHZvaWQsXG4gICkge1xuICAgIHRoaXMub25JdGVyYXRpb25VcGRhdGUgPSBvbkl0ZXJhdGlvblVwZGF0ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgZHluYW1pYyBuZXh0IChsb29wLWJhY2sgb3IgZHluYW1pYyBjb250aW51YXRpb24pLlxuICAgKlxuICAgKiBXSFk6IFJlc29sdmVzIGR5bmFtaWNOZXh0IGJhc2VkIG9uIGl0cyB0eXBlIHRvIHN1cHBvcnQgbXVsdGlwbGUgcGF0dGVybnM6XG4gICAqIC0gU3RyaW5nOiBSZWZlcmVuY2UgdG8gZXhpc3Rpbmcgbm9kZSBieSBJRCAocmVzb2x2ZSB2aWEgTm9kZVJlc29sdmVyLmZpbmROb2RlQnlJZClcbiAgICogLSBTdGFnZU5vZGUgd2l0aCBmbjogRXhlY3V0ZSBkaXJlY3RseSAodHJ1bHkgZHluYW1pYylcbiAgICogLSBTdGFnZU5vZGUgd2l0aG91dCBmbjogUmVmZXJlbmNlIGJ5IElEIChyZXNvbHZlIHZpYSBOb2RlUmVzb2x2ZXIuZmluZE5vZGVCeUlkKVxuICAgKlxuICAgKiBAcGFyYW0gZHluYW1pY05leHQgLSBUaGUgZHluYW1pYyBuZXh0IHRhcmdldCAoc3RyaW5nIElEIG9yIFN0YWdlTm9kZSlcbiAgICogQHBhcmFtIG5vZGUgLSBUaGUgY3VycmVudCBub2RlIChmb3IgZXJyb3IgbWVzc2FnZXMpXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gVGhlIHN0YWdlIGNvbnRleHRcbiAgICogQHBhcmFtIGJyZWFrRmxhZyAtIEJyZWFrIGZsYWcgZm9yIHByb3BhZ2F0aW9uXG4gICAqIEBwYXJhbSBicmFuY2hQYXRoIC0gQnJhbmNoIHBhdGggZm9yIGxvZ2dpbmdcbiAgICogQHBhcmFtIGV4ZWN1dGVOb2RlIC0gQ2FsbGJhY2sgdG8gZXhlY3V0ZSB0aGUgdGFyZ2V0IG5vZGVcbiAgICogQHJldHVybnMgVGhlIHJlc3VsdCBvZiBleGVjdXRpbmcgdGhlIHRhcmdldCBub2RlXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDMuNCwgMy41LCAzLjYsIDMuN19cbiAgICovXG4gIGFzeW5jIGhhbmRsZShcbiAgICBkeW5hbWljTmV4dDogc3RyaW5nIHwgU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gICAgbm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gICAgY29udGV4dDogU3RhZ2VDb250ZXh0LFxuICAgIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICAgIGJyYW5jaFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBleGVjdXRlTm9kZTogRXhlY3V0ZU5vZGVGbjxUT3V0LCBUU2NvcGU+LFxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIElmIGR5bmFtaWNOZXh0IGlzIGEgc3RyaW5nLCBpdCdzIGEgcmVmZXJlbmNlIHRvIGFuIGV4aXN0aW5nIG5vZGUgYnkgSURcbiAgICBpZiAodHlwZW9mIGR5bmFtaWNOZXh0ID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU3RyaW5nUmVmZXJlbmNlKGR5bmFtaWNOZXh0LCBub2RlLCBjb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgsIGV4ZWN1dGVOb2RlKTtcbiAgICB9XG5cbiAgICAvLyBJZiBkeW5hbWljTmV4dCBpcyBhIFN0YWdlTm9kZSB3aXRoIGZuLCBleGVjdXRlIGl0IGRpcmVjdGx5ICh0cnVseSBkeW5hbWljKVxuICAgIGlmIChkeW5hbWljTmV4dC5mbikge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGlyZWN0Tm9kZShkeW5hbWljTmV4dCwgY29udGV4dCwgYnJlYWtGbGFnLCBicmFuY2hQYXRoLCBleGVjdXRlTm9kZSk7XG4gICAgfVxuXG4gICAgLy8gSWYgZHluYW1pY05leHQgaXMgYSBTdGFnZU5vZGUgd2l0aG91dCBmbiwgaXQncyBhIHJlZmVyZW5jZSAtIGxvb2sgdXAgYnkgSURcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVOb2RlUmVmZXJlbmNlKGR5bmFtaWNOZXh0LCBub2RlLCBjb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgsIGV4ZWN1dGVOb2RlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgZHluYW1pY05leHQgYXMgYSBzdHJpbmcgcmVmZXJlbmNlIHRvIGFuIGV4aXN0aW5nIG5vZGUuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGhhbmRsZVN0cmluZ1JlZmVyZW5jZShcbiAgICBub2RlSWQ6IHN0cmluZyxcbiAgICBjdXJyZW50Tm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gICAgY29udGV4dDogU3RhZ2VDb250ZXh0LFxuICAgIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICAgIGJyYW5jaFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBleGVjdXRlTm9kZTogRXhlY3V0ZU5vZGVGbjxUT3V0LCBUU2NvcGU+LFxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRhcmdldE5vZGUgPSB0aGlzLm5vZGVSZXNvbHZlci5maW5kTm9kZUJ5SWQobm9kZUlkKTtcbiAgICBpZiAoIXRhcmdldE5vZGUpIHtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGBkeW5hbWljTmV4dCB0YXJnZXQgbm9kZSBub3QgZm91bmQ6ICR7bm9kZUlkfWA7XG4gICAgICBsb2dnZXIuZXJyb3IoYEVycm9yIGluIHBpcGVsaW5lICgke2JyYW5jaFBhdGh9KSBzdGFnZSBbJHtjdXJyZW50Tm9kZS5uYW1lfV06YCwgeyBlcnJvcjogZXJyb3JNZXNzYWdlIH0pO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGVycm9yTWVzc2FnZSk7XG4gICAgfVxuXG4gICAgY29uc3QgaXRlcmF0aW9uID0gdGhpcy5nZXRBbmRJbmNyZW1lbnRJdGVyYXRpb24obm9kZUlkKTtcbiAgICBjb25zdCBpdGVyYXRlZFN0YWdlTmFtZSA9IHRoaXMuZ2V0SXRlcmF0ZWRTdGFnZU5hbWUodGFyZ2V0Tm9kZS5uYW1lLCBpdGVyYXRpb24pO1xuICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dFRhcmdldCcsIG5vZGVJZCk7XG4gICAgY29udGV4dC5hZGRMb2coJ2R5bmFtaWNOZXh0SXRlcmF0aW9uJywgaXRlcmF0aW9uKTtcblxuICAgIC8vIExvZyBmbG93IGNvbnRyb2wgZGVjaXNpb24gZm9yIGxvb3BcbiAgICBjb250ZXh0LmFkZEZsb3dEZWJ1Z01lc3NhZ2UoJ2xvb3AnLFxuICAgICAgYExvb3BpbmcgYmFjayB0byAke3RhcmdldE5vZGUuZGlzcGxheU5hbWUgfHwgdGFyZ2V0Tm9kZS5uYW1lfSAoaXRlcmF0aW9uICR7aXRlcmF0aW9uICsgMX0pYCwge1xuICAgICAgICB0YXJnZXRTdGFnZTogdGFyZ2V0Tm9kZS5uYW1lLFxuICAgICAgICBpdGVyYXRpb246IGl0ZXJhdGlvbiArIDEsXG4gICAgICB9KTtcblxuICAgIC8vIE5hcnJhdGl2ZTogcmVjb3JkIHRoZSBsb29wLWJhY2sgd2l0aCAxLWJhc2VkIGl0ZXJhdGlvbiBudW1iZXJcbiAgICB0aGlzLmN0eC5uYXJyYXRpdmVHZW5lcmF0b3Iub25Mb29wKHRhcmdldE5vZGUubmFtZSwgdGFyZ2V0Tm9kZS5kaXNwbGF5TmFtZSwgaXRlcmF0aW9uICsgMSwgdGFyZ2V0Tm9kZS5kZXNjcmlwdGlvbik7XG5cbiAgICBjb25zdCBuZXh0U3RhZ2VDb250ZXh0ID0gY29udGV4dC5jcmVhdGVOZXh0KGJyYW5jaFBhdGggYXMgc3RyaW5nLCBpdGVyYXRlZFN0YWdlTmFtZSk7XG4gICAgcmV0dXJuIGV4ZWN1dGVOb2RlKHRhcmdldE5vZGUsIG5leHRTdGFnZUNvbnRleHQsIGJyZWFrRmxhZywgYnJhbmNoUGF0aCk7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGR5bmFtaWNOZXh0IGFzIGEgZGlyZWN0IFN0YWdlTm9kZSB3aXRoIGZuICh0cnVseSBkeW5hbWljKS5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRGlyZWN0Tm9kZShcbiAgICBkeW5hbWljTm9kZTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4sXG4gICAgY29udGV4dDogU3RhZ2VDb250ZXh0LFxuICAgIGJyZWFrRmxhZzogeyBzaG91bGRCcmVhazogYm9vbGVhbiB9LFxuICAgIGJyYW5jaFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBleGVjdXRlTm9kZTogRXhlY3V0ZU5vZGVGbjxUT3V0LCBUU2NvcGU+LFxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dERpcmVjdCcsIHRydWUpO1xuICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dE5hbWUnLCBkeW5hbWljTm9kZS5uYW1lKTtcblxuICAgIC8vIExvZyBmbG93IGNvbnRyb2wgZGVjaXNpb24gZm9yIGR5bmFtaWMgbmV4dFxuICAgIGNvbnRleHQuYWRkRmxvd0RlYnVnTWVzc2FnZSgnbmV4dCcsIGBNb3ZpbmcgdG8gJHtkeW5hbWljTm9kZS5kaXNwbGF5TmFtZSB8fCBkeW5hbWljTm9kZS5uYW1lfSBzdGFnZSAoZHluYW1pYylgLCB7XG4gICAgICB0YXJnZXRTdGFnZTogZHluYW1pY05vZGUubmFtZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IG5leHRTdGFnZUNvbnRleHQgPSBjb250ZXh0LmNyZWF0ZU5leHQoYnJhbmNoUGF0aCBhcyBzdHJpbmcsIGR5bmFtaWNOb2RlLm5hbWUpO1xuICAgIHJldHVybiBleGVjdXRlTm9kZShkeW5hbWljTm9kZSwgbmV4dFN0YWdlQ29udGV4dCwgYnJlYWtGbGFnLCBicmFuY2hQYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgZHluYW1pY05leHQgYXMgYSBTdGFnZU5vZGUgcmVmZXJlbmNlIChubyBmbiwgbG9vayB1cCBieSBJRCkuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGhhbmRsZU5vZGVSZWZlcmVuY2UoXG4gICAgZHluYW1pY05vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+LFxuICAgIGN1cnJlbnROb2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICBjb250ZXh0OiBTdGFnZUNvbnRleHQsXG4gICAgYnJlYWtGbGFnOiB7IHNob3VsZEJyZWFrOiBib29sZWFuIH0sXG4gICAgYnJhbmNoUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgIGV4ZWN1dGVOb2RlOiBFeGVjdXRlTm9kZUZuPFRPdXQsIFRTY29wZT4sXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgbmV4dE5vZGVJZCA9IGR5bmFtaWNOb2RlLmlkO1xuICAgIGlmICghbmV4dE5vZGVJZCkge1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gJ2R5bmFtaWNOZXh0IG5vZGUgbXVzdCBoYXZlIGFuIGlkIHdoZW4gdXNlZCBhcyByZWZlcmVuY2UnO1xuICAgICAgbG9nZ2VyLmVycm9yKGBFcnJvciBpbiBwaXBlbGluZSAoJHticmFuY2hQYXRofSkgc3RhZ2UgWyR7Y3VycmVudE5vZGUubmFtZX1dOmAsIHsgZXJyb3I6IGVycm9yTWVzc2FnZSB9KTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldE5vZGUgPSB0aGlzLm5vZGVSZXNvbHZlci5maW5kTm9kZUJ5SWQobmV4dE5vZGVJZCk7XG4gICAgaWYgKCF0YXJnZXROb2RlKSB7XG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBgZHluYW1pY05leHQgdGFyZ2V0IG5vZGUgbm90IGZvdW5kOiAke25leHROb2RlSWR9YDtcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaW4gcGlwZWxpbmUgKCR7YnJhbmNoUGF0aH0pIHN0YWdlIFske2N1cnJlbnROb2RlLm5hbWV9XTpgLCB7IGVycm9yOiBlcnJvck1lc3NhZ2UgfSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKTtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVyYXRpb24gPSB0aGlzLmdldEFuZEluY3JlbWVudEl0ZXJhdGlvbihuZXh0Tm9kZUlkKTtcbiAgICBjb25zdCBpdGVyYXRlZFN0YWdlTmFtZSA9IHRoaXMuZ2V0SXRlcmF0ZWRTdGFnZU5hbWUodGFyZ2V0Tm9kZS5uYW1lLCBpdGVyYXRpb24pO1xuICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dFRhcmdldCcsIG5leHROb2RlSWQpO1xuICAgIGNvbnRleHQuYWRkTG9nKCdkeW5hbWljTmV4dEl0ZXJhdGlvbicsIGl0ZXJhdGlvbik7XG5cbiAgICAvLyBMb2cgZmxvdyBjb250cm9sIGRlY2lzaW9uIGZvciBsb29wXG4gICAgY29udGV4dC5hZGRGbG93RGVidWdNZXNzYWdlKCdsb29wJyxcbiAgICAgIGBMb29waW5nIGJhY2sgdG8gJHt0YXJnZXROb2RlLmRpc3BsYXlOYW1lIHx8IHRhcmdldE5vZGUubmFtZX0gKGl0ZXJhdGlvbiAke2l0ZXJhdGlvbiArIDF9KWAsIHtcbiAgICAgICAgdGFyZ2V0U3RhZ2U6IHRhcmdldE5vZGUubmFtZSxcbiAgICAgICAgaXRlcmF0aW9uOiBpdGVyYXRpb24gKyAxLFxuICAgICAgfSk7XG5cbiAgICAvLyBOYXJyYXRpdmU6IHJlY29yZCB0aGUgbG9vcC1iYWNrIHdpdGggMS1iYXNlZCBpdGVyYXRpb24gbnVtYmVyXG4gICAgdGhpcy5jdHgubmFycmF0aXZlR2VuZXJhdG9yLm9uTG9vcCh0YXJnZXROb2RlLm5hbWUsIHRhcmdldE5vZGUuZGlzcGxheU5hbWUsIGl0ZXJhdGlvbiArIDEsIHRhcmdldE5vZGUuZGVzY3JpcHRpb24pO1xuXG4gICAgY29uc3QgbmV4dFN0YWdlQ29udGV4dCA9IGNvbnRleHQuY3JlYXRlTmV4dChicmFuY2hQYXRoIGFzIHN0cmluZywgaXRlcmF0ZWRTdGFnZU5hbWUpO1xuICAgIHJldHVybiBleGVjdXRlTm9kZSh0YXJnZXROb2RlLCBuZXh0U3RhZ2VDb250ZXh0LCBicmVha0ZsYWcsIGJyYW5jaFBhdGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgbmV4dCBpdGVyYXRpb24gbnVtYmVyIGZvciBhIG5vZGUgYW5kIGluY3JlbWVudCB0aGUgY291bnRlci5cbiAgICpcbiAgICogV0hZOiBFbmFibGVzIHRyYWNraW5nIG11bHRpcGxlIHZpc2l0cyB0byB0aGUgc2FtZSBub2RlIGluIHRoZSBjb250ZXh0IHRyZWUuXG4gICAqIFJldHVybnMgMCBmb3IgZmlyc3QgdmlzaXQsIDEgZm9yIHNlY29uZCwgZXRjLlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiAzLjJfXG4gICAqL1xuICBnZXRBbmRJbmNyZW1lbnRJdGVyYXRpb24obm9kZUlkOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLml0ZXJhdGlvbkNvdW50ZXJzLmdldChub2RlSWQpID8/IDA7XG4gICAgdGhpcy5pdGVyYXRpb25Db3VudGVycy5zZXQobm9kZUlkLCBjdXJyZW50ICsgMSk7XG5cbiAgICAvLyBOb3RpZnkgUGlwZWxpbmUgdG8gdXBkYXRlIHJ1bnRpbWUgcGlwZWxpbmUgc3RydWN0dXJlIHdpdGggaXRlcmF0aW9uIGNvdW50XG4gICAgLy8gY3VycmVudCArIDEgaXMgdGhlIHRvdGFsIG51bWJlciBvZiB2aXNpdHMgKDEtYmFzZWQpXG4gICAgLy8gX1JlcXVpcmVtZW50czogcnVudGltZS1waXBlbGluZS1zdHJ1Y3R1cmUgNS4xX1xuICAgIGlmICh0aGlzLm9uSXRlcmF0aW9uVXBkYXRlKSB7XG4gICAgICB0aGlzLm9uSXRlcmF0aW9uVXBkYXRlKG5vZGVJZCwgY3VycmVudCArIDEpO1xuICAgIH1cblxuICAgIHJldHVybiBjdXJyZW50O1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIGFuIGl0ZXJhdGVkIHN0YWdlIG5hbWUgZm9yIGNvbnRleHQgdHJlZS5cbiAgICpcbiAgICogV0hZOiBDcmVhdGVzIHVuaXF1ZSBuYW1lcyBmb3IgZWFjaCB2aXNpdCB0byBlbmFibGUgcHJvcGVyIGNvbnRleHQgdHJlZSBzdHJ1Y3R1cmUuXG4gICAqIEZpcnN0IHZpc2l0OiBcImFza0xMTVwiLCBzZWNvbmQ6IFwiYXNrTExNLjFcIiwgdGhpcmQ6IFwiYXNrTExNLjJcIlxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiAzLjNfXG4gICAqL1xuICBnZXRJdGVyYXRlZFN0YWdlTmFtZShiYXNlTmFtZTogc3RyaW5nLCBpdGVyYXRpb246IG51bWJlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIGl0ZXJhdGlvbiA9PT0gMCA/IGJhc2VOYW1lIDogYCR7YmFzZU5hbWV9LiR7aXRlcmF0aW9ufWA7XG4gIH1cbn1cbiJdfQ==