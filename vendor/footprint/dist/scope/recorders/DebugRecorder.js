"use strict";
/**
 * DebugRecorder - Development-focused recorder for detailed debugging information
 * ----------------------------------------------------------------------------
 * The DebugRecorder captures detailed debug information during execution for
 * troubleshooting issues during development and operational excellence (OE).
 *
 * Key features:
 *   - Track all errors that occur during scope operations
 *   - Track all mutations (writes and updates) with their values
 *   - Track reads in verbose mode
 *   - Configurable verbosity levels (minimal, verbose)
 *   - Filter entries by stage name
 *   - Clear recorded entries
 *
 * @module scope/recorders/DebugRecorder
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugRecorder = void 0;
// ============================================================================
// DebugRecorder Implementation
// ============================================================================
/**
 * DebugRecorder - captures detailed debug information for development and OE.
 *
 * This recorder implements the Recorder interface to observe scope operations
 * and collect debug information. It tracks:
 *   - All errors that occur during scope operations (always)
 *   - All mutations (writes and updates) with their values (in verbose mode)
 *   - All read operations (only in verbose mode)
 *   - Stage lifecycle events (stageStart/stageEnd)
 *
 * @example
 * ```typescript
 * const debugRecorder = new DebugRecorder({ verbosity: 'verbose' });
 * scope.attachRecorder(debugRecorder);
 *
 * // ... execute pipeline stages ...
 *
 * // Get all recorded entries
 * const entries = debugRecorder.getEntries();
 * console.log(`Total entries: ${entries.length}`);
 *
 * // Get only errors
 * const errors = debugRecorder.getErrors();
 * if (errors.length > 0) {
 *   console.error('Errors occurred:', errors);
 * }
 *
 * // Get entries for a specific stage
 * const stageEntries = debugRecorder.getEntriesForStage('processData');
 * console.log(`Stage entries: ${stageEntries.length}`);
 *
 * // Change verbosity
 * debugRecorder.setVerbosity('minimal');
 *
 * // Clear all entries
 * debugRecorder.clear();
 * ```
 */
class DebugRecorder {
    /**
     * Creates a new DebugRecorder instance.
     *
     * @param options - Optional configuration options
     */
    constructor(options) {
        var _a, _b;
        /**
         * All recorded debug entries.
         */
        this.entries = [];
        this.id = (_a = options === null || options === void 0 ? void 0 : options.id) !== null && _a !== void 0 ? _a : `debug-recorder-${Date.now()}`;
        this.verbosity = (_b = options === null || options === void 0 ? void 0 : options.verbosity) !== null && _b !== void 0 ? _b : 'verbose';
    }
    // ==========================================================================
    // Recorder Hooks
    // ==========================================================================
    /**
     * Called when a value is read from scope.
     *
     * Only records in verbose mode.
     *
     * @param event - Details about the read operation
     *
     * Requirements: 6.7
     */
    onRead(event) {
        // Only record reads in verbose mode
        if (this.verbosity !== 'verbose') {
            return;
        }
        this.entries.push({
            type: 'read',
            stageName: event.stageName,
            timestamp: event.timestamp,
            data: {
                path: event.path,
                key: event.key,
                value: event.value,
                pipelineId: event.pipelineId,
            },
        });
    }
    /**
     * Called when a value is written to scope.
     *
     * Records in verbose mode (mutations are tracked).
     *
     * @param event - Details about the write operation
     *
     * Requirements: 6.2, 6.3
     */
    onWrite(event) {
        // Only record writes in verbose mode
        if (this.verbosity !== 'verbose') {
            return;
        }
        this.entries.push({
            type: 'write',
            stageName: event.stageName,
            timestamp: event.timestamp,
            data: {
                path: event.path,
                key: event.key,
                value: event.value,
                operation: event.operation,
                pipelineId: event.pipelineId,
            },
        });
    }
    /**
     * Called when an error occurs during scope operations.
     *
     * Always records errors regardless of verbosity level.
     *
     * @param event - Details about the error
     *
     * Requirements: 6.1
     */
    onError(event) {
        // Always record errors regardless of verbosity
        this.entries.push({
            type: 'error',
            stageName: event.stageName,
            timestamp: event.timestamp,
            data: {
                error: event.error,
                operation: event.operation,
                path: event.path,
                key: event.key,
                pipelineId: event.pipelineId,
            },
        });
    }
    /**
     * Called when a stage begins execution.
     *
     * Records stage start events in verbose mode.
     *
     * @param event - Stage context
     */
    onStageStart(event) {
        // Only record stage events in verbose mode
        if (this.verbosity !== 'verbose') {
            return;
        }
        this.entries.push({
            type: 'stageStart',
            stageName: event.stageName,
            timestamp: event.timestamp,
            data: {
                pipelineId: event.pipelineId,
            },
        });
    }
    /**
     * Called when a stage completes execution.
     *
     * Records stage end events in verbose mode.
     *
     * @param event - Stage context with optional duration
     */
    onStageEnd(event) {
        // Only record stage events in verbose mode
        if (this.verbosity !== 'verbose') {
            return;
        }
        this.entries.push({
            type: 'stageEnd',
            stageName: event.stageName,
            timestamp: event.timestamp,
            data: {
                pipelineId: event.pipelineId,
                duration: event.duration,
            },
        });
    }
    // ==========================================================================
    // Debug Access Methods
    // ==========================================================================
    /**
     * Returns all recorded debug entries.
     *
     * @returns Array of all debug entries in chronological order
     *
     * Requirements: 6.5
     *
     * @example
     * ```typescript
     * const entries = debugRecorder.getEntries();
     * for (const entry of entries) {
     *   console.log(`[${entry.type}] ${entry.stageName}: ${JSON.stringify(entry.data)}`);
     * }
     * ```
     */
    getEntries() {
        // Return a copy to prevent external modification
        return [...this.entries];
    }
    /**
     * Returns all recorded error entries.
     *
     * @returns Array of error entries only
     *
     * Requirements: 6.1, 6.5
     *
     * @example
     * ```typescript
     * const errors = debugRecorder.getErrors();
     * if (errors.length > 0) {
     *   console.error(`${errors.length} errors occurred during execution`);
     *   for (const error of errors) {
     *     console.error(`  - ${error.stageName}: ${(error.data as any).error.message}`);
     *   }
     * }
     * ```
     */
    getErrors() {
        return this.entries.filter((entry) => entry.type === 'error');
    }
    /**
     * Returns all entries for a specific stage.
     *
     * @param stageName - The name of the stage to filter by
     * @returns Array of entries for the specified stage
     *
     * Requirements: 6.6
     *
     * @example
     * ```typescript
     * const stageEntries = debugRecorder.getEntriesForStage('processData');
     * console.log(`Stage 'processData' had ${stageEntries.length} recorded operations`);
     *
     * // Count operations by type
     * const reads = stageEntries.filter(e => e.type === 'read').length;
     * const writes = stageEntries.filter(e => e.type === 'write').length;
     * console.log(`  Reads: ${reads}, Writes: ${writes}`);
     * ```
     */
    getEntriesForStage(stageName) {
        return this.entries.filter((entry) => entry.stageName === stageName);
    }
    /**
     * Sets the verbosity level for recording.
     *
     * - 'minimal': Only errors are recorded
     * - 'verbose': Errors, mutations, and reads are recorded
     *
     * Note: Changing verbosity only affects future recordings.
     * Existing entries are not modified.
     *
     * @param level - The new verbosity level
     *
     * Requirements: 6.4
     *
     * @example
     * ```typescript
     * // Start with verbose logging
     * debugRecorder.setVerbosity('verbose');
     *
     * // ... execute some stages ...
     *
     * // Switch to minimal for production-like behavior
     * debugRecorder.setVerbosity('minimal');
     * ```
     */
    setVerbosity(level) {
        this.verbosity = level;
    }
    /**
     * Clears all recorded entries.
     *
     * Use this to reset the recorder for a new execution run.
     *
     * @example
     * ```typescript
     * // After analyzing entries
     * const entries = debugRecorder.getEntries();
     * console.log(`Analyzed ${entries.length} entries`);
     *
     * // Clear for next run
     * debugRecorder.clear();
     *
     * // Verify cleared
     * console.log(debugRecorder.getEntries().length); // 0
     * ```
     */
    clear() {
        this.entries = [];
    }
    /**
     * Returns the current verbosity level.
     *
     * @returns The current verbosity level
     */
    getVerbosity() {
        return this.verbosity;
    }
}
exports.DebugRecorder = DebugRecorder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdSZWNvcmRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zY29wZS9yZWNvcmRlcnMvRGVidWdSZWNvcmRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHOzs7QUFvREgsK0VBQStFO0FBQy9FLCtCQUErQjtBQUMvQiwrRUFBK0U7QUFFL0U7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQ0c7QUFDSCxNQUFhLGFBQWE7SUFnQnhCOzs7O09BSUc7SUFDSCxZQUFZLE9BQThCOztRQWYxQzs7V0FFRztRQUNLLFlBQU8sR0FBaUIsRUFBRSxDQUFDO1FBYWpDLElBQUksQ0FBQyxFQUFFLEdBQUcsTUFBQSxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsRUFBRSxtQ0FBSSxrQkFBa0IsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDeEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxTQUFTLG1DQUFJLFNBQVMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsNkVBQTZFO0lBQzdFLGlCQUFpQjtJQUNqQiw2RUFBNkU7SUFFN0U7Ozs7Ozs7O09BUUc7SUFDSCxNQUFNLENBQUMsS0FBZ0I7UUFDckIsb0NBQW9DO1FBQ3BDLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNqQyxPQUFPO1FBQ1QsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO1lBQ2hCLElBQUksRUFBRSxNQUFNO1lBQ1osU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO1lBQzFCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztZQUMxQixJQUFJLEVBQUU7Z0JBQ0osSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO2dCQUNoQixHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7Z0JB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QUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FrQkc7SUFDSCxrQkFBa0IsQ0FBQyxTQUFpQjtRQUNsQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsU0FBUyxLQUFLLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0F1Qkc7SUFDSCxZQUFZLENBQUMsS0FBcUI7UUFDaEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7SUFDekIsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7OztPQWlCRztJQUNILEtBQUs7UUFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQztDQUNGO0FBOVJELHNDQThSQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRGVidWdSZWNvcmRlciAtIERldmVsb3BtZW50LWZvY3VzZWQgcmVjb3JkZXIgZm9yIGRldGFpbGVkIGRlYnVnZ2luZyBpbmZvcm1hdGlvblxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogVGhlIERlYnVnUmVjb3JkZXIgY2FwdHVyZXMgZGV0YWlsZWQgZGVidWcgaW5mb3JtYXRpb24gZHVyaW5nIGV4ZWN1dGlvbiBmb3JcbiAqIHRyb3VibGVzaG9vdGluZyBpc3N1ZXMgZHVyaW5nIGRldmVsb3BtZW50IGFuZCBvcGVyYXRpb25hbCBleGNlbGxlbmNlIChPRSkuXG4gKlxuICogS2V5IGZlYXR1cmVzOlxuICogICAtIFRyYWNrIGFsbCBlcnJvcnMgdGhhdCBvY2N1ciBkdXJpbmcgc2NvcGUgb3BlcmF0aW9uc1xuICogICAtIFRyYWNrIGFsbCBtdXRhdGlvbnMgKHdyaXRlcyBhbmQgdXBkYXRlcykgd2l0aCB0aGVpciB2YWx1ZXNcbiAqICAgLSBUcmFjayByZWFkcyBpbiB2ZXJib3NlIG1vZGVcbiAqICAgLSBDb25maWd1cmFibGUgdmVyYm9zaXR5IGxldmVscyAobWluaW1hbCwgdmVyYm9zZSlcbiAqICAgLSBGaWx0ZXIgZW50cmllcyBieSBzdGFnZSBuYW1lXG4gKiAgIC0gQ2xlYXIgcmVjb3JkZWQgZW50cmllc1xuICpcbiAqIEBtb2R1bGUgc2NvcGUvcmVjb3JkZXJzL0RlYnVnUmVjb3JkZXJcbiAqXG4gKiBSZXF1aXJlbWVudHM6IDYuMSwgNi4yLCA2LjMsIDYuNCwgNi41LCA2LjYsIDYuN1xuICovXG5cbmltcG9ydCB0eXBlIHsgRXJyb3JFdmVudCwgUmVhZEV2ZW50LCBSZWNvcmRlciwgU3RhZ2VFdmVudCwgV3JpdGVFdmVudCB9IGZyb20gJy4uL3R5cGVzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHlwZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBWZXJib3NpdHkgbGV2ZWxzIGZvciBEZWJ1Z1JlY29yZGVyLlxuICpcbiAqIC0gJ21pbmltYWwnOiBPbmx5IGVycm9ycyBhcmUgcmVjb3JkZWRcbiAqIC0gJ3ZlcmJvc2UnOiBFcnJvcnMsIG11dGF0aW9ucywgYW5kIHJlYWRzIGFyZSByZWNvcmRlZFxuICpcbiAqIE5vdGU6IFRoZSBkZXNpZ24gbWVudGlvbnMgJ25vcm1hbCcgYnV0IHRoZSByZXF1aXJlbWVudHMgKDYuNCwgNi43KSBzcGVjaWZ5XG4gKiBtaW5pbWFsIGFuZCB2ZXJib3NlLiBXZSBpbXBsZW1lbnQgbWluaW1hbCAoZXJyb3JzIG9ubHkpIGFuZCB2ZXJib3NlIChhbGwpLlxuICogSW4gdmVyYm9zZSBtb2RlLCBtdXRhdGlvbnMgYXJlIGFsd2F5cyByZWNvcmRlZC5cbiAqL1xuZXhwb3J0IHR5cGUgRGVidWdWZXJib3NpdHkgPSAnbWluaW1hbCcgfCAndmVyYm9zZSc7XG5cbi8qKlxuICogRGVidWcgZW50cnkgZm9yIGEgc2luZ2xlIG9wZXJhdGlvbi5cbiAqXG4gKiBAcHJvcGVydHkgdHlwZSAtIFRoZSB0eXBlIG9mIG9wZXJhdGlvbiByZWNvcmRlZFxuICogQHByb3BlcnR5IHN0YWdlTmFtZSAtIFRoZSBzdGFnZSB3aGVyZSB0aGUgb3BlcmF0aW9uIG9jY3VycmVkXG4gKiBAcHJvcGVydHkgdGltZXN0YW1wIC0gVW5peCB0aW1lc3RhbXAgKG1zKSB3aGVuIHRoZSBvcGVyYXRpb24gb2NjdXJyZWRcbiAqIEBwcm9wZXJ0eSBkYXRhIC0gVGhlIGV2ZW50IGRhdGEgYXNzb2NpYXRlZCB3aXRoIHRoaXMgZW50cnlcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBEZWJ1Z0VudHJ5IHtcbiAgLyoqIFRoZSB0eXBlIG9mIG9wZXJhdGlvbiByZWNvcmRlZCAqL1xuICB0eXBlOiAncmVhZCcgfCAnd3JpdGUnIHwgJ2Vycm9yJyB8ICdzdGFnZVN0YXJ0JyB8ICdzdGFnZUVuZCc7XG4gIC8qKiBUaGUgc3RhZ2Ugd2hlcmUgdGhlIG9wZXJhdGlvbiBvY2N1cnJlZCAqL1xuICBzdGFnZU5hbWU6IHN0cmluZztcbiAgLyoqIFVuaXggdGltZXN0YW1wIChtcykgd2hlbiB0aGUgb3BlcmF0aW9uIG9jY3VycmVkICovXG4gIHRpbWVzdGFtcDogbnVtYmVyO1xuICAvKiogVGhlIGV2ZW50IGRhdGEgYXNzb2NpYXRlZCB3aXRoIHRoaXMgZW50cnkgKi9cbiAgZGF0YTogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBPcHRpb25zIGZvciBjcmVhdGluZyBhIERlYnVnUmVjb3JkZXIgaW5zdGFuY2UuXG4gKlxuICogQHByb3BlcnR5IGlkIC0gT3B0aW9uYWwgdW5pcXVlIGlkZW50aWZpZXJcbiAqIEBwcm9wZXJ0eSB2ZXJib3NpdHkgLSBJbml0aWFsIHZlcmJvc2l0eSBsZXZlbCAoZGVmYXVsdHMgdG8gJ3ZlcmJvc2UnKVxuICovXG5leHBvcnQgaW50ZXJmYWNlIERlYnVnUmVjb3JkZXJPcHRpb25zIHtcbiAgLyoqIE9wdGlvbmFsIHVuaXF1ZSBpZGVudGlmaWVyICovXG4gIGlkPzogc3RyaW5nO1xuICAvKiogSW5pdGlhbCB2ZXJib3NpdHkgbGV2ZWwgKGRlZmF1bHRzIHRvICd2ZXJib3NlJykgKi9cbiAgdmVyYm9zaXR5PzogRGVidWdWZXJib3NpdHk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIERlYnVnUmVjb3JkZXIgSW1wbGVtZW50YXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBEZWJ1Z1JlY29yZGVyIC0gY2FwdHVyZXMgZGV0YWlsZWQgZGVidWcgaW5mb3JtYXRpb24gZm9yIGRldmVsb3BtZW50IGFuZCBPRS5cbiAqXG4gKiBUaGlzIHJlY29yZGVyIGltcGxlbWVudHMgdGhlIFJlY29yZGVyIGludGVyZmFjZSB0byBvYnNlcnZlIHNjb3BlIG9wZXJhdGlvbnNcbiAqIGFuZCBjb2xsZWN0IGRlYnVnIGluZm9ybWF0aW9uLiBJdCB0cmFja3M6XG4gKiAgIC0gQWxsIGVycm9ycyB0aGF0IG9jY3VyIGR1cmluZyBzY29wZSBvcGVyYXRpb25zIChhbHdheXMpXG4gKiAgIC0gQWxsIG11dGF0aW9ucyAod3JpdGVzIGFuZCB1cGRhdGVzKSB3aXRoIHRoZWlyIHZhbHVlcyAoaW4gdmVyYm9zZSBtb2RlKVxuICogICAtIEFsbCByZWFkIG9wZXJhdGlvbnMgKG9ubHkgaW4gdmVyYm9zZSBtb2RlKVxuICogICAtIFN0YWdlIGxpZmVjeWNsZSBldmVudHMgKHN0YWdlU3RhcnQvc3RhZ2VFbmQpXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGRlYnVnUmVjb3JkZXIgPSBuZXcgRGVidWdSZWNvcmRlcih7IHZlcmJvc2l0eTogJ3ZlcmJvc2UnIH0pO1xuICogc2NvcGUuYXR0YWNoUmVjb3JkZXIoZGVidWdSZWNvcmRlcik7XG4gKlxuICogLy8gLi4uIGV4ZWN1dGUgcGlwZWxpbmUgc3RhZ2VzIC4uLlxuICpcbiAqIC8vIEdldCBhbGwgcmVjb3JkZWQgZW50cmllc1xuICogY29uc3QgZW50cmllcyA9IGRlYnVnUmVjb3JkZXIuZ2V0RW50cmllcygpO1xuICogY29uc29sZS5sb2coYFRvdGFsIGVudHJpZXM6ICR7ZW50cmllcy5sZW5ndGh9YCk7XG4gKlxuICogLy8gR2V0IG9ubHkgZXJyb3JzXG4gKiBjb25zdCBlcnJvcnMgPSBkZWJ1Z1JlY29yZGVyLmdldEVycm9ycygpO1xuICogaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gKiAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9ycyBvY2N1cnJlZDonLCBlcnJvcnMpO1xuICogfVxuICpcbiAqIC8vIEdldCBlbnRyaWVzIGZvciBhIHNwZWNpZmljIHN0YWdlXG4gKiBjb25zdCBzdGFnZUVudHJpZXMgPSBkZWJ1Z1JlY29yZGVyLmdldEVudHJpZXNGb3JTdGFnZSgncHJvY2Vzc0RhdGEnKTtcbiAqIGNvbnNvbGUubG9nKGBTdGFnZSBlbnRyaWVzOiAke3N0YWdlRW50cmllcy5sZW5ndGh9YCk7XG4gKlxuICogLy8gQ2hhbmdlIHZlcmJvc2l0eVxuICogZGVidWdSZWNvcmRlci5zZXRWZXJib3NpdHkoJ21pbmltYWwnKTtcbiAqXG4gKiAvLyBDbGVhciBhbGwgZW50cmllc1xuICogZGVidWdSZWNvcmRlci5jbGVhcigpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBEZWJ1Z1JlY29yZGVyIGltcGxlbWVudHMgUmVjb3JkZXIge1xuICAvKipcbiAgICogVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoaXMgcmVjb3JkZXIgaW5zdGFuY2UuXG4gICAqL1xuICByZWFkb25seSBpZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBbGwgcmVjb3JkZWQgZGVidWcgZW50cmllcy5cbiAgICovXG4gIHByaXZhdGUgZW50cmllczogRGVidWdFbnRyeVtdID0gW107XG5cbiAgLyoqXG4gICAqIEN1cnJlbnQgdmVyYm9zaXR5IGxldmVsLlxuICAgKi9cbiAgcHJpdmF0ZSB2ZXJib3NpdHk6IERlYnVnVmVyYm9zaXR5O1xuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IERlYnVnUmVjb3JkZXIgaW5zdGFuY2UuXG4gICAqXG4gICAqIEBwYXJhbSBvcHRpb25zIC0gT3B0aW9uYWwgY29uZmlndXJhdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zPzogRGVidWdSZWNvcmRlck9wdGlvbnMpIHtcbiAgICB0aGlzLmlkID0gb3B0aW9ucz8uaWQgPz8gYGRlYnVnLXJlY29yZGVyLSR7RGF0ZS5ub3coKX1gO1xuICAgIHRoaXMudmVyYm9zaXR5ID0gb3B0aW9ucz8udmVyYm9zaXR5ID8/ICd2ZXJib3NlJztcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFJlY29yZGVyIEhvb2tzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgdmFsdWUgaXMgcmVhZCBmcm9tIHNjb3BlLlxuICAgKlxuICAgKiBPbmx5IHJlY29yZHMgaW4gdmVyYm9zZSBtb2RlLlxuICAgKlxuICAgKiBAcGFyYW0gZXZlbnQgLSBEZXRhaWxzIGFib3V0IHRoZSByZWFkIG9wZXJhdGlvblxuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDYuN1xuICAgKi9cbiAgb25SZWFkKGV2ZW50OiBSZWFkRXZlbnQpOiB2b2lkIHtcbiAgICAvLyBPbmx5IHJlY29yZCByZWFkcyBpbiB2ZXJib3NlIG1vZGVcbiAgICBpZiAodGhpcy52ZXJib3NpdHkgIT09ICd2ZXJib3NlJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZW50cmllcy5wdXNoKHtcbiAgICAgIHR5cGU6ICdyZWFkJyxcbiAgICAgIHN0YWdlTmFtZTogZXZlbnQuc3RhZ2VOYW1lLFxuICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHBhdGg6IGV2ZW50LnBhdGgsXG4gICAgICAgIGtleTogZXZlbnQua2V5LFxuICAgICAgICB2YWx1ZTogZXZlbnQudmFsdWUsXG4gICAgICAgIHBpcGVsaW5lSWQ6IGV2ZW50LnBpcGVsaW5lSWQsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgdmFsdWUgaXMgd3JpdHRlbiB0byBzY29wZS5cbiAgICpcbiAgICogUmVjb3JkcyBpbiB2ZXJib3NlIG1vZGUgKG11dGF0aW9ucyBhcmUgdHJhY2tlZCkuXG4gICAqXG4gICAqIEBwYXJhbSBldmVudCAtIERldGFpbHMgYWJvdXQgdGhlIHdyaXRlIG9wZXJhdGlvblxuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDYuMiwgNi4zXG4gICAqL1xuICBvbldyaXRlKGV2ZW50OiBXcml0ZUV2ZW50KTogdm9pZCB7XG4gICAgLy8gT25seSByZWNvcmQgd3JpdGVzIGluIHZlcmJvc2UgbW9kZVxuICAgIGlmICh0aGlzLnZlcmJvc2l0eSAhPT0gJ3ZlcmJvc2UnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5lbnRyaWVzLnB1c2goe1xuICAgICAgdHlwZTogJ3dyaXRlJyxcbiAgICAgIHN0YWdlTmFtZTogZXZlbnQuc3RhZ2VOYW1lLFxuICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHBhdGg6IGV2ZW50LnBhdGgsXG4gICAgICAgIGtleTogZXZlbnQua2V5LFxuICAgICAgICB2YWx1ZTogZXZlbnQudmFsdWUsXG4gICAgICAgIG9wZXJhdGlvbjogZXZlbnQub3BlcmF0aW9uLFxuICAgICAgICBwaXBlbGluZUlkOiBldmVudC5waXBlbGluZUlkLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxsZWQgd2hlbiBhbiBlcnJvciBvY2N1cnMgZHVyaW5nIHNjb3BlIG9wZXJhdGlvbnMuXG4gICAqXG4gICAqIEFsd2F5cyByZWNvcmRzIGVycm9ycyByZWdhcmRsZXNzIG9mIHZlcmJvc2l0eSBsZXZlbC5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gRGV0YWlscyBhYm91dCB0aGUgZXJyb3JcbiAgICpcbiAgICogUmVxdWlyZW1lbnRzOiA2LjFcbiAgICovXG4gIG9uRXJyb3IoZXZlbnQ6IEVycm9yRXZlbnQpOiB2b2lkIHtcbiAgICAvLyBBbHdheXMgcmVjb3JkIGVycm9ycyByZWdhcmRsZXNzIG9mIHZlcmJvc2l0eVxuICAgIHRoaXMuZW50cmllcy5wdXNoKHtcbiAgICAgIHR5cGU6ICdlcnJvcicsXG4gICAgICBzdGFnZU5hbWU6IGV2ZW50LnN0YWdlTmFtZSxcbiAgICAgIHRpbWVzdGFtcDogZXZlbnQudGltZXN0YW1wLFxuICAgICAgZGF0YToge1xuICAgICAgICBlcnJvcjogZXZlbnQuZXJyb3IsXG4gICAgICAgIG9wZXJhdGlvbjogZXZlbnQub3BlcmF0aW9uLFxuICAgICAgICBwYXRoOiBldmVudC5wYXRoLFxuICAgICAgICBrZXk6IGV2ZW50LmtleSxcbiAgICAgICAgcGlwZWxpbmVJZDogZXZlbnQucGlwZWxpbmVJZCxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIHdoZW4gYSBzdGFnZSBiZWdpbnMgZXhlY3V0aW9uLlxuICAgKlxuICAgKiBSZWNvcmRzIHN0YWdlIHN0YXJ0IGV2ZW50cyBpbiB2ZXJib3NlIG1vZGUuXG4gICAqXG4gICAqIEBwYXJhbSBldmVudCAtIFN0YWdlIGNvbnRleHRcbiAgICovXG4gIG9uU3RhZ2VTdGFydChldmVudDogU3RhZ2VFdmVudCk6IHZvaWQge1xuICAgIC8vIE9ubHkgcmVjb3JkIHN0YWdlIGV2ZW50cyBpbiB2ZXJib3NlIG1vZGVcbiAgICBpZiAodGhpcy52ZXJib3NpdHkgIT09ICd2ZXJib3NlJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZW50cmllcy5wdXNoKHtcbiAgICAgIHR5cGU6ICdzdGFnZVN0YXJ0JyxcbiAgICAgIHN0YWdlTmFtZTogZXZlbnQuc3RhZ2VOYW1lLFxuICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHBpcGVsaW5lSWQ6IGV2ZW50LnBpcGVsaW5lSWQsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgc3RhZ2UgY29tcGxldGVzIGV4ZWN1dGlvbi5cbiAgICpcbiAgICogUmVjb3JkcyBzdGFnZSBlbmQgZXZlbnRzIGluIHZlcmJvc2UgbW9kZS5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gU3RhZ2UgY29udGV4dCB3aXRoIG9wdGlvbmFsIGR1cmF0aW9uXG4gICAqL1xuICBvblN0YWdlRW5kKGV2ZW50OiBTdGFnZUV2ZW50KTogdm9pZCB7XG4gICAgLy8gT25seSByZWNvcmQgc3RhZ2UgZXZlbnRzIGluIHZlcmJvc2UgbW9kZVxuICAgIGlmICh0aGlzLnZlcmJvc2l0eSAhPT0gJ3ZlcmJvc2UnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5lbnRyaWVzLnB1c2goe1xuICAgICAgdHlwZTogJ3N0YWdlRW5kJyxcbiAgICAgIHN0YWdlTmFtZTogZXZlbnQuc3RhZ2VOYW1lLFxuICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHBpcGVsaW5lSWQ6IGV2ZW50LnBpcGVsaW5lSWQsXG4gICAgICAgIGR1cmF0aW9uOiBldmVudC5kdXJhdGlvbixcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBEZWJ1ZyBBY2Nlc3MgTWV0aG9kc1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGFsbCByZWNvcmRlZCBkZWJ1ZyBlbnRyaWVzLlxuICAgKlxuICAgKiBAcmV0dXJucyBBcnJheSBvZiBhbGwgZGVidWcgZW50cmllcyBpbiBjaHJvbm9sb2dpY2FsIG9yZGVyXG4gICAqXG4gICAqIFJlcXVpcmVtZW50czogNi41XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgZW50cmllcyA9IGRlYnVnUmVjb3JkZXIuZ2V0RW50cmllcygpO1xuICAgKiBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICogICBjb25zb2xlLmxvZyhgWyR7ZW50cnkudHlwZX1dICR7ZW50cnkuc3RhZ2VOYW1lfTogJHtKU09OLnN0cmluZ2lmeShlbnRyeS5kYXRhKX1gKTtcbiAgICogfVxuICAgKiBgYGBcbiAgICovXG4gIGdldEVudHJpZXMoKTogRGVidWdFbnRyeVtdIHtcbiAgICAvLyBSZXR1cm4gYSBjb3B5IHRvIHByZXZlbnQgZXh0ZXJuYWwgbW9kaWZpY2F0aW9uXG4gICAgcmV0dXJuIFsuLi50aGlzLmVudHJpZXNdO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYWxsIHJlY29yZGVkIGVycm9yIGVudHJpZXMuXG4gICAqXG4gICAqIEByZXR1cm5zIEFycmF5IG9mIGVycm9yIGVudHJpZXMgb25seVxuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDYuMSwgNi41XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgZXJyb3JzID0gZGVidWdSZWNvcmRlci5nZXRFcnJvcnMoKTtcbiAgICogaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAqICAgY29uc29sZS5lcnJvcihgJHtlcnJvcnMubGVuZ3RofSBlcnJvcnMgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbmApO1xuICAgKiAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XG4gICAqICAgICBjb25zb2xlLmVycm9yKGAgIC0gJHtlcnJvci5zdGFnZU5hbWV9OiAkeyhlcnJvci5kYXRhIGFzIGFueSkuZXJyb3IubWVzc2FnZX1gKTtcbiAgICogICB9XG4gICAqIH1cbiAgICogYGBgXG4gICAqL1xuICBnZXRFcnJvcnMoKTogRGVidWdFbnRyeVtdIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyaWVzLmZpbHRlcigoZW50cnkpID0+IGVudHJ5LnR5cGUgPT09ICdlcnJvcicpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYWxsIGVudHJpZXMgZm9yIGEgc3BlY2lmaWMgc3RhZ2UuXG4gICAqXG4gICAqIEBwYXJhbSBzdGFnZU5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc3RhZ2UgdG8gZmlsdGVyIGJ5XG4gICAqIEByZXR1cm5zIEFycmF5IG9mIGVudHJpZXMgZm9yIHRoZSBzcGVjaWZpZWQgc3RhZ2VcbiAgICpcbiAgICogUmVxdWlyZW1lbnRzOiA2LjZcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBzdGFnZUVudHJpZXMgPSBkZWJ1Z1JlY29yZGVyLmdldEVudHJpZXNGb3JTdGFnZSgncHJvY2Vzc0RhdGEnKTtcbiAgICogY29uc29sZS5sb2coYFN0YWdlICdwcm9jZXNzRGF0YScgaGFkICR7c3RhZ2VFbnRyaWVzLmxlbmd0aH0gcmVjb3JkZWQgb3BlcmF0aW9uc2ApO1xuICAgKlxuICAgKiAvLyBDb3VudCBvcGVyYXRpb25zIGJ5IHR5cGVcbiAgICogY29uc3QgcmVhZHMgPSBzdGFnZUVudHJpZXMuZmlsdGVyKGUgPT4gZS50eXBlID09PSAncmVhZCcpLmxlbmd0aDtcbiAgICogY29uc3Qgd3JpdGVzID0gc3RhZ2VFbnRyaWVzLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ3dyaXRlJykubGVuZ3RoO1xuICAgKiBjb25zb2xlLmxvZyhgICBSZWFkczogJHtyZWFkc30sIFdyaXRlczogJHt3cml0ZXN9YCk7XG4gICAqIGBgYFxuICAgKi9cbiAgZ2V0RW50cmllc0ZvclN0YWdlKHN0YWdlTmFtZTogc3RyaW5nKTogRGVidWdFbnRyeVtdIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyaWVzLmZpbHRlcigoZW50cnkpID0+IGVudHJ5LnN0YWdlTmFtZSA9PT0gc3RhZ2VOYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIHRoZSB2ZXJib3NpdHkgbGV2ZWwgZm9yIHJlY29yZGluZy5cbiAgICpcbiAgICogLSAnbWluaW1hbCc6IE9ubHkgZXJyb3JzIGFyZSByZWNvcmRlZFxuICAgKiAtICd2ZXJib3NlJzogRXJyb3JzLCBtdXRhdGlvbnMsIGFuZCByZWFkcyBhcmUgcmVjb3JkZWRcbiAgICpcbiAgICogTm90ZTogQ2hhbmdpbmcgdmVyYm9zaXR5IG9ubHkgYWZmZWN0cyBmdXR1cmUgcmVjb3JkaW5ncy5cbiAgICogRXhpc3RpbmcgZW50cmllcyBhcmUgbm90IG1vZGlmaWVkLlxuICAgKlxuICAgKiBAcGFyYW0gbGV2ZWwgLSBUaGUgbmV3IHZlcmJvc2l0eSBsZXZlbFxuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDYuNFxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIC8vIFN0YXJ0IHdpdGggdmVyYm9zZSBsb2dnaW5nXG4gICAqIGRlYnVnUmVjb3JkZXIuc2V0VmVyYm9zaXR5KCd2ZXJib3NlJyk7XG4gICAqXG4gICAqIC8vIC4uLiBleGVjdXRlIHNvbWUgc3RhZ2VzIC4uLlxuICAgKlxuICAgKiAvLyBTd2l0Y2ggdG8gbWluaW1hbCBmb3IgcHJvZHVjdGlvbi1saWtlIGJlaGF2aW9yXG4gICAqIGRlYnVnUmVjb3JkZXIuc2V0VmVyYm9zaXR5KCdtaW5pbWFsJyk7XG4gICAqIGBgYFxuICAgKi9cbiAgc2V0VmVyYm9zaXR5KGxldmVsOiBEZWJ1Z1ZlcmJvc2l0eSk6IHZvaWQge1xuICAgIHRoaXMudmVyYm9zaXR5ID0gbGV2ZWw7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXJzIGFsbCByZWNvcmRlZCBlbnRyaWVzLlxuICAgKlxuICAgKiBVc2UgdGhpcyB0byByZXNldCB0aGUgcmVjb3JkZXIgZm9yIGEgbmV3IGV4ZWN1dGlvbiBydW4uXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogLy8gQWZ0ZXIgYW5hbHl6aW5nIGVudHJpZXNcbiAgICogY29uc3QgZW50cmllcyA9IGRlYnVnUmVjb3JkZXIuZ2V0RW50cmllcygpO1xuICAgKiBjb25zb2xlLmxvZyhgQW5hbHl6ZWQgJHtlbnRyaWVzLmxlbmd0aH0gZW50cmllc2ApO1xuICAgKlxuICAgKiAvLyBDbGVhciBmb3IgbmV4dCBydW5cbiAgICogZGVidWdSZWNvcmRlci5jbGVhcigpO1xuICAgKlxuICAgKiAvLyBWZXJpZnkgY2xlYXJlZFxuICAgKiBjb25zb2xlLmxvZyhkZWJ1Z1JlY29yZGVyLmdldEVudHJpZXMoKS5sZW5ndGgpOyAvLyAwXG4gICAqIGBgYFxuICAgKi9cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgdGhpcy5lbnRyaWVzID0gW107XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgY3VycmVudCB2ZXJib3NpdHkgbGV2ZWwuXG4gICAqXG4gICAqIEByZXR1cm5zIFRoZSBjdXJyZW50IHZlcmJvc2l0eSBsZXZlbFxuICAgKi9cbiAgZ2V0VmVyYm9zaXR5KCk6IERlYnVnVmVyYm9zaXR5IHtcbiAgICByZXR1cm4gdGhpcy52ZXJib3NpdHk7XG4gIH1cbn1cbiJdfQ==