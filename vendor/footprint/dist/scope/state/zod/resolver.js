"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodScopeResolver = void 0;
const baseStateCompatible_1 = require("../../providers/baseStateCompatible");
const builder_1 = require("./schema/builder");
const scopeFactory_1 = require("./scopeFactory");
function makeZodProvider(schema, strict = 'warn') {
    return {
        kind: 'zod',
        create: (ctx, stageName, ro) => {
            const proxy = (0, scopeFactory_1.createScopeProxyFromZod)(ctx, schema, strict, ro);
            // make it feel like BaseState (debug + get/set helpers)
            return (0, baseStateCompatible_1.attachBaseStateCompat)(proxy, ctx, stageName, ro);
        },
    };
}
exports.ZodScopeResolver = {
    name: 'zod',
    canHandle(input) {
        return (0, builder_1.isScopeSchema)(input);
    },
    makeProvider(input, options) {
        var _a, _b;
        const schema = input;
        const strict = (_b = (_a = options === null || options === void 0 ? void 0 : options.zod) === null || _a === void 0 ? void 0 : _a.strict) !== null && _b !== void 0 ? _b : 'warn';
        return makeZodProvider(schema, strict);
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NvcGUvc3RhdGUvem9kL3Jlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLDZFQUE0RTtBQUU1RSw4Q0FBaUQ7QUFDakQsaURBQXlEO0FBRXpELFNBQVMsZUFBZSxDQUFDLE1BQXdCLEVBQUUsU0FBcUIsTUFBTTtJQUM1RSxPQUFPO1FBQ0wsSUFBSSxFQUFFLEtBQUs7UUFDWCxNQUFNLEVBQUUsQ0FBQyxHQUFxQixFQUFFLFNBQWlCLEVBQUUsRUFBWSxFQUFFLEVBQUU7WUFDakUsTUFBTSxLQUFLLEdBQUcsSUFBQSxzQ0FBdUIsRUFBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMvRCx3REFBd0Q7WUFDeEQsT0FBTyxJQUFBLDJDQUFxQixFQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzFELENBQUM7S0FDRixDQUFDO0FBQ0osQ0FBQztBQUVZLFFBQUEsZ0JBQWdCLEdBQXFCO0lBQ2hELElBQUksRUFBRSxLQUFLO0lBQ1gsU0FBUyxDQUFDLEtBQWM7UUFDdEIsT0FBTyxJQUFBLHVCQUFhLEVBQUMsS0FBSyxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUNELFlBQVksQ0FBQyxLQUFjLEVBQUUsT0FBMkM7O1FBQ3RFLE1BQU0sTUFBTSxHQUFHLEtBQW9DLENBQUM7UUFDcEQsTUFBTSxNQUFNLEdBQUcsTUFBQSxNQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxHQUFHLDBDQUFFLE1BQU0sbUNBQUksTUFBTSxDQUFDO1FBQzlDLE9BQU8sZUFBZSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN6QyxDQUFDO0NBQ0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuXG5pbXBvcnQgeyBhdHRhY2hCYXNlU3RhdGVDb21wYXQgfSBmcm9tICcuLi8uLi9wcm92aWRlcnMvYmFzZVN0YXRlQ29tcGF0aWJsZSc7XG5pbXBvcnQgeyBQcm92aWRlclJlc29sdmVyLCBTY29wZVByb3ZpZGVyLCBTdGFnZUNvbnRleHRMaWtlLCBTdHJpY3RNb2RlIH0gZnJvbSAnLi4vLi4vcHJvdmlkZXJzL3R5cGVzJztcbmltcG9ydCB7IGlzU2NvcGVTY2hlbWEgfSBmcm9tICcuL3NjaGVtYS9idWlsZGVyJztcbmltcG9ydCB7IGNyZWF0ZVNjb3BlUHJveHlGcm9tWm9kIH0gZnJvbSAnLi9zY29wZUZhY3RvcnknO1xuXG5mdW5jdGlvbiBtYWtlWm9kUHJvdmlkZXIoc2NoZW1hOiB6LlpvZE9iamVjdDxhbnk+LCBzdHJpY3Q6IFN0cmljdE1vZGUgPSAnd2FybicpOiBTY29wZVByb3ZpZGVyPGFueT4ge1xuICByZXR1cm4ge1xuICAgIGtpbmQ6ICd6b2QnLFxuICAgIGNyZWF0ZTogKGN0eDogU3RhZ2VDb250ZXh0TGlrZSwgc3RhZ2VOYW1lOiBzdHJpbmcsIHJvPzogdW5rbm93bikgPT4ge1xuICAgICAgY29uc3QgcHJveHkgPSBjcmVhdGVTY29wZVByb3h5RnJvbVpvZChjdHgsIHNjaGVtYSwgc3RyaWN0LCBybyk7XG4gICAgICAvLyBtYWtlIGl0IGZlZWwgbGlrZSBCYXNlU3RhdGUgKGRlYnVnICsgZ2V0L3NldCBoZWxwZXJzKVxuICAgICAgcmV0dXJuIGF0dGFjaEJhc2VTdGF0ZUNvbXBhdChwcm94eSwgY3R4LCBzdGFnZU5hbWUsIHJvKTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgWm9kU2NvcGVSZXNvbHZlcjogUHJvdmlkZXJSZXNvbHZlciA9IHtcbiAgbmFtZTogJ3pvZCcsXG4gIGNhbkhhbmRsZShpbnB1dDogdW5rbm93bik6IGJvb2xlYW4ge1xuICAgIHJldHVybiBpc1Njb3BlU2NoZW1hKGlucHV0KTtcbiAgfSxcbiAgbWFrZVByb3ZpZGVyKGlucHV0OiB1bmtub3duLCBvcHRpb25zPzogeyB6b2Q/OiB7IHN0cmljdD86IFN0cmljdE1vZGUgfSB9KTogU2NvcGVQcm92aWRlcjxhbnk+IHtcbiAgICBjb25zdCBzY2hlbWEgPSBpbnB1dCBhcyB1bmtub3duIGFzIHouWm9kT2JqZWN0PGFueT47XG4gICAgY29uc3Qgc3RyaWN0ID0gb3B0aW9ucz8uem9kPy5zdHJpY3QgPz8gJ3dhcm4nO1xuICAgIHJldHVybiBtYWtlWm9kUHJvdmlkZXIoc2NoZW1hLCBzdHJpY3QpO1xuICB9LFxufTtcbiJdfQ==