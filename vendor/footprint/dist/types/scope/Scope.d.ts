/**
 * Scope - Core runtime memory container for pipeline execution
 * ----------------------------------------------------------------------------
 * The Scope class provides the primary interface for stages to read from and
 * write to state during flow execution. It wraps GlobalStore for persistence
 * and WriteBuffer for transactional writes.
 *
 * Key features:
 *   - getValue: Read values from the store with namespace isolation
 *   - setValue: Overwrite values at a path/key
 *   - updateValue: Deep-merge values at a path/key
 *   - commit: Flush staged writes to GlobalStore
 *   - Read-after-write consistency: Writes are immediately available for reads
 *
 * This implementation focuses on core operations. Recorder hooks and time-travel
 * support will be added in subsequent tasks.
 *
 * @module scope/Scope
 */
import type { GlobalStore } from '../core/memory/GlobalStore';
import type { Recorder, ScopeOptions, ScopeSnapshot } from './types';
/**
 * Scope - Core runtime memory container for pipeline execution
 *
 * Provides getValue, setValue, updateValue, and commit operations with
 * namespace isolation via pipelineId.
 */
export declare class Scope {
    private readonly globalStore;
    private readonly executionHistory?;
    private readonly pipelineId;
    private stageName;
    /**
     * Local cache for read-after-write consistency.
     * Stores values that have been written but not yet committed.
     */
    private localCache;
    /**
     * Staged writes waiting to be committed.
     */
    private stagedWrites;
    /**
     * Recorders attached at the global scope level.
     * Will be populated in Task 5.1.
     */
    private recorders;
    /**
     * Recorders attached at the stage level.
     * Will be populated in Task 5.1.
     */
    private stageRecorders;
    /**
     * Snapshot history for time-travel support.
     * Will be populated in Task 3.1.
     */
    private snapshots;
    /**
     * Stage start time for duration tracking.
     * Will be used in Task 5.2.
     */
    private stageStartTime?;
    /**
     * Creates a new Scope instance.
     *
     * @param options - Configuration options for the scope
     * @param options.pipelineId - Unique identifier for namespace isolation
     * @param options.stageName - Initial stage name
     * @param options.globalStore - Shared state container for persistence
     * @param options.executionHistory - Optional history tracker for time-travel
     * @param options.recorders - Optional initial recorders to attach
     */
    constructor(options: ScopeOptions);
    /**
     * Reads a value from the scope.
     *
     * First checks the local cache for uncommitted writes (read-after-write
     * consistency), then falls back to GlobalStore.
     *
     * @param path - The namespace path for the read operation
     * @param key - Optional key to read a specific field
     * @returns The value at the path/key, or undefined if not found
     *
     * @example
     * ```typescript
     * // Read entire object at path
     * const config = scope.getValue(['config']);
     *
     * // Read specific key at path
     * const timeout = scope.getValue(['config'], 'timeout');
     * ```
     */
    getValue(path: string[], key?: string): unknown;
    /**
     * Sets a value at the specified path/key, overwriting any existing value.
     *
     * The write is staged locally and made immediately available for subsequent
     * reads (read-after-write consistency). Call commit() to persist to GlobalStore.
     *
     * @param path - The namespace path for the write operation
     * @param key - The key to write to
     * @param value - The value to write
     *
     * @throws TypeError if path is not an array or key is not a string
     *
     * @example
     * ```typescript
     * scope.setValue(['config'], 'timeout', 5000);
     * scope.setValue(['users'], 'admin', { name: 'Admin', role: 'admin' });
     * ```
     */
    setValue(path: string[], key: string, value: unknown): void;
    /**
     * Updates a value at the specified path/key using deep merge semantics.
     *
     * If the existing value is an object, the new value is deep-merged into it.
     * If the existing value is an array, arrays are unioned without duplicates.
     * For primitives, the new value overwrites the existing value.
     *
     * The write is staged locally and made immediately available for subsequent
     * reads (read-after-write consistency). Call commit() to persist to GlobalStore.
     *
     * @param path - The namespace path for the update operation
     * @param key - The key to update
     * @param value - The value to merge
     *
     * @throws TypeError if path is not an array or key is not a string
     *
     * @example
     * ```typescript
     * // Existing: { timeout: 5000 }
     * scope.updateValue(['config'], 'settings', { retries: 3 });
     * // Result: { timeout: 5000, retries: 3 }
     * ```
     */
    updateValue(path: string[], key: string, value: unknown): void;
    /**
     * Commits all staged writes to GlobalStore.
     *
     * Applies all setValue and updateValue operations that have been staged
     * since the last commit. For updateValue operations, the deep-merged result
     * is computed and written as a setValue to preserve deep merge semantics.
     *
     * After commit, the local cache is cleared and subsequent reads will go
     * directly to GlobalStore. A snapshot of the current state is also created
     * for time-travel support.
     *
     * @example
     * ```typescript
     * scope.setValue(['config'], 'timeout', 5000);
     * scope.updateValue(['config'], 'settings', { retries: 3 });
     * scope.commit(); // Persists both writes to GlobalStore
     * ```
     */
    commit(): void;
    /**
     * Creates a snapshot of the current state.
     *
     * Called internally after each commit to record the state for time-travel.
     * The snapshot includes a deep copy of the state to ensure immutability.
     */
    private createSnapshot;
    /**
     * Returns all recorded snapshots.
     *
     * Snapshots are created on each commit and contain the state at that point
     * in time. This method returns a shallow copy of the snapshots array to
     * prevent external modification.
     *
     * @returns Array of all recorded snapshots
     *
     * @example
     * ```typescript
     * scope.setValue(['config'], 'a', 1);
     * scope.commit();
     * scope.setValue(['config'], 'b', 2);
     * scope.commit();
     *
     * const snapshots = scope.getSnapshots();
     * console.log(snapshots.length); // 2
     * ```
     */
    getSnapshots(): ScopeSnapshot[];
    /**
     * Returns the state at a specific snapshot index.
     *
     * This is a read-only operation that does NOT modify the current execution
     * state. Returns undefined if the index is out of bounds.
     *
     * @param index - The snapshot index (0-based)
     * @returns The state at that snapshot, or undefined if out of bounds
     *
     * @example
     * ```typescript
     * scope.setValue(['config'], 'value', 'first');
     * scope.commit();
     * scope.setValue(['config'], 'value', 'second');
     * scope.commit();
     *
     * const firstState = scope.getStateAt(0);
     * console.log(firstState?.config?.value); // 'first'
     * ```
     */
    getStateAt(index: number): Record<string, unknown> | undefined;
    /**
     * Returns the index of the most recent snapshot.
     *
     * Returns -1 if no snapshots have been recorded yet.
     *
     * @returns The index of the most recent snapshot, or -1 if none exist
     *
     * @example
     * ```typescript
     * console.log(scope.getCurrentSnapshotIndex()); // -1 (no commits yet)
     *
     * scope.setValue(['config'], 'value', 1);
     * scope.commit();
     * console.log(scope.getCurrentSnapshotIndex()); // 0
     *
     * scope.setValue(['config'], 'value', 2);
     * scope.commit();
     * console.log(scope.getCurrentSnapshotIndex()); // 1
     * ```
     */
    getCurrentSnapshotIndex(): number;
    /**
     * Signals the start of a new stage.
     *
     * Updates the current stage name and invokes the onStageStart hook on all
     * active recorders. Also records the start time for duration tracking.
     *
     * @param stageName - The name of the stage that is starting
     *
     * @example
     * ```typescript
     * scope.startStage('processData');
     * // ... perform stage operations ...
     * scope.endStage();
     * ```
     */
    startStage(stageName: string): void;
    /**
     * Signals the end of the current stage.
     *
     * Invokes the onStageEnd hook on all active recorders with the duration
     * since startStage was called. Optionally resets the stage name.
     *
     * @param resetStageName - If true, resets stageName to empty string (default: false)
     *
     * @example
     * ```typescript
     * scope.startStage('processData');
     * // ... perform stage operations ...
     * scope.endStage();
     *
     * // Or reset stage name after ending
     * scope.endStage(true);
     * ```
     */
    endStage(resetStageName?: boolean): void;
    /**
     * Attaches a recorder at the global scope level.
     *
     * Global recorders receive events for all operations across all stages.
     * Recorders are invoked in attachment order.
     *
     * @param recorder - The recorder to attach
     *
     * @example
     * ```typescript
     * const metricRecorder = new MetricRecorder();
     * scope.attachRecorder(metricRecorder);
     * ```
     */
    attachRecorder(recorder: Recorder): void;
    /**
     * Attaches a recorder at the stage level.
     *
     * Stage-level recorders only receive events for operations performed
     * during the specified stage. This allows targeted recording for
     * specific stages without noise from other stages.
     *
     * @param stageName - The name of the stage to attach the recorder to
     * @param recorder - The recorder to attach
     *
     * @example
     * ```typescript
     * const debugRecorder = new DebugRecorder({ verbosity: 'verbose' });
     * scope.attachStageRecorder('processData', debugRecorder);
     * ```
     */
    attachStageRecorder(stageName: string, recorder: Recorder): void;
    /**
     * Detaches a recorder by its ID.
     *
     * Removes the recorder from both global and stage-level attachment.
     * If the recorder is not found, this is a no-op (silent).
     *
     * @param recorderId - The unique ID of the recorder to detach
     *
     * @example
     * ```typescript
     * scope.attachRecorder(metricRecorder);
     * // ... later ...
     * scope.detachRecorder(metricRecorder.id);
     * ```
     */
    detachRecorder(recorderId: string): void;
    /**
     * Returns all attached recorders (global and stage-level).
     *
     * Returns a new array containing all recorders. Global recorders
     * are listed first, followed by stage-level recorders.
     *
     * @returns Array of all attached recorders
     *
     * @example
     * ```typescript
     * scope.attachRecorder(metricRecorder);
     * scope.attachStageRecorder('processData', debugRecorder);
     *
     * const recorders = scope.getRecorders();
     * console.log(recorders.length); // 2
     * ```
     */
    getRecorders(): Recorder[];
    /**
     * Gets the active recorders for the current stage.
     *
     * Returns global recorders plus any stage-specific recorders for
     * the current stage. Used internally by invokeHook.
     *
     * @returns Array of recorders active for the current stage
     */
    private getActiveRecorders;
    /**
     * Invokes a hook on all active recorders with error handling.
     *
     * Recorders are invoked in attachment order. If a recorder throws
     * an error:
     *   1. The error is caught and not propagated to the calling code
     *   2. The error is passed to onError hooks of other recorders
     *   3. The scope operation continues normally
     *   4. A warning is logged in development mode
     *
     * @param hook - The name of the hook to invoke
     * @param event - The event payload to pass to the hook
     *
     * @internal
     */
    private invokeHook;
    /**
     * Maps a hook name to an operation type for error events.
     *
     * @param hook - The hook name
     * @returns The corresponding operation type
     *
     * @internal
     */
    private hookToOperation;
    /**
     * Builds a cache key for local storage.
     *
     * @param path - The namespace path
     * @param key - Optional key
     * @returns A string key for the local cache
     */
    private buildCacheKey;
    /**
     * Gets the pipeline ID for this scope.
     */
    getPipelineId(): string;
    /**
     * Gets the current stage name.
     */
    getStageName(): string;
    /**
     * Gets the underlying GlobalStore.
     * Primarily for testing and integration purposes.
     */
    getGlobalStore(): GlobalStore;
}
