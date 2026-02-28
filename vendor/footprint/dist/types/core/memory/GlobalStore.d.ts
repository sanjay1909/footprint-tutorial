/**
 * GlobalStore - The shared state container for all pipeline execution
 *
 * WHY: Pipelines need a centralized place to store and retrieve state.
 * This is the single source of truth that all stages read from and write to.
 *
 * DESIGN: Like a compiler's symbol table or runtime heap:
 * - Namespace isolation: Each pipeline has its own namespace (pipelines/{id}/)
 * - Default values: Can be initialized with defaults that are preserved
 * - Patch application: Accepts commit bundles from WriteBuffer
 *
 * RESPONSIBILITIES:
 * - Store and retrieve values by path
 * - Apply commit bundles from WriteBuffer
 * - Maintain namespace isolation between pipelines
 *
 * RELATED:
 * - {@link WriteBuffer} - Produces commit bundles
 * - {@link StageContext} - Provides stage-scoped access to GlobalStore
 *
 * @example
 * ```typescript
 * const store = new GlobalStore({ defaultConfig: {} });
 * store.setValue('pipeline-1', ['user'], 'name', 'Alice');
 * const name = store.getValue('pipeline-1', ['user'], 'name'); // 'Alice'
 * ```
 */
import { MemoryPatch } from '../../internal/memory/WriteBuffer';
export declare class GlobalStore {
    private context;
    private _defaultValues?;
    constructor(defaultValues?: unknown, initialContext?: unknown);
    /**
     * Gets a clone of the default values.
     * WHY: Consumers may need defaults for initialization or reset.
     */
    getDefaultValues(): {} | undefined;
    /**
     * Gets all pipeline namespaces.
     * WHY: Enables iteration over all pipelines for debugging/visualization.
     */
    getPipelines(): any;
    /**
     * Updates a value using merge semantics.
     * WHY: Enables additive updates without losing existing nested data.
     */
    updateValue(pipelineId: string, path: string[], key: string, value: unknown): void;
    /**
     * Sets a value using overwrite semantics.
     * WHY: Some operations need to completely replace a value.
     */
    setValue(pipelineId: string, path: string[], key: string, value: unknown): void;
    /**
     * Reads a value from the store.
     * WHY: Stages need to access shared state during execution.
     *
     * DESIGN: Looks up in pipeline namespace first, falls back to global.
     * This allows pipeline-specific overrides of global values.
     */
    getValue(pipelineId?: string, path?: string[], key?: string): any;
    /**
     * Gets the entire state as a JSON object.
     * WHY: Enables serialization for persistence or debugging.
     */
    getState(): Record<string, unknown>;
    /**
     * Applies a commit bundle from WriteBuffer.
     * WHY: Stages commit their mutations through WriteBuffer, which produces
     * patches that need to be applied to the global state.
     */
    applyPatch(overwrite: MemoryPatch, updates: MemoryPatch, trace: {
        path: string;
        verb: 'set' | 'merge';
    }[]): void;
}
