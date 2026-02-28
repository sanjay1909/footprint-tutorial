"use strict";
/**
 * MetricRecorder - Production-focused recorder for timing and execution counts
 * ----------------------------------------------------------------------------
 * The MetricRecorder captures timing data and execution counts for production
 * monitoring. It tracks read/write/commit operations per stage and measures
 * stage execution duration.
 *
 * Key features:
 *   - Track read/write/commit counts per stage
 *   - Track stage duration via onStageStart/onStageEnd
 *   - Aggregate metrics across all stages
 *   - Reset metrics to initial state
 *
 * @module scope/recorders/MetricRecorder
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricRecorder = void 0;
// ============================================================================
// MetricRecorder Implementation
// ============================================================================
/**
 * MetricRecorder - captures timing and execution counts for production monitoring.
 *
 * This recorder implements the Recorder interface to observe scope operations
 * and collect metrics. It tracks:
 *   - Read/write/commit counts per stage
 *   - Stage execution duration
 *   - Stage invocation counts
 *
 * @example
 * ```typescript
 * const metricRecorder = new MetricRecorder('my-metrics');
 * scope.attachRecorder(metricRecorder);
 *
 * // ... execute pipeline stages ...
 *
 * const metrics = metricRecorder.getMetrics();
 * console.log(`Total reads: ${metrics.totalReads}`);
 * console.log(`Total duration: ${metrics.totalDuration}ms`);
 *
 * // Get metrics for a specific stage
 * const stageMetrics = metricRecorder.getStageMetrics('processData');
 * if (stageMetrics) {
 *   console.log(`Stage reads: ${stageMetrics.readCount}`);
 * }
 *
 * // Reset metrics for a new run
 * metricRecorder.reset();
 * ```
 */
class MetricRecorder {
    /**
     * Creates a new MetricRecorder instance.
     *
     * @param id - Optional unique identifier. Defaults to 'metric-recorder-{timestamp}'
     */
    constructor(id) {
        /**
         * Metrics collected per stage.
         */
        this.metrics = new Map();
        /**
         * Start times for stages currently in progress.
         * Used to calculate duration when onStageEnd is called.
         */
        this.stageStartTimes = new Map();
        this.id = id !== null && id !== void 0 ? id : `metric-recorder-${Date.now()}`;
    }
    // ==========================================================================
    // Recorder Hooks
    // ==========================================================================
    /**
     * Called when a value is read from scope.
     *
     * Increments the read count for the current stage.
     *
     * @param event - Details about the read operation
     *
     * Requirements: 5.2
     */
    onRead(event) {
        const stageMetrics = this.getOrCreateStageMetrics(event.stageName);
        stageMetrics.readCount++;
    }
    /**
     * Called when a value is written to scope.
     *
     * Increments the write count for the current stage.
     *
     * @param event - Details about the write operation
     *
     * Requirements: 5.3
     */
    onWrite(event) {
        const stageMetrics = this.getOrCreateStageMetrics(event.stageName);
        stageMetrics.writeCount++;
    }
    /**
     * Called when staged writes are committed.
     *
     * Increments the commit count for the current stage.
     *
     * @param event - Details about the commit operation
     *
     * Requirements: 5.4
     */
    onCommit(event) {
        const stageMetrics = this.getOrCreateStageMetrics(event.stageName);
        stageMetrics.commitCount++;
    }
    /**
     * Called when a stage begins execution.
     *
     * Records the start time for duration calculation.
     *
     * @param event - Stage context
     *
     * Requirements: 5.1
     */
    onStageStart(event) {
        // Record start time for this stage
        this.stageStartTimes.set(event.stageName, event.timestamp);
        // Increment invocation count
        const stageMetrics = this.getOrCreateStageMetrics(event.stageName);
        stageMetrics.invocationCount++;
    }
    /**
     * Called when a stage completes execution.
     *
     * Calculates and stores the total execution time for the stage.
     * Uses the duration from the event if available, otherwise calculates
     * from the recorded start time.
     *
     * @param event - Stage context with optional duration
     *
     * Requirements: 5.1, 5.7
     */
    onStageEnd(event) {
        const stageMetrics = this.getOrCreateStageMetrics(event.stageName);
        // Calculate duration
        let duration;
        if (event.duration !== undefined) {
            // Use duration from event if provided
            duration = event.duration;
        }
        else {
            // Calculate from recorded start time
            const startTime = this.stageStartTimes.get(event.stageName);
            if (startTime !== undefined) {
                duration = event.timestamp - startTime;
            }
            else {
                // No start time recorded, use 0
                duration = 0;
            }
        }
        // Add to total duration for this stage
        stageMetrics.totalDuration += duration;
        // Clean up start time
        this.stageStartTimes.delete(event.stageName);
    }
    // ==========================================================================
    // Metrics Access
    // ==========================================================================
    /**
     * Returns aggregated metrics across all stages.
     *
     * Calculates totals by summing metrics from all tracked stages.
     *
     * @returns Aggregated metrics including totals and per-stage breakdown
     *
     * Requirements: 5.5
     *
     * @example
     * ```typescript
     * const metrics = metricRecorder.getMetrics();
     * console.log(`Total reads: ${metrics.totalReads}`);
     * console.log(`Total writes: ${metrics.totalWrites}`);
     * console.log(`Total commits: ${metrics.totalCommits}`);
     * console.log(`Total duration: ${metrics.totalDuration}ms`);
     *
     * // Iterate over stage metrics
     * for (const [stageName, stageMetrics] of metrics.stageMetrics) {
     *   console.log(`${stageName}: ${stageMetrics.readCount} reads`);
     * }
     * ```
     */
    getMetrics() {
        let totalDuration = 0;
        let totalReads = 0;
        let totalWrites = 0;
        let totalCommits = 0;
        // Sum up metrics from all stages
        for (const stageMetrics of this.metrics.values()) {
            totalDuration += stageMetrics.totalDuration;
            totalReads += stageMetrics.readCount;
            totalWrites += stageMetrics.writeCount;
            totalCommits += stageMetrics.commitCount;
        }
        return {
            totalDuration,
            totalReads,
            totalWrites,
            totalCommits,
            // Return a copy of the map to prevent external modification
            stageMetrics: new Map(this.metrics),
        };
    }
    /**
     * Returns metrics for a specific stage.
     *
     * @param stageName - The name of the stage to get metrics for
     * @returns The stage metrics, or undefined if the stage has no recorded metrics
     *
     * Requirements: 5.5
     *
     * @example
     * ```typescript
     * const stageMetrics = metricRecorder.getStageMetrics('processData');
     * if (stageMetrics) {
     *   console.log(`Reads: ${stageMetrics.readCount}`);
     *   console.log(`Writes: ${stageMetrics.writeCount}`);
     *   console.log(`Duration: ${stageMetrics.totalDuration}ms`);
     * }
     * ```
     */
    getStageMetrics(stageName) {
        const metrics = this.metrics.get(stageName);
        if (!metrics) {
            return undefined;
        }
        // Return a copy to prevent external modification
        return { ...metrics };
    }
    /**
     * Resets all metrics to initial state.
     *
     * Clears all recorded metrics and stage start times. Use this to
     * start fresh for a new pipeline execution.
     *
     * Requirements: 5.6
     *
     * @example
     * ```typescript
     * // After a pipeline run
     * const metrics = metricRecorder.getMetrics();
     * console.log(`Run completed with ${metrics.totalReads} reads`);
     *
     * // Reset for next run
     * metricRecorder.reset();
     *
     * // Verify reset
     * const newMetrics = metricRecorder.getMetrics();
     * console.log(newMetrics.totalReads); // 0
     * ```
     */
    reset() {
        this.metrics.clear();
        this.stageStartTimes.clear();
    }
    // ==========================================================================
    // Private Helpers
    // ==========================================================================
    /**
     * Gets or creates stage metrics for the given stage name.
     *
     * If metrics don't exist for the stage, creates a new entry with
     * all counts initialized to zero.
     *
     * @param stageName - The name of the stage
     * @returns The stage metrics object (mutable)
     */
    getOrCreateStageMetrics(stageName) {
        let stageMetrics = this.metrics.get(stageName);
        if (!stageMetrics) {
            stageMetrics = {
                stageName,
                readCount: 0,
                writeCount: 0,
                commitCount: 0,
                totalDuration: 0,
                invocationCount: 0,
            };
            this.metrics.set(stageName, stageMetrics);
        }
        return stageMetrics;
    }
}
exports.MetricRecorder = MetricRecorder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWV0cmljUmVjb3JkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NvcGUvcmVjb3JkZXJzL01ldHJpY1JlY29yZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRzs7O0FBdURILCtFQUErRTtBQUMvRSxnQ0FBZ0M7QUFDaEMsK0VBQStFO0FBRS9FOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTZCRztBQUNILE1BQWEsY0FBYztJQWlCekI7Ozs7T0FJRztJQUNILFlBQVksRUFBVztRQWhCdkI7O1dBRUc7UUFDSyxZQUFPLEdBQThCLElBQUksR0FBRyxFQUFFLENBQUM7UUFFdkQ7OztXQUdHO1FBQ0ssb0JBQWUsR0FBd0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQVF2RCxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsYUFBRixFQUFFLGNBQUYsRUFBRSxHQUFJLG1CQUFtQixJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztJQUNsRCxDQUFDO0lBRUQsNkVBQTZFO0lBQzdFLGlCQUFpQjtJQUNqQiw2RUFBNkU7SUFFN0U7Ozs7Ozs7O09BUUc7SUFDSCxNQUFNLENBQUMsS0FBZ0I7UUFDckIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuRSxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUVEOzs7Ozs7OztPQVFHO0lBQ0gsT0FBTyxDQUFDLEtBQWlCO1FBQ3ZCLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkUsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILFFBQVEsQ0FBQyxLQUFrQjtRQUN6QixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMs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Ozs7Ozs7Ozs7OztPQXFCRztJQUNILEtBQUs7UUFDSCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUVELDZFQUE2RTtJQUM3RSxrQkFBa0I7SUFDbEIsNkVBQTZFO0lBRTdFOzs7Ozs7OztPQVFHO0lBQ0ssdUJBQXVCLENBQUMsU0FBaUI7UUFDL0MsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFL0MsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xCLFlBQVksR0FBRztnQkFDYixTQUFTO2dCQUNULFNBQVMsRUFBRSxDQUFDO2dCQUNaLFVBQVUsRUFBRSxDQUFDO2dCQUNiLFdBQVcsRUFBRSxDQUFDO2dCQUNkLGFBQWEsRUFBRSxDQUFDO2dCQUNoQixlQUFlLEVBQUUsQ0FBQzthQUNuQixDQUFDO1lBQ0YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFRCxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDO0NBQ0Y7QUF2UUQsd0NBdVFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNZXRyaWNSZWNvcmRlciAtIFByb2R1Y3Rpb24tZm9jdXNlZCByZWNvcmRlciBmb3IgdGltaW5nIGFuZCBleGVjdXRpb24gY291bnRzXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBUaGUgTWV0cmljUmVjb3JkZXIgY2FwdHVyZXMgdGltaW5nIGRhdGEgYW5kIGV4ZWN1dGlvbiBjb3VudHMgZm9yIHByb2R1Y3Rpb25cbiAqIG1vbml0b3JpbmcuIEl0IHRyYWNrcyByZWFkL3dyaXRlL2NvbW1pdCBvcGVyYXRpb25zIHBlciBzdGFnZSBhbmQgbWVhc3VyZXNcbiAqIHN0YWdlIGV4ZWN1dGlvbiBkdXJhdGlvbi5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAgIC0gVHJhY2sgcmVhZC93cml0ZS9jb21taXQgY291bnRzIHBlciBzdGFnZVxuICogICAtIFRyYWNrIHN0YWdlIGR1cmF0aW9uIHZpYSBvblN0YWdlU3RhcnQvb25TdGFnZUVuZFxuICogICAtIEFnZ3JlZ2F0ZSBtZXRyaWNzIGFjcm9zcyBhbGwgc3RhZ2VzXG4gKiAgIC0gUmVzZXQgbWV0cmljcyB0byBpbml0aWFsIHN0YXRlXG4gKlxuICogQG1vZHVsZSBzY29wZS9yZWNvcmRlcnMvTWV0cmljUmVjb3JkZXJcbiAqXG4gKiBSZXF1aXJlbWVudHM6IDUuMSwgNS4yLCA1LjMsIDUuNCwgNS41LCA1LjYsIDUuN1xuICovXG5cbmltcG9ydCB0eXBlIHsgQ29tbWl0RXZlbnQsIFJlYWRFdmVudCwgUmVjb3JkZXIsIFN0YWdlRXZlbnQsIFdyaXRlRXZlbnQgfSBmcm9tICcuLi90eXBlcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFR5cGVzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogTWV0cmljcyBjb2xsZWN0ZWQgZm9yIGEgc2luZ2xlIHN0YWdlLlxuICpcbiAqIEBwcm9wZXJ0eSBzdGFnZU5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc3RhZ2VcbiAqIEBwcm9wZXJ0eSByZWFkQ291bnQgLSBOdW1iZXIgb2YgcmVhZCBvcGVyYXRpb25zIGluIHRoaXMgc3RhZ2VcbiAqIEBwcm9wZXJ0eSB3cml0ZUNvdW50IC0gTnVtYmVyIG9mIHdyaXRlIG9wZXJhdGlvbnMgaW4gdGhpcyBzdGFnZVxuICogQHByb3BlcnR5IGNvbW1pdENvdW50IC0gTnVtYmVyIG9mIGNvbW1pdCBvcGVyYXRpb25zIGluIHRoaXMgc3RhZ2VcbiAqIEBwcm9wZXJ0eSB0b3RhbER1cmF0aW9uIC0gVG90YWwgZXhlY3V0aW9uIHRpbWUgaW4gbWlsbGlzZWNvbmRzXG4gKiBAcHJvcGVydHkgaW52b2NhdGlvbkNvdW50IC0gTnVtYmVyIG9mIHRpbWVzIHRoZSBzdGFnZSB3YXMgZW50ZXJlZFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFN0YWdlTWV0cmljcyB7XG4gIC8qKiBUaGUgbmFtZSBvZiB0aGUgc3RhZ2UgKi9cbiAgc3RhZ2VOYW1lOiBzdHJpbmc7XG4gIC8qKiBOdW1iZXIgb2YgcmVhZCBvcGVyYXRpb25zIGluIHRoaXMgc3RhZ2UgKi9cbiAgcmVhZENvdW50OiBudW1iZXI7XG4gIC8qKiBOdW1iZXIgb2Ygd3JpdGUgb3BlcmF0aW9ucyBpbiB0aGlzIHN0YWdlICovXG4gIHdyaXRlQ291bnQ6IG51bWJlcjtcbiAgLyoqIE51bWJlciBvZiBjb21taXQgb3BlcmF0aW9ucyBpbiB0aGlzIHN0YWdlICovXG4gIGNvbW1pdENvdW50OiBudW1iZXI7XG4gIC8qKiBUb3RhbCBleGVjdXRpb24gdGltZSBpbiBtaWxsaXNlY29uZHMgKi9cbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICAvKiogTnVtYmVyIG9mIHRpbWVzIHRoZSBzdGFnZSB3YXMgZW50ZXJlZCAqL1xuICBpbnZvY2F0aW9uQ291bnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBZ2dyZWdhdGVkIG1ldHJpY3MgYWNyb3NzIGFsbCBzdGFnZXMuXG4gKlxuICogQHByb3BlcnR5IHRvdGFsRHVyYXRpb24gLSBTdW0gb2YgYWxsIHN0YWdlIGR1cmF0aW9uc1xuICogQHByb3BlcnR5IHRvdGFsUmVhZHMgLSBTdW0gb2YgYWxsIHJlYWQgb3BlcmF0aW9uc1xuICogQHByb3BlcnR5IHRvdGFsV3JpdGVzIC0gU3VtIG9mIGFsbCB3cml0ZSBvcGVyYXRpb25zXG4gKiBAcHJvcGVydHkgdG90YWxDb21taXRzIC0gU3VtIG9mIGFsbCBjb21taXQgb3BlcmF0aW9uc1xuICogQHByb3BlcnR5IHN0YWdlTWV0cmljcyAtIE1hcCBvZiBzdGFnZSBuYW1lIHRvIHN0YWdlLXNwZWNpZmljIG1ldHJpY3NcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBZ2dyZWdhdGVkTWV0cmljcyB7XG4gIC8qKiBTdW0gb2YgYWxsIHN0YWdlIGR1cmF0aW9ucyAqL1xuICB0b3RhbER1cmF0aW9uOiBudW1iZXI7XG4gIC8qKiBTdW0gb2YgYWxsIHJlYWQgb3BlcmF0aW9ucyAqL1xuICB0b3RhbFJlYWRzOiBudW1iZXI7XG4gIC8qKiBTdW0gb2YgYWxsIHdyaXRlIG9wZXJhdGlvbnMgKi9cbiAgdG90YWxXcml0ZXM6IG51bWJlcjtcbiAgLyoqIFN1bSBvZiBhbGwgY29tbWl0IG9wZXJhdGlvbnMgKi9cbiAgdG90YWxDb21taXRzOiBudW1iZXI7XG4gIC8qKiBNYXAgb2Ygc3RhZ2UgbmFtZSB0byBzdGFnZS1zcGVjaWZpYyBtZXRyaWNzICovXG4gIHN0YWdlTWV0cmljczogTWFwPHN0cmluZywgU3RhZ2VNZXRyaWNzPjtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTWV0cmljUmVjb3JkZXIgSW1wbGVtZW50YXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBNZXRyaWNSZWNvcmRlciAtIGNhcHR1cmVzIHRpbWluZyBhbmQgZXhlY3V0aW9uIGNvdW50cyBmb3IgcHJvZHVjdGlvbiBtb25pdG9yaW5nLlxuICpcbiAqIFRoaXMgcmVjb3JkZXIgaW1wbGVtZW50cyB0aGUgUmVjb3JkZXIgaW50ZXJmYWNlIHRvIG9ic2VydmUgc2NvcGUgb3BlcmF0aW9uc1xuICogYW5kIGNvbGxlY3QgbWV0cmljcy4gSXQgdHJhY2tzOlxuICogICAtIFJlYWQvd3JpdGUvY29tbWl0IGNvdW50cyBwZXIgc3RhZ2VcbiAqICAgLSBTdGFnZSBleGVjdXRpb24gZHVyYXRpb25cbiAqICAgLSBTdGFnZSBpbnZvY2F0aW9uIGNvdW50c1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBtZXRyaWNSZWNvcmRlciA9IG5ldyBNZXRyaWNSZWNvcmRlcignbXktbWV0cmljcycpO1xuICogc2NvcGUuYXR0YWNoUmVjb3JkZXIobWV0cmljUmVjb3JkZXIpO1xuICpcbiAqIC8vIC4uLiBleGVjdXRlIHBpcGVsaW5lIHN0YWdlcyAuLi5cbiAqXG4gKiBjb25zdCBtZXRyaWNzID0gbWV0cmljUmVjb3JkZXIuZ2V0TWV0cmljcygpO1xuICogY29uc29sZS5sb2coYFRvdGFsIHJlYWRzOiAke21ldHJpY3MudG90YWxSZWFkc31gKTtcbiAqIGNvbnNvbGUubG9nKGBUb3RhbCBkdXJhdGlvbjogJHttZXRyaWNzLnRvdGFsRHVyYXRpb259bXNgKTtcbiAqXG4gKiAvLyBHZXQgbWV0cmljcyBmb3IgYSBzcGVjaWZpYyBzdGFnZVxuICogY29uc3Qgc3RhZ2VNZXRyaWNzID0gbWV0cmljUmVjb3JkZXIuZ2V0U3RhZ2VNZXRyaWNzKCdwcm9jZXNzRGF0YScpO1xuICogaWYgKHN0YWdlTWV0cmljcykge1xuICogICBjb25zb2xlLmxvZyhgU3RhZ2UgcmVhZHM6ICR7c3RhZ2VNZXRyaWNzLnJlYWRDb3VudH1gKTtcbiAqIH1cbiAqXG4gKiAvLyBSZXNldCBtZXRyaWNzIGZvciBhIG5ldyBydW5cbiAqIG1ldHJpY1JlY29yZGVyLnJlc2V0KCk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIE1ldHJpY1JlY29yZGVyIGltcGxlbWVudHMgUmVjb3JkZXIge1xuICAvKipcbiAgICogVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoaXMgcmVjb3JkZXIgaW5zdGFuY2UuXG4gICAqL1xuICByZWFkb25seSBpZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBNZXRyaWNzIGNvbGxlY3RlZCBwZXIgc3RhZ2UuXG4gICAqL1xuICBwcml2YXRlIG1ldHJpY3M6IE1hcDxzdHJpbmcsIFN0YWdlTWV0cmljcz4gPSBuZXcgTWFwKCk7XG5cbiAgLyoqXG4gICAqIFN0YXJ0IHRpbWVzIGZvciBzdGFnZXMgY3VycmVudGx5IGluIHByb2dyZXNzLlxuICAgKiBVc2VkIHRvIGNhbGN1bGF0ZSBkdXJhdGlvbiB3aGVuIG9uU3RhZ2VFbmQgaXMgY2FsbGVkLlxuICAgKi9cbiAgcHJpdmF0ZSBzdGFnZVN0YXJ0VGltZXM6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKCk7XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgTWV0cmljUmVjb3JkZXIgaW5zdGFuY2UuXG4gICAqXG4gICAqIEBwYXJhbSBpZCAtIE9wdGlvbmFsIHVuaXF1ZSBpZGVudGlmaWVyLiBEZWZhdWx0cyB0byAnbWV0cmljLXJlY29yZGVyLXt0aW1lc3RhbXB9J1xuICAgKi9cbiAgY29uc3RydWN0b3IoaWQ/OiBzdHJpbmcpIHtcbiAgICB0aGlzLmlkID0gaWQgPz8gYG1ldHJpYy1yZWNvcmRlci0ke0RhdGUubm93KCl9YDtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFJlY29yZGVyIEhvb2tzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgdmFsdWUgaXMgcmVhZCBmcm9tIHNjb3BlLlxuICAgKlxuICAgKiBJbmNyZW1lbnRzIHRoZSByZWFkIGNvdW50IGZvciB0aGUgY3VycmVudCBzdGFnZS5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gRGV0YWlscyBhYm91dCB0aGUgcmVhZCBvcGVyYXRpb25cbiAgICpcbiAgICogUmVxdWlyZW1lbnRzOiA1LjJcbiAgICovXG4gIG9uUmVhZChldmVudDogUmVhZEV2ZW50KTogdm9pZCB7XG4gICAgY29uc3Qgc3RhZ2VNZXRyaWNzID0gdGhpcy5nZXRPckNyZWF0ZVN0YWdlTWV0cmljcyhldmVudC5zdGFnZU5hbWUpO1xuICAgIHN0YWdlTWV0cmljcy5yZWFkQ291bnQrKztcbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxsZWQgd2hlbiBhIHZhbHVlIGlzIHdyaXR0ZW4gdG8gc2NvcGUuXG4gICAqXG4gICAqIEluY3JlbWVudHMgdGhlIHdyaXRlIGNvdW50IGZvciB0aGUgY3VycmVudCBzdGFnZS5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gRGV0YWlscyBhYm91dCB0aGUgd3JpdGUgb3BlcmF0aW9uXG4gICAqXG4gICAqIFJlcXVpcmVtZW50czogNS4zXG4gICAqL1xuICBvbldyaXRlKGV2ZW50OiBXcml0ZUV2ZW50KTogdm9pZCB7XG4gICAgY29uc3Qgc3RhZ2VNZXRyaWNzID0gdGhpcy5nZXRPckNyZWF0ZVN0YWdlTWV0cmljcyhldmVudC5zdGFnZU5hbWUpO1xuICAgIHN0YWdlTWV0cmljcy53cml0ZUNvdW50Kys7XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIHdoZW4gc3RhZ2VkIHdyaXRlcyBhcmUgY29tbWl0dGVkLlxuICAgKlxuICAgKiBJbmNyZW1lbnRzIHRoZSBjb21taXQgY291bnQgZm9yIHRoZSBjdXJyZW50IHN0YWdlLlxuICAgKlxuICAgKiBAcGFyYW0gZXZlbnQgLSBEZXRhaWxzIGFib3V0IHRoZSBjb21taXQgb3BlcmF0aW9uXG4gICAqXG4gICAqIFJlcXVpcmVtZW50czogNS40XG4gICAqL1xuICBvbkNvbW1pdChldmVudDogQ29tbWl0RXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBzdGFnZU1ldHJpY3MgPSB0aGlzLmdldE9yQ3JlYXRlU3RhZ2VNZXRyaWNzKGV2ZW50LnN0YWdlTmFtZSk7XG4gICAgc3RhZ2VNZXRyaWNzLmNvbW1pdENvdW50Kys7XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIHdoZW4gYSBzdGFnZSBiZWdpbnMgZXhlY3V0aW9uLlxuICAgKlxuICAgKiBSZWNvcmRzIHRoZSBzdGFydCB0aW1lIGZvciBkdXJhdGlvbiBjYWxjdWxhdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gU3RhZ2UgY29udGV4dFxuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDUuMVxuICAgKi9cbiAgb25TdGFnZVN0YXJ0KGV2ZW50OiBTdGFnZUV2ZW50KTogdm9pZCB7XG4gICAgLy8gUmVjb3JkIHN0YXJ0IHRpbWUgZm9yIHRoaXMgc3RhZ2VcbiAgICB0aGlzLnN0YWdlU3RhcnRUaW1lcy5zZXQoZXZlbnQuc3RhZ2VOYW1lLCBldmVudC50aW1lc3RhbXApO1xuXG4gICAgLy8gSW5jcmVtZW50IGludm9jYXRpb24gY291bnRcbiAgICBjb25zdCBzdGFnZU1ldHJpY3MgPSB0aGlzLmdldE9yQ3JlYXRlU3RhZ2VNZXRyaWNzKGV2ZW50LnN0YWdlTmFtZSk7XG4gICAgc3RhZ2VNZXRyaWNzLmludm9jYXRpb25Db3VudCsrO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgc3RhZ2UgY29tcGxldGVzIGV4ZWN1dGlvbi5cbiAgICpcbiAgICogQ2FsY3VsYXRlcyBhbmQgc3RvcmVzIHRoZSB0b3RhbCBleGVjdXRpb24gdGltZSBmb3IgdGhlIHN0YWdlLlxuICAgKiBVc2VzIHRoZSBkdXJhdGlvbiBmcm9tIHRoZSBldmVudCBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBjYWxjdWxhdGVzXG4gICAqIGZyb20gdGhlIHJlY29yZGVkIHN0YXJ0IHRpbWUuXG4gICAqXG4gICAqIEBwYXJhbSBldmVudCAtIFN0YWdlIGNvbnRleHQgd2l0aCBvcHRpb25hbCBkdXJhdGlvblxuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDUuMSwgNS43XG4gICAqL1xuICBvblN0YWdlRW5kKGV2ZW50OiBTdGFnZUV2ZW50KTogdm9pZCB7XG4gICAgY29uc3Qgc3RhZ2VNZXRyaWNzID0gdGhpcy5nZXRPckNyZWF0ZVN0YWdlTWV0cmljcyhldmVudC5zdGFnZU5hbWUpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGR1cmF0aW9uXG4gICAgbGV0IGR1cmF0aW9uOiBudW1iZXI7XG4gICAgaWYgKGV2ZW50LmR1cmF0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIFVzZSBkdXJhdGlvbiBmcm9tIGV2ZW50IGlmIHByb3ZpZGVkXG4gICAgICBkdXJhdGlvbiA9IGV2ZW50LmR1cmF0aW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDYWxjdWxhdGUgZnJvbSByZWNvcmRlZCBzdGFydCB0aW1lXG4gICAgICBjb25zdCBzdGFydFRpbWUgPSB0aGlzLnN0YWdlU3RhcnRUaW1lcy5nZXQoZXZlbnQuc3RhZ2VOYW1lKTtcbiAgICAgIGlmIChzdGFydFRpbWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBkdXJhdGlvbiA9IGV2ZW50LnRpbWVzdGFtcCAtIHN0YXJ0VGltZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIE5vIHN0YXJ0IHRpbWUgcmVjb3JkZWQsIHVzZSAwXG4gICAgICAgIGR1cmF0aW9uID0gMDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBZGQgdG8gdG90YWwgZHVyYXRpb24gZm9yIHRoaXMgc3RhZ2VcbiAgICBzdGFnZU1ldHJpY3MudG90YWxEdXJhdGlvbiArPSBkdXJhdGlvbjtcblxuICAgIC8vIENsZWFuIHVwIHN0YXJ0IHRpbWVcbiAgICB0aGlzLnN0YWdlU3RhcnRUaW1lcy5kZWxldGUoZXZlbnQuc3RhZ2VOYW1lKTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1ldHJpY3MgQWNjZXNzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYWdncmVnYXRlZCBtZXRyaWNzIGFjcm9zcyBhbGwgc3RhZ2VzLlxuICAgKlxuICAgKiBDYWxjdWxhdGVzIHRvdGFscyBieSBzdW1taW5nIG1ldHJpY3MgZnJvbSBhbGwgdHJhY2tlZCBzdGFnZXMuXG4gICAqXG4gICAqIEByZXR1cm5zIEFnZ3JlZ2F0ZWQgbWV0cmljcyBpbmNsdWRpbmcgdG90YWxzIGFuZCBwZXItc3RhZ2UgYnJlYWtkb3duXG4gICAqXG4gICAqIFJlcXVpcmVtZW50czogNS41XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgbWV0cmljcyA9IG1ldHJpY1JlY29yZGVyLmdldE1ldHJpY3MoKTtcbiAgICogY29uc29sZS5sb2coYFRvdGFsIHJlYWRzOiAke21ldHJpY3MudG90YWxSZWFkc31gKTtcbiAgICogY29uc29sZS5sb2coYFRvdGFsIHdyaXRlczogJHttZXRyaWNzLnRvdGFsV3JpdGVzfWApO1xuICAgKiBjb25zb2xlLmxvZyhgVG90YWwgY29tbWl0czogJHttZXRyaWNzLnRvdGFsQ29tbWl0c31gKTtcbiAgICogY29uc29sZS5sb2coYFRvdGFsIGR1cmF0aW9uOiAke21ldHJpY3MudG90YWxEdXJhdGlvbn1tc2ApO1xuICAgKlxuICAgKiAvLyBJdGVyYXRlIG92ZXIgc3RhZ2UgbWV0cmljc1xuICAgKiBmb3IgKGNvbnN0IFtzdGFnZU5hbWUsIHN0YWdlTWV0cmljc10gb2YgbWV0cmljcy5zdGFnZU1ldHJpY3MpIHtcbiAgICogICBjb25zb2xlLmxvZyhgJHtzdGFnZU5hbWV9OiAke3N0YWdlTWV0cmljcy5yZWFkQ291bnR9IHJlYWRzYCk7XG4gICAqIH1cbiAgICogYGBgXG4gICAqL1xuICBnZXRNZXRyaWNzKCk6IEFnZ3JlZ2F0ZWRNZXRyaWNzIHtcbiAgICBsZXQgdG90YWxEdXJhdGlvbiA9IDA7XG4gICAgbGV0IHRvdGFsUmVhZHMgPSAwO1xuICAgIGxldCB0b3RhbFdyaXRlcyA9IDA7XG4gICAgbGV0IHRvdGFsQ29tbWl0cyA9IDA7XG5cbiAgICAvLyBTdW0gdXAgbWV0cmljcyBmcm9tIGFsbCBzdGFnZXNcbiAgICBmb3IgKGNvbnN0IHN0YWdlTWV0cmljcyBvZiB0aGlzLm1ldHJpY3MudmFsdWVzKCkpIHtcbiAgICAgIHRvdGFsRHVyYXRpb24gKz0gc3RhZ2VNZXRyaWNzLnRvdGFsRHVyYXRpb247XG4gICAgICB0b3RhbFJlYWRzICs9IHN0YWdlTWV0cmljcy5yZWFkQ291bnQ7XG4gICAgICB0b3RhbFdyaXRlcyArPSBzdGFnZU1ldHJpY3Mud3JpdGVDb3VudDtcbiAgICAgIHRvdGFsQ29tbWl0cyArPSBzdGFnZU1ldHJpY3MuY29tbWl0Q291bnQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHRvdGFsRHVyYXRpb24sXG4gICAgICB0b3RhbFJlYWRzLFxuICAgICAgdG90YWxXcml0ZXMsXG4gICAgICB0b3RhbENvbW1pdHMsXG4gICAgICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBtYXAgdG8gcHJldmVudCBleHRlcm5hbCBtb2RpZmljYXRpb25cbiAgICAgIHN0YWdlTWV0cmljczogbmV3IE1hcCh0aGlzLm1ldHJpY3MpLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBtZXRyaWNzIGZvciBhIHNwZWNpZmljIHN0YWdlLlxuICAgKlxuICAgKiBAcGFyYW0gc3RhZ2VOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHN0YWdlIHRvIGdldCBtZXRyaWNzIGZvclxuICAgKiBAcmV0dXJucyBUaGUgc3RhZ2UgbWV0cmljcywgb3IgdW5kZWZpbmVkIGlmIHRoZSBzdGFnZSBoYXMgbm8gcmVjb3JkZWQgbWV0cmljc1xuICAgKlxuICAgKiBSZXF1aXJlbWVudHM6IDUuNVxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIGNvbnN0IHN0YWdlTWV0cmljcyA9IG1ldHJpY1JlY29yZGVyLmdldFN0YWdlTWV0cmljcygncHJvY2Vzc0RhdGEnKTtcbiAgICogaWYgKHN0YWdlTWV0cmljcykge1xuICAgKiAgIGNvbnNvbGUubG9nKGBSZWFkczogJHtzdGFnZU1ldHJpY3MucmVhZENvdW50fWApO1xuICAgKiAgIGNvbnNvbGUubG9nKGBXcml0ZXM6ICR7c3RhZ2VNZXRyaWNzLndyaXRlQ291bnR9YCk7XG4gICAqICAgY29uc29sZS5sb2coYER1cmF0aW9uOiAke3N0YWdlTWV0cmljcy50b3RhbER1cmF0aW9ufW1zYCk7XG4gICAqIH1cbiAgICogYGBgXG4gICAqL1xuICBnZXRTdGFnZU1ldHJpY3Moc3RhZ2VOYW1lOiBzdHJpbmcpOiBTdGFnZU1ldHJpY3MgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IG1ldHJpY3MgPSB0aGlzLm1ldHJpY3MuZ2V0KHN0YWdlTmFtZSk7XG4gICAgaWYgKCFtZXRyaWNzKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIC8vIFJldHVybiBhIGNvcHkgdG8gcHJldmVudCBleHRlcm5hbCBtb2RpZmljYXRpb25cbiAgICByZXR1cm4geyAuLi5tZXRyaWNzIH07XG4gIH1cblxuICAvKipcbiAgICogUmVzZXRzIGFsbCBtZXRyaWNzIHRvIGluaXRpYWwgc3RhdGUuXG4gICAqXG4gICAqIENsZWFycyBhbGwgcmVjb3JkZWQgbWV0cmljcyBhbmQgc3RhZ2Ugc3RhcnQgdGltZXMuIFVzZSB0aGlzIHRvXG4gICAqIHN0YXJ0IGZyZXNoIGZvciBhIG5ldyBwaXBlbGluZSBleGVjdXRpb24uXG4gICAqXG4gICAqIFJlcXVpcmVtZW50czogNS42XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogLy8gQWZ0ZXIgYSBwaXBlbGluZSBydW5cbiAgICogY29uc3QgbWV0cmljcyA9IG1ldHJpY1JlY29yZGVyLmdldE1ldHJpY3MoKTtcbiAgICogY29uc29sZS5sb2coYFJ1biBjb21wbGV0ZWQgd2l0aCAke21ldHJpY3MudG90YWxSZWFkc30gcmVhZHNgKTtcbiAgICpcbiAgICogLy8gUmVzZXQgZm9yIG5leHQgcnVuXG4gICAqIG1ldHJpY1JlY29yZGVyLnJlc2V0KCk7XG4gICAqXG4gICAqIC8vIFZlcmlmeSByZXNldFxuICAgKiBjb25zdCBuZXdNZXRyaWNzID0gbWV0cmljUmVjb3JkZXIuZ2V0TWV0cmljcygpO1xuICAgKiBjb25zb2xlLmxvZyhuZXdNZXRyaWNzLnRvdGFsUmVhZHMpOyAvLyAwXG4gICAqIGBgYFxuICAgKi9cbiAgcmVzZXQoKTogdm9pZCB7XG4gICAgdGhpcy5tZXRyaWNzLmNsZWFyKCk7XG4gICAgdGhpcy5zdGFnZVN0YXJ0VGltZXMuY2xlYXIoKTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFByaXZhdGUgSGVscGVyc1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBHZXRzIG9yIGNyZWF0ZXMgc3RhZ2UgbWV0cmljcyBmb3IgdGhlIGdpdmVuIHN0YWdlIG5hbWUuXG4gICAqXG4gICAqIElmIG1ldHJpY3MgZG9uJ3QgZXhpc3QgZm9yIHRoZSBzdGFnZSwgY3JlYXRlcyBhIG5ldyBlbnRyeSB3aXRoXG4gICAqIGFsbCBjb3VudHMgaW5pdGlhbGl6ZWQgdG8gemVyby5cbiAgICpcbiAgICogQHBhcmFtIHN0YWdlTmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBzdGFnZVxuICAgKiBAcmV0dXJucyBUaGUgc3RhZ2UgbWV0cmljcyBvYmplY3QgKG11dGFibGUpXG4gICAqL1xuICBwcml2YXRlIGdldE9yQ3JlYXRlU3RhZ2VNZXRyaWNzKHN0YWdlTmFtZTogc3RyaW5nKTogU3RhZ2VNZXRyaWNzIHtcbiAgICBsZXQgc3RhZ2VNZXRyaWNzID0gdGhpcy5tZXRyaWNzLmdldChzdGFnZU5hbWUpO1xuXG4gICAgaWYgKCFzdGFnZU1ldHJpY3MpIHtcbiAgICAgIHN0YWdlTWV0cmljcyA9IHtcbiAgICAgICAgc3RhZ2VOYW1lLFxuICAgICAgICByZWFkQ291bnQ6IDAsXG4gICAgICAgIHdyaXRlQ291bnQ6IDAsXG4gICAgICAgIGNvbW1pdENvdW50OiAwLFxuICAgICAgICB0b3RhbER1cmF0aW9uOiAwLFxuICAgICAgICBpbnZvY2F0aW9uQ291bnQ6IDAsXG4gICAgICB9O1xuICAgICAgdGhpcy5tZXRyaWNzLnNldChzdGFnZU5hbWUsIHN0YWdlTWV0cmljcyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0YWdlTWV0cmljcztcbiAgfVxufVxuIl19