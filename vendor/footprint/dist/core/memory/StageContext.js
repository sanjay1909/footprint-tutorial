"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageContext = void 0;
const WriteBuffer_1 = require("../../internal/memory/WriteBuffer");
const utils_1 = require("../../internal/memory/utils");
const StageMetadata_1 = require("./StageMetadata");
const scopeLog_1 = require("../../utils/scopeLog");
class StageContext {
    constructor(pipelineId, name, globalStore, branchId, executionHistory, isDecider) {
        this.stageName = '';
        // Per-stage metadata collector
        this.debug = new StageMetadata_1.StageMetadata();
        this.pipelineId = pipelineId;
        this.stageName = name;
        this.globalStore = globalStore;
        this.branchId = branchId;
        this.executionHistory = executionHistory;
        this.isDecider = !!isDecider;
        this.isFork = false;
    }
    /**
     * Gets the write buffer for staging mutations.
     * WHY: Lazily instantiates so we pay clone cost only if stage writes.
     */
    getWriteBuffer() {
        if (!this.writeBuffer) {
            this.writeBuffer = new WriteBuffer_1.WriteBuffer(this.globalStore.getState());
        }
        return this.writeBuffer;
    }
    /**
     * Builds an absolute path inside the shared GlobalStore.
     * WHY: Pipelines are namespaced under 'pipelines/{id}/' to prevent collisions.
     */
    withNamespace(path, key) {
        if (!this.pipelineId || this.pipelineId === '') {
            return [...path, key];
        }
        return ['pipelines', this.pipelineId, ...path, key];
    }
    /**
     * Hard overwrite at the specified path.
     */
    patch(path, key, value, shouldRedact = false) {
        this.getWriteBuffer().set(this.withNamespace(path, key), value, shouldRedact);
    }
    set(path, key, value) {
        this.patch(path, key, value);
    }
    /**
     * Deep union merge at the specified path.
     */
    merge(path, key, value) {
        this.getWriteBuffer().merge(this.withNamespace(path, key), value);
    }
    /**
     * Flushes staged mutations into the GlobalStore.
     * WHY: Atomic commit ensures all-or-nothing semantics.
     */
    commit() {
        var _a;
        const buffer = this.getWriteBuffer();
        const bundle = buffer.commit();
        const commitBundle = { ...bundle, stage: this.stageName };
        // Apply to global store
        this.globalStore.applyPatch(commitBundle.overwrite, commitBundle.updates, commitBundle.trace);
        // Redact and record to history
        const redactedOverwrite = (0, utils_1.redactPatch)(commitBundle.overwrite, commitBundle.redactedPaths);
        const redactedUpdates = (0, utils_1.redactPatch)(commitBundle.updates, commitBundle.redactedPaths);
        (_a = this.executionHistory) === null || _a === void 0 ? void 0 : _a.record({
            ...commitBundle,
            redactedPaths: Array.from(commitBundle.redactedPaths.values()),
            overwrite: redactedOverwrite,
            updates: redactedUpdates,
        });
        this.debug.addLog('writeTrace', commitBundle.trace);
    }
    /**
     * Creates the linear successor stage context.
     * WHY: Enables pipeline traversal without duplicating contexts.
     */
    createNext(path, stageName, isDecider = false) {
        if (!this.next) {
            this.next = new StageContext(path, stageName, this.globalStore, '', this.executionHistory, isDecider);
            this.next.parent = this;
        }
        return this.next;
    }
    /**
     * Creates a branch context for parallel execution.
     * WHY: Fan-out stages need separate contexts but share GlobalStore.
     */
    createChild(pipelineId, branchId, stageName, isDecider = false) {
        if (!this.children) {
            this.children = [];
        }
        const childContext = new StageContext(pipelineId, stageName, this.globalStore, branchId, this.executionHistory, isDecider);
        childContext.parent = this;
        this.children.push(childContext);
        return childContext;
    }
    createDecider(path, stageName) {
        return this.createNext(path, stageName, true);
    }
    setAsDecider() {
        this.isDecider = true;
        return this;
    }
    setAsFork() {
        this.isFork = true;
        return this;
    }
    // Convenience wrappers for common operations
    setRoot(key, value) {
        this.patch([], key, value);
        scopeLog_1.treeConsole.log(this, this.stageName, [], key, value, true);
    }
    updateObject(path, key, value, description) {
        this.merge(path, key, value);
        scopeLog_1.treeConsole.log(this, this.stageName, path, key, value);
        if (description) {
            this.debug.addLog('message', description);
        }
    }
    updateGlobalContext(key, value) {
        this.getWriteBuffer().set([key], value);
    }
    setGlobal(key, value, description) {
        this.getWriteBuffer().set([key], value);
        scopeLog_1.treeConsole.log(this, this.stageName, [], key, value, true);
        if (description) {
            this.debug.addLog('message', description);
        }
    }
    setObject(path, key, value, shouldRedact, description) {
        this.patch(path, key, value, shouldRedact !== null && shouldRedact !== void 0 ? shouldRedact : false);
        const logValue = shouldRedact ? 'REDACTED' : value;
        scopeLog_1.treeConsole.log(this, this.stageName, path, key, logValue, true);
        if (description) {
            const taggedDescription = description.startsWith('[')
                ? description
                : `[WRITE] ${description}`;
            this.debug.addLog('message', taggedDescription);
        }
    }
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
    appendToArray(path, key, items, description) {
        const existing = this.getValue(path, key);
        const merged = Array.isArray(existing) ? [...existing, ...items] : [...items];
        this.setObject(path, key, merged, false, description);
    }
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
    mergeObject(path, key, obj, description) {
        const existing = this.getValue(path, key);
        const merged = (existing && typeof existing === 'object' && !Array.isArray(existing))
            ? { ...existing, ...obj }
            : { ...obj };
        this.setObject(path, key, merged, false, description);
    }
    /**
     * Reads a value with read-after-write semantics.
     * WHY: Staged writes should be visible before commit.
     */
    getValue(path, key, description) {
        const buffer = this.getWriteBuffer();
        const fromPatch = buffer.get(this.withNamespace(path, key));
        const value = typeof fromPatch !== 'undefined'
            ? fromPatch
            : this.globalStore.getValue(this.pipelineId, path, key);
        if (description) {
            this.debug.addLog('message', `[READ] ${description}`);
        }
        return value;
    }
    getPipelineId() {
        return this.pipelineId;
    }
    get(path, key) {
        return this.getValue(path, key);
    }
    getRoot(key) {
        return this.globalStore.getValue(this.pipelineId, [], key);
    }
    getGlobal(key) {
        return this.globalStore.getValue('', [], key);
    }
    getFromRoot(key) {
        return this.globalStore.getValue(this.pipelineId, [], key);
    }
    getFromGlobalContext(key) {
        return this.globalStore.getValue('', [], key);
    }
    getScope() {
        return this.globalStore.getState();
    }
    // Metadata helpers
    addLog(key, value, path) {
        this.debug.addLog(key, value, path);
    }
    setLog(key, value, path) {
        this.debug.setLog(key, value, path);
    }
    addMetric(key, value, path) {
        this.debug.addMetric(key, value, path);
    }
    setMetric(key, value, path) {
        this.debug.setMetric(key, value, path);
    }
    addEval(key, value, path) {
        this.debug.addEval(key, value, path);
    }
    setEval(key, value, path) {
        this.debug.setEval(key, value, path);
    }
    addError(key, value, path) {
        this.debug.addError(key, value, path);
    }
    addFlowDebugMessage(type, description, options) {
        const flowMessage = {
            type,
            description,
            timestamp: Date.now(),
            ...options,
        };
        this.debug.addFlowMessage(flowMessage);
    }
    getStageId() {
        if (!this.pipelineId || this.pipelineId === '') {
            return this.stageName;
        }
        return `${this.pipelineId}.${this.stageName}`;
    }
    getSnapshot() {
        var _a, _b;
        const snapshot = {
            id: this.pipelineId,
            name: this.stageName,
            isDecider: this.isDecider,
            isFork: this.isFork,
            logs: this.debug.logContext,
            errors: this.debug.errorContext,
            metrics: this.debug.metricContext,
            evals: this.debug.evalContext,
        };
        if (this.debug.flowMessages.length > 0) {
            snapshot.flowMessages = this.debug.flowMessages;
        }
        if (this.next) {
            snapshot.next = (_a = this.next) === null || _a === void 0 ? void 0 : _a.getSnapshot();
        }
        if (this.children) {
            snapshot.children = (_b = this.children) === null || _b === void 0 ? void 0 : _b.map((child) => {
                return child.getSnapshot();
            });
        }
        return snapshot;
    }
}
exports.StageContext = StageContext;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhZ2VDb250ZXh0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2NvcmUvbWVtb3J5L1N0YWdlQ29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQThCRzs7O0FBR0gsbUVBQWdFO0FBQ2hFLHVEQUEwRDtBQUMxRCxtREFBZ0Q7QUFFaEQsbURBQW1EO0FBcUJuRCxNQUFhLFlBQVk7SUFtQnZCLFlBQ0UsVUFBa0IsRUFDbEIsSUFBWSxFQUNaLFdBQXdCLEVBQ3hCLFFBQWlCLEVBQ2pCLGdCQUFtQyxFQUNuQyxTQUFtQjtRQXBCZCxjQUFTLEdBQUcsRUFBRSxDQUFDO1FBV3RCLCtCQUErQjtRQUN4QixVQUFLLEdBQWtCLElBQUksNkJBQWEsRUFBRSxDQUFDO1FBVWhELElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO1FBQy9CLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxnQkFBb0MsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDN0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7T0FHRztJQUNILGNBQWM7UUFDWixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSx5QkFBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNsRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQzFCLENBQUM7SUFFRDs7O09BR0c7SUFDSyxhQUFhLENBQUMsSUFB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aEQsQ0FBQztJQUVELFdBQVc7O1FBQ1QsTUFBTSxRQUFRLEdBQWtCO1lBQzlCLEVBQUUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUNuQixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDcEIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNuQixJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVO1lBQzNCLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVk7WUFDL0IsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYTtZQUNqQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXO1NBQzlCLENBQUM7UUFFRixJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxRQUFRLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDO1FBQ2xELENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNkLFFBQVEsQ0FBQyxJQUFJLEdBQUcsTUFBQSxJQUFJLENBQUMsSUFBSSwwQ0FBRSxXQUFXLEVBQUUsQ0FBQztRQUMzQyxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEIsUUFBUSxDQUFDLFFBQVEsR0FBRyxNQUFBLElBQUksQ0FBQyxRQUFRLDBDQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO2dCQUMvQyxPQUFPLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUM3QixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFDRCxPQUFPLFFBQVEsQ0FBQztJQUNsQixDQUFDO0NBQ0Y7QUF0WEQsb0NBc1hDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTdGFnZUNvbnRleHQgLSBFeGVjdXRpb24gY29udGV4dCBmb3IgYSBzaW5nbGUgcGlwZWxpbmUgc3RhZ2VcbiAqIFxuICogV0hZOiBFYWNoIHN0YWdlIG5lZWRzIGlzb2xhdGVkIGFjY2VzcyB0byBzaGFyZWQgc3RhdGUgd2l0aCBhdG9taWMgY29tbWl0XG4gKiBzZW1hbnRpY3MuIFN0YWdlQ29udGV4dCBwcm92aWRlcyB0aGlzIGJ5IHdyYXBwaW5nIEdsb2JhbFN0b3JlIHdpdGggYVxuICogV3JpdGVCdWZmZXIgZm9yIHN0YWdlZCBtdXRhdGlvbnMuXG4gKiBcbiAqIERFU0lHTjogTGlrZSBhIHN0YWNrIGZyYW1lIGluIGEgY29tcGlsZXIvcnVudGltZTpcbiAqIC0gUmVmZXJlbmNlIHRvIEdsb2JhbFN0b3JlIChsaWtlIGFjY2Vzc2luZyBoZWFwIG1lbW9yeSlcbiAqIC0gV3JpdGVCdWZmZXIgZm9yIHN0YWdpbmcgbXV0YXRpb25zIChsaWtlIGEgdHJhbnNhY3Rpb24gYnVmZmVyKVxuICogLSBMaW5rcyB0byBwYXJlbnQvY2hpbGQvbmV4dCBjb250ZXh0cyAobGlrZSBjYWxsIHN0YWNrIGZyYW1lcylcbiAqIC0gTWV0YWRhdGEgY29sbGVjdG9yIGZvciBsb2dzLCBlcnJvcnMsIG1ldHJpY3NcbiAqIFxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gSG9sZCBlcGhlbWVyYWwgc3RhdGUgZm9yIGEgc2luZ2xlIHN0YWdlIGV4ZWN1dGlvblxuICogLSBEZWxlZ2F0ZSByZWFkcy93cml0ZXMgdG8gV3JpdGVCdWZmZXIgZm9yIGJhdGNoaW5nXG4gKiAtIEF0b21pY2FsbHkgY29tbWl0IGNoYW5nZXMgdG8gR2xvYmFsU3RvcmVcbiAqIC0gQ3JlYXRlIGNoaWxkL25leHQgY29udGV4dHMgZm9yIHRyZWUgdHJhdmVyc2FsXG4gKiBcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBHbG9iYWxTdG9yZX0gLSBUaGUgc2hhcmVkIHN0YXRlIGNvbnRhaW5lclxuICogLSB7QGxpbmsgV3JpdGVCdWZmZXJ9IC0gVHJhbnNhY3Rpb24gYnVmZmVyIGZvciBtdXRhdGlvbnNcbiAqIC0ge0BsaW5rIFN0YWdlTWV0YWRhdGF9IC0gTG9ncywgZXJyb3JzLCBtZXRyaWNzIGNvbGxlY3RvclxuICogXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3QgY3R4ID0gbmV3IFN0YWdlQ29udGV4dCgncGlwZWxpbmUtMScsICd2YWxpZGF0ZScsIGdsb2JhbFN0b3JlKTtcbiAqIGN0eC5zZXRPYmplY3QoWyd1c2VyJ10sICduYW1lJywgJ0FsaWNlJyk7XG4gKiBjdHguY29tbWl0KCk7IC8vIEF0b21pY2FsbHkgYXBwbGllcyB0byBHbG9iYWxTdG9yZVxuICogYGBgXG4gKi9cblxuaW1wb3J0IHsgRXhlY3V0aW9uSGlzdG9yeSB9IGZyb20gJy4uLy4uL2ludGVybmFsL2hpc3RvcnkvRXhlY3V0aW9uSGlzdG9yeSc7XG5pbXBvcnQgeyBXcml0ZUJ1ZmZlciB9IGZyb20gJy4uLy4uL2ludGVybmFsL21lbW9yeS9Xcml0ZUJ1ZmZlcic7XG5pbXBvcnQgeyByZWRhY3RQYXRjaCB9IGZyb20gJy4uLy4uL2ludGVybmFsL21lbW9yeS91dGlscyc7XG5pbXBvcnQgeyBTdGFnZU1ldGFkYXRhIH0gZnJvbSAnLi9TdGFnZU1ldGFkYXRhJztcbmltcG9ydCB7IEdsb2JhbFN0b3JlIH0gZnJvbSAnLi9HbG9iYWxTdG9yZSc7XG5pbXBvcnQgeyB0cmVlQ29uc29sZSB9IGZyb20gJy4uLy4uL3V0aWxzL3Njb3BlTG9nJztcbmltcG9ydCB0eXBlIHsgRmxvd0NvbnRyb2xUeXBlLCBGbG93TWVzc2FnZSB9IGZyb20gJy4uL2V4ZWN1dG9yL3R5cGVzJztcblxuLyoqXG4gKiBTZXJpYWxpemFibGUgcmVwcmVzZW50YXRpb24gb2YgYSBzdGFnZSdzIHN0YXRlLlxuICogV0hZOiBVc2VkIGZvciBkZWJ1Z2dpbmcsIHZpc3VhbGl6YXRpb24sIGFuZCB0aW1lLXRyYXZlbCBmZWF0dXJlcy5cbiAqL1xuZXhwb3J0IHR5cGUgU3RhZ2VTbmFwc2hvdCA9IHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgaXNEZWNpZGVyPzogYm9vbGVhbjtcbiAgaXNGb3JrPzogYm9vbGVhbjtcbiAgbG9nczogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGVycm9yczogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIG1ldHJpY3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBldmFsczogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGZsb3dNZXNzYWdlcz86IEZsb3dNZXNzYWdlW107XG4gIG5leHQ/OiBTdGFnZVNuYXBzaG90O1xuICBjaGlsZHJlbj86IFN0YWdlU25hcHNob3RbXTtcbn07XG5cbmV4cG9ydCBjbGFzcyBTdGFnZUNvbnRleHQge1xuICBwcml2YXRlIGdsb2JhbFN0b3JlOiBHbG9iYWxTdG9yZTtcbiAgcHJpdmF0ZSB3cml0ZUJ1ZmZlcj86IFdyaXRlQnVmZmVyOyAvLyBMYXppbHkgY3JlYXRlZCBwZXIgc3RhZ2VcbiAgcHJpdmF0ZSBleGVjdXRpb25IaXN0b3J5PzogRXhlY3V0aW9uSGlzdG9yeTtcblxuICBwdWJsaWMgc3RhZ2VOYW1lID0gJyc7XG4gIHB1YmxpYyBwaXBlbGluZUlkOiBzdHJpbmc7XG4gIHB1YmxpYyBicmFuY2hJZD86IHN0cmluZztcbiAgcHVibGljIGlzRGVjaWRlcjogYm9vbGVhbjtcbiAgcHVibGljIGlzRm9yazogYm9vbGVhbjtcblxuICAvLyBMaW5rcyBmb3Igd2Fsa2luZyB0aGUgc3RhZ2UgdHJlZVxuICBwdWJsaWMgcGFyZW50PzogU3RhZ2VDb250ZXh0O1xuICBwdWJsaWMgbmV4dD86IFN0YWdlQ29udGV4dDtcbiAgcHVibGljIGNoaWxkcmVuPzogU3RhZ2VDb250ZXh0W107XG5cbiAgLy8gUGVyLXN0YWdlIG1ldGFkYXRhIGNvbGxlY3RvclxuICBwdWJsaWMgZGVidWc6IFN0YWdlTWV0YWRhdGEgPSBuZXcgU3RhZ2VNZXRhZGF0YSgpO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBpcGVsaW5lSWQ6IHN0cmluZyxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgZ2xvYmFsU3RvcmU6IEdsb2JhbFN0b3JlLFxuICAgIGJyYW5jaElkPzogc3RyaW5nLFxuICAgIGV4ZWN1dGlvbkhpc3Rvcnk/OiBFeGVjdXRpb25IaXN0b3J5LFxuICAgIGlzRGVjaWRlcj86IGJvb2xlYW4sXG4gICkge1xuICAgIHRoaXMucGlwZWxpbmVJZCA9IHBpcGVsaW5lSWQ7XG4gICAgdGhpcy5zdGFnZU5hbWUgPSBuYW1lO1xuICAgIHRoaXMuZ2xvYmFsU3RvcmUgPSBnbG9iYWxTdG9yZTtcbiAgICB0aGlzLmJyYW5jaElkID0gYnJhbmNoSWQ7XG4gICAgdGhpcy5leGVjdXRpb25IaXN0b3J5ID0gZXhlY3V0aW9uSGlzdG9yeSBhcyBFeGVjdXRpb25IaXN0b3J5O1xuICAgIHRoaXMuaXNEZWNpZGVyID0gISFpc0RlY2lkZXI7XG4gICAgdGhpcy5pc0ZvcmsgPSBmYWxzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIHRoZSB3cml0ZSBidWZmZXIgZm9yIHN0YWdpbmcgbXV0YXRpb25zLlxuICAgKiBXSFk6IExhemlseSBpbnN0YW50aWF0ZXMgc28gd2UgcGF5IGNsb25lIGNvc3Qgb25seSBpZiBzdGFnZSB3cml0ZXMuXG4gICAqL1xuICBnZXRXcml0ZUJ1ZmZlcigpOiBXcml0ZUJ1ZmZlciB7XG4gICAgaWYgKCF0aGlzLndyaXRlQnVmZmVyKSB7XG4gICAgICB0aGlzLndyaXRlQnVmZmVyID0gbmV3IFdyaXRlQnVmZmVyKHRoaXMuZ2xvYmFsU3RvcmUuZ2V0U3RhdGUoKSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLndyaXRlQnVmZmVyO1xuICB9XG5cbiAgLyoqXG4gICAqIEJ1aWxkcyBhbiBhYnNvbHV0ZSBwYXRoIGluc2lkZSB0aGUgc2hhcmVkIEdsb2JhbFN0b3JlLlxuICAgKiBXSFk6IFBpcGVsaW5lcyBhcmUgbmFtZXNwYWNlZCB1bmRlciAncGlwZWxpbmVzL3tpZH0vJyB0byBwcmV2ZW50IGNvbGxpc2lvbnMuXG4gICAqL1xuICBwcml2YXRlIHdpdGhOYW1lc3BhY2UocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nKTogc3RyaW5nW10ge1xuICAgIGlmICghdGhpcy5waXBlbGluZUlkIHx8IHRoaXMucGlwZWxpbmVJZCA9PT0gJycpIHtcbiAgICAgIHJldHVybiBbLi4ucGF0aCwga2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIFsncGlwZWxpbmVzJywgdGhpcy5waXBlbGluZUlkLCAuLi5wYXRoLCBrZXldO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhcmQgb3ZlcndyaXRlIGF0IHRoZSBzcGVjaWZpZWQgcGF0aC5cbiAgICovXG4gIHBhdGNoKHBhdGg6IHN0cmluZ1tdLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHNob3VsZFJlZGFjdCA9IGZhbHNlKSB7XG4gICAgdGhpcy5nZXRXcml0ZUJ1ZmZlcigpLnNldCh0aGlzLndpdGhOYW1lc3BhY2UocGF0aCwga2V5KSwgdmFsdWUsIHNob3VsZFJlZGFjdCk7XG4gIH1cblxuICBzZXQocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHRoaXMucGF0Y2gocGF0aCwga2V5LCB2YWx1ZSk7XG4gIH1cblxuICAvKipcbiAgICogRGVlcCB1bmlvbiBtZXJnZSBhdCB0aGUgc3BlY2lmaWVkIHBhdGguXG4gICAqL1xuICBtZXJnZShwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG4gICAgdGhpcy5nZXRXcml0ZUJ1ZmZlcigpLm1lcmdlKHRoaXMud2l0aE5hbWVzcGFjZShwYXRoLCBrZXkpLCB2YWx1ZSk7XG4gIH1cblxuICAvKipcbiAgICogRmx1c2hlcyBzdGFnZWQgbXV0YXRpb25zIGludG8gdGhlIEdsb2JhbFN0b3JlLlxuICAgKiBXSFk6IEF0b21pYyBjb21taXQgZW5zdXJlcyBhbGwtb3Itbm90aGluZyBzZW1hbnRpY3MuXG4gICAqL1xuICBjb21taXQoKTogdm9pZCB7XG4gICAgY29uc3QgYnVmZmVyID0gdGhpcy5nZXRXcml0ZUJ1ZmZlcigpO1xuICAgIGNvbnN0IGJ1bmRsZSA9IGJ1ZmZlci5jb21taXQoKTtcblxuICAgIGNvbnN0IGNvbW1pdEJ1bmRsZSA9IHsgLi4uYnVuZGxlLCBzdGFnZTogdGhpcy5zdGFnZU5hbWUgfTtcblxuICAgIC8vIEFwcGx5IHRvIGdsb2JhbCBzdG9yZVxuICAgIHRoaXMuZ2xvYmFsU3RvcmUuYXBwbHlQYXRjaChjb21taXRCdW5kbGUub3ZlcndyaXRlLCBjb21taXRCdW5kbGUudXBkYXRlcywgY29tbWl0QnVuZGxlLnRyYWNlKTtcblxuICAgIC8vIFJlZGFjdCBhbmQgcmVjb3JkIHRvIGhpc3RvcnlcbiAgICBjb25zdCByZWRhY3RlZE92ZXJ3cml0ZSA9IHJlZGFjdFBhdGNoKGNvbW1pdEJ1bmRsZS5vdmVyd3JpdGUsIGNvbW1pdEJ1bmRsZS5yZWRhY3RlZFBhdGhzKTtcbiAgICBjb25zdCByZWRhY3RlZFVwZGF0ZXMgPSByZWRhY3RQYXRjaChjb21taXRCdW5kbGUudXBkYXRlcywgY29tbWl0QnVuZGxlLnJlZGFjdGVkUGF0aHMpO1xuICAgIHRoaXMuZXhlY3V0aW9uSGlzdG9yeT8ucmVjb3JkKHtcbiAgICAgIC4uLmNvbW1pdEJ1bmRsZSxcbiAgICAgIHJlZGFjdGVkUGF0aHM6IEFycmF5LmZyb20oY29tbWl0QnVuZGxlLnJlZGFjdGVkUGF0aHMudmFsdWVzKCkpLFxuICAgICAgb3ZlcndyaXRlOiByZWRhY3RlZE92ZXJ3cml0ZSxcbiAgICAgIHVwZGF0ZXM6IHJlZGFjdGVkVXBkYXRlcyxcbiAgICB9KTtcblxuICAgIHRoaXMuZGVidWcuYWRkTG9nKCd3cml0ZVRyYWNlJywgY29tbWl0QnVuZGxlLnRyYWNlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIHRoZSBsaW5lYXIgc3VjY2Vzc29yIHN0YWdlIGNvbnRleHQuXG4gICAqIFdIWTogRW5hYmxlcyBwaXBlbGluZSB0cmF2ZXJzYWwgd2l0aG91dCBkdXBsaWNhdGluZyBjb250ZXh0cy5cbiAgICovXG4gIGNyZWF0ZU5leHQocGF0aDogc3RyaW5nLCBzdGFnZU5hbWU6IHN0cmluZywgaXNEZWNpZGVyID0gZmFsc2UpOiBTdGFnZUNvbnRleHQge1xuICAgIGlmICghdGhpcy5uZXh0KSB7XG4gICAgICB0aGlzLm5leHQgPSBuZXcgU3RhZ2VDb250ZXh0KHBhdGgsIHN0YWdlTmFtZSwgdGhpcy5nbG9iYWxTdG9yZSwgJycsIHRoaXMuZXhlY3V0aW9uSGlzdG9yeSwgaXNEZWNpZGVyKTtcbiAgICAgIHRoaXMubmV4dC5wYXJlbnQgPSB0aGlzO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5uZXh0O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBicmFuY2ggY29udGV4dCBmb3IgcGFyYWxsZWwgZXhlY3V0aW9uLlxuICAgKiBXSFk6IEZhbi1vdXQgc3RhZ2VzIG5lZWQgc2VwYXJhdGUgY29udGV4dHMgYnV0IHNoYXJlIEdsb2JhbFN0b3JlLlxuICAgKi9cbiAgY3JlYXRlQ2hpbGQocGlwZWxpbmVJZDogc3RyaW5nLCBicmFuY2hJZDogc3RyaW5nLCBzdGFnZU5hbWU6IHN0cmluZywgaXNEZWNpZGVyID0gZmFsc2UpOiBTdGFnZUNvbnRleHQge1xuICAgIGlmICghdGhpcy5jaGlsZHJlbikge1xuICAgICAgdGhpcy5jaGlsZHJlbiA9IFtdO1xuICAgIH1cbiAgICBjb25zdCBjaGlsZENvbnRleHQgPSBuZXcgU3RhZ2VDb250ZXh0KFxuICAgICAgcGlwZWxpbmVJZCxcbiAgICAgIHN0YWdlTmFtZSxcbiAgICAgIHRoaXMuZ2xvYmFsU3RvcmUsXG4gICAgICBicmFuY2hJZCxcbiAgICAgIHRoaXMuZXhlY3V0aW9uSGlzdG9yeSxcbiAgICAgIGlzRGVjaWRlcixcbiAgICApO1xuICAgIGNoaWxkQ29udGV4dC5wYXJlbnQgPSB0aGlzO1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZENvbnRleHQpO1xuICAgIHJldHVybiBjaGlsZENvbnRleHQ7XG4gIH1cblxuICBjcmVhdGVEZWNpZGVyKHBhdGg6IHN0cmluZywgc3RhZ2VOYW1lOiBzdHJpbmcpOiBTdGFnZUNvbnRleHQge1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU5leHQocGF0aCwgc3RhZ2VOYW1lLCB0cnVlKTtcbiAgfVxuXG4gIHNldEFzRGVjaWRlcigpOiBTdGFnZUNvbnRleHQge1xuICAgIHRoaXMuaXNEZWNpZGVyID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIHNldEFzRm9yaygpOiBTdGFnZUNvbnRleHQge1xuICAgIHRoaXMuaXNGb3JrID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIENvbnZlbmllbmNlIHdyYXBwZXJzIGZvciBjb21tb24gb3BlcmF0aW9uc1xuICBzZXRSb290KGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHRoaXMucGF0Y2goW10sIGtleSwgdmFsdWUpO1xuICAgIHRyZWVDb25zb2xlLmxvZyh0aGlzLCB0aGlzLnN0YWdlTmFtZSwgW10sIGtleSwgdmFsdWUsIHRydWUpO1xuICB9XG5cbiAgdXBkYXRlT2JqZWN0KHBhdGg6IHN0cmluZ1tdLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGRlc2NyaXB0aW9uPzogc3RyaW5nKSB7XG4gICAgdGhpcy5tZXJnZShwYXRoLCBrZXksIHZhbHVlKTtcbiAgICB0cmVlQ29uc29sZS5sb2codGhpcywgdGhpcy5zdGFnZU5hbWUsIHBhdGgsIGtleSwgdmFsdWUpO1xuICAgIGlmIChkZXNjcmlwdGlvbikge1xuICAgICAgdGhpcy5kZWJ1Zy5hZGRMb2coJ21lc3NhZ2UnLCBkZXNjcmlwdGlvbik7XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlR2xvYmFsQ29udGV4dChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICB0aGlzLmdldFdyaXRlQnVmZmVyKCkuc2V0KFtrZXldLCB2YWx1ZSk7XG4gIH1cblxuICBzZXRHbG9iYWwoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBkZXNjcmlwdGlvbj86IHN0cmluZykge1xuICAgIHRoaXMuZ2V0V3JpdGVCdWZmZXIoKS5zZXQoW2tleV0sIHZhbHVlKTtcbiAgICB0cmVlQ29uc29sZS5sb2codGhpcywgdGhpcy5zdGFnZU5hbWUsIFtdLCBrZXksIHZhbHVlLCB0cnVlKTtcbiAgICBpZiAoZGVzY3JpcHRpb24pIHtcbiAgICAgIHRoaXMuZGVidWcuYWRkTG9nKCdtZXNzYWdlJywgZGVzY3JpcHRpb24pO1xuICAgIH1cbiAgfVxuXG4gIHNldE9iamVjdChwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBzaG91bGRSZWRhY3Q/OiBib29sZWFuLCBkZXNjcmlwdGlvbj86IHN0cmluZykge1xuICAgIHRoaXMucGF0Y2gocGF0aCwga2V5LCB2YWx1ZSwgc2hvdWxkUmVkYWN0ID8/IGZhbHNlKTtcbiAgICBjb25zdCBsb2dWYWx1ZSA9IHNob3VsZFJlZGFjdCA/ICdSRURBQ1RFRCcgOiB2YWx1ZTtcbiAgICB0cmVlQ29uc29sZS5sb2codGhpcywgdGhpcy5zdGFnZU5hbWUsIHBhdGgsIGtleSwgbG9nVmFsdWUsIHRydWUpO1xuICAgIGlmIChkZXNjcmlwdGlvbikge1xuICAgICAgY29uc3QgdGFnZ2VkRGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbi5zdGFydHNXaXRoKCdbJylcbiAgICAgICAgPyBkZXNjcmlwdGlvblxuICAgICAgICA6IGBbV1JJVEVdICR7ZGVzY3JpcHRpb259YDtcbiAgICAgIHRoaXMuZGVidWcuYWRkTG9nKCdtZXNzYWdlJywgdGFnZ2VkRGVzY3JpcHRpb24pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBcHBlbmQgaXRlbXMgdG8gYW4gZXhpc3RpbmcgYXJyYXkgYXQgdGhlIGdpdmVuIHNjb3BlIHBhdGguXG4gICAqXG4gICAqIFdIWTogU3RhZ2VzIGFuZCBzdWJmbG93IG91dHB1dCBtYXBwZXJzIGZyZXF1ZW50bHkgbmVlZCB0byBhZGQgaXRlbXMgdG9cbiAgICogY29sbGVjdGlvbnMgKGUuZy4sIGFwcGVuZGluZyBhIG1lc3NhZ2UgdG8gY29udmVyc2F0aW9uIGhpc3RvcnkpLiBXaXRob3V0XG4gICAqIHRoaXMgcHJpbWl0aXZlLCBjb25zdW1lcnMgbXVzdCBkbyBhIG1hbnVhbCByZWFkLWFwcGVuZC13cml0ZTpcbiAgICogICBjb25zdCBhcnIgPSBzY29wZS5nZXRWYWx1ZShwYXRoLCBrZXkpO1xuICAgKiAgIGFyci5wdXNoKG5ld0l0ZW0pO1xuICAgKiAgIHNjb3BlLnNldE9iamVjdChwYXRoLCBrZXksIGFycik7XG4gICAqXG4gICAqIFRoaXMgbWV0aG9kIGVuY2Fwc3VsYXRlcyB0aGF0IHBhdHRlcm4gYXMgYSBmaXJzdC1jbGFzcyBvcGVyYXRpb24uXG4gICAqXG4gICAqIERFU0lHTjogUmVhZHMgdGhlIGV4aXN0aW5nIHZhbHVlLCBhcHBlbmRzIG5ldyBpdGVtcywgd3JpdGVzIGJhY2sgdGhlXG4gICAqIGZ1bGwgbWVyZ2VkIGFycmF5IHZpYSBzZXRPYmplY3QuIElmIG5vIGV4aXN0aW5nIGFycmF5IGlzIGZvdW5kLCB0aGVcbiAgICogaXRlbXMgYmVjb21lIHRoZSBuZXcgYXJyYXkuIFRoZSBmdWxsIGFycmF5IGlzIHdyaXR0ZW4gdG8gdGhlIFdyaXRlQnVmZmVyLFxuICAgKiBzbyBjb21taXQgaGlzdG9yeSBjYXB0dXJlcyB0aGUgY29tcGxldGUgc3RhdGUgKG5vdCBqdXN0IHRoZSBkZWx0YSkuXG4gICAqXG4gICAqIEZVVFVSRTogRm9yIGdyYW51bGFyIFwiaXRlbSB3YXMgYXBwZW5kZWRcIiB0cmFja2luZyBpbiB0aGUgdGltZSB0cmF2ZWxlcixcbiAgICogdGhpcyB3b3VsZCBuZWVkIFdyaXRlQnVmZmVyLWxldmVsIENSRFQgc3VwcG9ydC4gU2VlOlxuICAgKiBkb2NzL2Z1dHVyZS9DUkRULWFycmF5LW9wZXJhdGlvbnMubWRcbiAgICpcbiAgICogQHBhcmFtIHBhdGggLSBTY29wZSBwYXRoIChlLmcuLCBbJ2FnZW50J10pXG4gICAqIEBwYXJhbSBrZXkgLSBLZXkgd2l0aGluIHRoZSBwYXRoIChlLmcuLCAnbWVzc2FnZXMnKVxuICAgKiBAcGFyYW0gaXRlbXMgLSBBcnJheSBvZiBpdGVtcyB0byBhcHBlbmRcbiAgICogQHBhcmFtIGRlc2NyaXB0aW9uIC0gT3B0aW9uYWwgZGVidWcgZGVzY3JpcHRpb25cbiAgICovXG4gIGFwcGVuZFRvQXJyYXkocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nLCBpdGVtczogdW5rbm93bltdLCBkZXNjcmlwdGlvbj86IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXRWYWx1ZShwYXRoLCBrZXkpO1xuICAgIGNvbnN0IG1lcmdlZCA9IEFycmF5LmlzQXJyYXkoZXhpc3RpbmcpID8gWy4uLmV4aXN0aW5nLCAuLi5pdGVtc10gOiBbLi4uaXRlbXNdO1xuICAgIHRoaXMuc2V0T2JqZWN0KHBhdGgsIGtleSwgbWVyZ2VkLCBmYWxzZSwgZGVzY3JpcHRpb24pO1xuICB9XG5cbiAgLyoqXG4gICAqIFNoYWxsb3cgbWVyZ2UgYW4gb2JqZWN0IGludG8gYW4gZXhpc3Rpbmcgb2JqZWN0IGF0IHRoZSBnaXZlbiBzY29wZSBwYXRoLlxuICAgKlxuICAgKiBXSFk6IFN0YWdlcyBhbmQgc3ViZmxvdyBvdXRwdXQgbWFwcGVycyBmcmVxdWVudGx5IG5lZWQgdG8gYWRkIGtleXMgdG9cbiAgICogZXhpc3Rpbmcgb2JqZWN0cyB3aXRob3V0IHJlcGxhY2luZyB0aGUgZW50aXJlIG9iamVjdC4gV2l0aG91dCB0aGlzXG4gICAqIHByaW1pdGl2ZSwgY29uc3VtZXJzIG11c3QgZG8gYSBtYW51YWwgcmVhZC1tZXJnZS13cml0ZS5cbiAgICpcbiAgICogREVTSUdOOiBSZWFkcyB0aGUgZXhpc3RpbmcgdmFsdWUsIHNoYWxsb3cgbWVyZ2VzIG5ldyBrZXlzIChuZXcga2V5c1xuICAgKiB3aW4gb24gY29uZmxpY3QpLCB3cml0ZXMgYmFjayB2aWEgc2V0T2JqZWN0LiBJZiBubyBleGlzdGluZyBvYmplY3RcbiAgICogaXMgZm91bmQsIHRoZSBuZXcgb2JqZWN0IGJlY29tZXMgdGhlIHZhbHVlLlxuICAgKlxuICAgKiBGVVRVUkU6IEZvciBncmFudWxhciBcImtleSB3YXMgbWVyZ2VkXCIgdHJhY2tpbmcgaW4gdGhlIHRpbWUgdHJhdmVsZXIsXG4gICAqIHRoaXMgd291bGQgbmVlZCBXcml0ZUJ1ZmZlci1sZXZlbCBDUkRUIHN1cHBvcnQuIFNlZTpcbiAgICogZG9jcy9mdXR1cmUvQ1JEVC1hcnJheS1vcGVyYXRpb25zLm1kXG4gICAqXG4gICAqIEBwYXJhbSBwYXRoIC0gU2NvcGUgcGF0aCAoZS5nLiwgWydhZ2VudCddKVxuICAgKiBAcGFyYW0ga2V5IC0gS2V5IHdpdGhpbiB0aGUgcGF0aCAoZS5nLiwgJ2NvbmZpZycpXG4gICAqIEBwYXJhbSBvYmogLSBPYmplY3Qgd2l0aCBrZXlzIHRvIG1lcmdlXG4gICAqIEBwYXJhbSBkZXNjcmlwdGlvbiAtIE9wdGlvbmFsIGRlYnVnIGRlc2NyaXB0aW9uXG4gICAqL1xuICBtZXJnZU9iamVjdChwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIG9iajogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGRlc2NyaXB0aW9uPzogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldFZhbHVlKHBhdGgsIGtleSk7XG4gICAgY29uc3QgbWVyZ2VkID0gKGV4aXN0aW5nICYmIHR5cGVvZiBleGlzdGluZyA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoZXhpc3RpbmcpKVxuICAgICAgPyB7IC4uLihleGlzdGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiksIC4uLm9iaiB9XG4gICAgICA6IHsgLi4ub2JqIH07XG4gICAgdGhpcy5zZXRPYmplY3QocGF0aCwga2V5LCBtZXJnZWQsIGZhbHNlLCBkZXNjcmlwdGlvbik7XG4gIH1cblxuICAvKipcbiAgICogUmVhZHMgYSB2YWx1ZSB3aXRoIHJlYWQtYWZ0ZXItd3JpdGUgc2VtYW50aWNzLlxuICAgKiBXSFk6IFN0YWdlZCB3cml0ZXMgc2hvdWxkIGJlIHZpc2libGUgYmVmb3JlIGNvbW1pdC5cbiAgICovXG4gIGdldFZhbHVlKHBhdGg6IHN0cmluZ1tdLCBrZXk/OiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKSB7XG4gICAgY29uc3QgYnVmZmVyID0gdGhpcy5nZXRXcml0ZUJ1ZmZlcigpO1xuICAgIGNvbnN0IGZyb21QYXRjaCA9IGJ1ZmZlci5nZXQodGhpcy53aXRoTmFtZXNwYWNlKHBhdGgsIGtleSBhcyBzdHJpbmcpKTtcbiAgICBjb25zdCB2YWx1ZSA9IHR5cGVvZiBmcm9tUGF0Y2ggIT09ICd1bmRlZmluZWQnXG4gICAgICA/IGZyb21QYXRjaFxuICAgICAgOiB0aGlzLmdsb2JhbFN0b3JlLmdldFZhbHVlKHRoaXMucGlwZWxpbmVJZCwgcGF0aCwga2V5KTtcblxuICAgIGlmIChkZXNjcmlwdGlvbikge1xuICAgICAgdGhpcy5kZWJ1Zy5hZGRMb2coJ21lc3NhZ2UnLCBgW1JFQURdICR7ZGVzY3JpcHRpb259YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgZ2V0UGlwZWxpbmVJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLnBpcGVsaW5lSWQ7XG4gIH1cblxuICBnZXQocGF0aDogc3RyaW5nW10sIGtleT86IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldFZhbHVlKHBhdGgsIGtleSk7XG4gIH1cblxuICBnZXRSb290KGtleTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2xvYmFsU3RvcmUuZ2V0VmFsdWUodGhpcy5waXBlbGluZUlkLCBbXSwga2V5KTtcbiAgfVxuXG4gIGdldEdsb2JhbChrZXk6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdsb2JhbFN0b3JlLmdldFZhbHVlKCcnLCBbXSwga2V5KTtcbiAgfVxuXG4gIGdldEZyb21Sb290KGtleTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2xvYmFsU3RvcmUuZ2V0VmFsdWUodGhpcy5waXBlbGluZUlkLCBbXSwga2V5KTtcbiAgfVxuXG4gIGdldEZyb21HbG9iYWxDb250ZXh0KGtleTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2xvYmFsU3RvcmUuZ2V0VmFsdWUoJycsIFtdLCBrZXkpO1xuICB9XG5cbiAgZ2V0U2NvcGUoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICAgIHJldHVybiB0aGlzLmdsb2JhbFN0b3JlLmdldFN0YXRlKCk7XG4gIH1cblxuICAvLyBNZXRhZGF0YSBoZWxwZXJzXG4gIGFkZExvZyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHBhdGg/OiBzdHJpbmdbXSkge1xuICAgIHRoaXMuZGVidWcuYWRkTG9nKGtleSwgdmFsdWUsIHBhdGgpO1xuICB9XG5cbiAgc2V0TG9nKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgcGF0aD86IHN0cmluZ1tdKSB7XG4gICAgdGhpcy5kZWJ1Zy5zZXRMb2coa2V5LCB2YWx1ZSwgcGF0aCk7XG4gIH1cblxuICBhZGRNZXRyaWMoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBwYXRoPzogc3RyaW5nW10pIHtcbiAgICB0aGlzLmRlYnVnLmFkZE1ldHJpYyhrZXksIHZhbHVlLCBwYXRoKTtcbiAgfVxuXG4gIHNldE1ldHJpYyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHBhdGg/OiBzdHJpbmdbXSkge1xuICAgIHRoaXMuZGVidWcuc2V0TWV0cmljKGtleSwgdmFsdWUsIHBhdGgpO1xuICB9XG5cbiAgYWRkRXZhbChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHBhdGg/OiBzdHJpbmdbXSkge1xuICAgIHRoaXMuZGVidWcuYWRkRXZhbChrZXksIHZhbHVlLCBwYXRoKTtcbiAgfVxuXG4gIHNldEV2YWwoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBwYXRoPzogc3RyaW5nW10pIHtcbiAgICB0aGlzLmRlYnVnLnNldEV2YWwoa2V5LCB2YWx1ZSwgcGF0aCk7XG4gIH1cblxuICBhZGRFcnJvcihrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHBhdGg/OiBzdHJpbmdbXSkge1xuICAgIHRoaXMuZGVidWcuYWRkRXJyb3Ioa2V5LCB2YWx1ZSwgcGF0aCk7XG4gIH1cblxuICBhZGRGbG93RGVidWdNZXNzYWdlKFxuICAgIHR5cGU6IEZsb3dDb250cm9sVHlwZSxcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nLFxuICAgIG9wdGlvbnM/OiB7XG4gICAgICB0YXJnZXRTdGFnZT86IHN0cmluZyB8IHN0cmluZ1tdO1xuICAgICAgcmF0aW9uYWxlPzogc3RyaW5nO1xuICAgICAgY291bnQ/OiBudW1iZXI7XG4gICAgICBpdGVyYXRpb24/OiBudW1iZXI7XG4gICAgfSxcbiAgKSB7XG4gICAgY29uc3QgZmxvd01lc3NhZ2U6IEZsb3dNZXNzYWdlID0ge1xuICAgICAgdHlwZSxcbiAgICAgIGRlc2NyaXB0aW9uLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgLi4ub3B0aW9ucyxcbiAgICB9O1xuICAgIHRoaXMuZGVidWcuYWRkRmxvd01lc3NhZ2UoZmxvd01lc3NhZ2UpO1xuICB9XG5cbiAgZ2V0U3RhZ2VJZCgpOiBzdHJpbmcge1xuICAgIGlmICghdGhpcy5waXBlbGluZUlkIHx8IHRoaXMucGlwZWxpbmVJZCA9PT0gJycpIHtcbiAgICAgIHJldHVybiB0aGlzLnN0YWdlTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIGAke3RoaXMucGlwZWxpbmVJZH0uJHt0aGlzLnN0YWdlTmFtZX1gO1xuICB9XG5cbiAgZ2V0U25hcHNob3QoKTogU3RhZ2VTbmFwc2hvdCB7XG4gICAgY29uc3Qgc25hcHNob3Q6IFN0YWdlU25hcHNob3QgPSB7XG4gICAgICBpZDogdGhpcy5waXBlbGluZUlkLFxuICAgICAgbmFtZTogdGhpcy5zdGFnZU5hbWUsXG4gICAgICBpc0RlY2lkZXI6IHRoaXMuaXNEZWNpZGVyLFxuICAgICAgaXNGb3JrOiB0aGlzLmlzRm9yayxcbiAgICAgIGxvZ3M6IHRoaXMuZGVidWcubG9nQ29udGV4dCxcbiAgICAgIGVycm9yczogdGhpcy5kZWJ1Zy5lcnJvckNvbnRleHQsXG4gICAgICBtZXRyaWNzOiB0aGlzLmRlYnVnLm1ldHJpY0NvbnRleHQsXG4gICAgICBldmFsczogdGhpcy5kZWJ1Zy5ldmFsQ29udGV4dCxcbiAgICB9O1xuXG4gICAgaWYgKHRoaXMuZGVidWcuZmxvd01lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIHNuYXBzaG90LmZsb3dNZXNzYWdlcyA9IHRoaXMuZGVidWcuZmxvd01lc3NhZ2VzO1xuICAgIH1cblxuICAgIGlmICh0aGlzLm5leHQpIHtcbiAgICAgIHNuYXBzaG90Lm5leHQgPSB0aGlzLm5leHQ/LmdldFNuYXBzaG90KCk7XG4gICAgfVxuICAgIGlmICh0aGlzLmNoaWxkcmVuKSB7XG4gICAgICBzbmFwc2hvdC5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4/Lm1hcCgoY2hpbGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGNoaWxkLmdldFNuYXBzaG90KCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHNuYXBzaG90O1xuICB9XG59XG4iXX0=