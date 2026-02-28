"use strict";
/**
 * PipelineRuntime - The top-level runtime container for pipeline execution
 * ----------------------------------------------------------------------------
 *  The main entry point for creating and managing a pipeline's execution context.
 *
 *  Think of it like a compiler's runtime environment or a VM instance - it holds:
 *    - The global store (shared state)
 *    - The root stage context (entry point for execution)
 *    - The execution history (for time-travel debugging)
 *
 *  This is what you instantiate when you want to run a pipeline.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreePipelineContext = exports.PipelineRuntime = void 0;
const ExecutionHistory_1 = require("../../internal/history/ExecutionHistory");
const GlobalStore_1 = require("./GlobalStore");
const StageContext_1 = require("./StageContext");
/**
 * PipelineRuntime - Top-level container for pipeline execution
 *
 * Creates and manages the global store, root stage context, and execution history.
 * This is the main class you instantiate to run a pipeline.
 */
class PipelineRuntime {
    constructor(rootName, defaultValuesForContext, initialContext) {
        this.executionHistory = new ExecutionHistory_1.ExecutionHistory(initialContext);
        this.globalStore = new GlobalStore_1.GlobalStore(defaultValuesForContext, initialContext);
        this.rootStageContext = new StageContext_1.StageContext('', rootName, this.globalStore, '', this.executionHistory);
    }
    /**
     * getPipelines() - Get all pipeline namespaces from the global store
     */
    getPipelines() {
        return this.globalStore.getPipelines();
    }
    /**
     * setRootObject() - Set a value at the root level
     */
    setRootObject(path, key, value) {
        this.rootStageContext.setObject(path, key, value);
    }
    /**
     * getSnapshot() - Get a complete snapshot of the runtime state
     *
     * Returns the global state, stage tree, and execution history.
     */
    getSnapshot() {
        const globalContext = this.globalStore.getState();
        const stageContexts = this.rootStageContext.getSnapshot();
        return {
            globalContext,
            stageContexts,
            history: this.executionHistory.list(),
        };
    }
    /**
     * getFullNarrative() - Extract the complete execution narrative in order
     *
     * Walks the stage context tree in execution order and combines:
     * - Stage messages (bullet points from addDebugMessage)
     * - Flow messages (headings from addFlowDebugMessage)
     *
     * This creates a complete storytelling view of the execution that can be:
     * - Displayed in the Semantic View as a progressive story
     * - Sent to LLM as context history
     * - Exported for documentation/debugging
     *
     * _Requirements: flow-control-narrative REQ-7_
     */
    getFullNarrative() {
        const narrative = [];
        let timeIndex = 0;
        this.walkContextTree(this.rootStageContext, (context) => {
            // Get stage messages from debug info
            const stageMessages = context.debug.logContext.message || [];
            // Get flow messages (use first one as the heading)
            const flowMessages = context.debug.flowMessages;
            const flowMessage = flowMessages.length > 0 ? flowMessages[0] : undefined;
            const entry = {
                stageId: context.getStageId(),
                stageName: context.stageName,
                stageMessages,
                flowMessage,
                timeIndex: timeIndex++,
            };
            narrative.push(entry);
        });
        return narrative;
    }
    /**
     * walkContextTree() - Walk the stage context tree in execution order
     *
     * Visits nodes in the order they were executed:
     * 1. Visit current node
     * 2. Visit children (parallel branches)
     * 3. Visit next (linear continuation)
     *
     * @param context - The current stage context
     * @param visitor - Callback function for each context
     */
    walkContextTree(context, visitor) {
        visitor(context);
        // Visit children first (parallel branches)
        if (context.children) {
            for (const child of context.children) {
                this.walkContextTree(child, visitor);
            }
        }
        // Then visit next (linear continuation)
        if (context.next) {
            this.walkContextTree(context.next, visitor);
        }
    }
}
exports.PipelineRuntime = PipelineRuntime;
exports.TreePipelineContext = PipelineRuntime;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGlwZWxpbmVSdW50aW1lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2NvcmUvbWVtb3J5L1BpcGVsaW5lUnVudGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQUVILDhFQUF5RjtBQUN6RiwrQ0FBNEM7QUFDNUMsaURBQTZEO0FBc0M3RDs7Ozs7R0FLRztBQUNILE1BQWEsZUFBZTtJQVExQixZQUFZLFFBQWdCLEVBQUUsdUJBQWlDLEVBQUUsY0FBd0I7UUFDdkYsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksbUNBQWdCLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLHlCQUFXLENBQUMsdUJBQXVCLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksMkJBQVksQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3RHLENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDekMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsYUFBYSxDQUFDLElBQWMsRUFBRSxHQUFXLEVBQUUsS0FBYztRQUN2RCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxXQUFXO1FBQ1QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDMUQsT0FBTztZQUNMLGFBQWE7WUFDYixhQUFhO1lBQ2IsT0FBTyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUU7U0FDdEMsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsZ0JBQWdCO1FBQ2QsTUFBTSxTQUFTLEdBQXFCLEVBQUUsQ0FBQztRQUN2QyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFbEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUN0RCxxQ0FBcUM7WUFDckMsTUFBTSxhQUFhLEdBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBb0IsSUFBSSxFQUFFLENBQUM7WUFFM0UsbURBQW1EO1lBQ25ELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDO1lBQ2hELE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUUxRSxNQUFNLEtBQUssR0FBbUI7Z0JBQzVCLE9BQU8sRUFBRSxPQUFPLENBQUMsVUFBVSxFQUFFO2dCQUM3QixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7Z0JBQzVCLGFBQWE7Z0JBQ2IsV0FBVztnQkFDWCxTQUFTLEVBQUUsU0FBUyxFQUFFO2FBQ3ZCLENBQUM7WUFFRixTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztJQUVEOzs7Ozs7Ozs7O09BVUc7SUFDSyxlQUFlLENBQUMsT0FBcUIsRUFBRSxPQUFvQztRQUNqRixPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFakIsMkNBQTJDO1FBQzNDLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3JCLEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNyQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN2QyxDQUFDO1FBQ0gsQ0FBQztRQUVELHdDQUF3QztRQUN4QyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQixJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDOUMsQ0FBQztJQUNILENBQUM7Q0FDRjtBQTdHRCwwQ0E2R0M7QUFHMkIsOENBQW1CIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQaXBlbGluZVJ1bnRpbWUgLSBUaGUgdG9wLWxldmVsIHJ1bnRpbWUgY29udGFpbmVyIGZvciBwaXBlbGluZSBleGVjdXRpb25cbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBUaGUgbWFpbiBlbnRyeSBwb2ludCBmb3IgY3JlYXRpbmcgYW5kIG1hbmFnaW5nIGEgcGlwZWxpbmUncyBleGVjdXRpb24gY29udGV4dC5cbiAqICBcbiAqICBUaGluayBvZiBpdCBsaWtlIGEgY29tcGlsZXIncyBydW50aW1lIGVudmlyb25tZW50IG9yIGEgVk0gaW5zdGFuY2UgLSBpdCBob2xkczpcbiAqICAgIC0gVGhlIGdsb2JhbCBzdG9yZSAoc2hhcmVkIHN0YXRlKVxuICogICAgLSBUaGUgcm9vdCBzdGFnZSBjb250ZXh0IChlbnRyeSBwb2ludCBmb3IgZXhlY3V0aW9uKVxuICogICAgLSBUaGUgZXhlY3V0aW9uIGhpc3RvcnkgKGZvciB0aW1lLXRyYXZlbCBkZWJ1Z2dpbmcpXG4gKlxuICogIFRoaXMgaXMgd2hhdCB5b3UgaW5zdGFudGlhdGUgd2hlbiB5b3Ugd2FudCB0byBydW4gYSBwaXBlbGluZS5cbiAqL1xuXG5pbXBvcnQgeyBDb21taXRCdW5kbGUsIEV4ZWN1dGlvbkhpc3RvcnkgfSBmcm9tICcuLi8uLi9pbnRlcm5hbC9oaXN0b3J5L0V4ZWN1dGlvbkhpc3RvcnknO1xuaW1wb3J0IHsgR2xvYmFsU3RvcmUgfSBmcm9tICcuL0dsb2JhbFN0b3JlJztcbmltcG9ydCB7IFN0YWdlQ29udGV4dCwgU3RhZ2VTbmFwc2hvdCB9IGZyb20gJy4vU3RhZ2VDb250ZXh0JztcbmltcG9ydCB0eXBlIHsgRmxvd01lc3NhZ2UgfSBmcm9tICcuLi9leGVjdXRvci90eXBlcyc7XG5cbi8qKlxuICogTmFycmF0aXZlRW50cnkgLSBBIHNpbmdsZSBlbnRyeSBpbiB0aGUgZXhlY3V0aW9uIG5hcnJhdGl2ZVxuICogXG4gKiBDb21iaW5lcyBzdGFnZSBtZXNzYWdlcyAoYnVsbGV0IHBvaW50cykgd2l0aCBmbG93IG1lc3NhZ2VzIChoZWFkaW5ncylcbiAqIHRvIGNyZWF0ZSBhIGNvbXBsZXRlIHN0b3J5dGVsbGluZyB2aWV3IG9mIHRoZSBleGVjdXRpb24uXG4gKlxuICogX1JlcXVpcmVtZW50czogZmxvdy1jb250cm9sLW5hcnJhdGl2ZSBSRVEtNywgUkVRLTEwX1xuICovXG5leHBvcnQgaW50ZXJmYWNlIE5hcnJhdGl2ZUVudHJ5IHtcbiAgLyoqIFVuaXF1ZSBpZGVudGlmaWVyIGZvciBsaW5raW5nIHRvIGZsb3djaGFydCAqL1xuICBzdGFnZUlkOiBzdHJpbmc7XG4gIC8qKiBTdGFnZSBuYW1lICovXG4gIHN0YWdlTmFtZTogc3RyaW5nO1xuICAvKiogSHVtYW4tcmVhZGFibGUgZGlzcGxheSBuYW1lICovXG4gIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuICAvKiogU3RhZ2UgbWVzc2FnZXMgKGJ1bGxldCBwb2ludHMpICovXG4gIHN0YWdlTWVzc2FnZXM6IHN0cmluZ1tdO1xuICAvKiogRmxvdyBjb250cm9sIG1lc3NhZ2UgKGhlYWRpbmcpICovXG4gIGZsb3dNZXNzYWdlPzogRmxvd01lc3NhZ2U7XG4gIC8qKiBQb3NpdGlvbiBpbiB0aW1lLXRyYXZlbGVyICovXG4gIHRpbWVJbmRleDogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJ1bnRpbWVTbmFwc2hvdCAtIENvbXBsZXRlIHNuYXBzaG90IG9mIHRoZSBwaXBlbGluZSBydW50aW1lIHN0YXRlXG4gKiBcbiAqIFVzZWQgZm9yIGRlYnVnZ2luZywgdmlzdWFsaXphdGlvbiwgYW5kIHNlcmlhbGl6YXRpb24uXG4gKi9cbmV4cG9ydCB0eXBlIFJ1bnRpbWVTbmFwc2hvdCA9IHtcbiAgZ2xvYmFsQ29udGV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIHN0YWdlQ29udGV4dHM6IFN0YWdlU25hcHNob3Q7XG4gIGhpc3Rvcnk6IENvbW1pdEJ1bmRsZVtdO1xufTtcblxuXG4vKipcbiAqIFBpcGVsaW5lUnVudGltZSAtIFRvcC1sZXZlbCBjb250YWluZXIgZm9yIHBpcGVsaW5lIGV4ZWN1dGlvblxuICogXG4gKiBDcmVhdGVzIGFuZCBtYW5hZ2VzIHRoZSBnbG9iYWwgc3RvcmUsIHJvb3Qgc3RhZ2UgY29udGV4dCwgYW5kIGV4ZWN1dGlvbiBoaXN0b3J5LlxuICogVGhpcyBpcyB0aGUgbWFpbiBjbGFzcyB5b3UgaW5zdGFudGlhdGUgdG8gcnVuIGEgcGlwZWxpbmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBQaXBlbGluZVJ1bnRpbWUge1xuICAvKiogVGhlIHNoYXJlZCBzdGF0ZSBjb250YWluZXIgKi9cbiAgcHVibGljIGdsb2JhbFN0b3JlOiBHbG9iYWxTdG9yZTtcbiAgLyoqIFRoZSByb290IHN0YWdlIGNvbnRleHQgKGVudHJ5IHBvaW50KSAqL1xuICBwdWJsaWMgcm9vdFN0YWdlQ29udGV4dDogU3RhZ2VDb250ZXh0O1xuICAvKiogVGhlIGV4ZWN1dGlvbiBoaXN0b3J5IGZvciB0aW1lLXRyYXZlbCAqL1xuICBwdWJsaWMgZXhlY3V0aW9uSGlzdG9yeTogRXhlY3V0aW9uSGlzdG9yeTtcblxuICBjb25zdHJ1Y3Rvcihyb290TmFtZTogc3RyaW5nLCBkZWZhdWx0VmFsdWVzRm9yQ29udGV4dD86IHVua25vd24sIGluaXRpYWxDb250ZXh0PzogdW5rbm93bikge1xuICAgIHRoaXMuZXhlY3V0aW9uSGlzdG9yeSA9IG5ldyBFeGVjdXRpb25IaXN0b3J5KGluaXRpYWxDb250ZXh0KTtcbiAgICB0aGlzLmdsb2JhbFN0b3JlID0gbmV3IEdsb2JhbFN0b3JlKGRlZmF1bHRWYWx1ZXNGb3JDb250ZXh0LCBpbml0aWFsQ29udGV4dCk7XG4gICAgdGhpcy5yb290U3RhZ2VDb250ZXh0ID0gbmV3IFN0YWdlQ29udGV4dCgnJywgcm9vdE5hbWUsIHRoaXMuZ2xvYmFsU3RvcmUsICcnLCB0aGlzLmV4ZWN1dGlvbkhpc3RvcnkpO1xuICB9XG5cbiAgLyoqXG4gICAqIGdldFBpcGVsaW5lcygpIC0gR2V0IGFsbCBwaXBlbGluZSBuYW1lc3BhY2VzIGZyb20gdGhlIGdsb2JhbCBzdG9yZVxuICAgKi9cbiAgZ2V0UGlwZWxpbmVzKCkge1xuICAgIHJldHVybiB0aGlzLmdsb2JhbFN0b3JlLmdldFBpcGVsaW5lcygpO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldFJvb3RPYmplY3QoKSAtIFNldCBhIHZhbHVlIGF0IHRoZSByb290IGxldmVsXG4gICAqL1xuICBzZXRSb290T2JqZWN0KHBhdGg6IHN0cmluZ1tdLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICB0aGlzLnJvb3RTdGFnZUNvbnRleHQuc2V0T2JqZWN0KHBhdGgsIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIGdldFNuYXBzaG90KCkgLSBHZXQgYSBjb21wbGV0ZSBzbmFwc2hvdCBvZiB0aGUgcnVudGltZSBzdGF0ZVxuICAgKiBcbiAgICogUmV0dXJucyB0aGUgZ2xvYmFsIHN0YXRlLCBzdGFnZSB0cmVlLCBhbmQgZXhlY3V0aW9uIGhpc3RvcnkuXG4gICAqL1xuICBnZXRTbmFwc2hvdCgpOiBSdW50aW1lU25hcHNob3Qge1xuICAgIGNvbnN0IGdsb2JhbENvbnRleHQgPSB0aGlzLmdsb2JhbFN0b3JlLmdldFN0YXRlKCk7XG4gICAgY29uc3Qgc3RhZ2VDb250ZXh0cyA9IHRoaXMucm9vdFN0YWdlQ29udGV4dC5nZXRTbmFwc2hvdCgpO1xuICAgIHJldHVybiB7XG4gICAgICBnbG9iYWxDb250ZXh0LFxuICAgICAgc3RhZ2VDb250ZXh0cyxcbiAgICAgIGhpc3Rvcnk6IHRoaXMuZXhlY3V0aW9uSGlzdG9yeS5saXN0KCksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBnZXRGdWxsTmFycmF0aXZlKCkgLSBFeHRyYWN0IHRoZSBjb21wbGV0ZSBleGVjdXRpb24gbmFycmF0aXZlIGluIG9yZGVyXG4gICAqIFxuICAgKiBXYWxrcyB0aGUgc3RhZ2UgY29udGV4dCB0cmVlIGluIGV4ZWN1dGlvbiBvcmRlciBhbmQgY29tYmluZXM6XG4gICAqIC0gU3RhZ2UgbWVzc2FnZXMgKGJ1bGxldCBwb2ludHMgZnJvbSBhZGREZWJ1Z01lc3NhZ2UpXG4gICAqIC0gRmxvdyBtZXNzYWdlcyAoaGVhZGluZ3MgZnJvbSBhZGRGbG93RGVidWdNZXNzYWdlKVxuICAgKiBcbiAgICogVGhpcyBjcmVhdGVzIGEgY29tcGxldGUgc3Rvcnl0ZWxsaW5nIHZpZXcgb2YgdGhlIGV4ZWN1dGlvbiB0aGF0IGNhbiBiZTpcbiAgICogLSBEaXNwbGF5ZWQgaW4gdGhlIFNlbWFudGljIFZpZXcgYXMgYSBwcm9ncmVzc2l2ZSBzdG9yeVxuICAgKiAtIFNlbnQgdG8gTExNIGFzIGNvbnRleHQgaGlzdG9yeVxuICAgKiAtIEV4cG9ydGVkIGZvciBkb2N1bWVudGF0aW9uL2RlYnVnZ2luZ1xuICAgKlxuICAgKiBfUmVxdWlyZW1lbnRzOiBmbG93LWNvbnRyb2wtbmFycmF0aXZlIFJFUS03X1xuICAgKi9cbiAgZ2V0RnVsbE5hcnJhdGl2ZSgpOiBOYXJyYXRpdmVFbnRyeVtdIHtcbiAgICBjb25zdCBuYXJyYXRpdmU6IE5hcnJhdGl2ZUVudHJ5W10gPSBbXTtcbiAgICBsZXQgdGltZUluZGV4ID0gMDtcblxuICAgIHRoaXMud2Fsa0NvbnRleHRUcmVlKHRoaXMucm9vdFN0YWdlQ29udGV4dCwgKGNvbnRleHQpID0+IHtcbiAgICAgIC8vIEdldCBzdGFnZSBtZXNzYWdlcyBmcm9tIGRlYnVnIGluZm9cbiAgICAgIGNvbnN0IHN0YWdlTWVzc2FnZXMgPSAoY29udGV4dC5kZWJ1Zy5sb2dDb250ZXh0Lm1lc3NhZ2UgYXMgc3RyaW5nW10pIHx8IFtdO1xuICAgICAgXG4gICAgICAvLyBHZXQgZmxvdyBtZXNzYWdlcyAodXNlIGZpcnN0IG9uZSBhcyB0aGUgaGVhZGluZylcbiAgICAgIGNvbnN0IGZsb3dNZXNzYWdlcyA9IGNvbnRleHQuZGVidWcuZmxvd01lc3NhZ2VzO1xuICAgICAgY29uc3QgZmxvd01lc3NhZ2UgPSBmbG93TWVzc2FnZXMubGVuZ3RoID4gMCA/IGZsb3dNZXNzYWdlc1swXSA6IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgZW50cnk6IE5hcnJhdGl2ZUVudHJ5ID0ge1xuICAgICAgICBzdGFnZUlkOiBjb250ZXh0LmdldFN0YWdlSWQoKSxcbiAgICAgICAgc3RhZ2VOYW1lOiBjb250ZXh0LnN0YWdlTmFtZSxcbiAgICAgICAgc3RhZ2VNZXNzYWdlcyxcbiAgICAgICAgZmxvd01lc3NhZ2UsXG4gICAgICAgIHRpbWVJbmRleDogdGltZUluZGV4KyssXG4gICAgICB9O1xuXG4gICAgICBuYXJyYXRpdmUucHVzaChlbnRyeSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gbmFycmF0aXZlO1xuICB9XG5cbiAgLyoqXG4gICAqIHdhbGtDb250ZXh0VHJlZSgpIC0gV2FsayB0aGUgc3RhZ2UgY29udGV4dCB0cmVlIGluIGV4ZWN1dGlvbiBvcmRlclxuICAgKiBcbiAgICogVmlzaXRzIG5vZGVzIGluIHRoZSBvcmRlciB0aGV5IHdlcmUgZXhlY3V0ZWQ6XG4gICAqIDEuIFZpc2l0IGN1cnJlbnQgbm9kZVxuICAgKiAyLiBWaXNpdCBjaGlsZHJlbiAocGFyYWxsZWwgYnJhbmNoZXMpXG4gICAqIDMuIFZpc2l0IG5leHQgKGxpbmVhciBjb250aW51YXRpb24pXG4gICAqXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gVGhlIGN1cnJlbnQgc3RhZ2UgY29udGV4dFxuICAgKiBAcGFyYW0gdmlzaXRvciAtIENhbGxiYWNrIGZ1bmN0aW9uIGZvciBlYWNoIGNvbnRleHRcbiAgICovXG4gIHByaXZhdGUgd2Fsa0NvbnRleHRUcmVlKGNvbnRleHQ6IFN0YWdlQ29udGV4dCwgdmlzaXRvcjogKGN0eDogU3RhZ2VDb250ZXh0KSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdmlzaXRvcihjb250ZXh0KTtcblxuICAgIC8vIFZpc2l0IGNoaWxkcmVuIGZpcnN0IChwYXJhbGxlbCBicmFuY2hlcylcbiAgICBpZiAoY29udGV4dC5jaGlsZHJlbikge1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjb250ZXh0LmNoaWxkcmVuKSB7XG4gICAgICAgIHRoaXMud2Fsa0NvbnRleHRUcmVlKGNoaWxkLCB2aXNpdG9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGVuIHZpc2l0IG5leHQgKGxpbmVhciBjb250aW51YXRpb24pXG4gICAgaWYgKGNvbnRleHQubmV4dCkge1xuICAgICAgdGhpcy53YWxrQ29udGV4dFRyZWUoY29udGV4dC5uZXh0LCB2aXNpdG9yKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gTGVnYWN5IGFsaWFzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGR1cmluZyBtaWdyYXRpb25cbmV4cG9ydCB7IFBpcGVsaW5lUnVudGltZSBhcyBUcmVlUGlwZWxpbmVDb250ZXh0IH07XG4iXX0=