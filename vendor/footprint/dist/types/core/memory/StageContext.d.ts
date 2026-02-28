/**
 * StageContext - Execution context for a single pipeline stage
 *
 * WHY: Each stage needs isolated access to shared state with atomic commit
 * semantics. StageContext provides this by wrapping GlobalStore with a
 * WriteBuffer for staged mutations.
 *
 * DESIGN: Like a stack frame in a compiler/runtime:
 * - Reference to GlobalStore (like accessing heap memory)
 * - WriteBuffer for staging mutations (like a transaction buffer)
 * - Links to parent/child/next contexts (like call stack frames)
 * - Metadata collector for logs, errors, metrics
 *
 * RESPONSIBILITIES:
 * - Hold ephemeral state for a single stage execution
 * - Delegate reads/writes to WriteBuffer for batching
 * - Atomically commit changes to GlobalStore
 * - Create child/next contexts for tree traversal
 *
 * RELATED:
 * - {@link GlobalStore} - The shared state container
 * - {@link WriteBuffer} - Transaction buffer for mutations
 * - {@link StageMetadata} - Logs, errors, metrics collector
 *
 * @example
 * ```typescript
 * const ctx = new StageContext('pipeline-1', 'validate', globalStore);
 * ctx.setObject(['user'], 'name', 'Alice');
 * ctx.commit(); // Atomically applies to GlobalStore
 * ```
 */
import { ExecutionHistory } from '../../internal/history/ExecutionHistory';
import { WriteBuffer } from '../../internal/memory/WriteBuffer';
import { StageMetadata } from './StageMetadata';
import { GlobalStore } from './GlobalStore';
import type { FlowControlType, FlowMessage } from '../executor/types';
/**
 * Serializable representation of a stage's state.
 * WHY: Used for debugging, visualization, and time-travel features.
 */
export type StageSnapshot = {
    id: string;
    name?: string;
    isDecider?: boolean;
    isFork?: boolean;
    logs: Record<string, unknown>;
    errors: Record<string, unknown>;
    metrics: Record<string, unknown>;
    evals: Record<string, unknown>;
    flowMessages?: FlowMessage[];
    next?: StageSnapshot;
    children?: StageSnapshot[];
};
export declare class StageContext {
    private globalStore;
    private writeBuffer?;
    private executionHistory?;
    stageName: string;
    pipelineId: string;
    branchId?: string;
    isDecider: boolean;
    isFork: boolean;
    parent?: StageContext;
    next?: StageContext;
    children?: StageContext[];
    debug: StageMetadata;
    constructor(pipelineId: string, name: string, globalStore: GlobalStore, branchId?: string, executionHistory?: ExecutionHistory, isDecider?: boolean);
    /**
     * Gets the write buffer for staging mutations.
     * WHY: Lazily instantiates so we pay clone cost only if stage writes.
     */
    getWriteBuffer(): WriteBuffer;
    /**
     * Builds an absolute path inside the shared GlobalStore.
     * WHY: Pipelines are namespaced under 'pipelines/{id}/' to prevent collisions.
     */
    private withNamespace;
    /**
     * Hard overwrite at the specified path.
     */
    patch(path: string[], key: string, value: unknown, shouldRedact?: boolean): void;
    set(path: string[], key: string, value: unknown): void;
    /**
     * Deep union merge at the specified path.
     */
    merge(path: string[], key: string, value: unknown): void;
    /**
     * Flushes staged mutations into the GlobalStore.
     * WHY: Atomic commit ensures all-or-nothing semantics.
     */
    commit(): void;
    /**
     * Creates the linear successor stage context.
     * WHY: Enables pipeline traversal without duplicating contexts.
     */
    createNext(path: string, stageName: string, isDecider?: boolean): StageContext;
    /**
     * Creates a branch context for parallel execution.
     * WHY: Fan-out stages need separate contexts but share GlobalStore.
     */
    createChild(pipelineId: string, branchId: string, stageName: string, isDecider?: boolean): StageContext;
    createDecider(path: string, stageName: string): StageContext;
    setAsDecider(): StageContext;
    setAsFork(): StageContext;
    setRoot(key: string, value: unknown): void;
    updateObject(path: string[], key: string, value: unknown, description?: string): void;
    updateGlobalContext(key: string, value: unknown): void;
    setGlobal(key: string, value: unknown, description?: string): void;
    setObject(path: string[], key: string, value: unknown, shouldRedact?: boolean, description?: string): void;
    /**
     * Append items to an existing array at the given scope path.
     *
     * WHY: Stages and subflow output mappers frequently need to add items to
     * collections (e.g., appending a message to conversation history). Without
     * this primitive, consumers must do a manual read-append-write:
     *   const arr = scope.getValue(path, key);
     *   arr.push(newItem);
     *   scope.setObject(path, key, arr);
     *
     * This method encapsulates that pattern as a first-class operation.
     *
     * DESIGN: Reads the existing value, appends new items, writes back the
     * full merged array via setObject. If no existing array is found, the
     * items become the new array. The full array is written to the WriteBuffer,
     * so commit history captures the complete state (not just the delta).
     *
     * FUTURE: For granular "item was appended" tracking in the time traveler,
     * this would need WriteBuffer-level CRDT support. See:
     * docs/future/CRDT-array-operations.md
     *
     * @param path - Scope path (e.g., ['agent'])
     * @param key - Key within the path (e.g., 'messages')
     * @param items - Array of items to append
     * @param description - Optional debug description
     */
    appendToArray(path: string[], key: string, items: unknown[], description?: string): void;
    /**
     * Shallow merge an object into an existing object at the given scope path.
     *
     * WHY: Stages and subflow output mappers frequently need to add keys to
     * existing objects without replacing the entire object. Without this
     * primitive, consumers must do a manual read-merge-write.
     *
     * DESIGN: Reads the existing value, shallow merges new keys (new keys
     * win on conflict), writes back via setObject. If no existing object
     * is found, the new object becomes the value.
     *
     * FUTURE: For granular "key was merged" tracking in the time traveler,
     * this would need WriteBuffer-level CRDT support. See:
     * docs/future/CRDT-array-operations.md
     *
     * @param path - Scope path (e.g., ['agent'])
     * @param key - Key within the path (e.g., 'config')
     * @param obj - Object with keys to merge
     * @param description - Optional debug description
     */
    mergeObject(path: string[], key: string, obj: Record<string, unknown>, description?: string): void;
    /**
     * Reads a value with read-after-write semantics.
     * WHY: Staged writes should be visible before commit.
     */
    getValue(path: string[], key?: string, description?: string): any;
    getPipelineId(): string;
    get(path: string[], key?: string): any;
    getRoot(key: string): any;
    getGlobal(key: string): any;
    getFromRoot(key: string): any;
    getFromGlobalContext(key: string): any;
    getScope(): Record<string, unknown>;
    addLog(key: string, value: unknown, path?: string[]): void;
    setLog(key: string, value: unknown, path?: string[]): void;
    addMetric(key: string, value: unknown, path?: string[]): void;
    setMetric(key: string, value: unknown, path?: string[]): void;
    addEval(key: string, value: unknown, path?: string[]): void;
    setEval(key: string, value: unknown, path?: string[]): void;
    addError(key: string, value: unknown, path?: string[]): void;
    addFlowDebugMessage(type: FlowControlType, description: string, options?: {
        targetStage?: string | string[];
        rationale?: string;
        count?: number;
        iteration?: number;
    }): void;
    getStageId(): string;
    getSnapshot(): StageSnapshot;
}
