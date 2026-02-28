"use strict";
/**
 * Providers Module - Barrel Export
 * ----------------------------------------------------------------------------
 * This module provides the scope provider system for resolving arbitrary inputs
 * (factory functions, classes, schemas) into ScopeFactory instances.
 *
 * WHY: Centralizes the provider resolution logic and allows plugins to register
 * custom resolvers for different input types (e.g., Zod schemas).
 *
 * EXPORTS:
 * - toScopeFactory: Main API for converting inputs to ScopeFactory
 * - registerScopeResolver: Plugin registration API
 * - Guards: Heuristics for detecting input types
 * - Providers: Factory functions for creating providers
 * - Types: Type definitions for the provider system
 *
 * @module scope/providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBaseStateCompat = exports.makeClassProvider = exports.makeFactoryProvider = exports.isSubclassOfStateScope = exports.looksLikeFactory = exports.looksLikeClassCtor = exports.__clearScopeResolversForTests = exports.resolveScopeProvider = exports.registerScopeResolver = exports.toScopeFactory = void 0;
// ============================================================================
// Main API
// ============================================================================
/**
 * toScopeFactory - Convert arbitrary inputs to ScopeFactory.
 * registerScopeResolver - Register custom resolvers for plugin support.
 */
var resolve_1 = require("./resolve");
Object.defineProperty(exports, "toScopeFactory", { enumerable: true, get: function () { return resolve_1.toScopeFactory; } });
Object.defineProperty(exports, "registerScopeResolver", { enumerable: true, get: function () { return resolve_1.registerScopeResolver; } });
// ============================================================================
// Registry (for advanced use cases)
// ============================================================================
/**
 * resolveScopeProvider - Lower-level API for getting a ScopeProvider.
 * __clearScopeResolversForTests - Test helper to clear registered resolvers.
 */
var registry_1 = require("./registry");
Object.defineProperty(exports, "resolveScopeProvider", { enumerable: true, get: function () { return registry_1.resolveScopeProvider; } });
Object.defineProperty(exports, "__clearScopeResolversForTests", { enumerable: true, get: function () { return registry_1.__clearScopeResolversForTests; } });
// ============================================================================
// Guards (for plugin authors)
// ============================================================================
/**
 * Heuristic functions for detecting input types.
 */
var guards_1 = require("./guards");
Object.defineProperty(exports, "looksLikeClassCtor", { enumerable: true, get: function () { return guards_1.looksLikeClassCtor; } });
Object.defineProperty(exports, "looksLikeFactory", { enumerable: true, get: function () { return guards_1.looksLikeFactory; } });
Object.defineProperty(exports, "isSubclassOfStateScope", { enumerable: true, get: function () { return guards_1.isSubclassOfStateScope; } });
// ============================================================================
// Provider Factories (for plugin authors)
// ============================================================================
/**
 * Factory functions for creating ScopeProvider instances.
 */
var providers_1 = require("./providers");
Object.defineProperty(exports, "makeFactoryProvider", { enumerable: true, get: function () { return providers_1.makeFactoryProvider; } });
Object.defineProperty(exports, "makeClassProvider", { enumerable: true, get: function () { return providers_1.makeClassProvider; } });
// ============================================================================
// BaseState Compatibility (for plugin authors)
// ============================================================================
/**
 * Attach BaseState-like methods to any object.
 */
var baseStateCompatible_1 = require("./baseStateCompatible");
Object.defineProperty(exports, "attachBaseStateCompat", { enumerable: true, get: function () { return baseStateCompatible_1.attachBaseStateCompat; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NvcGUvcHJvdmlkZXJzL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUVILCtFQUErRTtBQUMvRSxXQUFXO0FBQ1gsK0VBQStFO0FBRS9FOzs7R0FHRztBQUNILHFDQUFrRTtBQUF6RCx5R0FBQSxjQUFjLE9BQUE7QUFBRSxnSEFBQSxxQkFBcUIsT0FBQTtBQUU5QywrRUFBK0U7QUFDL0Usb0NBQW9DO0FBQ3BDLCtFQUErRTtBQUUvRTs7O0dBR0c7QUFDSCx1Q0FBaUY7QUFBeEUsZ0hBQUEsb0JBQW9CLE9BQUE7QUFBRSx5SEFBQSw2QkFBNkIsT0FBQTtBQUU1RCwrRUFBK0U7QUFDL0UsOEJBQThCO0FBQzlCLCtFQUErRTtBQUUvRTs7R0FFRztBQUNILG1DQUF3RjtBQUEvRSw0R0FBQSxrQkFBa0IsT0FBQTtBQUFFLDBHQUFBLGdCQUFnQixPQUFBO0FBQUUsZ0hBQUEsc0JBQXNCLE9BQUE7QUFFckUsK0VBQStFO0FBQy9FLDBDQUEwQztBQUMxQywrRUFBK0U7QUFFL0U7O0dBRUc7QUFDSCx5Q0FBcUU7QUFBNUQsZ0hBQUEsbUJBQW1CLE9BQUE7QUFBRSw4R0FBQSxpQkFBaUIsT0FBQTtBQUUvQywrRUFBK0U7QUFDL0UsK0NBQStDO0FBQy9DLCtFQUErRTtBQUUvRTs7R0FFRztBQUNILDZEQUE4RDtBQUFyRCw0SEFBQSxxQkFBcUIsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUHJvdmlkZXJzIE1vZHVsZSAtIEJhcnJlbCBFeHBvcnRcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIFRoaXMgbW9kdWxlIHByb3ZpZGVzIHRoZSBzY29wZSBwcm92aWRlciBzeXN0ZW0gZm9yIHJlc29sdmluZyBhcmJpdHJhcnkgaW5wdXRzXG4gKiAoZmFjdG9yeSBmdW5jdGlvbnMsIGNsYXNzZXMsIHNjaGVtYXMpIGludG8gU2NvcGVGYWN0b3J5IGluc3RhbmNlcy5cbiAqXG4gKiBXSFk6IENlbnRyYWxpemVzIHRoZSBwcm92aWRlciByZXNvbHV0aW9uIGxvZ2ljIGFuZCBhbGxvd3MgcGx1Z2lucyB0byByZWdpc3RlclxuICogY3VzdG9tIHJlc29sdmVycyBmb3IgZGlmZmVyZW50IGlucHV0IHR5cGVzIChlLmcuLCBab2Qgc2NoZW1hcykuXG4gKlxuICogRVhQT1JUUzpcbiAqIC0gdG9TY29wZUZhY3Rvcnk6IE1haW4gQVBJIGZvciBjb252ZXJ0aW5nIGlucHV0cyB0byBTY29wZUZhY3RvcnlcbiAqIC0gcmVnaXN0ZXJTY29wZVJlc29sdmVyOiBQbHVnaW4gcmVnaXN0cmF0aW9uIEFQSVxuICogLSBHdWFyZHM6IEhldXJpc3RpY3MgZm9yIGRldGVjdGluZyBpbnB1dCB0eXBlc1xuICogLSBQcm92aWRlcnM6IEZhY3RvcnkgZnVuY3Rpb25zIGZvciBjcmVhdGluZyBwcm92aWRlcnNcbiAqIC0gVHlwZXM6IFR5cGUgZGVmaW5pdGlvbnMgZm9yIHRoZSBwcm92aWRlciBzeXN0ZW1cbiAqXG4gKiBAbW9kdWxlIHNjb3BlL3Byb3ZpZGVyc1xuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1haW4gQVBJXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogdG9TY29wZUZhY3RvcnkgLSBDb252ZXJ0IGFyYml0cmFyeSBpbnB1dHMgdG8gU2NvcGVGYWN0b3J5LlxuICogcmVnaXN0ZXJTY29wZVJlc29sdmVyIC0gUmVnaXN0ZXIgY3VzdG9tIHJlc29sdmVycyBmb3IgcGx1Z2luIHN1cHBvcnQuXG4gKi9cbmV4cG9ydCB7IHRvU2NvcGVGYWN0b3J5LCByZWdpc3RlclNjb3BlUmVzb2x2ZXIgfSBmcm9tICcuL3Jlc29sdmUnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZWdpc3RyeSAoZm9yIGFkdmFuY2VkIHVzZSBjYXNlcylcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiByZXNvbHZlU2NvcGVQcm92aWRlciAtIExvd2VyLWxldmVsIEFQSSBmb3IgZ2V0dGluZyBhIFNjb3BlUHJvdmlkZXIuXG4gKiBfX2NsZWFyU2NvcGVSZXNvbHZlcnNGb3JUZXN0cyAtIFRlc3QgaGVscGVyIHRvIGNsZWFyIHJlZ2lzdGVyZWQgcmVzb2x2ZXJzLlxuICovXG5leHBvcnQgeyByZXNvbHZlU2NvcGVQcm92aWRlciwgX19jbGVhclNjb3BlUmVzb2x2ZXJzRm9yVGVzdHMgfSBmcm9tICcuL3JlZ2lzdHJ5JztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gR3VhcmRzIChmb3IgcGx1Z2luIGF1dGhvcnMpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogSGV1cmlzdGljIGZ1bmN0aW9ucyBmb3IgZGV0ZWN0aW5nIGlucHV0IHR5cGVzLlxuICovXG5leHBvcnQgeyBsb29rc0xpa2VDbGFzc0N0b3IsIGxvb2tzTGlrZUZhY3RvcnksIGlzU3ViY2xhc3NPZlN0YXRlU2NvcGUgfSBmcm9tICcuL2d1YXJkcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFByb3ZpZGVyIEZhY3RvcmllcyAoZm9yIHBsdWdpbiBhdXRob3JzKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEZhY3RvcnkgZnVuY3Rpb25zIGZvciBjcmVhdGluZyBTY29wZVByb3ZpZGVyIGluc3RhbmNlcy5cbiAqL1xuZXhwb3J0IHsgbWFrZUZhY3RvcnlQcm92aWRlciwgbWFrZUNsYXNzUHJvdmlkZXIgfSBmcm9tICcuL3Byb3ZpZGVycyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEJhc2VTdGF0ZSBDb21wYXRpYmlsaXR5IChmb3IgcGx1Z2luIGF1dGhvcnMpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQXR0YWNoIEJhc2VTdGF0ZS1saWtlIG1ldGhvZHMgdG8gYW55IG9iamVjdC5cbiAqL1xuZXhwb3J0IHsgYXR0YWNoQmFzZVN0YXRlQ29tcGF0IH0gZnJvbSAnLi9iYXNlU3RhdGVDb21wYXRpYmxlJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHlwZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBUeXBlIGRlZmluaXRpb25zIGZvciB0aGUgcHJvdmlkZXIgc3lzdGVtLlxuICovXG5leHBvcnQgdHlwZSB7XG4gIFN0YWdlQ29udGV4dExpa2UsXG4gIFNjb3BlRmFjdG9yeSxcbiAgU2NvcGVQcm92aWRlcixcbiAgUHJvdmlkZXJSZXNvbHZlcixcbiAgU3RyaWN0TW9kZSxcbiAgUmVzb2x2ZU9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuIl19