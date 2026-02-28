"use strict";
/**
 * NodeResolver.ts
 *
 * WHY: Handles node lookup and subflow reference resolution for the Pipeline.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of node resolution from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Find nodes by ID (recursive tree search for loop-back support)
 * - Resolve subflow reference nodes to actual subflow structures
 * - Evaluate deciders to determine next node in branching scenarios
 *
 * DESIGN DECISIONS:
 * - Uses recursive tree search for findNodeById to handle arbitrary tree depths
 * - Subflow resolution uses multiple key fallbacks (subflowId, subflowName, name) for flexibility
 * - Decider evaluation is async-safe to support both sync and async decider functions
 *
 * RELATED:
 * - {@link Pipeline} - Uses NodeResolver for node lookup and subflow resolution
 * - {@link LoopHandler} - Uses findNodeById for loop-back to existing nodes
 * - {@link DeciderHandler} - Uses getNextNode for decider evaluation
 *
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeResolver = void 0;
const logger_1 = require("../../../utils/logger");
/**
 * NodeResolver
 * ------------------------------------------------------------------
 * Handles node lookup and subflow reference resolution.
 *
 * WHY: Centralizes all node resolution logic in one place, making it easier
 * to understand and test how nodes are found and resolved during execution.
 *
 * DESIGN: Uses PipelineContext for access to root node and subflows dictionary,
 * enabling dependency injection for testing.
 *
 * @template TOut - Output type of pipeline stages
 * @template TScope - Scope type passed to stages
 *
 * @example
 * ```typescript
 * const resolver = new NodeResolver(pipelineContext);
 * const node = resolver.findNodeById('my-node-id');
 * const resolved = resolver.resolveSubflowReference(referenceNode);
 * ```
 */
class NodeResolver {
    constructor(ctx) {
        this.ctx = ctx;
    }
    /**
     * Find a node by its ID in the tree (recursive search).
     *
     * WHY: Enables loop-back functionality where a stage can return a reference
     * to an existing node ID, causing execution to continue from that node.
     *
     * DESIGN: Uses depth-first search, checking current node, then children,
     * then next. This order ensures we find the first occurrence in tree order.
     *
     * @param nodeId - The ID of the node to find
     * @param startNode - The node to start searching from (defaults to root)
     * @returns The found node, or undefined if not found
     *
     * _Requirements: 3.1, 3.4_
     */
    findNodeById(nodeId, startNode) {
        const node = startNode !== null && startNode !== void 0 ? startNode : this.ctx.root;
        // Check current node
        if (node.id === nodeId) {
            return node;
        }
        // Check children (depth-first)
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNodeById(nodeId, child);
                if (found)
                    return found;
            }
        }
        // Check next (linear continuation)
        if (node.next) {
            const found = this.findNodeById(nodeId, node.next);
            if (found)
                return found;
        }
        return undefined;
    }
    /**
     * Resolve a subflow reference node to its actual subflow structure.
     *
     * WHY: Reference-based subflows avoid deep-copying the entire subflow tree
     * at build time. Instead, they store a lightweight reference that is resolved
     * at runtime when the subflow is executed.
     *
     * DESIGN: Reference nodes are lightweight placeholders created by the builder:
     * - They have `isSubflowRoot: true` and `subflowId`
     * - But they have NO `fn`, NO `children`, NO internal `next`
     * - The actual subflow structure is in `this.ctx.subflows[subflowKey]`
     *
     * This method looks up the subflow definition and creates a merged node
     * that combines the reference metadata with the actual subflow structure.
     *
     * @param node - The reference node to resolve
     * @returns A node with the subflow's actual structure, preserving reference metadata
     *
     * _Requirements: 3.2, 3.5_
     */
    resolveSubflowReference(node) {
        // If node already has fn or children, it's not a reference - return as-is
        if (node.fn || (node.children && node.children.length > 0)) {
            return node;
        }
        // Check if we have subflows dictionary
        if (!this.ctx.subflows) {
            // No subflows dictionary - node might be using old deep-copy approach
            return node;
        }
        // Try to find subflow definition using multiple keys in order of preference:
        // 1. subflowId (the mount id, used by FlowChartBuilder)
        // 2. subflowName (for backward compatibility)
        // 3. name (fallback)
        // WHY: Multiple fallbacks ensure compatibility with different builder versions
        const keysToTry = [node.subflowId, node.subflowName, node.name].filter(Boolean);
        let subflowDef;
        for (const key of keysToTry) {
            if (this.ctx.subflows[key]) {
                subflowDef = this.ctx.subflows[key];
                break;
            }
        }
        if (!subflowDef) {
            // Subflow not found in dictionary - might be using old approach
            logger_1.logger.info(`Subflow not found in subflows dictionary for node '${node.name}' (tried keys: ${keysToTry.join(', ')})`);
            return node;
        }
        // Create a merged node that combines reference metadata with actual structure
        // IMPORTANT: We preserve the reference node's metadata (subflowId, subflowName, etc.)
        // but use the subflow definition's structure (fn, children, internal next)
        const resolvedNode = {
            ...subflowDef.root,
            // Preserve reference metadata
            isSubflowRoot: node.isSubflowRoot,
            subflowId: node.subflowId,
            subflowName: node.subflowName,
            // Use reference node's display name if provided
            displayName: node.displayName || subflowDef.root.displayName,
            // Use reference node's id (mountId) for uniqueness
            id: node.id || subflowDef.root.id,
            // Preserve subflowMountOptions from the reference node (inputMapper/outputMapper)
            // WHY: The reference node carries the mount-time options (e.g., inputMapper
            // that injects tool arguments). The subflow definition doesn't have these.
            subflowMountOptions: node.subflowMountOptions || subflowDef.root.subflowMountOptions,
        };
        return resolvedNode;
    }
    /**
     * Evaluate decider and pick the next child by id.
     *
     * WHY: Deciders enable conditional branching where the next node is determined
     * at runtime based on the stage output or other conditions.
     *
     * DESIGN: Supports both sync and async decider functions by checking if the
     * result is a Promise before awaiting.
     *
     * @param nextNodeDecider - The decider function to evaluate
     * @param children - Array of child nodes to choose from
     * @param input - Input to pass to the decider (typically stage output)
     * @param context - Optional stage context for debug info
     * @returns The chosen child node
     * @throws Error if the decider returns an ID that doesn't match any child
     *
     * _Requirements: 3.3_
     */
    async getNextNode(nextNodeDecider, children, input, context) {
        const deciderResp = nextNodeDecider(input);
        const nextNodeId = deciderResp instanceof Promise ? await deciderResp : deciderResp;
        context === null || context === void 0 ? void 0 : context.addLog('nextNode', nextNodeId);
        const nextNode = children.find((child) => child.id === nextNodeId);
        if (!nextNode) {
            const errorMessage = `Next Stage not found for ${nextNodeId}`;
            context === null || context === void 0 ? void 0 : context.addError('deciderError', errorMessage);
            throw Error(errorMessage);
        }
        return nextNode;
    }
}
exports.NodeResolver = NodeResolver;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTm9kZVJlc29sdmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvZXhlY3V0b3IvaGFuZGxlcnMvTm9kZVJlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7OztBQUdILGtEQUErQztBQUkvQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FvQkc7QUFDSCxNQUFhLFlBQVk7SUFDdkIsWUFBb0IsR0FBa0M7UUFBbEMsUUFBRyxHQUFILEdBQUcsQ0FBK0I7SUFBRyxDQUFDO0lBRTFEOzs7Ozs7Ozs7Ozs7OztPQWNHO0lBQ0gsWUFBWSxDQUFDLE1BQWMsRUFBRSxTQUFtQztRQUM5RCxNQUFNLElBQUksR0FBRyxTQUFTLGFBQVQsU0FBUyxjQUFULFNBQVMsR0FBSSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztRQUV4QyxxQkFBcUI7UUFDckIsSUFBSSxJQUFJLENBQUMsRUFBRSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUVELCtCQUErQjtRQUMvQixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQy9DLElBQUksS0FBSztvQkFBRSxPQUFPLEtBQUssQ0FBQztZQUMxQixDQUFDO1FBQ0gsQ0FBQztRQUVELG1DQUFtQztRQUNuQyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuRCxJQUFJLEtBQUs7Z0JBQUUsT0FBTyxLQUFL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QUFVLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxNQUFNLFlBQVksR0FBRyw0QkFBNEIsVUFBVSxFQUFFLENBQUM7WUFDOUQsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDaEQsTUFBTSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDO0lBQ2xCLENBQUM7Q0FDRjtBQTdKRCxvQ0E2SkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE5vZGVSZXNvbHZlci50c1xuICpcbiAqIFdIWTogSGFuZGxlcyBub2RlIGxvb2t1cCBhbmQgc3ViZmxvdyByZWZlcmVuY2UgcmVzb2x1dGlvbiBmb3IgdGhlIFBpcGVsaW5lLlxuICogVGhpcyBtb2R1bGUgaXMgZXh0cmFjdGVkIGZyb20gUGlwZWxpbmUudHMgZm9sbG93aW5nIHRoZSBTaW5nbGUgUmVzcG9uc2liaWxpdHkgUHJpbmNpcGxlLFxuICogaXNvbGF0aW5nIHRoZSBjb25jZXJucyBvZiBub2RlIHJlc29sdXRpb24gZnJvbSBwaXBlbGluZSB0cmF2ZXJzYWwuXG4gKlxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gRmluZCBub2RlcyBieSBJRCAocmVjdXJzaXZlIHRyZWUgc2VhcmNoIGZvciBsb29wLWJhY2sgc3VwcG9ydClcbiAqIC0gUmVzb2x2ZSBzdWJmbG93IHJlZmVyZW5jZSBub2RlcyB0byBhY3R1YWwgc3ViZmxvdyBzdHJ1Y3R1cmVzXG4gKiAtIEV2YWx1YXRlIGRlY2lkZXJzIHRvIGRldGVybWluZSBuZXh0IG5vZGUgaW4gYnJhbmNoaW5nIHNjZW5hcmlvc1xuICpcbiAqIERFU0lHTiBERUNJU0lPTlM6XG4gKiAtIFVzZXMgcmVjdXJzaXZlIHRyZWUgc2VhcmNoIGZvciBmaW5kTm9kZUJ5SWQgdG8gaGFuZGxlIGFyYml0cmFyeSB0cmVlIGRlcHRoc1xuICogLSBTdWJmbG93IHJlc29sdXRpb24gdXNlcyBtdWx0aXBsZSBrZXkgZmFsbGJhY2tzIChzdWJmbG93SWQsIHN1YmZsb3dOYW1lLCBuYW1lKSBmb3IgZmxleGliaWxpdHlcbiAqIC0gRGVjaWRlciBldmFsdWF0aW9uIGlzIGFzeW5jLXNhZmUgdG8gc3VwcG9ydCBib3RoIHN5bmMgYW5kIGFzeW5jIGRlY2lkZXIgZnVuY3Rpb25zXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIFBpcGVsaW5lfSAtIFVzZXMgTm9kZVJlc29sdmVyIGZvciBub2RlIGxvb2t1cCBhbmQgc3ViZmxvdyByZXNvbHV0aW9uXG4gKiAtIHtAbGluayBMb29wSGFuZGxlcn0gLSBVc2VzIGZpbmROb2RlQnlJZCBmb3IgbG9vcC1iYWNrIHRvIGV4aXN0aW5nIG5vZGVzXG4gKiAtIHtAbGluayBEZWNpZGVySGFuZGxlcn0gLSBVc2VzIGdldE5leHROb2RlIGZvciBkZWNpZGVyIGV2YWx1YXRpb25cbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiAzLjEsIDMuMiwgMy4zLCAzLjQsIDMuNSwgMy42X1xuICovXG5cbmltcG9ydCB7IFN0YWdlQ29udGV4dCB9IGZyb20gJy4uLy4uL21lbW9yeS9TdGFnZUNvbnRleHQnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbG9nZ2VyJztcbmltcG9ydCB7IFBpcGVsaW5lQ29udGV4dCB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgU3RhZ2VOb2RlLCBEZWNpZGVyIH0gZnJvbSAnLi4vUGlwZWxpbmUnO1xuXG4vKipcbiAqIE5vZGVSZXNvbHZlclxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBIYW5kbGVzIG5vZGUgbG9va3VwIGFuZCBzdWJmbG93IHJlZmVyZW5jZSByZXNvbHV0aW9uLlxuICpcbiAqIFdIWTogQ2VudHJhbGl6ZXMgYWxsIG5vZGUgcmVzb2x1dGlvbiBsb2dpYyBpbiBvbmUgcGxhY2UsIG1ha2luZyBpdCBlYXNpZXJcbiAqIHRvIHVuZGVyc3RhbmQgYW5kIHRlc3QgaG93IG5vZGVzIGFyZSBmb3VuZCBhbmQgcmVzb2x2ZWQgZHVyaW5nIGV4ZWN1dGlvbi5cbiAqXG4gKiBERVNJR046IFVzZXMgUGlwZWxpbmVDb250ZXh0IGZvciBhY2Nlc3MgdG8gcm9vdCBub2RlIGFuZCBzdWJmbG93cyBkaWN0aW9uYXJ5LFxuICogZW5hYmxpbmcgZGVwZW5kZW5jeSBpbmplY3Rpb24gZm9yIHRlc3RpbmcuXG4gKlxuICogQHRlbXBsYXRlIFRPdXQgLSBPdXRwdXQgdHlwZSBvZiBwaXBlbGluZSBzdGFnZXNcbiAqIEB0ZW1wbGF0ZSBUU2NvcGUgLSBTY29wZSB0eXBlIHBhc3NlZCB0byBzdGFnZXNcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3QgcmVzb2x2ZXIgPSBuZXcgTm9kZVJlc29sdmVyKHBpcGVsaW5lQ29udGV4dCk7XG4gKiBjb25zdCBub2RlID0gcmVzb2x2ZXIuZmluZE5vZGVCeUlkKCdteS1ub2RlLWlkJyk7XG4gKiBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVyLnJlc29sdmVTdWJmbG93UmVmZXJlbmNlKHJlZmVyZW5jZU5vZGUpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBOb2RlUmVzb2x2ZXI8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgY3R4OiBQaXBlbGluZUNvbnRleHQ8VE91dCwgVFNjb3BlPikge31cblxuICAvKipcbiAgICogRmluZCBhIG5vZGUgYnkgaXRzIElEIGluIHRoZSB0cmVlIChyZWN1cnNpdmUgc2VhcmNoKS5cbiAgICpcbiAgICogV0hZOiBFbmFibGVzIGxvb3AtYmFjayBmdW5jdGlvbmFsaXR5IHdoZXJlIGEgc3RhZ2UgY2FuIHJldHVybiBhIHJlZmVyZW5jZVxuICAgKiB0byBhbiBleGlzdGluZyBub2RlIElELCBjYXVzaW5nIGV4ZWN1dGlvbiB0byBjb250aW51ZSBmcm9tIHRoYXQgbm9kZS5cbiAgICpcbiAgICogREVTSUdOOiBVc2VzIGRlcHRoLWZpcnN0IHNlYXJjaCwgY2hlY2tpbmcgY3VycmVudCBub2RlLCB0aGVuIGNoaWxkcmVuLFxuICAgKiB0aGVuIG5leHQuIFRoaXMgb3JkZXIgZW5zdXJlcyB3ZSBmaW5kIHRoZSBmaXJzdCBvY2N1cnJlbmNlIGluIHRyZWUgb3JkZXIuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlSWQgLSBUaGUgSUQgb2YgdGhlIG5vZGUgdG8gZmluZFxuICAgKiBAcGFyYW0gc3RhcnROb2RlIC0gVGhlIG5vZGUgdG8gc3RhcnQgc2VhcmNoaW5nIGZyb20gKGRlZmF1bHRzIHRvIHJvb3QpXG4gICAqIEByZXR1cm5zIFRoZSBmb3VuZCBub2RlLCBvciB1bmRlZmluZWQgaWYgbm90IGZvdW5kXG4gICAqXG4gICAqIF9SZXF1aXJlbWVudHM6IDMuMSwgMy40X1xuICAgKi9cbiAgZmluZE5vZGVCeUlkKG5vZGVJZDogc3RyaW5nLCBzdGFydE5vZGU/OiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPik6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+IHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBub2RlID0gc3RhcnROb2RlID8/IHRoaXMuY3R4LnJvb3Q7XG5cbiAgICAvLyBDaGVjayBjdXJyZW50IG5vZGVcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSB7XG4gICAgICByZXR1cm4gbm9kZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBjaGlsZHJlbiAoZGVwdGgtZmlyc3QpXG4gICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuICAgICAgICBjb25zdCBmb3VuZCA9IHRoaXMuZmluZE5vZGVCeUlkKG5vZGVJZCwgY2hpbGQpO1xuICAgICAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBuZXh0IChsaW5lYXIgY29udGludWF0aW9uKVxuICAgIGlmIChub2RlLm5leHQpIHtcbiAgICAgIGNvbnN0IGZvdW5kID0gdGhpcy5maW5kTm9kZUJ5SWQobm9kZUlkLCBub2RlLm5leHQpO1xuICAgICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNvbHZlIGEgc3ViZmxvdyByZWZlcmVuY2Ugbm9kZSB0byBpdHMgYWN0dWFsIHN1YmZsb3cgc3RydWN0dXJlLlxuICAgKlxuICAgKiBXSFk6IFJlZmVyZW5jZS1iYXNlZCBzdWJmbG93cyBhdm9pZCBkZWVwLWNvcHlpbmcgdGhlIGVudGlyZSBzdWJmbG93IHRyZWVcbiAgICogYXQgYnVpbGQgdGltZS4gSW5zdGVhZCwgdGhleSBzdG9yZSBhIGxpZ2h0d2VpZ2h0IHJlZmVyZW5jZSB0aGF0IGlzIHJlc29sdmVkXG4gICAqIGF0IHJ1bnRpbWUgd2hlbiB0aGUgc3ViZmxvdyBpcyBleGVjdXRlZC5cbiAgICpcbiAgICogREVTSUdOOiBSZWZlcmVuY2Ugbm9kZXMgYXJlIGxpZ2h0d2VpZ2h0IHBsYWNlaG9sZGVycyBjcmVhdGVkIGJ5IHRoZSBidWlsZGVyOlxuICAgKiAtIFRoZXkgaGF2ZSBgaXNTdWJmbG93Um9vdDogdHJ1ZWAgYW5kIGBzdWJmbG93SWRgXG4gICAqIC0gQnV0IHRoZXkgaGF2ZSBOTyBgZm5gLCBOTyBgY2hpbGRyZW5gLCBOTyBpbnRlcm5hbCBgbmV4dGBcbiAgICogLSBUaGUgYWN0dWFsIHN1YmZsb3cgc3RydWN0dXJlIGlzIGluIGB0aGlzLmN0eC5zdWJmbG93c1tzdWJmbG93S2V5XWBcbiAgICpcbiAgICogVGhpcyBtZXRob2QgbG9va3MgdXAgdGhlIHN1YmZsb3cgZGVmaW5pdGlvbiBhbmQgY3JlYXRlcyBhIG1lcmdlZCBub2RlXG4gICAqIHRoYXQgY29tYmluZXMgdGhlIHJlZmVyZW5jZSBtZXRhZGF0YSB3aXRoIHRoZSBhY3R1YWwgc3ViZmxvdyBzdHJ1Y3R1cmUuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIHJlZmVyZW5jZSBub2RlIHRvIHJlc29sdmVcbiAgICogQHJldHVybnMgQSBub2RlIHdpdGggdGhlIHN1YmZsb3cncyBhY3R1YWwgc3RydWN0dXJlLCBwcmVzZXJ2aW5nIHJlZmVyZW5jZSBtZXRhZGF0YVxuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiAzLjIsIDMuNV9cbiAgICovXG4gIHJlc29sdmVTdWJmbG93UmVmZXJlbmNlKG5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+KTogU3RhZ2VOb2RlPFRPdXQsIFRTY29wZT4ge1xuICAgIC8vIElmIG5vZGUgYWxyZWFkeSBoYXMgZm4gb3IgY2hpbGRyZW4sIGl0J3Mgbm90IGEgcmVmZXJlbmNlIC0gcmV0dXJuIGFzLWlzXG4gICAgaWYgKG5vZGUuZm4gfHwgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSkge1xuICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBzdWJmbG93cyBkaWN0aW9uYXJ5XG4gICAgaWYgKCF0aGlzLmN0eC5zdWJmbG93cykge1xuICAgICAgLy8gTm8gc3ViZmxvd3MgZGljdGlvbmFyeSAtIG5vZGUgbWlnaHQgYmUgdXNpbmcgb2xkIGRlZXAtY29weSBhcHByb2FjaFxuICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfVxuXG4gICAgLy8gVHJ5IHRvIGZpbmQgc3ViZmxvdyBkZWZpbml0aW9uIHVzaW5nIG11bHRpcGxlIGtleXMgaW4gb3JkZXIgb2YgcHJlZmVyZW5jZTpcbiAgICAvLyAxLiBzdWJmbG93SWQgKHRoZSBtb3VudCBpZCwgdXNlZCBieSBGbG93Q2hhcnRCdWlsZGVyKVxuICAgIC8vIDIuIHN1YmZsb3dOYW1lIChmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAgICAvLyAzLiBuYW1lIChmYWxsYmFjaylcbiAgICAvLyBXSFk6IE11bHRpcGxlIGZhbGxiYWNrcyBlbnN1cmUgY29tcGF0aWJpbGl0eSB3aXRoIGRpZmZlcmVudCBidWlsZGVyIHZlcnNpb25zXG4gICAgY29uc3Qga2V5c1RvVHJ5ID0gW25vZGUuc3ViZmxvd0lkLCBub2RlLnN1YmZsb3dOYW1lLCBub2RlLm5hbWVdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXTtcbiAgICBsZXQgc3ViZmxvd0RlZjogeyByb290OiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPiB9IHwgdW5kZWZpbmVkO1xuXG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5c1RvVHJ5KSB7XG4gICAgICBpZiAodGhpcy5jdHguc3ViZmxvd3Nba2V5XSkge1xuICAgICAgICBzdWJmbG93RGVmID0gdGhpcy5jdHguc3ViZmxvd3Nba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFzdWJmbG93RGVmKSB7XG4gICAgICAvLyBTdWJmbG93IG5vdCBmb3VuZCBpbiBkaWN0aW9uYXJ5IC0gbWlnaHQgYmUgdXNpbmcgb2xkIGFwcHJvYWNoXG4gICAgICBsb2dnZXIuaW5mbyhcbiAgICAgICAgYFN1YmZsb3cgbm90IGZvdW5kIGluIHN1YmZsb3dzIGRpY3Rpb25hcnkgZm9yIG5vZGUgJyR7bm9kZS5uYW1lfScgKHRyaWVkIGtleXM6ICR7a2V5c1RvVHJ5LmpvaW4oJywgJyl9KWAsXG4gICAgICApO1xuICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGEgbWVyZ2VkIG5vZGUgdGhhdCBjb21iaW5lcyByZWZlcmVuY2UgbWV0YWRhdGEgd2l0aCBhY3R1YWwgc3RydWN0dXJlXG4gICAgLy8gSU1QT1JUQU5UOiBXZSBwcmVzZXJ2ZSB0aGUgcmVmZXJlbmNlIG5vZGUncyBtZXRhZGF0YSAoc3ViZmxvd0lkLCBzdWJmbG93TmFtZSwgZXRjLilcbiAgICAvLyBidXQgdXNlIHRoZSBzdWJmbG93IGRlZmluaXRpb24ncyBzdHJ1Y3R1cmUgKGZuLCBjaGlsZHJlbiwgaW50ZXJuYWwgbmV4dClcbiAgICBjb25zdCByZXNvbHZlZE5vZGU6IFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+ID0ge1xuICAgICAgLi4uc3ViZmxvd0RlZi5yb290LFxuICAgICAgLy8gUHJlc2VydmUgcmVmZXJlbmNlIG1ldGFkYXRhXG4gICAgICBpc1N1YmZsb3dSb290OiBub2RlLmlzU3ViZmxvd1Jvb3QsXG4gICAgICBzdWJmbG93SWQ6IG5vZGUuc3ViZmxvd0lkLFxuICAgICAgc3ViZmxvd05hbWU6IG5vZGUuc3ViZmxvd05hbWUsXG4gICAgICAvLyBVc2UgcmVmZXJlbmNlIG5vZGUncyBkaXNwbGF5IG5hbWUgaWYgcHJvdmlkZWRcbiAgICAgIGRpc3BsYXlOYW1lOiBub2RlLmRpc3BsYXlOYW1lIHx8IHN1YmZsb3dEZWYucm9vdC5kaXNwbGF5TmFtZSxcbiAgICAgIC8vIFVzZSByZWZlcmVuY2Ugbm9kZSdzIGlkIChtb3VudElkKSBmb3IgdW5pcXVlbmVzc1xuICAgICAgaWQ6IG5vZGUuaWQgfHwgc3ViZmxvd0RlZi5yb290LmlkLFxuICAgICAgLy8gUHJlc2VydmUgc3ViZmxvd01vdW50T3B0aW9ucyBmcm9tIHRoZSByZWZlcmVuY2Ugbm9kZSAoaW5wdXRNYXBwZXIvb3V0cHV0TWFwcGVyKVxuICAgICAgLy8gV0hZOiBUaGUgcmVmZXJlbmNlIG5vZGUgY2FycmllcyB0aGUgbW91bnQtdGltZSBvcHRpb25zIChlLmcuLCBpbnB1dE1hcHBlclxuICAgICAgLy8gdGhhdCBpbmplY3RzIHRvb2wgYXJndW1lbnRzKS4gVGhlIHN1YmZsb3cgZGVmaW5pdGlvbiBkb2Vzbid0IGhhdmUgdGhlc2UuXG4gICAgICBzdWJmbG93TW91bnRPcHRpb25zOiBub2RlLnN1YmZsb3dNb3VudE9wdGlvbnMgfHwgc3ViZmxvd0RlZi5yb290LnN1YmZsb3dNb3VudE9wdGlvbnMsXG4gICAgfTtcblxuICAgIHJldHVybiByZXNvbHZlZE5vZGU7XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgZGVjaWRlciBhbmQgcGljayB0aGUgbmV4dCBjaGlsZCBieSBpZC5cbiAgICpcbiAgICogV0hZOiBEZWNpZGVycyBlbmFibGUgY29uZGl0aW9uYWwgYnJhbmNoaW5nIHdoZXJlIHRoZSBuZXh0IG5vZGUgaXMgZGV0ZXJtaW5lZFxuICAgKiBhdCBydW50aW1lIGJhc2VkIG9uIHRoZSBzdGFnZSBvdXRwdXQgb3Igb3RoZXIgY29uZGl0aW9ucy5cbiAgICpcbiAgICogREVTSUdOOiBTdXBwb3J0cyBib3RoIHN5bmMgYW5kIGFzeW5jIGRlY2lkZXIgZnVuY3Rpb25zIGJ5IGNoZWNraW5nIGlmIHRoZVxuICAgKiByZXN1bHQgaXMgYSBQcm9taXNlIGJlZm9yZSBhd2FpdGluZy5cbiAgICpcbiAgICogQHBhcmFtIG5leHROb2RlRGVjaWRlciAtIFRoZSBkZWNpZGVyIGZ1bmN0aW9uIHRvIGV2YWx1YXRlXG4gICAqIEBwYXJhbSBjaGlsZHJlbiAtIEFycmF5IG9mIGNoaWxkIG5vZGVzIHRvIGNob29zZSBmcm9tXG4gICAqIEBwYXJhbSBpbnB1dCAtIElucHV0IHRvIHBhc3MgdG8gdGhlIGRlY2lkZXIgKHR5cGljYWxseSBzdGFnZSBvdXRwdXQpXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gT3B0aW9uYWwgc3RhZ2UgY29udGV4dCBmb3IgZGVidWcgaW5mb1xuICAgKiBAcmV0dXJucyBUaGUgY2hvc2VuIGNoaWxkIG5vZGVcbiAgICogQHRocm93cyBFcnJvciBpZiB0aGUgZGVjaWRlciByZXR1cm5zIGFuIElEIHRoYXQgZG9lc24ndCBtYXRjaCBhbnkgY2hpbGRcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMy4zX1xuICAgKi9cbiAgYXN5bmMgZ2V0TmV4dE5vZGUoXG4gICAgbmV4dE5vZGVEZWNpZGVyOiBEZWNpZGVyLFxuICAgIGNoaWxkcmVuOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPltdLFxuICAgIGlucHV0PzogVE91dCxcbiAgICBjb250ZXh0PzogU3RhZ2VDb250ZXh0LFxuICApOiBQcm9taXNlPFN0YWdlTm9kZTxUT3V0LCBUU2NvcGU+PiB7XG4gICAgY29uc3QgZGVjaWRlclJlc3AgPSBuZXh0Tm9kZURlY2lkZXIoaW5wdXQpO1xuICAgIGNvbnN0IG5leHROb2RlSWQgPSBkZWNpZGVyUmVzcCBpbnN0YW5jZW9mIFByb21pc2UgPyBhd2FpdCBkZWNpZGVyUmVzcCA6IGRlY2lkZXJSZXNwO1xuXG4gICAgY29udGV4dD8uYWRkTG9nKCduZXh0Tm9kZScsIG5leHROb2RlSWQpO1xuXG4gICAgY29uc3QgbmV4dE5vZGUgPSBjaGlsZHJlbi5maW5kKChjaGlsZCkgPT4gY2hpbGQuaWQgPT09IG5leHROb2RlSWQpO1xuICAgIGlmICghbmV4dE5vZGUpIHtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGBOZXh0IFN0YWdlIG5vdCBmb3VuZCBmb3IgJHtuZXh0Tm9kZUlkfWA7XG4gICAgICBjb250ZXh0Py5hZGRFcnJvcignZGVjaWRlckVycm9yJywgZXJyb3JNZXNzYWdlKTtcbiAgICAgIHRocm93IEVycm9yKGVycm9yTWVzc2FnZSk7XG4gICAgfVxuICAgIHJldHVybiBuZXh0Tm9kZTtcbiAgfVxufVxuIl19