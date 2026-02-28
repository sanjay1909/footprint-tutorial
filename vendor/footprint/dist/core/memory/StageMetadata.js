"use strict";
/**
 * StageMetadata - Per-stage metadata collector for logs, errors, metrics, and evals
 * ----------------------------------------------------------------------------
 *  Collects non-execution metadata during a stage's run. This data is used for:
 *    - Debugging and troubleshooting (logs, errors)
 *    - Performance monitoring (metrics)
 *    - Quality evaluation (evals)
 *    - Flow control narrative (flowMessages)
 *
 *  This is separate from the main execution state (GlobalStore) because metadata
 *  is observational - it doesn't affect pipeline logic, just provides visibility.
 *
 *  Think of it like a compiler's diagnostic collector - it gathers warnings,
 *  errors, and timing info without affecting the compilation output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugContext = exports.StageMetadata = void 0;
const utils_1 = require("../../internal/memory/utils");
/**
 * StageMetadata - Collects observational data during stage execution
 *
 * Five categories of metadata:
 *   - logContext: Debug logs and trace information
 *   - errorContext: Error details and stack traces
 *   - metricContext: Performance metrics and timings
 *   - evalContext: Quality evaluation data
 *   - flowMessages: Flow control narrative entries
 *
 * _Requirements: flow-control-narrative REQ-5_
 */
class StageMetadata {
    constructor() {
        this.logContext = {};
        this.errorContext = {};
        this.metricContext = {};
        this.evalContext = {};
        this.flowMessages = [];
    }
    /**
     * addLog() - Append a log entry (merge semantics)
     */
    addLog(key, value, path = []) {
        (0, utils_1.updateNestedValue)(this.logContext, '', path, key, value);
    }
    /**
     * setLog() - Set a log entry (overwrite semantics)
     */
    setLog(key, value, path = []) {
        (0, utils_1.setNestedValue)(this.logContext, '', path, key, value);
    }
    /**
     * addError() - Record an error entry
     */
    addError(key, value, path = []) {
        (0, utils_1.updateNestedValue)(this.errorContext, '', path, key, value);
    }
    /**
     * addMetric() - Append a metric entry (merge semantics)
     */
    addMetric(key, value, path = []) {
        (0, utils_1.updateNestedValue)(this.metricContext, '', path, key, value);
    }
    /**
     * setMetric() - Set a metric entry (overwrite semantics)
     */
    setMetric(key, value, path = []) {
        (0, utils_1.setNestedValue)(this.metricContext, '', path, key, value);
    }
    /**
     * addEval() - Append an evaluation entry (merge semantics)
     */
    addEval(key, value, path = []) {
        (0, utils_1.updateNestedValue)(this.evalContext, '', path, key, value);
    }
    /**
     * setEval() - Set an evaluation entry (overwrite semantics)
     */
    setEval(key, value, path = []) {
        (0, utils_1.setNestedValue)(this.evalContext, '', path, key, value);
    }
    /**
     * addFlowMessage() - Add a flow control narrative entry
     *
     * Flow messages capture control flow decisions made by the execution engine.
     * They form the "headings" in the narrative story, complementing the
     * stage-level "bullet points" in logContext.
     *
     * _Requirements: flow-control-narrative REQ-5_
     */
    addFlowMessage(flowMessage) {
        this.flowMessages.push(flowMessage);
    }
}
exports.StageMetadata = StageMetadata;
exports.DebugContext = StageMetadata;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhZ2VNZXRhZGF0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jb3JlL21lbW9yeS9TdGFnZU1ldGFkYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7R0FjRzs7O0FBRUgsdURBQWdGO0FBR2hGOzs7Ozs7Ozs7OztHQVdHO0FBQ0gsTUFBYSxhQUFhO0lBQTFCO1FBQ1MsZUFBVSxHQUEyQixFQUFFLENBQUM7UUFDeEMsaUJBQVksR0FBMkIsRUFBRSxDQUFDO1FBQzFDLGtCQUFhLEdBQTJCLEVBQUUsQ0FBQztRQUMzQyxnQkFBVyxHQUEyQixFQUFFLENBQUM7UUFDekMsaUJBQVksR0FBa0IsRUFBRSxDQUFDO0lBK0QxQyxDQUFDO0lBN0RDOztPQUVHO0lBQ0gsTUFBTSxDQUFDLEdBQVcsRUFBRSxLQUFVLEVBQUUsT0FBaUIsRUFBRTtRQUNqRCxJQUFBLHlCQUFpQixFQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLEdBQVcsRUFBRSxLQUFVLEVBQUUsT0FBaUIsRUFBRTtRQUNqRCxJQUFBLHNCQUFjLEVBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxRQUFRLENBQUMsR0FBVyxFQUFFLEtBQVUsRUFBRSxPQUFpQixFQUFFO1FBQ25ELElBQUEseUJBQWlCLEVBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLENBQUMsR0FBVyxFQUFFLEtBQVUsRUFBRSxPQUFpQixFQUFFO1FBQ3BELElBQUEseUJBQWlCLEVBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLENBQUMsR0FBVyxFQUFFLEtBQVUsRUFBRSxPQUFpQixFQUFFO1FBQ3BELElBQUEsc0JBQWMsRUFBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRDs7T0FFRztJQUNILE9BQU8sQ0FBQyxHQUFXLEVBQUUsS0FBVSxFQUFFLE9BQWlCLEVBQUU7UUFDbEQsSUFBQSx5QkFBaUIsRUFBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRDs7T0FFRztJQUNILE9BQU8sQ0FBQyxHQUFXLEVBQUUsS0FBVSxFQUFFLE9BQWlCLEVBQUU7UUFDbEQsSUFBQSxzQkFBYyxFQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVEOzs7Ozs7OztPQVFHO0lBQ0gsY0FBYyxDQUFDLFdBQXdCO1FBQ3JDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRjtBQXBFRCxzQ0FvRUM7QUFHeUIscUNBQVkiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFN0YWdlTWV0YWRhdGEgLSBQZXItc3RhZ2UgbWV0YWRhdGEgY29sbGVjdG9yIGZvciBsb2dzLCBlcnJvcnMsIG1ldHJpY3MsIGFuZCBldmFsc1xuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvbGxlY3RzIG5vbi1leGVjdXRpb24gbWV0YWRhdGEgZHVyaW5nIGEgc3RhZ2UncyBydW4uIFRoaXMgZGF0YSBpcyB1c2VkIGZvcjpcbiAqICAgIC0gRGVidWdnaW5nIGFuZCB0cm91Ymxlc2hvb3RpbmcgKGxvZ3MsIGVycm9ycylcbiAqICAgIC0gUGVyZm9ybWFuY2UgbW9uaXRvcmluZyAobWV0cmljcylcbiAqICAgIC0gUXVhbGl0eSBldmFsdWF0aW9uIChldmFscylcbiAqICAgIC0gRmxvdyBjb250cm9sIG5hcnJhdGl2ZSAoZmxvd01lc3NhZ2VzKVxuICpcbiAqICBUaGlzIGlzIHNlcGFyYXRlIGZyb20gdGhlIG1haW4gZXhlY3V0aW9uIHN0YXRlIChHbG9iYWxTdG9yZSkgYmVjYXVzZSBtZXRhZGF0YVxuICogIGlzIG9ic2VydmF0aW9uYWwgLSBpdCBkb2Vzbid0IGFmZmVjdCBwaXBlbGluZSBsb2dpYywganVzdCBwcm92aWRlcyB2aXNpYmlsaXR5LlxuICpcbiAqICBUaGluayBvZiBpdCBsaWtlIGEgY29tcGlsZXIncyBkaWFnbm9zdGljIGNvbGxlY3RvciAtIGl0IGdhdGhlcnMgd2FybmluZ3MsXG4gKiAgZXJyb3JzLCBhbmQgdGltaW5nIGluZm8gd2l0aG91dCBhZmZlY3RpbmcgdGhlIGNvbXBpbGF0aW9uIG91dHB1dC5cbiAqL1xuXG5pbXBvcnQgeyBzZXROZXN0ZWRWYWx1ZSwgdXBkYXRlTmVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi9pbnRlcm5hbC9tZW1vcnkvdXRpbHMnO1xuaW1wb3J0IHR5cGUgeyBGbG93TWVzc2FnZSB9IGZyb20gJy4uL2V4ZWN1dG9yL3R5cGVzJztcblxuLyoqXG4gKiBTdGFnZU1ldGFkYXRhIC0gQ29sbGVjdHMgb2JzZXJ2YXRpb25hbCBkYXRhIGR1cmluZyBzdGFnZSBleGVjdXRpb25cbiAqIFxuICogRml2ZSBjYXRlZ29yaWVzIG9mIG1ldGFkYXRhOlxuICogICAtIGxvZ0NvbnRleHQ6IERlYnVnIGxvZ3MgYW5kIHRyYWNlIGluZm9ybWF0aW9uXG4gKiAgIC0gZXJyb3JDb250ZXh0OiBFcnJvciBkZXRhaWxzIGFuZCBzdGFjayB0cmFjZXNcbiAqICAgLSBtZXRyaWNDb250ZXh0OiBQZXJmb3JtYW5jZSBtZXRyaWNzIGFuZCB0aW1pbmdzXG4gKiAgIC0gZXZhbENvbnRleHQ6IFF1YWxpdHkgZXZhbHVhdGlvbiBkYXRhXG4gKiAgIC0gZmxvd01lc3NhZ2VzOiBGbG93IGNvbnRyb2wgbmFycmF0aXZlIGVudHJpZXNcbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiBmbG93LWNvbnRyb2wtbmFycmF0aXZlIFJFUS01X1xuICovXG5leHBvcnQgY2xhc3MgU3RhZ2VNZXRhZGF0YSB7XG4gIHB1YmxpYyBsb2dDb250ZXh0OiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG4gIHB1YmxpYyBlcnJvckNvbnRleHQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgcHVibGljIG1ldHJpY0NvbnRleHQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgcHVibGljIGV2YWxDb250ZXh0OiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG4gIHB1YmxpYyBmbG93TWVzc2FnZXM6IEZsb3dNZXNzYWdlW10gPSBbXTtcblxuICAvKipcbiAgICogYWRkTG9nKCkgLSBBcHBlbmQgYSBsb2cgZW50cnkgKG1lcmdlIHNlbWFudGljcylcbiAgICovXG4gIGFkZExvZyhrZXk6IHN0cmluZywgdmFsdWU6IGFueSwgcGF0aDogc3RyaW5nW10gPSBbXSkge1xuICAgIHVwZGF0ZU5lc3RlZFZhbHVlKHRoaXMubG9nQ29udGV4dCwgJycsIHBhdGgsIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldExvZygpIC0gU2V0IGEgbG9nIGVudHJ5IChvdmVyd3JpdGUgc2VtYW50aWNzKVxuICAgKi9cbiAgc2V0TG9nKGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBwYXRoOiBzdHJpbmdbXSA9IFtdKSB7XG4gICAgc2V0TmVzdGVkVmFsdWUodGhpcy5sb2dDb250ZXh0LCAnJywgcGF0aCwga2V5LCB2YWx1ZSk7XG4gIH1cblxuICAvKipcbiAgICogYWRkRXJyb3IoKSAtIFJlY29yZCBhbiBlcnJvciBlbnRyeVxuICAgKi9cbiAgYWRkRXJyb3Ioa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnksIHBhdGg6IHN0cmluZ1tdID0gW10pIHtcbiAgICB1cGRhdGVOZXN0ZWRWYWx1ZSh0aGlzLmVycm9yQ29udGV4dCwgJycsIHBhdGgsIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIGFkZE1ldHJpYygpIC0gQXBwZW5kIGEgbWV0cmljIGVudHJ5IChtZXJnZSBzZW1hbnRpY3MpXG4gICAqL1xuICBhZGRNZXRyaWMoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnksIHBhdGg6IHN0cmluZ1tdID0gW10pIHtcbiAgICB1cGRhdGVOZXN0ZWRWYWx1ZSh0aGlzLm1ldHJpY0NvbnRleHQsICcnLCBwYXRoLCBrZXksIHZhbHVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBzZXRNZXRyaWMoKSAtIFNldCBhIG1ldHJpYyBlbnRyeSAob3ZlcndyaXRlIHNlbWFudGljcylcbiAgICovXG4gIHNldE1ldHJpYyhrZXk6IHN0cmluZywgdmFsdWU6IGFueSwgcGF0aDogc3RyaW5nW10gPSBbXSkge1xuICAgIHNldE5lc3RlZFZhbHVlKHRoaXMubWV0cmljQ29udGV4dCwgJycsIHBhdGgsIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIGFkZEV2YWwoKSAtIEFwcGVuZCBhbiBldmFsdWF0aW9uIGVudHJ5IChtZXJnZSBzZW1hbnRpY3MpXG4gICAqL1xuICBhZGRFdmFsKGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBwYXRoOiBzdHJpbmdbXSA9IFtdKSB7XG4gICAgdXBkYXRlTmVzdGVkVmFsdWUodGhpcy5ldmFsQ29udGV4dCwgJycsIHBhdGgsIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldEV2YWwoKSAtIFNldCBhbiBldmFsdWF0aW9uIGVudHJ5IChvdmVyd3JpdGUgc2VtYW50aWNzKVxuICAgKi9cbiAgc2V0RXZhbChrZXk6IHN0cmluZywgdmFsdWU6IGFueSwgcGF0aDogc3RyaW5nW10gPSBbXSkge1xuICAgIHNldE5lc3RlZFZhbHVlKHRoaXMuZXZhbENvbnRleHQsICcnLCBwYXRoLCBrZXksIHZhbHVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBhZGRGbG93TWVzc2FnZSgpIC0gQWRkIGEgZmxvdyBjb250cm9sIG5hcnJhdGl2ZSBlbnRyeVxuICAgKiBcbiAgICogRmxvdyBtZXNzYWdlcyBjYXB0dXJlIGNvbnRyb2wgZmxvdyBkZWNpc2lvbnMgbWFkZSBieSB0aGUgZXhlY3V0aW9uIGVuZ2luZS5cbiAgICogVGhleSBmb3JtIHRoZSBcImhlYWRpbmdzXCIgaW4gdGhlIG5hcnJhdGl2ZSBzdG9yeSwgY29tcGxlbWVudGluZyB0aGVcbiAgICogc3RhZ2UtbGV2ZWwgXCJidWxsZXQgcG9pbnRzXCIgaW4gbG9nQ29udGV4dC5cbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogZmxvdy1jb250cm9sLW5hcnJhdGl2ZSBSRVEtNV9cbiAgICovXG4gIGFkZEZsb3dNZXNzYWdlKGZsb3dNZXNzYWdlOiBGbG93TWVzc2FnZSkge1xuICAgIHRoaXMuZmxvd01lc3NhZ2VzLnB1c2goZmxvd01lc3NhZ2UpO1xuICB9XG59XG5cbi8vIExlZ2FjeSBhbGlhc2VzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGR1cmluZyBtaWdyYXRpb25cbmV4cG9ydCB7IFN0YWdlTWV0YWRhdGEgYXMgRGVidWdDb250ZXh0IH07XG4iXX0=