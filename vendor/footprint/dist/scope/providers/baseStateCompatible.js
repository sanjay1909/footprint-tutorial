"use strict";
/**
 * baseStateCompatible.ts
 *
 * WHY: Attaches BaseState-like methods onto any target object (e.g., a proxy scope).
 * This allows non-class scopes (like Zod-generated scopes) to have the same
 * convenience methods as BaseState subclasses.
 *
 * RESPONSIBILITIES:
 * - Attach debug/metric/eval logging methods
 * - Attach getValue/setValue/updateValue methods
 * - Attach getInitialValueFor, getReadOnlyValues, getPipelineId methods
 *
 * DESIGN DECISIONS:
 * - Uses Object.assign to add methods to existing objects
 * - Methods delegate to StageContextLike for actual implementation
 * - Allows any object to gain BaseState-like capabilities
 *
 * RELATED:
 * - {@link BaseState} - The class these methods are modeled after
 * - {@link types.ts} - StageContextLike interface
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBaseStateCompat = void 0;
/** Attach BaseState-like methods onto any target (e.g., a proxy scope) */
function attachBaseStateCompat(target, ctx, stageName, readOnly) {
    const compat = {
        addDebugInfo: (k, v) => { var _a; return (_a = ctx.addLog) === null || _a === void 0 ? void 0 : _a.call(ctx, k, v); },
        addDebugMessage: (v) => { var _a; return (_a = ctx.addLog) === null || _a === void 0 ? void 0 : _a.call(ctx, 'messages', [v]); },
        addErrorInfo: (k, v) => { var _a; return (_a = ctx.addError) === null || _a === void 0 ? void 0 : _a.call(ctx, k, v); },
        addMetric: (name, v) => { var _a; return (_a = ctx.addLog) === null || _a === void 0 ? void 0 : _a.call(ctx, `metric:${name}`, v); },
        addEval: (name, v) => { var _a; return (_a = ctx.addLog) === null || _a === void 0 ? void 0 : _a.call(ctx, `eval:${name}`, v); },
        getInitialValueFor: (k) => { var _a; return (_a = ctx.getFromGlobalContext) === null || _a === void 0 ? void 0 : _a.call(ctx, k); },
        getValue: (path, key) => ctx.getValue(path, key),
        setObject: (path, key, value, shouldRedact = false, description) => ctx.setObject(path, key, value, shouldRedact, description),
        updateObject: (path, key, value, description) => ctx.updateObject(path, key, value, description),
        setObjectInRoot: (key, value) => { var _a; return (_a = ctx.setRoot) === null || _a === void 0 ? void 0 : _a.call(ctx, key, value); },
        getReadOnlyValues: () => readOnly,
        getPipelineId: () => ctx.pipelineId,
    };
    return Object.assign(target, compat);
}
exports.attachBaseStateCompat = attachBaseStateCompat;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZVN0YXRlQ29tcGF0aWJsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zY29wZS9wcm92aWRlcnMvYmFzZVN0YXRlQ29tcGF0aWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7QUFJSCwwRUFBMEU7QUFDMUUsU0FBZ0IscUJBQXFCLENBQ25DLE1BQVMsRUFDVCxHQUFxQixFQUNyQixTQUFpQixFQUNqQixRQUFrQjtJQWlCbEIsTUFBTSxNQUFNLEdBQUc7UUFDYixZQUFZLEVBQUUsQ0FBQyxDQUFTLEVBQUUsQ0FBVSxFQUFFLEVBQUUsV0FBQyxPQUFBLE1BQUEsR0FBRyxDQUFDLE1BQU0sb0RBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBLEVBQUE7UUFDM0QsZUFBZSxFQUFFLENBQUMsQ0FBVSxFQUFFLEVBQUUsV0FBQyxPQUFBLE1BQUEsR0FBRyxDQUFDLE1BQU0sb0RBQUcsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxFQUFBO1FBQzlELFlBQVksRUFBRSxDQUFDLENBQVMsRUFBRSxDQUFVLEVBQUUsRUFBRSxXQUFDLE9BQUEsTUFBQSxHQUFHLENBQUMsUUFBUSxvREFBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUEsRUFBQTtRQUM3RCxTQUFTLEVBQUUsQ0FBQyxJQUFZLEVBQUUsQ0FBVSxFQUFFLEVBQUUsV0FBQyxPQUFBLE1BQUEsR0FBRyxDQUFDLE1BQU0sb0RBQUcsVUFBVSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQSxFQUFBO1FBQzFFLE9BQU8sRUFBRSxDQUFDLElBQVksRUFBRSxDQUFVLEVBQUUsRUFBRSxXQUFDLE9BQUEsTUFBQSxHQUFHLENBQUMsTUFBTSxvREFBRyxRQUFRLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFBLEVBQUE7UUFFdEUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFTLEVBQUUsRUFBRSxXQUFDLE9BQUEsTUFBQSxHQUFHLENBQUMsb0JBQW9CLG9EQUFHLENBQUMsQ0FBQyxDQUFBLEVBQUE7UUFDaEUsUUFBUSxFQUFFLENBQUMsSUFBYyxFQUFFLEdBQVksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1FBQ25FLFNBQVMsRUFBRSxDQUFDLElBQWMsRUFBRSxHQUFXLEVBQUUsS0FBYyxFQUFFLFlBQVksR0FBRyxLQUFLLEVBQUUsV0FBb0IsRUFBRSxFQUFFLENBQ3BHLEdBQVcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLFdBQVcsQ0FBQztRQUNyRSxZQUFZLEVBQUUsQ0FBQyxJQUFjLEVBQUUsR0FBVyxFQUFFLEtBQWMsRUFBRSxXQUFvQixFQUFFLEVBQUUsQ0FDbEYsR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUM7UUFDakQsZUFBZSxFQUFFLENBQUMsR0FBVyxFQUFFLEtBQWMsRUFBRSxFQUFFLFdBQUMsT0FBQSxNQUFBLEdBQUcsQ0FBQyxPQUFPLG9EQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQSxFQUFBO1FBRTNFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLFFBQVE7UUFDakMsYUFBYSxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVO0tBQ3BDLENBQUM7SUFFRixPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZDLENBQUM7QUF6Q0Qsc0RBeUNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBiYXNlU3RhdGVDb21wYXRpYmxlLnRzXG4gKlxuICogV0hZOiBBdHRhY2hlcyBCYXNlU3RhdGUtbGlrZSBtZXRob2RzIG9udG8gYW55IHRhcmdldCBvYmplY3QgKGUuZy4sIGEgcHJveHkgc2NvcGUpLlxuICogVGhpcyBhbGxvd3Mgbm9uLWNsYXNzIHNjb3BlcyAobGlrZSBab2QtZ2VuZXJhdGVkIHNjb3BlcykgdG8gaGF2ZSB0aGUgc2FtZVxuICogY29udmVuaWVuY2UgbWV0aG9kcyBhcyBCYXNlU3RhdGUgc3ViY2xhc3Nlcy5cbiAqXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBBdHRhY2ggZGVidWcvbWV0cmljL2V2YWwgbG9nZ2luZyBtZXRob2RzXG4gKiAtIEF0dGFjaCBnZXRWYWx1ZS9zZXRWYWx1ZS91cGRhdGVWYWx1ZSBtZXRob2RzXG4gKiAtIEF0dGFjaCBnZXRJbml0aWFsVmFsdWVGb3IsIGdldFJlYWRPbmx5VmFsdWVzLCBnZXRQaXBlbGluZUlkIG1ldGhvZHNcbiAqXG4gKiBERVNJR04gREVDSVNJT05TOlxuICogLSBVc2VzIE9iamVjdC5hc3NpZ24gdG8gYWRkIG1ldGhvZHMgdG8gZXhpc3Rpbmcgb2JqZWN0c1xuICogLSBNZXRob2RzIGRlbGVnYXRlIHRvIFN0YWdlQ29udGV4dExpa2UgZm9yIGFjdHVhbCBpbXBsZW1lbnRhdGlvblxuICogLSBBbGxvd3MgYW55IG9iamVjdCB0byBnYWluIEJhc2VTdGF0ZS1saWtlIGNhcGFiaWxpdGllc1xuICpcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBCYXNlU3RhdGV9IC0gVGhlIGNsYXNzIHRoZXNlIG1ldGhvZHMgYXJlIG1vZGVsZWQgYWZ0ZXJcbiAqIC0ge0BsaW5rIHR5cGVzLnRzfSAtIFN0YWdlQ29udGV4dExpa2UgaW50ZXJmYWNlXG4gKi9cblxuaW1wb3J0IHsgU3RhZ2VDb250ZXh0TGlrZSB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKiogQXR0YWNoIEJhc2VTdGF0ZS1saWtlIG1ldGhvZHMgb250byBhbnkgdGFyZ2V0IChlLmcuLCBhIHByb3h5IHNjb3BlKSAqL1xuZXhwb3J0IGZ1bmN0aW9uIGF0dGFjaEJhc2VTdGF0ZUNvbXBhdDxUIGV4dGVuZHMgb2JqZWN0PihcbiAgdGFyZ2V0OiBULFxuICBjdHg6IFN0YWdlQ29udGV4dExpa2UsXG4gIHN0YWdlTmFtZTogc3RyaW5nLFxuICByZWFkT25seT86IHVua25vd24sXG4pOiBUICYge1xuICBhZGREZWJ1Z0luZm8oazogc3RyaW5nLCB2OiB1bmtub3duKTogdm9pZDtcbiAgYWRkRGVidWdNZXNzYWdlKHY6IHVua25vd24pOiB2b2lkO1xuICBhZGRFcnJvckluZm8oazogc3RyaW5nLCB2OiB1bmtub3duKTogdm9pZDtcbiAgYWRkTWV0cmljKG5hbWU6IHN0cmluZywgdjogdW5rbm93bik6IHZvaWQ7XG4gIGFkZEV2YWwobmFtZTogc3RyaW5nLCB2OiB1bmtub3duKTogdm9pZDtcblxuICBnZXRJbml0aWFsVmFsdWVGb3Ioazogc3RyaW5nKTogdW5rbm93bjtcbiAgZ2V0VmFsdWUocGF0aDogc3RyaW5nW10sIGtleT86IHN0cmluZyk6IHVua25vd247XG4gIHNldE9iamVjdChwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBzaG91bGRSZWRhY3Q/OiBib29sZWFuLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IHZvaWQ7XG4gIHVwZGF0ZU9iamVjdChwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IHZvaWQ7XG4gIHNldE9iamVjdEluUm9vdChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkO1xuXG4gIGdldFJlYWRPbmx5VmFsdWVzKCk6IHVua25vd247XG4gIGdldFBpcGVsaW5lSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufSB7XG4gIGNvbnN0IGNvbXBhdCA9IHtcbiAgICBhZGREZWJ1Z0luZm86IChrOiBzdHJpbmcsIHY6IHVua25vd24pID0+IGN0eC5hZGRMb2c/LihrLCB2KSxcbiAgICBhZGREZWJ1Z01lc3NhZ2U6ICh2OiB1bmtub3duKSA9PiBjdHguYWRkTG9nPy4oJ21lc3NhZ2VzJywgW3ZdKSxcbiAgICBhZGRFcnJvckluZm86IChrOiBzdHJpbmcsIHY6IHVua25vd24pID0+IGN0eC5hZGRFcnJvcj8uKGssIHYpLFxuICAgIGFkZE1ldHJpYzogKG5hbWU6IHN0cmluZywgdjogdW5rbm93bikgPT4gY3R4LmFkZExvZz8uKGBtZXRyaWM6JHtuYW1lfWAsIHYpLFxuICAgIGFkZEV2YWw6IChuYW1lOiBzdHJpbmcsIHY6IHVua25vd24pID0+IGN0eC5hZGRMb2c/LihgZXZhbDoke25hbWV9YCwgdiksXG5cbiAgICBnZXRJbml0aWFsVmFsdWVGb3I6IChrOiBzdHJpbmcpID0+IGN0eC5nZXRGcm9tR2xvYmFsQ29udGV4dD8uKGspLFxuICAgIGdldFZhbHVlOiAocGF0aDogc3RyaW5nW10sIGtleT86IHN0cmluZykgPT4gY3R4LmdldFZhbHVlKHBhdGgsIGtleSksXG4gICAgc2V0T2JqZWN0OiAocGF0aDogc3RyaW5nW10sIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgc2hvdWxkUmVkYWN0ID0gZmFsc2UsIGRlc2NyaXB0aW9uPzogc3RyaW5nKSA9PlxuICAgICAgKGN0eCBhcyBhbnkpLnNldE9iamVjdChwYXRoLCBrZXksIHZhbHVlLCBzaG91bGRSZWRhY3QsIGRlc2NyaXB0aW9uKSxcbiAgICB1cGRhdGVPYmplY3Q6IChwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBkZXNjcmlwdGlvbj86IHN0cmluZykgPT5cbiAgICAgIGN0eC51cGRhdGVPYmplY3QocGF0aCwga2V5LCB2YWx1ZSwgZGVzY3JpcHRpb24pLFxuICAgIHNldE9iamVjdEluUm9vdDogKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikgPT4gY3R4LnNldFJvb3Q/LihrZXksIHZhbHVlKSxcblxuICAgIGdldFJlYWRPbmx5VmFsdWVzOiAoKSA9PiByZWFkT25seSxcbiAgICBnZXRQaXBlbGluZUlkOiAoKSA9PiBjdHgucGlwZWxpbmVJZCxcbiAgfTtcblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbih0YXJnZXQsIGNvbXBhdCk7XG59XG4iXX0=