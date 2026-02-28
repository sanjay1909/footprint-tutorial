"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scope = void 0;
const lodash_clonedeep_1 = __importDefault(require("lodash.clonedeep"));
/**
 * Deep merge helper for updateValue operations.
 *
 * Merges source into destination with the following semantics:
 *   - Arrays: Union without duplicates (encounter order preserved)
 *   - Objects: Recursive merge
 *   - Primitives: Source wins
 *
 * @param dst - Destination object
 * @param src - Source object to merge
 * @returns Merged result
 */
function deepMerge(dst, src) {
    // Primitives or null - source wins
    if (src === null || typeof src !== 'object') {
        return src;
    }
    // Array vs array -> union without duplicates
    if (Array.isArray(src) && Array.isArray(dst)) {
        return [...new Set([...dst, ...src])];
    }
    // Array vs non-array -> source wins (replace)
    if (Array.isArray(src)) {
        return [...src];
    }
    // Object merge
    const dstObj = dst && typeof dst === 'object' && !Array.isArray(dst) ? dst : {};
    const out = { ...dstObj };
    for (const key of Object.keys(src)) {
        out[key] = deepMerge(out[key], src[key]);
    }
    return out;
}
/**
 * Scope - Core runtime memory container for pipeline execution
 *
 * Provides getValue, setValue, updateValue, and commit operations with
 * namespace isolation via pipelineId.
 */
class Scope {
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
    constructor(options) {
        /**
         * Local cache for read-after-write consistency.
         * Stores values that have been written but not yet committed.
         */
        this.localCache = new Map();
        /**
         * Staged writes waiting to be committed.
         */
        this.stagedWrites = [];
        /**
         * Recorders attached at the global scope level.
         * Will be populated in Task 5.1.
         */
        this.recorders = [];
        /**
         * Recorders attached at the stage level.
         * Will be populated in Task 5.1.
         */
        this.stageRecorders = new Map();
        /**
         * Snapshot history for time-travel support.
         * Will be populated in Task 3.1.
         */
        this.snapshots = [];
        this.globalStore = options.globalStore;
        this.executionHistory = options.executionHistory;
        this.pipelineId = options.pipelineId;
        this.stageName = options.stageName;
        // Attach initial recorders if provided
        if (options.recorders) {
            for (const recorder of options.recorders) {
                this.recorders.push(recorder);
            }
        }
    }
    // ==========================================================================
    // Core Operations
    // ==========================================================================
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
    getValue(path, key) {
        // Build cache key for local lookup
        const cacheKey = this.buildCacheKey(path, key);
        // Check local cache first for read-after-write consistency
        let value;
        if (this.localCache.has(cacheKey)) {
            value = this.localCache.get(cacheKey);
        }
        else {
            // Fall back to GlobalStore
            value = this.globalStore.getValue(this.pipelineId, path, key);
        }
        // Invoke onRead hook with ReadEvent
        this.invokeHook('onRead', {
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: Date.now(),
            path,
            key,
            value,
        });
        return value;
    }
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
    setValue(path, key, value) {
        // Validate inputs
        if (!Array.isArray(path)) {
            throw new TypeError('path must be an array');
        }
        if (typeof key !== 'string') {
            throw new TypeError('key must be a string');
        }
        // Stage the write
        this.stagedWrites.push({
            path,
            key,
            value,
            operation: 'set',
        });
        // Update local cache for read-after-write consistency
        const cacheKey = this.buildCacheKey(path, key);
        this.localCache.set(cacheKey, value);
        // Invoke onWrite hook with WriteEvent
        this.invokeHook('onWrite', {
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: Date.now(),
            path,
            key,
            value,
            operation: 'set',
        });
    }
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
    updateValue(path, key, value) {
        // Validate inputs
        if (!Array.isArray(path)) {
            throw new TypeError('path must be an array');
        }
        if (typeof key !== 'string') {
            throw new TypeError('key must be a string');
        }
        // Stage the write
        this.stagedWrites.push({
            path,
            key,
            value,
            operation: 'update',
        });
        // Get current value for merge (check cache first, then GlobalStore)
        const cacheKey = this.buildCacheKey(path, key);
        let currentValue;
        if (this.localCache.has(cacheKey)) {
            currentValue = this.localCache.get(cacheKey);
        }
        else {
            currentValue = this.globalStore.getValue(this.pipelineId, path, key);
        }
        // Deep merge and update cache for read-after-write consistency
        const mergedValue = deepMerge(currentValue, value);
        this.localCache.set(cacheKey, mergedValue);
        // Invoke onWrite hook with WriteEvent
        this.invokeHook('onWrite', {
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: Date.now(),
            path,
            key,
            value,
            operation: 'update',
        });
    }
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
    commit() {
        // Build a map of final values for each path/key
        // This ensures deep merge semantics are preserved
        const finalValues = new Map();
        // Collect mutations for the CommitEvent
        const mutations = [];
        for (const write of this.stagedWrites) {
            const cacheKey = this.buildCacheKey(write.path, write.key);
            // Track mutation for CommitEvent
            mutations.push({
                path: write.path,
                key: write.key,
                value: write.value,
                operation: write.operation,
            });
            if (write.operation === 'set') {
                // Set operations overwrite
                finalValues.set(cacheKey, {
                    path: write.path,
                    key: write.key,
                    value: write.value,
                });
            }
            else {
                // Update operations need to merge with existing value
                const existing = finalValues.get(cacheKey);
                if (existing) {
                    // Merge with previously staged value
                    finalValues.set(cacheKey, {
                        path: write.path,
                        key: write.key,
                        value: deepMerge(existing.value, write.value),
                    });
                }
                else {
                    // Merge with GlobalStore value
                    const currentValue = this.globalStore.getValue(this.pipelineId, write.path, write.key);
                    finalValues.set(cacheKey, {
                        path: write.path,
                        key: write.key,
                        value: deepMerge(currentValue, write.value),
                    });
                }
            }
        }
        // Apply all final values to GlobalStore using setValue
        // This ensures our deep merge semantics are preserved
        for (const { path, key, value } of finalValues.values()) {
            this.globalStore.setValue(this.pipelineId, path, key, value);
        }
        // Create a snapshot of the current state for time-travel support
        this.createSnapshot();
        // Invoke onCommit hook with CommitEvent
        this.invokeHook('onCommit', {
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: Date.now(),
            mutations,
        });
        // Clear staged writes and local cache
        this.stagedWrites = [];
        this.localCache.clear();
    }
    // ==========================================================================
    // Time-Travel Support
    // ==========================================================================
    /**
     * Creates a snapshot of the current state.
     *
     * Called internally after each commit to record the state for time-travel.
     * The snapshot includes a deep copy of the state to ensure immutability.
     */
    createSnapshot() {
        // Get the current state from GlobalStore for this pipeline's namespace
        const fullState = this.globalStore.getState();
        const pipelines = fullState.pipelines;
        const pipelineState = pipelines === null || pipelines === void 0 ? void 0 : pipelines[this.pipelineId];
        // Create a deep copy of the state to ensure immutability
        const stateCopy = pipelineState ? (0, lodash_clonedeep_1.default)(pipelineState) : {};
        const snapshot = {
            index: this.snapshots.length,
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: Date.now(),
            state: stateCopy,
        };
        this.snapshots.push(snapshot);
    }
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
    getSnapshots() {
        return [...this.snapshots];
    }
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
    getStateAt(index) {
        if (index < 0 || index >= this.snapshots.length) {
            return undefined;
        }
        // Return a deep copy to ensure immutability (time-travel is read-only)
        return (0, lodash_clonedeep_1.default)(this.snapshots[index].state);
    }
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
    getCurrentSnapshotIndex() {
        return this.snapshots.length - 1;
    }
    // ==========================================================================
    // Stage Lifecycle
    // ==========================================================================
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
    startStage(stageName) {
        // Update the current stage name
        this.stageName = stageName;
        // Record start time for duration tracking
        this.stageStartTime = Date.now();
        // Invoke onStageStart hook with StageEvent
        this.invokeHook('onStageStart', {
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: this.stageStartTime,
        });
    }
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
    endStage(resetStageName = false) {
        const endTime = Date.now();
        // Calculate duration if we have a start time
        const duration = this.stageStartTime !== undefined ? endTime - this.stageStartTime : undefined;
        // Invoke onStageEnd hook with StageEvent including duration
        this.invokeHook('onStageEnd', {
            stageName: this.stageName,
            pipelineId: this.pipelineId,
            timestamp: endTime,
            duration,
        });
        // Clear start time
        this.stageStartTime = undefined;
        // Optionally reset stage name
        if (resetStageName) {
            this.stageName = '';
        }
    }
    // ==========================================================================
    // Recorder Management
    // ==========================================================================
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
    attachRecorder(recorder) {
        this.recorders.push(recorder);
    }
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
    attachStageRecorder(stageName, recorder) {
        const existing = this.stageRecorders.get(stageName);
        if (existing) {
            existing.push(recorder);
        }
        else {
            this.stageRecorders.set(stageName, [recorder]);
        }
    }
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
    detachRecorder(recorderId) {
        // Remove from global recorders
        this.recorders = this.recorders.filter((r) => r.id !== recorderId);
        // Remove from stage recorders
        for (const [stageName, recorders] of this.stageRecorders.entries()) {
            const filtered = recorders.filter((r) => r.id !== recorderId);
            if (filtered.length === 0) {
                this.stageRecorders.delete(stageName);
            }
            else if (filtered.length !== recorders.length) {
                this.stageRecorders.set(stageName, filtered);
            }
        }
    }
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
    getRecorders() {
        const allRecorders = [...this.recorders];
        // Add stage-level recorders
        for (const recorders of this.stageRecorders.values()) {
            for (const recorder of recorders) {
                // Avoid duplicates if same recorder is attached globally and to a stage
                if (!allRecorders.some((r) => r.id === recorder.id)) {
                    allRecorders.push(recorder);
                }
            }
        }
        return allRecorders;
    }
    /**
     * Gets the active recorders for the current stage.
     *
     * Returns global recorders plus any stage-specific recorders for
     * the current stage. Used internally by invokeHook.
     *
     * @returns Array of recorders active for the current stage
     */
    getActiveRecorders() {
        const active = [...this.recorders];
        // Add stage-specific recorders for current stage
        const stageSpecific = this.stageRecorders.get(this.stageName);
        if (stageSpecific) {
            for (const recorder of stageSpecific) {
                // Avoid duplicates
                if (!active.some((r) => r.id === recorder.id)) {
                    active.push(recorder);
                }
            }
        }
        return active;
    }
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
    invokeHook(hook, event) {
        const activeRecorders = this.getActiveRecorders();
        for (const recorder of activeRecorders) {
            try {
                const hookFn = recorder[hook];
                if (typeof hookFn === 'function') {
                    hookFn.call(recorder, event);
                }
            }
            catch (error) {
                // Don't let recorder errors break scope operations
                // Also avoid infinite recursion if onError itself throws
                if (hook !== 'onError') {
                    this.invokeHook('onError', {
                        stageName: this.stageName,
                        pipelineId: this.pipelineId,
                        timestamp: Date.now(),
                        error: error,
                        operation: this.hookToOperation(hook),
                    });
                }
                // Log warning in development mode
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`Recorder ${recorder.id} threw error in ${hook}:`, error);
                }
            }
        }
    }
    /**
     * Maps a hook name to an operation type for error events.
     *
     * @param hook - The hook name
     * @returns The corresponding operation type
     *
     * @internal
     */
    hookToOperation(hook) {
        switch (hook) {
            case 'onRead':
                return 'read';
            case 'onWrite':
                return 'write';
            case 'onCommit':
                return 'commit';
            default:
                // For stage lifecycle hooks, default to 'write' as a catch-all
                return 'write';
        }
    }
    // ==========================================================================
    // Path Construction Helpers
    // ==========================================================================
    /**
     * Builds a cache key for local storage.
     *
     * @param path - The namespace path
     * @param key - Optional key
     * @returns A string key for the local cache
     */
    buildCacheKey(path, key) {
        const pathStr = path.join('\u001F'); // Use unit separator as delimiter
        return key !== undefined ? `${pathStr}\u001F${key}` : pathStr;
    }
    // ==========================================================================
    // Accessors (for testing and debugging)
    // ==========================================================================
    /**
     * Gets the pipeline ID for this scope.
     */
    getPipelineId() {
        return this.pipelineId;
    }
    /**
     * Gets the current stage name.
     */
    getStageName() {
        return this.stageName;
    }
    /**
     * Gets the underlying GlobalStore.
     * Primarily for testing and integration purposes.
     */
    getGlobalStore() {
        return this.globalStore;
    }
}
exports.Scope = Scope;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2NvcGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2NvcGUvU2NvcGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FrQkc7Ozs7OztBQUVILHdFQUEwQztBQVExQzs7Ozs7Ozs7Ozs7R0FXRztBQUNILFNBQVMsU0FBUyxDQUFDLEdBQVksRUFBRSxHQUFZO0lBQzNDLG1DQUFtQztJQUNuQyxJQUFJLEdBQUcsS0FBSyxJQUFJLElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDNUMsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQsNkNBQTZDO0lBQzdDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDN0MsT0FBTyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsOENBQThDO0lBQzlDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxlQUFlO0lBQ2YsTUFBTSxNQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2hGLE1BQU0sR0FBRyxHQUE0QixFQUFFLEdBQUksTUFBa0MsRUFBRSxDQUFDO0lBRWhGLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxHQUE4QixDQUFDLEVBQUUsQ0FBQztRQUM5RCxHQUFHLENBQUMsR0FB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QUFDLEVBQUUsbUJBQW1CLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUN6RSxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNLLGVBQWUsQ0FBQyxJQUFnQztRQUN0RCxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2IsS0FBSyxRQUFRO2dCQUNYLE9BQU8sTUFBTSxDQUFDO1lBQ2hCLEtBQUssU0FBUztnQkFDWixPQUFPLE9BQU8sQ0FBQztZQUNqQixLQUFLLFVBQVU7Z0JBQ2IsT0FBTyxRQUFRLENBQUM7WUFDbEI7Z0JBQ0UsK0RBQStEO2dCQUMvRCxPQUFPLE9BQU8sQ0FBQztRQUNuQixDQUFDO0lBQ0gsQ0FBQztJQUVELDZFQUE2RTtJQUM3RSw0QkFBNEI7SUFDNUIsNkVBQTZFO0lBRTdFOzs7Ozs7T0FNRztJQUNLLGFBQWEsQ0FBQyxJQUFjLEVBQUUsR0FBWTtRQUNoRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsa0NBQWtDO1FBQ3ZFLE9BQU8sR0FBRyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLFNBQVMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNoRSxDQUFDO0lBRUQsNkVBQTZFO0lBQzdFLHdDQUF3QztJQUN4Qyw2RUFBNkU7SUFFN0U7O09BRUc7SUFDSCxhQUFhO1FBQ1gsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQztJQUVEOzs7T0FHRztJQUNILGNBQWM7UUFDWixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDMUIsQ0FBQztDQUNGO0FBN3VCRCxzQkE2dUJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTY29wZSAtIENvcmUgcnVudGltZSBtZW1vcnkgY29udGFpbmVyIGZvciBwaXBlbGluZSBleGVjdXRpb25cbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIFRoZSBTY29wZSBjbGFzcyBwcm92aWRlcyB0aGUgcHJpbWFyeSBpbnRlcmZhY2UgZm9yIHN0YWdlcyB0byByZWFkIGZyb20gYW5kXG4gKiB3cml0ZSB0byBzdGF0ZSBkdXJpbmcgZmxvdyBleGVjdXRpb24uIEl0IHdyYXBzIEdsb2JhbFN0b3JlIGZvciBwZXJzaXN0ZW5jZVxuICogYW5kIFdyaXRlQnVmZmVyIGZvciB0cmFuc2FjdGlvbmFsIHdyaXRlcy5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAgIC0gZ2V0VmFsdWU6IFJlYWQgdmFsdWVzIGZyb20gdGhlIHN0b3JlIHdpdGggbmFtZXNwYWNlIGlzb2xhdGlvblxuICogICAtIHNldFZhbHVlOiBPdmVyd3JpdGUgdmFsdWVzIGF0IGEgcGF0aC9rZXlcbiAqICAgLSB1cGRhdGVWYWx1ZTogRGVlcC1tZXJnZSB2YWx1ZXMgYXQgYSBwYXRoL2tleVxuICogICAtIGNvbW1pdDogRmx1c2ggc3RhZ2VkIHdyaXRlcyB0byBHbG9iYWxTdG9yZVxuICogICAtIFJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3k6IFdyaXRlcyBhcmUgaW1tZWRpYXRlbHkgYXZhaWxhYmxlIGZvciByZWFkc1xuICpcbiAqIFRoaXMgaW1wbGVtZW50YXRpb24gZm9jdXNlcyBvbiBjb3JlIG9wZXJhdGlvbnMuIFJlY29yZGVyIGhvb2tzIGFuZCB0aW1lLXRyYXZlbFxuICogc3VwcG9ydCB3aWxsIGJlIGFkZGVkIGluIHN1YnNlcXVlbnQgdGFza3MuXG4gKlxuICogQG1vZHVsZSBzY29wZS9TY29wZVxuICovXG5cbmltcG9ydCBfY2xvbmVEZWVwIGZyb20gJ2xvZGFzaC5jbG9uZWRlZXAnO1xuaW1wb3J0IF9nZXQgZnJvbSAnbG9kYXNoLmdldCc7XG5pbXBvcnQgX3NldCBmcm9tICdsb2Rhc2guc2V0JztcblxuaW1wb3J0IHR5cGUgeyBHbG9iYWxTdG9yZSB9IGZyb20gJy4uL2NvcmUvbWVtb3J5L0dsb2JhbFN0b3JlJztcbmltcG9ydCB0eXBlIHsgRXhlY3V0aW9uSGlzdG9yeSB9IGZyb20gJy4uL2ludGVybmFsL2hpc3RvcnkvRXhlY3V0aW9uSGlzdG9yeSc7XG5pbXBvcnQgdHlwZSB7IFJlY29yZGVyLCBTY29wZU9wdGlvbnMsIFNjb3BlU25hcHNob3QgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBEZWVwIG1lcmdlIGhlbHBlciBmb3IgdXBkYXRlVmFsdWUgb3BlcmF0aW9ucy5cbiAqXG4gKiBNZXJnZXMgc291cmNlIGludG8gZGVzdGluYXRpb24gd2l0aCB0aGUgZm9sbG93aW5nIHNlbWFudGljczpcbiAqICAgLSBBcnJheXM6IFVuaW9uIHdpdGhvdXQgZHVwbGljYXRlcyAoZW5jb3VudGVyIG9yZGVyIHByZXNlcnZlZClcbiAqICAgLSBPYmplY3RzOiBSZWN1cnNpdmUgbWVyZ2VcbiAqICAgLSBQcmltaXRpdmVzOiBTb3VyY2Ugd2luc1xuICpcbiAqIEBwYXJhbSBkc3QgLSBEZXN0aW5hdGlvbiBvYmplY3RcbiAqIEBwYXJhbSBzcmMgLSBTb3VyY2Ugb2JqZWN0IHRvIG1lcmdlXG4gKiBAcmV0dXJucyBNZXJnZWQgcmVzdWx0XG4gKi9cbmZ1bmN0aW9uIGRlZXBNZXJnZShkc3Q6IHVua25vd24sIHNyYzogdW5rbm93bik6IHVua25vd24ge1xuICAvLyBQcmltaXRpdmVzIG9yIG51bGwgLSBzb3VyY2Ugd2luc1xuICBpZiAoc3JjID09PSBudWxsIHx8IHR5cGVvZiBzcmMgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIHNyYztcbiAgfVxuXG4gIC8vIEFycmF5IHZzIGFycmF5IC0+IHVuaW9uIHdpdGhvdXQgZHVwbGljYXRlc1xuICBpZiAoQXJyYXkuaXNBcnJheShzcmMpICYmIEFycmF5LmlzQXJyYXkoZHN0KSkge1xuICAgIHJldHVybiBbLi4ubmV3IFNldChbLi4uZHN0LCAuLi5zcmNdKV07XG4gIH1cblxuICAvLyBBcnJheSB2cyBub24tYXJyYXkgLT4gc291cmNlIHdpbnMgKHJlcGxhY2UpXG4gIGlmIChBcnJheS5pc0FycmF5KHNyYykpIHtcbiAgICByZXR1cm4gWy4uLnNyY107XG4gIH1cblxuICAvLyBPYmplY3QgbWVyZ2VcbiAgY29uc3QgZHN0T2JqID0gZHN0ICYmIHR5cGVvZiBkc3QgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGRzdCkgPyBkc3QgOiB7fTtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgLi4uKGRzdE9iaiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgfTtcblxuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzcmMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKSB7XG4gICAgb3V0W2tleV0gPSBkZWVwTWVyZ2Uob3V0W2tleV0sIChzcmMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0pO1xuICB9XG5cbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBTdGFnZWQgd3JpdGUgZW50cnkgZm9yIHRyYWNraW5nIG11dGF0aW9ucyBiZWZvcmUgY29tbWl0LlxuICovXG5pbnRlcmZhY2UgU3RhZ2VkV3JpdGUge1xuICBwYXRoOiBzdHJpbmdbXTtcbiAga2V5OiBzdHJpbmc7XG4gIHZhbHVlOiB1bmtub3duO1xuICBvcGVyYXRpb246ICdzZXQnIHwgJ3VwZGF0ZSc7XG59XG5cbi8qKlxuICogU2NvcGUgLSBDb3JlIHJ1bnRpbWUgbWVtb3J5IGNvbnRhaW5lciBmb3IgcGlwZWxpbmUgZXhlY3V0aW9uXG4gKlxuICogUHJvdmlkZXMgZ2V0VmFsdWUsIHNldFZhbHVlLCB1cGRhdGVWYWx1ZSwgYW5kIGNvbW1pdCBvcGVyYXRpb25zIHdpdGhcbiAqIG5hbWVzcGFjZSBpc29sYXRpb24gdmlhIHBpcGVsaW5lSWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBTY29wZSB7XG4gIHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsU3RvcmU6IEdsb2JhbFN0b3JlO1xuICBwcml2YXRlIHJlYWRvbmx5IGV4ZWN1dGlvbkhpc3Rvcnk/OiBFeGVjdXRpb25IaXN0b3J5O1xuICBwcml2YXRlIHJlYWRvbmx5IHBpcGVsaW5lSWQ6IHN0cmluZztcbiAgcHJpdmF0ZSBzdGFnZU5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogTG9jYWwgY2FjaGUgZm9yIHJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3kuXG4gICAqIFN0b3JlcyB2YWx1ZXMgdGhhdCBoYXZlIGJlZW4gd3JpdHRlbiBidXQgbm90IHlldCBjb21taXR0ZWQuXG4gICAqL1xuICBwcml2YXRlIGxvY2FsQ2FjaGU6IE1hcDxzdHJpbmcsIHVua25vd24+ID0gbmV3IE1hcCgpO1xuXG4gIC8qKlxuICAgKiBTdGFnZWQgd3JpdGVzIHdhaXRpbmcgdG8gYmUgY29tbWl0dGVkLlxuICAgKi9cbiAgcHJpdmF0ZSBzdGFnZWRXcml0ZXM6IFN0YWdlZFdyaXRlW10gPSBbXTtcblxuICAvKipcbiAgICogUmVjb3JkZXJzIGF0dGFjaGVkIGF0IHRoZSBnbG9iYWwgc2NvcGUgbGV2ZWwuXG4gICAqIFdpbGwgYmUgcG9wdWxhdGVkIGluIFRhc2sgNS4xLlxuICAgKi9cbiAgcHJpdmF0ZSByZWNvcmRlcnM6IFJlY29yZGVyW10gPSBbXTtcblxuICAvKipcbiAgICogUmVjb3JkZXJzIGF0dGFjaGVkIGF0IHRoZSBzdGFnZSBsZXZlbC5cbiAgICogV2lsbCBiZSBwb3B1bGF0ZWQgaW4gVGFzayA1LjEuXG4gICAqL1xuICBwcml2YXRlIHN0YWdlUmVjb3JkZXJzOiBNYXA8c3RyaW5nLCBSZWNvcmRlcltdPiA9IG5ldyBNYXAoKTtcblxuICAvKipcbiAgICogU25hcHNob3QgaGlzdG9yeSBmb3IgdGltZS10cmF2ZWwgc3VwcG9ydC5cbiAgICogV2lsbCBiZSBwb3B1bGF0ZWQgaW4gVGFzayAzLjEuXG4gICAqL1xuICBwcml2YXRlIHNuYXBzaG90czogU2NvcGVTbmFwc2hvdFtdID0gW107XG5cbiAgLyoqXG4gICAqIFN0YWdlIHN0YXJ0IHRpbWUgZm9yIGR1cmF0aW9uIHRyYWNraW5nLlxuICAgKiBXaWxsIGJlIHVzZWQgaW4gVGFzayA1LjIuXG4gICAqL1xuICBwcml2YXRlIHN0YWdlU3RhcnRUaW1lPzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFNjb3BlIGluc3RhbmNlLlxuICAgKlxuICAgKiBAcGFyYW0gb3B0aW9ucyAtIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIHNjb3BlXG4gICAqIEBwYXJhbSBvcHRpb25zLnBpcGVsaW5lSWQgLSBVbmlxdWUgaWRlbnRpZmllciBmb3IgbmFtZXNwYWNlIGlzb2xhdGlvblxuICAgKiBAcGFyYW0gb3B0aW9ucy5zdGFnZU5hbWUgLSBJbml0aWFsIHN0YWdlIG5hbWVcbiAgICogQHBhcmFtIG9wdGlvbnMuZ2xvYmFsU3RvcmUgLSBTaGFyZWQgc3RhdGUgY29udGFpbmVyIGZvciBwZXJzaXN0ZW5jZVxuICAgKiBAcGFyYW0gb3B0aW9ucy5leGVjdXRpb25IaXN0b3J5IC0gT3B0aW9uYWwgaGlzdG9yeSB0cmFja2VyIGZvciB0aW1lLXRyYXZlbFxuICAgKiBAcGFyYW0gb3B0aW9ucy5yZWNvcmRlcnMgLSBPcHRpb25hbCBpbml0aWFsIHJlY29yZGVycyB0byBhdHRhY2hcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IFNjb3BlT3B0aW9ucykge1xuICAgIHRoaXMuZ2xvYmFsU3RvcmUgPSBvcHRpb25zLmdsb2JhbFN0b3JlO1xuICAgIHRoaXMuZXhlY3V0aW9uSGlzdG9yeSA9IG9wdGlvbnMuZXhlY3V0aW9uSGlzdG9yeTtcbiAgICB0aGlzLnBpcGVsaW5lSWQgPSBvcHRpb25zLnBpcGVsaW5lSWQ7XG4gICAgdGhpcy5zdGFnZU5hbWUgPSBvcHRpb25zLnN0YWdlTmFtZTtcblxuICAgIC8vIEF0dGFjaCBpbml0aWFsIHJlY29yZGVycyBpZiBwcm92aWRlZFxuICAgIGlmIChvcHRpb25zLnJlY29yZGVycykge1xuICAgICAgZm9yIChjb25zdCByZWNvcmRlciBvZiBvcHRpb25zLnJlY29yZGVycykge1xuICAgICAgICB0aGlzLnJlY29yZGVycy5wdXNoKHJlY29yZGVyKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDb3JlIE9wZXJhdGlvbnNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAvKipcbiAgICogUmVhZHMgYSB2YWx1ZSBmcm9tIHRoZSBzY29wZS5cbiAgICpcbiAgICogRmlyc3QgY2hlY2tzIHRoZSBsb2NhbCBjYWNoZSBmb3IgdW5jb21taXR0ZWQgd3JpdGVzIChyZWFkLWFmdGVyLXdyaXRlXG4gICAqIGNvbnNpc3RlbmN5KSwgdGhlbiBmYWxscyBiYWNrIHRvIEdsb2JhbFN0b3JlLlxuICAgKlxuICAgKiBAcGFyYW0gcGF0aCAtIFRoZSBuYW1lc3BhY2UgcGF0aCBmb3IgdGhlIHJlYWQgb3BlcmF0aW9uXG4gICAqIEBwYXJhbSBrZXkgLSBPcHRpb25hbCBrZXkgdG8gcmVhZCBhIHNwZWNpZmljIGZpZWxkXG4gICAqIEByZXR1cm5zIFRoZSB2YWx1ZSBhdCB0aGUgcGF0aC9rZXksIG9yIHVuZGVmaW5lZCBpZiBub3QgZm91bmRcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiAvLyBSZWFkIGVudGlyZSBvYmplY3QgYXQgcGF0aFxuICAgKiBjb25zdCBjb25maWcgPSBzY29wZS5nZXRWYWx1ZShbJ2NvbmZpZyddKTtcbiAgICpcbiAgICogLy8gUmVhZCBzcGVjaWZpYyBrZXkgYXQgcGF0aFxuICAgKiBjb25zdCB0aW1lb3V0ID0gc2NvcGUuZ2V0VmFsdWUoWydjb25maWcnXSwgJ3RpbWVvdXQnKTtcbiAgICogYGBgXG4gICAqL1xuICBnZXRWYWx1ZShwYXRoOiBzdHJpbmdbXSwga2V5Pzogc3RyaW5nKTogdW5rbm93biB7XG4gICAgLy8gQnVpbGQgY2FjaGUga2V5IGZvciBsb2NhbCBsb29rdXBcbiAgICBjb25zdCBjYWNoZUtleSA9IHRoaXMuYnVpbGRDYWNoZUtleShwYXRoLCBrZXkpO1xuXG4gICAgLy8gQ2hlY2sgbG9jYWwgY2FjaGUgZmlyc3QgZm9yIHJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3lcbiAgICBsZXQgdmFsdWU6IHVua25vd247XG4gICAgaWYgKHRoaXMubG9jYWxDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICB2YWx1ZSA9IHRoaXMubG9jYWxDYWNoZS5nZXQoY2FjaGVLZXkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGYWxsIGJhY2sgdG8gR2xvYmFsU3RvcmVcbiAgICAgIHZhbHVlID0gdGhpcy5nbG9iYWxTdG9yZS5nZXRWYWx1ZSh0aGlzLnBpcGVsaW5lSWQsIHBhdGgsIGtleSk7XG4gICAgfVxuXG4gICAgLy8gSW52b2tlIG9uUmVhZCBob29rIHdpdGggUmVhZEV2ZW50XG4gICAgdGhpcy5pbnZva2VIb29rKCdvblJlYWQnLCB7XG4gICAgICBzdGFnZU5hbWU6IHRoaXMuc3RhZ2VOYW1lLFxuICAgICAgcGlwZWxpbmVJZDogdGhpcy5waXBlbGluZUlkLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgcGF0aCxcbiAgICAgIGtleSxcbiAgICAgIHZhbHVlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgYSB2YWx1ZSBhdCB0aGUgc3BlY2lmaWVkIHBhdGgva2V5LCBvdmVyd3JpdGluZyBhbnkgZXhpc3RpbmcgdmFsdWUuXG4gICAqXG4gICAqIFRoZSB3cml0ZSBpcyBzdGFnZWQgbG9jYWxseSBhbmQgbWFkZSBpbW1lZGlhdGVseSBhdmFpbGFibGUgZm9yIHN1YnNlcXVlbnRcbiAgICogcmVhZHMgKHJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3kpLiBDYWxsIGNvbW1pdCgpIHRvIHBlcnNpc3QgdG8gR2xvYmFsU3RvcmUuXG4gICAqXG4gICAqIEBwYXJhbSBwYXRoIC0gVGhlIG5hbWVzcGFjZSBwYXRoIGZvciB0aGUgd3JpdGUgb3BlcmF0aW9uXG4gICAqIEBwYXJhbSBrZXkgLSBUaGUga2V5IHRvIHdyaXRlIHRvXG4gICAqIEBwYXJhbSB2YWx1ZSAtIFRoZSB2YWx1ZSB0byB3cml0ZVxuICAgKlxuICAgKiBAdGhyb3dzIFR5cGVFcnJvciBpZiBwYXRoIGlzIG5vdCBhbiBhcnJheSBvciBrZXkgaXMgbm90IGEgc3RyaW5nXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogc2NvcGUuc2V0VmFsdWUoWydjb25maWcnXSwgJ3RpbWVvdXQnLCA1MDAwKTtcbiAgICogc2NvcGUuc2V0VmFsdWUoWyd1c2VycyddLCAnYWRtaW4nLCB7IG5hbWU6ICdBZG1pbicsIHJvbGU6ICdhZG1pbicgfSk7XG4gICAqIGBgYFxuICAgKi9cbiAgc2V0VmFsdWUocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuICAgIC8vIFZhbGlkYXRlIGlucHV0c1xuICAgIGlmICghQXJyYXkuaXNBcnJheShwYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncGF0aCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2Yga2V5ICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigna2V5IG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgICB9XG5cbiAgICAvLyBTdGFnZSB0aGUgd3JpdGVcbiAgICB0aGlzLnN0YWdlZFdyaXRlcy5wdXNoKHtcbiAgICAgIHBhdGgsXG4gICAgICBrZXksXG4gICAgICB2YWx1ZSxcbiAgICAgIG9wZXJhdGlvbjogJ3NldCcsXG4gICAgfSk7XG5cbiAgICAvLyBVcGRhdGUgbG9jYWwgY2FjaGUgZm9yIHJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3lcbiAgICBjb25zdCBjYWNoZUtleSA9IHRoaXMuYnVpbGRDYWNoZUtleShwYXRoLCBrZXkpO1xuICAgIHRoaXMubG9jYWxDYWNoZS5zZXQoY2FjaGVLZXksIHZhbHVlKTtcblxuICAgIC8vIEludm9rZSBvbldyaXRlIGhvb2sgd2l0aCBXcml0ZUV2ZW50XG4gICAgdGhpcy5pbnZva2VIb29rKCdvbldyaXRlJywge1xuICAgICAgc3RhZ2VOYW1lOiB0aGlzLnN0YWdlTmFtZSxcbiAgICAgIHBpcGVsaW5lSWQ6IHRoaXMucGlwZWxpbmVJZCxcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgIHBhdGgsXG4gICAgICBrZXksXG4gICAgICB2YWx1ZSxcbiAgICAgIG9wZXJhdGlvbjogJ3NldCcsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBhIHZhbHVlIGF0IHRoZSBzcGVjaWZpZWQgcGF0aC9rZXkgdXNpbmcgZGVlcCBtZXJnZSBzZW1hbnRpY3MuXG4gICAqXG4gICAqIElmIHRoZSBleGlzdGluZyB2YWx1ZSBpcyBhbiBvYmplY3QsIHRoZSBuZXcgdmFsdWUgaXMgZGVlcC1tZXJnZWQgaW50byBpdC5cbiAgICogSWYgdGhlIGV4aXN0aW5nIHZhbHVlIGlzIGFuIGFycmF5LCBhcnJheXMgYXJlIHVuaW9uZWQgd2l0aG91dCBkdXBsaWNhdGVzLlxuICAgKiBGb3IgcHJpbWl0aXZlcywgdGhlIG5ldyB2YWx1ZSBvdmVyd3JpdGVzIHRoZSBleGlzdGluZyB2YWx1ZS5cbiAgICpcbiAgICogVGhlIHdyaXRlIGlzIHN0YWdlZCBsb2NhbGx5IGFuZCBtYWRlIGltbWVkaWF0ZWx5IGF2YWlsYWJsZSBmb3Igc3Vic2VxdWVudFxuICAgKiByZWFkcyAocmVhZC1hZnRlci13cml0ZSBjb25zaXN0ZW5jeSkuIENhbGwgY29tbWl0KCkgdG8gcGVyc2lzdCB0byBHbG9iYWxTdG9yZS5cbiAgICpcbiAgICogQHBhcmFtIHBhdGggLSBUaGUgbmFtZXNwYWNlIHBhdGggZm9yIHRoZSB1cGRhdGUgb3BlcmF0aW9uXG4gICAqIEBwYXJhbSBrZXkgLSBUaGUga2V5IHRvIHVwZGF0ZVxuICAgKiBAcGFyYW0gdmFsdWUgLSBUaGUgdmFsdWUgdG8gbWVyZ2VcbiAgICpcbiAgICogQHRocm93cyBUeXBlRXJyb3IgaWYgcGF0aCBpcyBub3QgYW4gYXJyYXkgb3Iga2V5IGlzIG5vdCBhIHN0cmluZ1xuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIC8vIEV4aXN0aW5nOiB7IHRpbWVvdXQ6IDUwMDAgfVxuICAgKiBzY29wZS51cGRhdGVWYWx1ZShbJ2NvbmZpZyddLCAnc2V0dGluZ3MnLCB7IHJldHJpZXM6IDMgfSk7XG4gICAqIC8vIFJlc3VsdDogeyB0aW1lb3V0OiA1MDAwLCByZXRyaWVzOiAzIH1cbiAgICogYGBgXG4gICAqL1xuICB1cGRhdGVWYWx1ZShwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG4gICAgLy8gVmFsaWRhdGUgaW5wdXRzXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwYXRoIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBrZXkgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdrZXkgbXVzdCBiZSBhIHN0cmluZycpO1xuICAgIH1cblxuICAgIC8vIFN0YWdlIHRoZSB3cml0ZVxuICAgIHRoaXMuc3RhZ2VkV3JpdGVzLnB1c2goe1xuICAgICAgcGF0aCxcbiAgICAgIGtleSxcbiAgICAgIHZhbHVlLFxuICAgICAgb3BlcmF0aW9uOiAndXBkYXRlJyxcbiAgICB9KTtcblxuICAgIC8vIEdldCBjdXJyZW50IHZhbHVlIGZvciBtZXJnZSAoY2hlY2sgY2FjaGUgZmlyc3QsIHRoZW4gR2xvYmFsU3RvcmUpXG4gICAgY29uc3QgY2FjaGVLZXkgPSB0aGlzLmJ1aWxkQ2FjaGVLZXkocGF0aCwga2V5KTtcbiAgICBsZXQgY3VycmVudFZhbHVlOiB1bmtub3duO1xuXG4gICAgaWYgKHRoaXMubG9jYWxDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICBjdXJyZW50VmFsdWUgPSB0aGlzLmxvY2FsQ2FjaGUuZ2V0KGNhY2hlS2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY3VycmVudFZhbHVlID0gdGhpcy5nbG9iYWxTdG9yZS5nZXRWYWx1ZSh0aGlzLnBpcGVsaW5lSWQsIHBhdGgsIGtleSk7XG4gICAgfVxuXG4gICAgLy8gRGVlcCBtZXJnZSBhbmQgdXBkYXRlIGNhY2hlIGZvciByZWFkLWFmdGVyLXdyaXRlIGNvbnNpc3RlbmN5XG4gICAgY29uc3QgbWVyZ2VkVmFsdWUgPSBkZWVwTWVyZ2UoY3VycmVudFZhbHVlLCB2YWx1ZSk7XG4gICAgdGhpcy5sb2NhbENhY2hlLnNldChjYWNoZUtleSwgbWVyZ2VkVmFsdWUpO1xuXG4gICAgLy8gSW52b2tlIG9uV3JpdGUgaG9vayB3aXRoIFdyaXRlRXZlbnRcbiAgICB0aGlzLmludm9rZUhvb2soJ29uV3JpdGUnLCB7XG4gICAgICBzdGFnZU5hbWU6IHRoaXMuc3RhZ2VOYW1lLFxuICAgICAgcGlwZWxpbmVJZDogdGhpcy5waXBlbGluZUlkLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgcGF0aCxcbiAgICAgIGtleSxcbiAgICAgIHZhbHVlLFxuICAgICAgb3BlcmF0aW9uOiAndXBkYXRlJyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21taXRzIGFsbCBzdGFnZWQgd3JpdGVzIHRvIEdsb2JhbFN0b3JlLlxuICAgKlxuICAgKiBBcHBsaWVzIGFsbCBzZXRWYWx1ZSBhbmQgdXBkYXRlVmFsdWUgb3BlcmF0aW9ucyB0aGF0IGhhdmUgYmVlbiBzdGFnZWRcbiAgICogc2luY2UgdGhlIGxhc3QgY29tbWl0LiBGb3IgdXBkYXRlVmFsdWUgb3BlcmF0aW9ucywgdGhlIGRlZXAtbWVyZ2VkIHJlc3VsdFxuICAgKiBpcyBjb21wdXRlZCBhbmQgd3JpdHRlbiBhcyBhIHNldFZhbHVlIHRvIHByZXNlcnZlIGRlZXAgbWVyZ2Ugc2VtYW50aWNzLlxuICAgKlxuICAgKiBBZnRlciBjb21taXQsIHRoZSBsb2NhbCBjYWNoZSBpcyBjbGVhcmVkIGFuZCBzdWJzZXF1ZW50IHJlYWRzIHdpbGwgZ29cbiAgICogZGlyZWN0bHkgdG8gR2xvYmFsU3RvcmUuIEEgc25hcHNob3Qgb2YgdGhlIGN1cnJlbnQgc3RhdGUgaXMgYWxzbyBjcmVhdGVkXG4gICAqIGZvciB0aW1lLXRyYXZlbCBzdXBwb3J0LlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIHNjb3BlLnNldFZhbHVlKFsnY29uZmlnJ10sICd0aW1lb3V0JywgNTAwMCk7XG4gICAqIHNjb3BlLnVwZGF0ZVZhbHVlKFsnY29uZmlnJ10sICdzZXR0aW5ncycsIHsgcmV0cmllczogMyB9KTtcbiAgICogc2NvcGUuY29tbWl0KCk7IC8vIFBlcnNpc3RzIGJvdGggd3JpdGVzIHRvIEdsb2JhbFN0b3JlXG4gICAqIGBgYFxuICAgKi9cbiAgY29tbWl0KCk6IHZvaWQge1xuICAgIC8vIEJ1aWxkIGEgbWFwIG9mIGZpbmFsIHZhbHVlcyBmb3IgZWFjaCBwYXRoL2tleVxuICAgIC8vIFRoaXMgZW5zdXJlcyBkZWVwIG1lcmdlIHNlbWFudGljcyBhcmUgcHJlc2VydmVkXG4gICAgY29uc3QgZmluYWxWYWx1ZXMgPSBuZXcgTWFwPHN0cmluZywgeyBwYXRoOiBzdHJpbmdbXTsga2V5OiBzdHJpbmc7IHZhbHVlOiB1bmtub3duIH0+KCk7XG5cbiAgICAvLyBDb2xsZWN0IG11dGF0aW9ucyBmb3IgdGhlIENvbW1pdEV2ZW50XG4gICAgY29uc3QgbXV0YXRpb25zOiBBcnJheTx7XG4gICAgICBwYXRoOiBzdHJpbmdbXTtcbiAgICAgIGtleTogc3RyaW5nO1xuICAgICAgdmFsdWU6IHVua25vd247XG4gICAgICBvcGVyYXRpb246ICdzZXQnIHwgJ3VwZGF0ZSc7XG4gICAgfT4gPSBbXTtcblxuICAgIGZvciAoY29uc3Qgd3JpdGUgb2YgdGhpcy5zdGFnZWRXcml0ZXMpIHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5idWlsZENhY2hlS2V5KHdyaXRlLnBhdGgsIHdyaXRlLmtleSk7XG5cbiAgICAgIC8vIFRyYWNrIG11dGF0aW9uIGZvciBDb21taXRFdmVudFxuICAgICAgbXV0YXRpb25zLnB1c2goe1xuICAgICAgICBwYXRoOiB3cml0ZS5wYXRoLFxuICAgICAgICBrZXk6IHdyaXRlLmtleSxcbiAgICAgICAgdmFsdWU6IHdyaXRlLnZhbHVlLFxuICAgICAgICBvcGVyYXRpb246IHdyaXRlLm9wZXJhdGlvbixcbiAgICAgIH0pO1xuXG4gICAgICBpZiAod3JpdGUub3BlcmF0aW9uID09PSAnc2V0Jykge1xuICAgICAgICAvLyBTZXQgb3BlcmF0aW9ucyBvdmVyd3JpdGVcbiAgICAgICAgZmluYWxWYWx1ZXMuc2V0KGNhY2hlS2V5LCB7XG4gICAgICAgICAgcGF0aDogd3JpdGUucGF0aCxcbiAgICAgICAgICBrZXk6IHdyaXRlLmtleSxcbiAgICAgICAgICB2YWx1ZTogd3JpdGUudmFsdWUsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVXBkYXRlIG9wZXJhdGlvbnMgbmVlZCB0byBtZXJnZSB3aXRoIGV4aXN0aW5nIHZhbHVlXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gZmluYWxWYWx1ZXMuZ2V0KGNhY2hlS2V5KTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgLy8gTWVyZ2Ugd2l0aCBwcmV2aW91c2x5IHN0YWdlZCB2YWx1ZVxuICAgICAgICAgIGZpbmFsVmFsdWVzLnNldChjYWNoZUtleSwge1xuICAgICAgICAgICAgcGF0aDogd3JpdGUucGF0aCxcbiAgICAgICAgICAgIGtleTogd3JpdGUua2V5LFxuICAgICAgICAgICAgdmFsdWU6IGRlZXBNZXJnZShleGlzdGluZy52YWx1ZSwgd3JpdGUudmFsdWUpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE1lcmdlIHdpdGggR2xvYmFsU3RvcmUgdmFsdWVcbiAgICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSB0aGlzLmdsb2JhbFN0b3JlLmdldFZhbHVlKHRoaXMucGlwZWxpbmVJZCwgd3JpdGUucGF0aCwgd3JpdGUua2V5KTtcbiAgICAgICAgICBmaW5hbFZhbHVlcy5zZXQoY2FjaGVLZXksIHtcbiAgICAgICAgICAgIHBhdGg6IHdyaXRlLnBhdGgsXG4gICAgICAgICAgICBrZXk6IHdyaXRlLmtleSxcbiAgICAgICAgICAgIHZhbHVlOiBkZWVwTWVyZ2UoY3VycmVudFZhbHVlLCB3cml0ZS52YWx1ZSksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBcHBseSBhbGwgZmluYWwgdmFsdWVzIHRvIEdsb2JhbFN0b3JlIHVzaW5nIHNldFZhbHVlXG4gICAgLy8gVGhpcyBlbnN1cmVzIG91ciBkZWVwIG1lcmdlIHNlbWFudGljcyBhcmUgcHJlc2VydmVkXG4gICAgZm9yIChjb25zdCB7IHBhdGgsIGtleSwgdmFsdWUgfSBvZiBmaW5hbFZhbHVlcy52YWx1ZXMoKSkge1xuICAgICAgdGhpcy5nbG9iYWxTdG9yZS5zZXRWYWx1ZSh0aGlzLnBpcGVsaW5lSWQsIHBhdGgsIGtleSwgdmFsdWUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBhIHNuYXBzaG90IG9mIHRoZSBjdXJyZW50IHN0YXRlIGZvciB0aW1lLXRyYXZlbCBzdXBwb3J0XG4gICAgdGhpcy5jcmVhdGVTbmFwc2hvdCgpO1xuXG4gICAgLy8gSW52b2tlIG9uQ29tbWl0IGhvb2sgd2l0aCBDb21taXRFdmVudFxuICAgIHRoaXMuaW52b2tlSG9vaygnb25Db21taXQnLCB7XG4gICAgICBzdGFnZU5hbWU6IHRoaXMuc3RhZ2VOYW1lLFxuICAgICAgcGlwZWxpbmVJZDogdGhpcy5waXBlbGluZUlkLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgbXV0YXRpb25zLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xlYXIgc3RhZ2VkIHdyaXRlcyBhbmQgbG9jYWwgY2FjaGVcbiAgICB0aGlzLnN0YWdlZFdyaXRlcyA9IFtdO1xuICAgIHRoaXMubG9jYWxDYWNoZS5jbGVhcigpO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gVGltZS1UcmF2ZWwgU3VwcG9ydFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgc25hcHNob3Qgb2YgdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAqXG4gICAqIENhbGxlZCBpbnRlcm5hbGx5IGFmdGVyIGVhY2ggY29tbWl0IHRvIHJlY29yZCB0aGUgc3RhdGUgZm9yIHRpbWUtdHJhdmVsLlxuICAgKiBUaGUgc25hcHNob3QgaW5jbHVkZXMgYSBkZWVwIGNvcHkgb2YgdGhlIHN0YXRlIHRvIGVuc3VyZSBpbW11dGFiaWxpdHkuXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZVNuYXBzaG90KCk6IHZvaWQge1xuICAgIC8vIEdldCB0aGUgY3VycmVudCBzdGF0ZSBmcm9tIEdsb2JhbFN0b3JlIGZvciB0aGlzIHBpcGVsaW5lJ3MgbmFtZXNwYWNlXG4gICAgY29uc3QgZnVsbFN0YXRlID0gdGhpcy5nbG9iYWxTdG9yZS5nZXRTdGF0ZSgpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IHBpcGVsaW5lcyA9IGZ1bGxTdGF0ZS5waXBlbGluZXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG4gICAgY29uc3QgcGlwZWxpbmVTdGF0ZSA9IHBpcGVsaW5lcz8uW3RoaXMucGlwZWxpbmVJZF0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cbiAgICAvLyBDcmVhdGUgYSBkZWVwIGNvcHkgb2YgdGhlIHN0YXRlIHRvIGVuc3VyZSBpbW11dGFiaWxpdHlcbiAgICBjb25zdCBzdGF0ZUNvcHkgPSBwaXBlbGluZVN0YXRlID8gX2Nsb25lRGVlcChwaXBlbGluZVN0YXRlKSA6IHt9O1xuXG4gICAgY29uc3Qgc25hcHNob3Q6IFNjb3BlU25hcHNob3QgPSB7XG4gICAgICBpbmRleDogdGhpcy5zbmFwc2hvdHMubGVuZ3RoLFxuICAgICAgc3RhZ2VOYW1lOiB0aGlzLnN0YWdlTmFtZSxcbiAgICAgIHBpcGVsaW5lSWQ6IHRoaXMucGlwZWxpbmVJZCxcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgIHN0YXRlOiBzdGF0ZUNvcHkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICAgfTtcblxuICAgIHRoaXMuc25hcHNob3RzLnB1c2goc25hcHNob3QpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYWxsIHJlY29yZGVkIHNuYXBzaG90cy5cbiAgICpcbiAgICogU25hcHNob3RzIGFyZSBjcmVhdGVkIG9uIGVhY2ggY29tbWl0IGFuZCBjb250YWluIHRoZSBzdGF0ZSBhdCB0aGF0IHBvaW50XG4gICAqIGluIHRpbWUuIFRoaXMgbWV0aG9kIHJldHVybnMgYSBzaGFsbG93IGNvcHkgb2YgdGhlIHNuYXBzaG90cyBhcnJheSB0b1xuICAgKiBwcmV2ZW50IGV4dGVybmFsIG1vZGlmaWNhdGlvbi5cbiAgICpcbiAgICogQHJldHVybnMgQXJyYXkgb2YgYWxsIHJlY29yZGVkIHNuYXBzaG90c1xuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIHNjb3BlLnNldFZhbHVlKFsnY29uZmlnJ10sICdhJywgMSk7XG4gICAqIHNjb3BlLmNvbW1pdCgpO1xuICAgKiBzY29wZS5zZXRWYWx1ZShbJ2NvbmZpZyddLCAnYicsIDIpO1xuICAgKiBzY29wZS5jb21taXQoKTtcbiAgICpcbiAgICogY29uc3Qgc25hcHNob3RzID0gc2NvcGUuZ2V0U25hcHNob3RzKCk7XG4gICAqIGNvbnNvbGUubG9nKHNuYXBzaG90cy5sZW5ndGgpOyAvLyAyXG4gICAqIGBgYFxuICAgKi9cbiAgZ2V0U25hcHNob3RzKCk6IFNjb3BlU25hcHNob3RbXSB7XG4gICAgcmV0dXJuIFsuLi50aGlzLnNuYXBzaG90c107XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgc3RhdGUgYXQgYSBzcGVjaWZpYyBzbmFwc2hvdCBpbmRleC5cbiAgICpcbiAgICogVGhpcyBpcyBhIHJlYWQtb25seSBvcGVyYXRpb24gdGhhdCBkb2VzIE5PVCBtb2RpZnkgdGhlIGN1cnJlbnQgZXhlY3V0aW9uXG4gICAqIHN0YXRlLiBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGUgaW5kZXggaXMgb3V0IG9mIGJvdW5kcy5cbiAgICpcbiAgICogQHBhcmFtIGluZGV4IC0gVGhlIHNuYXBzaG90IGluZGV4ICgwLWJhc2VkKVxuICAgKiBAcmV0dXJucyBUaGUgc3RhdGUgYXQgdGhhdCBzbmFwc2hvdCwgb3IgdW5kZWZpbmVkIGlmIG91dCBvZiBib3VuZHNcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBzY29wZS5zZXRWYWx1ZShbJ2NvbmZpZyddLCAndmFsdWUnLCAnZmlyc3QnKTtcbiAgICogc2NvcGUuY29tbWl0KCk7XG4gICAqIHNjb3BlLnNldFZhbHVlKFsnY29uZmlnJ10sICd2YWx1ZScsICdzZWNvbmQnKTtcbiAgICogc2NvcGUuY29tbWl0KCk7XG4gICAqXG4gICAqIGNvbnN0IGZpcnN0U3RhdGUgPSBzY29wZS5nZXRTdGF0ZUF0KDApO1xuICAgKiBjb25zb2xlLmxvZyhmaXJzdFN0YXRlPy5jb25maWc/LnZhbHVlKTsgLy8gJ2ZpcnN0J1xuICAgKiBgYGBcbiAgICovXG4gIGdldFN0YXRlQXQoaW5kZXg6IG51bWJlcik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcbiAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuc25hcHNob3RzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gYSBkZWVwIGNvcHkgdG8gZW5zdXJlIGltbXV0YWJpbGl0eSAodGltZS10cmF2ZWwgaXMgcmVhZC1vbmx5KVxuICAgIHJldHVybiBfY2xvbmVEZWVwKHRoaXMuc25hcHNob3RzW2luZGV4XS5zdGF0ZSk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1vc3QgcmVjZW50IHNuYXBzaG90LlxuICAgKlxuICAgKiBSZXR1cm5zIC0xIGlmIG5vIHNuYXBzaG90cyBoYXZlIGJlZW4gcmVjb3JkZWQgeWV0LlxuICAgKlxuICAgKiBAcmV0dXJucyBUaGUgaW5kZXggb2YgdGhlIG1vc3QgcmVjZW50IHNuYXBzaG90LCBvciAtMSBpZiBub25lIGV4aXN0XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc29sZS5sb2coc2NvcGUuZ2V0Q3VycmVudFNuYXBzaG90SW5kZXgoKSk7IC8vIC0xIChubyBjb21taXRzIHlldClcbiAgICpcbiAgICogc2NvcGUuc2V0VmFsdWUoWydjb25maWcnXSwgJ3ZhbHVlJywgMSk7XG4gICAqIHNjb3BlLmNvbW1pdCgpO1xuICAgKiBjb25zb2xlLmxvZyhzY29wZS5nZXRDdXJyZW50U25hcHNob3RJbmRleCgpKTsgLy8gMFxuICAgKlxuICAgKiBzY29wZS5zZXRWYWx1ZShbJ2NvbmZpZyddLCAndmFsdWUnLCAyKTtcbiAgICogc2NvcGUuY29tbWl0KCk7XG4gICAqIGNvbnNvbGUubG9nKHNjb3BlLmdldEN1cnJlbnRTbmFwc2hvdEluZGV4KCkpOyAvLyAxXG4gICAqIGBgYFxuICAgKi9cbiAgZ2V0Q3VycmVudFNuYXBzaG90SW5kZXgoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5zbmFwc2hvdHMubGVuZ3RoIC0gMTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFN0YWdlIExpZmVjeWNsZVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBTaWduYWxzIHRoZSBzdGFydCBvZiBhIG5ldyBzdGFnZS5cbiAgICpcbiAgICogVXBkYXRlcyB0aGUgY3VycmVudCBzdGFnZSBuYW1lIGFuZCBpbnZva2VzIHRoZSBvblN0YWdlU3RhcnQgaG9vayBvbiBhbGxcbiAgICogYWN0aXZlIHJlY29yZGVycy4gQWxzbyByZWNvcmRzIHRoZSBzdGFydCB0aW1lIGZvciBkdXJhdGlvbiB0cmFja2luZy5cbiAgICpcbiAgICogQHBhcmFtIHN0YWdlTmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBzdGFnZSB0aGF0IGlzIHN0YXJ0aW5nXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogc2NvcGUuc3RhcnRTdGFnZSgncHJvY2Vzc0RhdGEnKTtcbiAgICogLy8gLi4uIHBlcmZvcm0gc3RhZ2Ugb3BlcmF0aW9ucyAuLi5cbiAgICogc2NvcGUuZW5kU3RhZ2UoKTtcbiAgICogYGBgXG4gICAqL1xuICBzdGFydFN0YWdlKHN0YWdlTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgLy8gVXBkYXRlIHRoZSBjdXJyZW50IHN0YWdlIG5hbWVcbiAgICB0aGlzLnN0YWdlTmFtZSA9IHN0YWdlTmFtZTtcblxuICAgIC8vIFJlY29yZCBzdGFydCB0aW1lIGZvciBkdXJhdGlvbiB0cmFja2luZ1xuICAgIHRoaXMuc3RhZ2VTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgLy8gSW52b2tlIG9uU3RhZ2VTdGFydCBob29rIHdpdGggU3RhZ2VFdmVudFxuICAgIHRoaXMuaW52b2tlSG9vaygnb25TdGFnZVN0YXJ0Jywge1xuICAgICAgc3RhZ2VOYW1lOiB0aGlzLnN0YWdlTmFtZSxcbiAgICAgIHBpcGVsaW5lSWQ6IHRoaXMucGlwZWxpbmVJZCxcbiAgICAgIHRpbWVzdGFtcDogdGhpcy5zdGFnZVN0YXJ0VGltZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaWduYWxzIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgc3RhZ2UuXG4gICAqXG4gICAqIEludm9rZXMgdGhlIG9uU3RhZ2VFbmQgaG9vayBvbiBhbGwgYWN0aXZlIHJlY29yZGVycyB3aXRoIHRoZSBkdXJhdGlvblxuICAgKiBzaW5jZSBzdGFydFN0YWdlIHdhcyBjYWxsZWQuIE9wdGlvbmFsbHkgcmVzZXRzIHRoZSBzdGFnZSBuYW1lLlxuICAgKlxuICAgKiBAcGFyYW0gcmVzZXRTdGFnZU5hbWUgLSBJZiB0cnVlLCByZXNldHMgc3RhZ2VOYW1lIHRvIGVtcHR5IHN0cmluZyAoZGVmYXVsdDogZmFsc2UpXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogc2NvcGUuc3RhcnRTdGFnZSgncHJvY2Vzc0RhdGEnKTtcbiAgICogLy8gLi4uIHBlcmZvcm0gc3RhZ2Ugb3BlcmF0aW9ucyAuLi5cbiAgICogc2NvcGUuZW5kU3RhZ2UoKTtcbiAgICpcbiAgICogLy8gT3IgcmVzZXQgc3RhZ2UgbmFtZSBhZnRlciBlbmRpbmdcbiAgICogc2NvcGUuZW5kU3RhZ2UodHJ1ZSk7XG4gICAqIGBgYFxuICAgKi9cbiAgZW5kU3RhZ2UocmVzZXRTdGFnZU5hbWU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IGVuZFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGR1cmF0aW9uIGlmIHdlIGhhdmUgYSBzdGFydCB0aW1lXG4gICAgY29uc3QgZHVyYXRpb24gPSB0aGlzLnN0YWdlU3RhcnRUaW1lICE9PSB1bmRlZmluZWQgPyBlbmRUaW1lIC0gdGhpcy5zdGFnZVN0YXJ0VGltZSA6IHVuZGVmaW5lZDtcblxuICAgIC8vIEludm9rZSBvblN0YWdlRW5kIGhvb2sgd2l0aCBTdGFnZUV2ZW50IGluY2x1ZGluZyBkdXJhdGlvblxuICAgIHRoaXMuaW52b2tlSG9vaygnb25TdGFnZUVuZCcsIHtcbiAgICAgIHN0YWdlTmFtZTogdGhpcy5zdGFnZU5hbWUsXG4gICAgICBwaXBlbGluZUlkOiB0aGlzLnBpcGVsaW5lSWQsXG4gICAgICB0aW1lc3RhbXA6IGVuZFRpbWUsXG4gICAgICBkdXJhdGlvbixcbiAgICB9KTtcblxuICAgIC8vIENsZWFyIHN0YXJ0IHRpbWVcbiAgICB0aGlzLnN0YWdlU3RhcnRUaW1lID0gdW5kZWZpbmVkO1xuXG4gICAgLy8gT3B0aW9uYWxseSByZXNldCBzdGFnZSBuYW1lXG4gICAgaWYgKHJlc2V0U3RhZ2VOYW1lKSB7XG4gICAgICB0aGlzLnN0YWdlTmFtZSA9ICcnO1xuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFJlY29yZGVyIE1hbmFnZW1lbnRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAvKipcbiAgICogQXR0YWNoZXMgYSByZWNvcmRlciBhdCB0aGUgZ2xvYmFsIHNjb3BlIGxldmVsLlxuICAgKlxuICAgKiBHbG9iYWwgcmVjb3JkZXJzIHJlY2VpdmUgZXZlbnRzIGZvciBhbGwgb3BlcmF0aW9ucyBhY3Jvc3MgYWxsIHN0YWdlcy5cbiAgICogUmVjb3JkZXJzIGFyZSBpbnZva2VkIGluIGF0dGFjaG1lbnQgb3JkZXIuXG4gICAqXG4gICAqIEBwYXJhbSByZWNvcmRlciAtIFRoZSByZWNvcmRlciB0byBhdHRhY2hcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBtZXRyaWNSZWNvcmRlciA9IG5ldyBNZXRyaWNSZWNvcmRlcigpO1xuICAgKiBzY29wZS5hdHRhY2hSZWNvcmRlcihtZXRyaWNSZWNvcmRlcik7XG4gICAqIGBgYFxuICAgKi9cbiAgYXR0YWNoUmVjb3JkZXIocmVjb3JkZXI6IFJlY29yZGVyKTogdm9pZCB7XG4gICAgdGhpcy5yZWNvcmRlcnMucHVzaChyZWNvcmRlcik7XG4gIH1cblxuICAvKipcbiAgICogQXR0YWNoZXMgYSByZWNvcmRlciBhdCB0aGUgc3RhZ2UgbGV2ZWwuXG4gICAqXG4gICAqIFN0YWdlLWxldmVsIHJlY29yZGVycyBvbmx5IHJlY2VpdmUgZXZlbnRzIGZvciBvcGVyYXRpb25zIHBlcmZvcm1lZFxuICAgKiBkdXJpbmcgdGhlIHNwZWNpZmllZCBzdGFnZS4gVGhpcyBhbGxvd3MgdGFyZ2V0ZWQgcmVjb3JkaW5nIGZvclxuICAgKiBzcGVjaWZpYyBzdGFnZXMgd2l0aG91dCBub2lzZSBmcm9tIG90aGVyIHN0YWdlcy5cbiAgICpcbiAgICogQHBhcmFtIHN0YWdlTmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBzdGFnZSB0byBhdHRhY2ggdGhlIHJlY29yZGVyIHRvXG4gICAqIEBwYXJhbSByZWNvcmRlciAtIFRoZSByZWNvcmRlciB0byBhdHRhY2hcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBkZWJ1Z1JlY29yZGVyID0gbmV3IERlYnVnUmVjb3JkZXIoeyB2ZXJib3NpdHk6ICd2ZXJib3NlJyB9KTtcbiAgICogc2NvcGUuYXR0YWNoU3RhZ2VSZWNvcmRlcigncHJvY2Vzc0RhdGEnLCBkZWJ1Z1JlY29yZGVyKTtcbiAgICogYGBgXG4gICAqL1xuICBhdHRhY2hTdGFnZVJlY29yZGVyKHN0YWdlTmFtZTogc3RyaW5nLCByZWNvcmRlcjogUmVjb3JkZXIpOiB2b2lkIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuc3RhZ2VSZWNvcmRlcnMuZ2V0KHN0YWdlTmFtZSk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICBleGlzdGluZy5wdXNoKHJlY29yZGVyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdGFnZVJlY29yZGVycy5zZXQoc3RhZ2VOYW1lLCBbcmVjb3JkZXJdKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGV0YWNoZXMgYSByZWNvcmRlciBieSBpdHMgSUQuXG4gICAqXG4gICAqIFJlbW92ZXMgdGhlIHJlY29yZGVyIGZyb20gYm90aCBnbG9iYWwgYW5kIHN0YWdlLWxldmVsIGF0dGFjaG1lbnQuXG4gICAqIElmIHRoZSByZWNvcmRlciBpcyBub3QgZm91bmQsIHRoaXMgaXMgYSBuby1vcCAoc2lsZW50KS5cbiAgICpcbiAgICogQHBhcmFtIHJlY29yZGVySWQgLSBUaGUgdW5pcXVlIElEIG9mIHRoZSByZWNvcmRlciB0byBkZXRhY2hcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBzY29wZS5hdHRhY2hSZWNvcmRlcihtZXRyaWNSZWNvcmRlcik7XG4gICAqIC8vIC4uLiBsYXRlciAuLi5cbiAgICogc2NvcGUuZGV0YWNoUmVjb3JkZXIobWV0cmljUmVjb3JkZXIuaWQpO1xuICAgKiBgYGBcbiAgICovXG4gIGRldGFjaFJlY29yZGVyKHJlY29yZGVySWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIC8vIFJlbW92ZSBmcm9tIGdsb2JhbCByZWNvcmRlcnNcbiAgICB0aGlzLnJlY29yZGVycyA9IHRoaXMucmVjb3JkZXJzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcmVjb3JkZXJJZCk7XG5cbiAgICAvLyBSZW1vdmUgZnJvbSBzdGFnZSByZWNvcmRlcnNcbiAgICBmb3IgKGNvbnN0IFtzdGFnZU5hbWUsIHJlY29yZGVyc10gb2YgdGhpcy5zdGFnZVJlY29yZGVycy5lbnRyaWVzKCkpIHtcbiAgICAgIGNvbnN0IGZpbHRlcmVkID0gcmVjb3JkZXJzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcmVjb3JkZXJJZCk7XG4gICAgICBpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRoaXMuc3RhZ2VSZWNvcmRlcnMuZGVsZXRlKHN0YWdlTmFtZSk7XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcmVkLmxlbmd0aCAhPT0gcmVjb3JkZXJzLmxlbmd0aCkge1xuICAgICAgICB0aGlzLnN0YWdlUmVjb3JkZXJzLnNldChzdGFnZU5hbWUsIGZpbHRlcmVkKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhbGwgYXR0YWNoZWQgcmVjb3JkZXJzIChnbG9iYWwgYW5kIHN0YWdlLWxldmVsKS5cbiAgICpcbiAgICogUmV0dXJucyBhIG5ldyBhcnJheSBjb250YWluaW5nIGFsbCByZWNvcmRlcnMuIEdsb2JhbCByZWNvcmRlcnNcbiAgICogYXJlIGxpc3RlZCBmaXJzdCwgZm9sbG93ZWQgYnkgc3RhZ2UtbGV2ZWwgcmVjb3JkZXJzLlxuICAgKlxuICAgKiBAcmV0dXJucyBBcnJheSBvZiBhbGwgYXR0YWNoZWQgcmVjb3JkZXJzXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogc2NvcGUuYXR0YWNoUmVjb3JkZXIobWV0cmljUmVjb3JkZXIpO1xuICAgKiBzY29wZS5hdHRhY2hTdGFnZVJlY29yZGVyKCdwcm9jZXNzRGF0YScsIGRlYnVnUmVjb3JkZXIpO1xuICAgKlxuICAgKiBjb25zdCByZWNvcmRlcnMgPSBzY29wZS5nZXRSZWNvcmRlcnMoKTtcbiAgICogY29uc29sZS5sb2cocmVjb3JkZXJzLmxlbmd0aCk7IC8vIDJcbiAgICogYGBgXG4gICAqL1xuICBnZXRSZWNvcmRlcnMoKTogUmVjb3JkZXJbXSB7XG4gICAgY29uc3QgYWxsUmVjb3JkZXJzOiBSZWNvcmRlcltdID0gWy4uLnRoaXMucmVjb3JkZXJzXTtcblxuICAgIC8vIEFkZCBzdGFnZS1sZXZlbCByZWNvcmRlcnNcbiAgICBmb3IgKGNvbnN0IHJlY29yZGVycyBvZiB0aGlzLnN0YWdlUmVjb3JkZXJzLnZhbHVlcygpKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlY29yZGVyIG9mIHJlY29yZGVycykge1xuICAgICAgICAvLyBBdm9pZCBkdXBsaWNhdGVzIGlmIHNhbWUgcmVjb3JkZXIgaXMgYXR0YWNoZWQgZ2xvYmFsbHkgYW5kIHRvIGEgc3RhZ2VcbiAgICAgICAgaWYgKCFhbGxSZWNvcmRlcnMuc29tZSgocikgPT4gci5pZCA9PT0gcmVjb3JkZXIuaWQpKSB7XG4gICAgICAgICAgYWxsUmVjb3JkZXJzLnB1c2gocmVjb3JkZXIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGFsbFJlY29yZGVycztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIHRoZSBhY3RpdmUgcmVjb3JkZXJzIGZvciB0aGUgY3VycmVudCBzdGFnZS5cbiAgICpcbiAgICogUmV0dXJucyBnbG9iYWwgcmVjb3JkZXJzIHBsdXMgYW55IHN0YWdlLXNwZWNpZmljIHJlY29yZGVycyBmb3JcbiAgICogdGhlIGN1cnJlbnQgc3RhZ2UuIFVzZWQgaW50ZXJuYWxseSBieSBpbnZva2VIb29rLlxuICAgKlxuICAgKiBAcmV0dXJucyBBcnJheSBvZiByZWNvcmRlcnMgYWN0aXZlIGZvciB0aGUgY3VycmVudCBzdGFnZVxuICAgKi9cbiAgcHJpdmF0ZSBnZXRBY3RpdmVSZWNvcmRlcnMoKTogUmVjb3JkZXJbXSB7XG4gICAgY29uc3QgYWN0aXZlOiBSZWNvcmRlcltdID0gWy4uLnRoaXMucmVjb3JkZXJzXTtcblxuICAgIC8vIEFkZCBzdGFnZS1zcGVjaWZpYyByZWNvcmRlcnMgZm9yIGN1cnJlbnQgc3RhZ2VcbiAgICBjb25zdCBzdGFnZVNwZWNpZmljID0gdGhpcy5zdGFnZVJlY29yZGVycy5nZXQodGhpcy5zdGFnZU5hbWUpO1xuICAgIGlmIChzdGFnZVNwZWNpZmljKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlY29yZGVyIG9mIHN0YWdlU3BlY2lmaWMpIHtcbiAgICAgICAgLy8gQXZvaWQgZHVwbGljYXRlc1xuICAgICAgICBpZiAoIWFjdGl2ZS5zb21lKChyKSA9PiByLmlkID09PSByZWNvcmRlci5pZCkpIHtcbiAgICAgICAgICBhY3RpdmUucHVzaChyZWNvcmRlcik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gYWN0aXZlO1xuICB9XG5cbiAgLyoqXG4gICAqIEludm9rZXMgYSBob29rIG9uIGFsbCBhY3RpdmUgcmVjb3JkZXJzIHdpdGggZXJyb3IgaGFuZGxpbmcuXG4gICAqXG4gICAqIFJlY29yZGVycyBhcmUgaW52b2tlZCBpbiBhdHRhY2htZW50IG9yZGVyLiBJZiBhIHJlY29yZGVyIHRocm93c1xuICAgKiBhbiBlcnJvcjpcbiAgICogICAxLiBUaGUgZXJyb3IgaXMgY2F1Z2h0IGFuZCBub3QgcHJvcGFnYXRlZCB0byB0aGUgY2FsbGluZyBjb2RlXG4gICAqICAgMi4gVGhlIGVycm9yIGlzIHBhc3NlZCB0byBvbkVycm9yIGhvb2tzIG9mIG90aGVyIHJlY29yZGVyc1xuICAgKiAgIDMuIFRoZSBzY29wZSBvcGVyYXRpb24gY29udGludWVzIG5vcm1hbGx5XG4gICAqICAgNC4gQSB3YXJuaW5nIGlzIGxvZ2dlZCBpbiBkZXZlbG9wbWVudCBtb2RlXG4gICAqXG4gICAqIEBwYXJhbSBob29rIC0gVGhlIG5hbWUgb2YgdGhlIGhvb2sgdG8gaW52b2tlXG4gICAqIEBwYXJhbSBldmVudCAtIFRoZSBldmVudCBwYXlsb2FkIHRvIHBhc3MgdG8gdGhlIGhvb2tcbiAgICpcbiAgICogQGludGVybmFsXG4gICAqL1xuICBwcml2YXRlIGludm9rZUhvb2soaG9vazoga2V5b2YgT21pdDxSZWNvcmRlciwgJ2lkJz4sIGV2ZW50OiB1bmtub3duKTogdm9pZCB7XG4gICAgY29uc3QgYWN0aXZlUmVjb3JkZXJzID0gdGhpcy5nZXRBY3RpdmVSZWNvcmRlcnMoKTtcblxuICAgIGZvciAoY29uc3QgcmVjb3JkZXIgb2YgYWN0aXZlUmVjb3JkZXJzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBob29rRm4gPSByZWNvcmRlcltob29rXTtcbiAgICAgICAgaWYgKHR5cGVvZiBob29rRm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAoaG9va0ZuIGFzIChldmVudDogdW5rbm93bikgPT4gdm9pZCkuY2FsbChyZWNvcmRlciwgZXZlbnQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBEb24ndCBsZXQgcmVjb3JkZXIgZXJyb3JzIGJyZWFrIHNjb3BlIG9wZXJhdGlvbnNcbiAgICAgICAgLy8gQWxzbyBhdm9pZCBpbmZpbml0ZSByZWN1cnNpb24gaWYgb25FcnJvciBpdHNlbGYgdGhyb3dzXG4gICAgICAgIGlmIChob29rICE9PSAnb25FcnJvcicpIHtcbiAgICAgICAgICB0aGlzLmludm9rZUhvb2soJ29uRXJyb3InLCB7XG4gICAgICAgICAgICBzdGFnZU5hbWU6IHRoaXMuc3RhZ2VOYW1lLFxuICAgICAgICAgICAgcGlwZWxpbmVJZDogdGhpcy5waXBlbGluZUlkLFxuICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgZXJyb3I6IGVycm9yIGFzIEVycm9yLFxuICAgICAgICAgICAgb3BlcmF0aW9uOiB0aGlzLmhvb2tUb09wZXJhdGlvbihob29rKSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIExvZyB3YXJuaW5nIGluIGRldmVsb3BtZW50IG1vZGVcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBSZWNvcmRlciAke3JlY29yZGVyLmlkfSB0aHJldyBlcnJvciBpbiAke2hvb2t9OmAsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBNYXBzIGEgaG9vayBuYW1lIHRvIGFuIG9wZXJhdGlvbiB0eXBlIGZvciBlcnJvciBldmVudHMuXG4gICAqXG4gICAqIEBwYXJhbSBob29rIC0gVGhlIGhvb2sgbmFtZVxuICAgKiBAcmV0dXJucyBUaGUgY29ycmVzcG9uZGluZyBvcGVyYXRpb24gdHlwZVxuICAgKlxuICAgKiBAaW50ZXJuYWxcbiAgICovXG4gIHByaXZhdGUgaG9va1RvT3BlcmF0aW9uKGhvb2s6IGtleW9mIE9taXQ8UmVjb3JkZXIsICdpZCc+KTogJ3JlYWQnIHwgJ3dyaXRlJyB8ICdjb21taXQnIHtcbiAgICBzd2l0Y2ggKGhvb2spIHtcbiAgICAgIGNhc2UgJ29uUmVhZCc6XG4gICAgICAgIHJldHVybiAncmVhZCc7XG4gICAgICBjYXNlICdvbldyaXRlJzpcbiAgICAgICAgcmV0dXJuICd3cml0ZSc7XG4gICAgICBjYXNlICdvbkNvbW1pdCc6XG4gICAgICAgIHJldHVybiAnY29tbWl0JztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIC8vIEZvciBzdGFnZSBsaWZlY3ljbGUgaG9va3MsIGRlZmF1bHQgdG8gJ3dyaXRlJyBhcyBhIGNhdGNoLWFsbFxuICAgICAgICByZXR1cm4gJ3dyaXRlJztcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQYXRoIENvbnN0cnVjdGlvbiBIZWxwZXJzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIEJ1aWxkcyBhIGNhY2hlIGtleSBmb3IgbG9jYWwgc3RvcmFnZS5cbiAgICpcbiAgICogQHBhcmFtIHBhdGggLSBUaGUgbmFtZXNwYWNlIHBhdGhcbiAgICogQHBhcmFtIGtleSAtIE9wdGlvbmFsIGtleVxuICAgKiBAcmV0dXJucyBBIHN0cmluZyBrZXkgZm9yIHRoZSBsb2NhbCBjYWNoZVxuICAgKi9cbiAgcHJpdmF0ZSBidWlsZENhY2hlS2V5KHBhdGg6IHN0cmluZ1tdLCBrZXk/OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHBhdGhTdHIgPSBwYXRoLmpvaW4oJ1xcdTAwMUYnKTsgLy8gVXNlIHVuaXQgc2VwYXJhdG9yIGFzIGRlbGltaXRlclxuICAgIHJldHVybiBrZXkgIT09IHVuZGVmaW5lZCA/IGAke3BhdGhTdHJ9XFx1MDAxRiR7a2V5fWAgOiBwYXRoU3RyO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQWNjZXNzb3JzIChmb3IgdGVzdGluZyBhbmQgZGVidWdnaW5nKVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBHZXRzIHRoZSBwaXBlbGluZSBJRCBmb3IgdGhpcyBzY29wZS5cbiAgICovXG4gIGdldFBpcGVsaW5lSWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5waXBlbGluZUlkO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgdGhlIGN1cnJlbnQgc3RhZ2UgbmFtZS5cbiAgICovXG4gIGdldFN0YWdlTmFtZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLnN0YWdlTmFtZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIHRoZSB1bmRlcmx5aW5nIEdsb2JhbFN0b3JlLlxuICAgKiBQcmltYXJpbHkgZm9yIHRlc3RpbmcgYW5kIGludGVncmF0aW9uIHB1cnBvc2VzLlxuICAgKi9cbiAgZ2V0R2xvYmFsU3RvcmUoKTogR2xvYmFsU3RvcmUge1xuICAgIHJldHVybiB0aGlzLmdsb2JhbFN0b3JlO1xuICB9XG59XG4iXX0=