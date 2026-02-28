/**
 * WriteBuffer - Transactional write buffer for stage mutations
 *
 * WHY: Stages need atomic commit semantics - all mutations succeed or none do.
 * This buffer collects writes during execution and commits them atomically.
 *
 * DESIGN: Similar to a database transaction buffer or compiler IR:
 * - Changes are staged here before being committed to GlobalStore
 * - Enables read-after-write consistency within a stage
 * - Records operation trace for time-travel debugging
 *
 * RESPONSIBILITIES:
 * - Collect overwrite patches (set operations)
 * - Collect update patches (merge operations)
 * - Track operation order for deterministic replay
 * - Provide atomic commit with all patches and trace
 *
 * RELATED:
 * - {@link GlobalStore} - Receives committed patches
 * - {@link StageContext} - Uses WriteBuffer for stage-scoped mutations
 *
 * @example
 * ```typescript
 * const buffer = new WriteBuffer(baseState);
 * buffer.set(['user', 'name'], 'Alice');
 * buffer.merge(['user', 'tags'], ['admin']);
 * const { overwrite, updates, trace } = buffer.commit();
 * ```
 */
export interface MemoryPatch {
    [key: string]: any;
}
/**
 * Delimiter for path serialization.
 * WHY: ASCII Unit-Separator (U+001F) cannot appear in JS identifiers
 * and renders invisibly in logs, making it ideal for path joining.
 */
export declare const DELIM = "\u001F";
export declare class WriteBuffer {
    private readonly baseSnapshot;
    private workingCopy;
    private overwritePatch;
    private updatePatch;
    private opTrace;
    private redactedPaths;
    constructor(base: any);
    /**
     * Hard overwrite at the specified path.
     * WHY: Some operations need to completely replace a value, not merge.
     *
     * @param path - Array path to the target location
     * @param value - Value to set (will be deep cloned)
     * @param shouldRedact - If true, path won't appear in debug logs
     */
    set(path: (string | number)[], value: any, shouldRedact?: boolean): void;
    /**
     * Deep union merge at the specified path.
     * WHY: Enables additive updates without losing existing data.
     * Arrays are unioned, objects are recursively merged.
     *
     * @param path - Array path to the target location
     * @param value - Value to merge (will be deep merged with existing)
     * @param shouldRedact - If true, path won't appear in debug logs
     */
    merge(path: (string | number)[], value: any, shouldRedact?: boolean): void;
    /**
     * Read current value at path (includes uncommitted changes).
     * WHY: Enables read-after-write consistency within a stage.
     */
    get(path: (string | number)[], defaultValue?: any): any;
    /**
     * Flush all staged mutations and return the commit bundle.
     * WHY: Atomic commit ensures all-or-nothing semantics.
     *
     * @returns Commit bundle with patches, redacted paths, and operation trace
     */
    commit(): {
        overwrite: MemoryPatch;
        updates: MemoryPatch;
        redactedPaths: Set<string>;
        trace: {
            path: string;
            verb: 'set' | 'merge';
        }[];
    };
}
/**
 * Applies a commit bundle to a base state by replaying operations in order.
 * WHY: Deterministic replay ensures consistent state reconstruction.
 *
 * DESIGN: Two-phase application:
 * 1. UPDATE phase: Union-merge via deepSmartMerge
 * 2. OVERWRITE phase: Direct set for final values
 *
 * This guarantees "last writer wins" semantics.
 */
export declare function applySmartMerge(base: any, updates: MemoryPatch, overwrite: MemoryPatch, trace: {
    path: string;
    verb: 'set' | 'merge';
}[]): any;
export { WriteBuffer as PatchedMemoryContext };
