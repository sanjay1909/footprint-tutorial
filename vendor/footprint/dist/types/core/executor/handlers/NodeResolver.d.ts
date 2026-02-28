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
import { StageContext } from '../../memory/StageContext';
import { PipelineContext } from '../types';
import type { StageNode, Decider } from '../Pipeline';
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
export declare class NodeResolver<TOut = any, TScope = any> {
    private ctx;
    constructor(ctx: PipelineContext<TOut, TScope>);
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
    findNodeById(nodeId: string, startNode?: StageNode<TOut, TScope>): StageNode<TOut, TScope> | undefined;
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
    resolveSubflowReference(node: StageNode<TOut, TScope>): StageNode<TOut, TScope>;
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
    getNextNode(nextNodeDecider: Decider, children: StageNode<TOut, TScope>[], input?: TOut, context?: StageContext): Promise<StageNode<TOut, TScope>>;
}
