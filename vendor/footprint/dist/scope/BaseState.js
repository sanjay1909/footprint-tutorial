"use strict";
/**
 * BaseState.ts
 *
 * WHY: Base class that library consumers extend to create custom scope classes.
 * Provides a consistent interface for accessing pipeline context, debug logging,
 * metrics, and state management.
 *
 * RESPONSIBILITIES:
 * - Provide debug/metric/eval logging methods
 * - Provide getValue/setValue/updateValue methods for state access
 * - Provide getInitialValueFor for accessing global context
 * - Provide getReadOnlyValues for accessing read-only context
 *
 * DESIGN DECISIONS:
 * - Uses a runtime brand (Symbol) to detect subclasses reliably
 * - Wraps StageContext to provide a consumer-friendly API
 * - Methods are intentionally simple - complex logic belongs in StageContext
 *
 * RELATED:
 * - {@link StageContext} - The underlying context this class wraps
 * - {@link Scope} - Uses BaseState subclasses for scope creation
 * - {@link guards.ts} - Uses isSubclassOfStateScope to detect BaseState subclasses
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseState = void 0;
const scopeLog_1 = require("../utils/scopeLog");
/**
 * BaseState
 * ------------------------------------------------------------------
 * Base class that library consumers extend to create custom scope classes.
 *
 * WHY: Provides a consistent interface for accessing pipeline context,
 * debug logging, metrics, and state management. Consumers extend this
 * class to add domain-specific properties and methods.
 *
 * USAGE:
 * ```typescript
 * class MyScope extends BaseState {
 *   get userName(): string {
 *     return this.getValue(['user'], 'name') as string;
 *   }
 *   set userName(value: string) {
 *     this.setObject(['user'], 'name', value);
 *   }
 * }
 * ```
 *
 * DESIGN DECISIONS:
 * - Uses a runtime brand (Symbol) to detect subclasses reliably
 * - Protected members allow subclasses to access context directly
 * - Methods are intentionally simple - complex logic belongs in StageContext
 */
class BaseState {
    constructor(context, stageName, readOnlyValues) {
        this._stageContext = context;
        this._stageName = stageName;
        this._readOnlyValues = readOnlyValues;
    }
    // ---------------- Debug (not included in final context)
    addDebugInfo(key, value) {
        scopeLog_1.treeConsole.log(this._stageContext, this._stageName, [], key, value);
    }
    addDebugMessage(value) {
        scopeLog_1.treeConsole.log(this._stageContext, this._stageName, [], 'messages', [value]);
    }
    addErrorInfo(key, value) {
        scopeLog_1.treeConsole.log(this._stageContext, this._stageName, [], key, [value]);
    }
    addMetric(metricName, value) {
        scopeLog_1.treeConsole.metric(this._stageContext, this._stageName, [], metricName, value);
    }
    addEval(metricName, value) {
        scopeLog_1.treeConsole.eval(this._stageContext, this._stageName, [], metricName, value);
    }
    // ---------------- getters / setters
    getInitialValueFor(key) {
        var _a, _b;
        return (_b = (_a = this._stageContext).getFromGlobalContext) === null || _b === void 0 ? void 0 : _b.call(_a, key);
    }
    getValue(path, key) {
        return this._stageContext.getValue(path, key);
    }
    setObject(path, key, value, shouldRedact, description) {
        return this._stageContext.setObject(path, key, value, shouldRedact, description);
    }
    updateObject(path, key, value, description) {
        return this._stageContext.updateObject(path, key, value, description);
    }
    setGlobal(key, value, description) {
        var _a, _b;
        return (_b = (_a = this._stageContext).setGlobal) === null || _b === void 0 ? void 0 : _b.call(_a, key, value, description);
    }
    getGlobal(key) {
        var _a, _b;
        return (_b = (_a = this._stageContext).getGlobal) === null || _b === void 0 ? void 0 : _b.call(_a, key);
    }
    setObjectInRoot(key, value) {
        var _a, _b;
        return (_b = (_a = this._stageContext).setRoot) === null || _b === void 0 ? void 0 : _b.call(_a, key, value);
    }
    // ---------------- read-only + misc
    getReadOnlyValues() {
        return this._readOnlyValues;
    }
    getPipelineId() {
        return this._stageContext.pipelineId;
    }
}
exports.BaseState = BaseState;
// runtime brand to detect subclasses reliably
BaseState.BRAND = Symbol.for('BaseState@v1');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzZVN0YXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3Njb3BlL0Jhc2VTdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7OztBQUVILGdEQUFnRDtBQUdoRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRztBQUNILE1BQWEsU0FBUztJQVFwQixZQUFZLE9BQXFCLEVBQUUsU0FBaUIsRUFBRSxjQUF3QjtRQUM1RSxJQUFJLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQztRQUM3QixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztRQUM1QixJQUFJLENBQUMsZUFBZSxHQUFHLGNBQWMsQ0FBQztJQUN4QyxDQUFDO0lBRUQseURBQXlEO0lBQ3pELFlBQVksQ0FBQyxHQUFXLEVBQUUsS0FBYztRQUN0QyxzQkFBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsZUFBZSxDQUFDLEtBQWM7UUFDNUIsc0JBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFRCxZQUFZLENBQUMsR0FBVyxFQUFFLEtBQWM7UUFDdEMsc0JBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLENBQUM7SUFFRCxTQUFTLENBQUMsVUFBa0IsRUFBRSxLQUFjO1FBQzFDLHNCQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFFRCxPQUFPLENBQUMsVUFBa0IsRUFBRSxLQUFjO1FBQ3hDLHNCQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxxQ0FBcUM7SUFDckMsa0JBQWtCLENBQUMsR0FBVzs7UUFDNUIsT0FBTyxNQUFBLE1BQUMsSUFBSSxDQUFDLGFBQXFCLEVBQUMsb0JBQW9CLG1EQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxRQUFRLENBQUMsSUFBYyxFQUFFLEdBQVk7UUFDbkMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFNBQVMsQ0FBQyxJQUFjLEVBQUUsR0FBVyxFQUFFLEtBQWMsRUFBRSxZQUFzQixFQUFFLFdBQW9CO1FBQ2pHLE9BQVEsSUFBSSxDQUFDLGFBQXFCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxXQUFXLENBQUMsQ0FBQztJQUM1RixDQUFDO0lBRUQsWUFBWSxDQUFDLElBQWMsRUFBRSxHQUFXLEVBQUUsS0FBYyxFQUFFLFdBQW9CO1FBQzVFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELFNBQVMsQ0FBQyxHQUFXLEVBQUUsS0FBYyxFQUFFLFdBQW9COztRQUN6RCxPQUFPLE1BQUEsTUFBQyxJQUFJLENBQUMsYUFBcUIsRUFBQyxTQUFTLG1EQUFHLEdBQUcsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUVELFNBQVMsQ0FBQyxHQUFXOztRQUNuQixPQUFPLE1BQUEsTUFBQyxJQUFJLENBQUMsYUFBcUIsRUFBQyxTQUFTLG1EQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxlQUFlLENBQUMsR0FBVyxFQUFFLEtBQWM7O1FBQ3pDLE9BQU8sTUFBQSxNQUFDLElBQUksQ0FBQyxhQUFxQixFQUFDLE9BQU8sbURBQUcsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxvQ0FBb0M7SUFDcEMsaUJBQWlCO1FBQ2YsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0lBQzlCLENBQUM7SUFFRCxhQUFhO1FBQ1gsT0FBUSxJQUFJLENBQUMsYUFBcUIsQ0FBQyxVQUFVLENBQUM7SUFDaEQsQ0FBQzs7QUF2RUgsOEJBd0VDO0FBdkVDLDhDQUE4QztBQUN2QixlQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQmFzZVN0YXRlLnRzXG4gKlxuICogV0hZOiBCYXNlIGNsYXNzIHRoYXQgbGlicmFyeSBjb25zdW1lcnMgZXh0ZW5kIHRvIGNyZWF0ZSBjdXN0b20gc2NvcGUgY2xhc3Nlcy5cbiAqIFByb3ZpZGVzIGEgY29uc2lzdGVudCBpbnRlcmZhY2UgZm9yIGFjY2Vzc2luZyBwaXBlbGluZSBjb250ZXh0LCBkZWJ1ZyBsb2dnaW5nLFxuICogbWV0cmljcywgYW5kIHN0YXRlIG1hbmFnZW1lbnQuXG4gKlxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gUHJvdmlkZSBkZWJ1Zy9tZXRyaWMvZXZhbCBsb2dnaW5nIG1ldGhvZHNcbiAqIC0gUHJvdmlkZSBnZXRWYWx1ZS9zZXRWYWx1ZS91cGRhdGVWYWx1ZSBtZXRob2RzIGZvciBzdGF0ZSBhY2Nlc3NcbiAqIC0gUHJvdmlkZSBnZXRJbml0aWFsVmFsdWVGb3IgZm9yIGFjY2Vzc2luZyBnbG9iYWwgY29udGV4dFxuICogLSBQcm92aWRlIGdldFJlYWRPbmx5VmFsdWVzIGZvciBhY2Nlc3NpbmcgcmVhZC1vbmx5IGNvbnRleHRcbiAqXG4gKiBERVNJR04gREVDSVNJT05TOlxuICogLSBVc2VzIGEgcnVudGltZSBicmFuZCAoU3ltYm9sKSB0byBkZXRlY3Qgc3ViY2xhc3NlcyByZWxpYWJseVxuICogLSBXcmFwcyBTdGFnZUNvbnRleHQgdG8gcHJvdmlkZSBhIGNvbnN1bWVyLWZyaWVuZGx5IEFQSVxuICogLSBNZXRob2RzIGFyZSBpbnRlbnRpb25hbGx5IHNpbXBsZSAtIGNvbXBsZXggbG9naWMgYmVsb25ncyBpbiBTdGFnZUNvbnRleHRcbiAqXG4gKiBSRUxBVEVEOlxuICogLSB7QGxpbmsgU3RhZ2VDb250ZXh0fSAtIFRoZSB1bmRlcmx5aW5nIGNvbnRleHQgdGhpcyBjbGFzcyB3cmFwc1xuICogLSB7QGxpbmsgU2NvcGV9IC0gVXNlcyBCYXNlU3RhdGUgc3ViY2xhc3NlcyBmb3Igc2NvcGUgY3JlYXRpb25cbiAqIC0ge0BsaW5rIGd1YXJkcy50c30gLSBVc2VzIGlzU3ViY2xhc3NPZlN0YXRlU2NvcGUgdG8gZGV0ZWN0IEJhc2VTdGF0ZSBzdWJjbGFzc2VzXG4gKi9cblxuaW1wb3J0IHsgdHJlZUNvbnNvbGUgfSBmcm9tICcuLi91dGlscy9zY29wZUxvZyc7XG5pbXBvcnQgeyBTdGFnZUNvbnRleHQgfSBmcm9tICcuLi9jb3JlL21lbW9yeS9TdGFnZUNvbnRleHQnO1xuXG4vKipcbiAqIEJhc2VTdGF0ZVxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBCYXNlIGNsYXNzIHRoYXQgbGlicmFyeSBjb25zdW1lcnMgZXh0ZW5kIHRvIGNyZWF0ZSBjdXN0b20gc2NvcGUgY2xhc3Nlcy5cbiAqXG4gKiBXSFk6IFByb3ZpZGVzIGEgY29uc2lzdGVudCBpbnRlcmZhY2UgZm9yIGFjY2Vzc2luZyBwaXBlbGluZSBjb250ZXh0LFxuICogZGVidWcgbG9nZ2luZywgbWV0cmljcywgYW5kIHN0YXRlIG1hbmFnZW1lbnQuIENvbnN1bWVycyBleHRlbmQgdGhpc1xuICogY2xhc3MgdG8gYWRkIGRvbWFpbi1zcGVjaWZpYyBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzLlxuICpcbiAqIFVTQUdFOlxuICogYGBgdHlwZXNjcmlwdFxuICogY2xhc3MgTXlTY29wZSBleHRlbmRzIEJhc2VTdGF0ZSB7XG4gKiAgIGdldCB1c2VyTmFtZSgpOiBzdHJpbmcge1xuICogICAgIHJldHVybiB0aGlzLmdldFZhbHVlKFsndXNlciddLCAnbmFtZScpIGFzIHN0cmluZztcbiAqICAgfVxuICogICBzZXQgdXNlck5hbWUodmFsdWU6IHN0cmluZykge1xuICogICAgIHRoaXMuc2V0T2JqZWN0KFsndXNlciddLCAnbmFtZScsIHZhbHVlKTtcbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gVXNlcyBhIHJ1bnRpbWUgYnJhbmQgKFN5bWJvbCkgdG8gZGV0ZWN0IHN1YmNsYXNzZXMgcmVsaWFibHlcbiAqIC0gUHJvdGVjdGVkIG1lbWJlcnMgYWxsb3cgc3ViY2xhc3NlcyB0byBhY2Nlc3MgY29udGV4dCBkaXJlY3RseVxuICogLSBNZXRob2RzIGFyZSBpbnRlbnRpb25hbGx5IHNpbXBsZSAtIGNvbXBsZXggbG9naWMgYmVsb25ncyBpbiBTdGFnZUNvbnRleHRcbiAqL1xuZXhwb3J0IGNsYXNzIEJhc2VTdGF0ZSB7XG4gIC8vIHJ1bnRpbWUgYnJhbmQgdG8gZGV0ZWN0IHN1YmNsYXNzZXMgcmVsaWFibHlcbiAgcHVibGljIHN0YXRpYyByZWFkb25seSBCUkFORCA9IFN5bWJvbC5mb3IoJ0Jhc2VTdGF0ZUB2MScpO1xuXG4gIHByb3RlY3RlZCBfc3RhZ2VDb250ZXh0OiBTdGFnZUNvbnRleHQ7XG4gIHByb3RlY3RlZCBfc3RhZ2VOYW1lOiBzdHJpbmc7XG4gIHByb3RlY3RlZCByZWFkb25seSBfcmVhZE9ubHlWYWx1ZXM/OiB1bmtub3duO1xuXG4gIGNvbnN0cnVjdG9yKGNvbnRleHQ6IFN0YWdlQ29udGV4dCwgc3RhZ2VOYW1lOiBzdHJpbmcsIHJlYWRPbmx5VmFsdWVzPzogdW5rbm93bikge1xuICAgIHRoaXMuX3N0YWdlQ29udGV4dCA9IGNvbnRleHQ7XG4gICAgdGhpcy5fc3RhZ2VOYW1lID0gc3RhZ2VOYW1lO1xuICAgIHRoaXMuX3JlYWRPbmx5VmFsdWVzID0gcmVhZE9ubHlWYWx1ZXM7XG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tIERlYnVnIChub3QgaW5jbHVkZWQgaW4gZmluYWwgY29udGV4dClcbiAgYWRkRGVidWdJbmZvKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHRyZWVDb25zb2xlLmxvZyh0aGlzLl9zdGFnZUNvbnRleHQsIHRoaXMuX3N0YWdlTmFtZSwgW10sIGtleSwgdmFsdWUpO1xuICB9XG5cbiAgYWRkRGVidWdNZXNzYWdlKHZhbHVlOiB1bmtub3duKSB7XG4gICAgdHJlZUNvbnNvbGUubG9nKHRoaXMuX3N0YWdlQ29udGV4dCwgdGhpcy5fc3RhZ2VOYW1lLCBbXSwgJ21lc3NhZ2VzJywgW3ZhbHVlXSk7XG4gIH1cblxuICBhZGRFcnJvckluZm8oa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG4gICAgdHJlZUNvbnNvbGUubG9nKHRoaXMuX3N0YWdlQ29udGV4dCwgdGhpcy5fc3RhZ2VOYW1lLCBbXSwga2V5LCBbdmFsdWVdKTtcbiAgfVxuXG4gIGFkZE1ldHJpYyhtZXRyaWNOYW1lOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG4gICAgdHJlZUNvbnNvbGUubWV0cmljKHRoaXMuX3N0YWdlQ29udGV4dCwgdGhpcy5fc3RhZ2VOYW1lLCBbXSwgbWV0cmljTmFtZSwgdmFsdWUpO1xuICB9XG5cbiAgYWRkRXZhbChtZXRyaWNOYW1lOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG4gICAgdHJlZUNvbnNvbGUuZXZhbCh0aGlzLl9zdGFnZUNvbnRleHQsIHRoaXMuX3N0YWdlTmFtZSwgW10sIG1ldHJpY05hbWUsIHZhbHVlKTtcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0gZ2V0dGVycyAvIHNldHRlcnNcbiAgZ2V0SW5pdGlhbFZhbHVlRm9yKGtleTogc3RyaW5nKSB7XG4gICAgcmV0dXJuICh0aGlzLl9zdGFnZUNvbnRleHQgYXMgYW55KS5nZXRGcm9tR2xvYmFsQ29udGV4dD8uKGtleSk7XG4gIH1cblxuICBnZXRWYWx1ZShwYXRoOiBzdHJpbmdbXSwga2V5Pzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX3N0YWdlQ29udGV4dC5nZXRWYWx1ZShwYXRoLCBrZXkpO1xuICB9XG5cbiAgc2V0T2JqZWN0KHBhdGg6IHN0cmluZ1tdLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHNob3VsZFJlZGFjdD86IGJvb2xlYW4sIGRlc2NyaXB0aW9uPzogc3RyaW5nKSB7XG4gICAgcmV0dXJuICh0aGlzLl9zdGFnZUNvbnRleHQgYXMgYW55KS5zZXRPYmplY3QocGF0aCwga2V5LCB2YWx1ZSwgc2hvdWxkUmVkYWN0LCBkZXNjcmlwdGlvbik7XG4gIH1cblxuICB1cGRhdGVPYmplY3QocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgZGVzY3JpcHRpb24/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fc3RhZ2VDb250ZXh0LnVwZGF0ZU9iamVjdChwYXRoLCBrZXksIHZhbHVlLCBkZXNjcmlwdGlvbik7XG4gIH1cblxuICBzZXRHbG9iYWwoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBkZXNjcmlwdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiAodGhpcy5fc3RhZ2VDb250ZXh0IGFzIGFueSkuc2V0R2xvYmFsPy4oa2V5LCB2YWx1ZSwgZGVzY3JpcHRpb24pO1xuICB9XG5cbiAgZ2V0R2xvYmFsKGtleTogc3RyaW5nKSB7XG4gICAgcmV0dXJuICh0aGlzLl9zdGFnZUNvbnRleHQgYXMgYW55KS5nZXRHbG9iYWw/LihrZXkpO1xuICB9XG5cbiAgc2V0T2JqZWN0SW5Sb290KGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHJldHVybiAodGhpcy5fc3RhZ2VDb250ZXh0IGFzIGFueSkuc2V0Um9vdD8uKGtleSwgdmFsdWUpO1xuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLSByZWFkLW9ubHkgKyBtaXNjXG4gIGdldFJlYWRPbmx5VmFsdWVzKCkge1xuICAgIHJldHVybiB0aGlzLl9yZWFkT25seVZhbHVlcztcbiAgfVxuXG4gIGdldFBpcGVsaW5lSWQoKSB7XG4gICAgcmV0dXJuICh0aGlzLl9zdGFnZUNvbnRleHQgYXMgYW55KS5waXBlbGluZUlkO1xuICB9XG59XG4iXX0=