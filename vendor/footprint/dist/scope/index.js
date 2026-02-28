"use strict";
/**
 * Scope Module - Barrel Export
 * ----------------------------------------------------------------------------
 * This module provides a single entry point for all scope-related exports.
 * Consumers can import everything they need from this location:
 *
 * @example
 * ```typescript
 * import {
 *   // Core Scope class
 *   Scope,
 *
 *   // BaseState for custom scope classes
 *   BaseState,
 *
 *   // Types
 *   ScopeOptions,
 *   ScopeSnapshot,
 *   Recorder,
 *   RecorderContext,
 *   ReadEvent,
 *   WriteEvent,
 *   CommitEvent,
 *   ErrorEvent,
 *   StageEvent,
 *
 *   // Library-provided recorders
 *   MetricRecorder,
 *   DebugRecorder,
 *
 *   // Recorder types
 *   StageMetrics,
 *   AggregatedMetrics,
 *   DebugVerbosity,
 *   DebugEntry,
 *   DebugRecorderOptions,
 *
 *   // Provider system (for plugin authors)
 *   toScopeFactory,
 *   registerScopeResolver,
 * } from './scope';
 * ```
 *
 * @module scope
 *
 * Requirements: 7.1 - All interfaces and types are exported for consumer use
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBaseStateCompat = exports.makeClassProvider = exports.makeFactoryProvider = exports.isSubclassOfStateScope = exports.looksLikeFactory = exports.looksLikeClassCtor = exports.__clearScopeResolversForTests = exports.resolveScopeProvider = exports.registerScopeResolver = exports.toScopeFactory = exports.DebugRecorder = exports.MetricRecorder = exports.BaseState = exports.Scope = void 0;
// ============================================================================
// Core Scope Class
// ============================================================================
/**
 * Scope - Core runtime memory container for pipeline execution.
 * Provides getValue, setValue, updateValue, and commit operations with
 * namespace isolation, time-travel support, and pluggable recorders.
 */
var Scope_1 = require("./Scope");
Object.defineProperty(exports, "Scope", { enumerable: true, get: function () { return Scope_1.Scope; } });
// ============================================================================
// BaseState - Base class for custom scope classes
// ============================================================================
/**
 * BaseState - Base class that library consumers extend to create custom scope classes.
 * Provides a consistent interface for accessing pipeline context, debug logging,
 * metrics, and state management.
 */
var BaseState_1 = require("./BaseState");
Object.defineProperty(exports, "BaseState", { enumerable: true, get: function () { return BaseState_1.BaseState; } });
// ============================================================================
// Library-Provided Recorders
// ============================================================================
/**
 * Re-export all recorders and their types from the recorders module.
 * This includes both the recorder classes and their associated types.
 */
var recorders_1 = require("./recorders");
// MetricRecorder - Production monitoring (timing, counts)
Object.defineProperty(exports, "MetricRecorder", { enumerable: true, get: function () { return recorders_1.MetricRecorder; } });
// DebugRecorder - Development/OE debugging (errors, mutations, verbose logs)
Object.defineProperty(exports, "DebugRecorder", { enumerable: true, get: function () { return recorders_1.DebugRecorder; } });
// ============================================================================
// Provider System (for plugin authors and advanced use cases)
// ============================================================================
/**
 * Re-export provider system for plugin authors.
 * - toScopeFactory: Convert arbitrary inputs to ScopeFactory
 * - registerScopeResolver: Register custom resolvers
 */
var providers_1 = require("./providers");
Object.defineProperty(exports, "toScopeFactory", { enumerable: true, get: function () { return providers_1.toScopeFactory; } });
Object.defineProperty(exports, "registerScopeResolver", { enumerable: true, get: function () { return providers_1.registerScopeResolver; } });
Object.defineProperty(exports, "resolveScopeProvider", { enumerable: true, get: function () { return providers_1.resolveScopeProvider; } });
Object.defineProperty(exports, "__clearScopeResolversForTests", { enumerable: true, get: function () { return providers_1.__clearScopeResolversForTests; } });
Object.defineProperty(exports, "looksLikeClassCtor", { enumerable: true, get: function () { return providers_1.looksLikeClassCtor; } });
Object.defineProperty(exports, "looksLikeFactory", { enumerable: true, get: function () { return providers_1.looksLikeFactory; } });
Object.defineProperty(exports, "isSubclassOfStateScope", { enumerable: true, get: function () { return providers_1.isSubclassOfStateScope; } });
Object.defineProperty(exports, "makeFactoryProvider", { enumerable: true, get: function () { return providers_1.makeFactoryProvider; } });
Object.defineProperty(exports, "makeClassProvider", { enumerable: true, get: function () { return providers_1.makeClassProvider; } });
Object.defineProperty(exports, "attachBaseStateCompat", { enumerable: true, get: function () { return providers_1.attachBaseStateCompat; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2NvcGUvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBOENHOzs7QUFFSCwrRUFBK0U7QUFDL0UsbUJBQW1CO0FBQ25CLCtFQUErRTtBQUUvRTs7OztHQUlHO0FBQ0gsaUNBQWdDO0FBQXZCLDhGQUFBLEtBQUssT0FBQTtBQUVkLCtFQUErRTtBQUMvRSxrREFBa0Q7QUFDbEQsK0VBQStFO0FBRS9FOzs7O0dBSUc7QUFDSCx5Q0FBd0M7QUFBL0Isc0dBQUEsU0FBUyxPQUFBO0FBMkJsQiwrRUFBK0U7QUFDL0UsNkJBQTZCO0FBQzdCLCtFQUErRTtBQUUvRTs7O0dBR0c7QUFDSCx5Q0FNcUI7QUFMbkIsMERBQTBEO0FBQzFELDJHQUFBLGNBQWMsT0FBQTtBQUVkLDZFQUE2RTtBQUM3RSwwR0FBQSxhQUFhLE9BQUE7QUFpQmYsK0VBQStFO0FBQy9FLDhEQUE4RDtBQUM5RCwrRUFBK0U7QUFFL0U7Ozs7R0FJRztBQUNILHlDQVdxQjtBQVZuQiwyR0FBQSxjQUFjLE9BQUE7QUFDZCxrSEFBQSxxQkFBcUIsT0FBQTtBQUNyQixpSEFBQSxvQkFBb0IsT0FBQTtBQUNwQiwwSEFBQSw2QkFBNkIsT0FBQTtBQUM3QiwrR0FBQSxrQkFBa0IsT0FBQTtBQUNsQiw2R0FBQSxnQkFBZ0IsT0FBQTtBQUNoQixtSEFBQSxzQkFBc0IsT0FBQTtBQUN0QixnSEFBQSxtQkFBbUIsT0FBQTtBQUNuQiw4R0FBQSxpQkFBaUIsT0FBQTtBQUNqQixrSEFBQSxxQkFBcUIsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2NvcGUgTW9kdWxlIC0gQmFycmVsIEV4cG9ydFxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogVGhpcyBtb2R1bGUgcHJvdmlkZXMgYSBzaW5nbGUgZW50cnkgcG9pbnQgZm9yIGFsbCBzY29wZS1yZWxhdGVkIGV4cG9ydHMuXG4gKiBDb25zdW1lcnMgY2FuIGltcG9ydCBldmVyeXRoaW5nIHRoZXkgbmVlZCBmcm9tIHRoaXMgbG9jYXRpb246XG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGltcG9ydCB7XG4gKiAgIC8vIENvcmUgU2NvcGUgY2xhc3NcbiAqICAgU2NvcGUsXG4gKlxuICogICAvLyBCYXNlU3RhdGUgZm9yIGN1c3RvbSBzY29wZSBjbGFzc2VzXG4gKiAgIEJhc2VTdGF0ZSxcbiAqXG4gKiAgIC8vIFR5cGVzXG4gKiAgIFNjb3BlT3B0aW9ucyxcbiAqICAgU2NvcGVTbmFwc2hvdCxcbiAqICAgUmVjb3JkZXIsXG4gKiAgIFJlY29yZGVyQ29udGV4dCxcbiAqICAgUmVhZEV2ZW50LFxuICogICBXcml0ZUV2ZW50LFxuICogICBDb21taXRFdmVudCxcbiAqICAgRXJyb3JFdmVudCxcbiAqICAgU3RhZ2VFdmVudCxcbiAqXG4gKiAgIC8vIExpYnJhcnktcHJvdmlkZWQgcmVjb3JkZXJzXG4gKiAgIE1ldHJpY1JlY29yZGVyLFxuICogICBEZWJ1Z1JlY29yZGVyLFxuICpcbiAqICAgLy8gUmVjb3JkZXIgdHlwZXNcbiAqICAgU3RhZ2VNZXRyaWNzLFxuICogICBBZ2dyZWdhdGVkTWV0cmljcyxcbiAqICAgRGVidWdWZXJib3NpdHksXG4gKiAgIERlYnVnRW50cnksXG4gKiAgIERlYnVnUmVjb3JkZXJPcHRpb25zLFxuICpcbiAqICAgLy8gUHJvdmlkZXIgc3lzdGVtIChmb3IgcGx1Z2luIGF1dGhvcnMpXG4gKiAgIHRvU2NvcGVGYWN0b3J5LFxuICogICByZWdpc3RlclNjb3BlUmVzb2x2ZXIsXG4gKiB9IGZyb20gJy4vc2NvcGUnO1xuICogYGBgXG4gKlxuICogQG1vZHVsZSBzY29wZVxuICpcbiAqIFJlcXVpcmVtZW50czogNy4xIC0gQWxsIGludGVyZmFjZXMgYW5kIHR5cGVzIGFyZSBleHBvcnRlZCBmb3IgY29uc3VtZXIgdXNlXG4gKi9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ29yZSBTY29wZSBDbGFzc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIFNjb3BlIC0gQ29yZSBydW50aW1lIG1lbW9yeSBjb250YWluZXIgZm9yIHBpcGVsaW5lIGV4ZWN1dGlvbi5cbiAqIFByb3ZpZGVzIGdldFZhbHVlLCBzZXRWYWx1ZSwgdXBkYXRlVmFsdWUsIGFuZCBjb21taXQgb3BlcmF0aW9ucyB3aXRoXG4gKiBuYW1lc3BhY2UgaXNvbGF0aW9uLCB0aW1lLXRyYXZlbCBzdXBwb3J0LCBhbmQgcGx1Z2dhYmxlIHJlY29yZGVycy5cbiAqL1xuZXhwb3J0IHsgU2NvcGUgfSBmcm9tICcuL1Njb3BlJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQmFzZVN0YXRlIC0gQmFzZSBjbGFzcyBmb3IgY3VzdG9tIHNjb3BlIGNsYXNzZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBCYXNlU3RhdGUgLSBCYXNlIGNsYXNzIHRoYXQgbGlicmFyeSBjb25zdW1lcnMgZXh0ZW5kIHRvIGNyZWF0ZSBjdXN0b20gc2NvcGUgY2xhc3Nlcy5cbiAqIFByb3ZpZGVzIGEgY29uc2lzdGVudCBpbnRlcmZhY2UgZm9yIGFjY2Vzc2luZyBwaXBlbGluZSBjb250ZXh0LCBkZWJ1ZyBsb2dnaW5nLFxuICogbWV0cmljcywgYW5kIHN0YXRlIG1hbmFnZW1lbnQuXG4gKi9cbmV4cG9ydCB7IEJhc2VTdGF0ZSB9IGZyb20gJy4vQmFzZVN0YXRlJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHlwZXMgYW5kIEludGVyZmFjZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBSZS1leHBvcnQgYWxsIHR5cGVzIGZyb20gdGhlIHR5cGVzIG1vZHVsZS5cbiAqIFRoZXNlIGluY2x1ZGUgdGhlIFJlY29yZGVyIGludGVyZmFjZSwgZXZlbnQgdHlwZXMsIGFuZCBzY29wZSBjb25maWd1cmF0aW9uIHR5cGVzLlxuICovXG5leHBvcnQgdHlwZSB7XG4gIC8vIFJlY29yZGVyIGludGVyZmFjZSBmb3IgY29uc3VtZXIgaW1wbGVtZW50YXRpb25cbiAgUmVjb3JkZXIsXG5cbiAgLy8gRXZlbnQgdHlwZXMgcGFzc2VkIHRvIHJlY29yZGVyIGhvb2tzXG4gIFJlY29yZGVyQ29udGV4dCxcbiAgUmVhZEV2ZW50LFxuICBXcml0ZUV2ZW50LFxuICBDb21taXRFdmVudCxcbiAgRXJyb3JFdmVudCxcbiAgU3RhZ2VFdmVudCxcblxuICAvLyBTY29wZSBjb25maWd1cmF0aW9uIGFuZCBzdGF0ZSB0eXBlc1xuICBTY29wZU9wdGlvbnMsXG4gIFNjb3BlU25hcHNob3QsXG59IGZyb20gJy4vdHlwZXMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBMaWJyYXJ5LVByb3ZpZGVkIFJlY29yZGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIFJlLWV4cG9ydCBhbGwgcmVjb3JkZXJzIGFuZCB0aGVpciB0eXBlcyBmcm9tIHRoZSByZWNvcmRlcnMgbW9kdWxlLlxuICogVGhpcyBpbmNsdWRlcyBib3RoIHRoZSByZWNvcmRlciBjbGFzc2VzIGFuZCB0aGVpciBhc3NvY2lhdGVkIHR5cGVzLlxuICovXG5leHBvcnQge1xuICAvLyBNZXRyaWNSZWNvcmRlciAtIFByb2R1Y3Rpb24gbW9uaXRvcmluZyAodGltaW5nLCBjb3VudHMpXG4gIE1ldHJpY1JlY29yZGVyLFxuXG4gIC8vIERlYnVnUmVjb3JkZXIgLSBEZXZlbG9wbWVudC9PRSBkZWJ1Z2dpbmcgKGVycm9ycywgbXV0YXRpb25zLCB2ZXJib3NlIGxvZ3MpXG4gIERlYnVnUmVjb3JkZXIsXG59IGZyb20gJy4vcmVjb3JkZXJzJztcblxuLyoqXG4gKiBSZS1leHBvcnQgcmVjb3JkZXItc3BlY2lmaWMgdHlwZXMuXG4gKi9cbmV4cG9ydCB0eXBlIHtcbiAgLy8gTWV0cmljUmVjb3JkZXIgdHlwZXNcbiAgU3RhZ2VNZXRyaWNzLFxuICBBZ2dyZWdhdGVkTWV0cmljcyxcblxuICAvLyBEZWJ1Z1JlY29yZGVyIHR5cGVzXG4gIERlYnVnVmVyYm9zaXR5LFxuICBEZWJ1Z0VudHJ5LFxuICBEZWJ1Z1JlY29yZGVyT3B0aW9ucyxcbn0gZnJvbSAnLi9yZWNvcmRlcnMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBQcm92aWRlciBTeXN0ZW0gKGZvciBwbHVnaW4gYXV0aG9ycyBhbmQgYWR2YW5jZWQgdXNlIGNhc2VzKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIFJlLWV4cG9ydCBwcm92aWRlciBzeXN0ZW0gZm9yIHBsdWdpbiBhdXRob3JzLlxuICogLSB0b1Njb3BlRmFjdG9yeTogQ29udmVydCBhcmJpdHJhcnkgaW5wdXRzIHRvIFNjb3BlRmFjdG9yeVxuICogLSByZWdpc3RlclNjb3BlUmVzb2x2ZXI6IFJlZ2lzdGVyIGN1c3RvbSByZXNvbHZlcnNcbiAqL1xuZXhwb3J0IHtcbiAgdG9TY29wZUZhY3RvcnksXG4gIHJlZ2lzdGVyU2NvcGVSZXNvbHZlcixcbiAgcmVzb2x2ZVNjb3BlUHJvdmlkZXIsXG4gIF9fY2xlYXJTY29wZVJlc29sdmVyc0ZvclRlc3RzLFxuICBsb29rc0xpa2VDbGFzc0N0b3IsXG4gIGxvb2tzTGlrZUZhY3RvcnksXG4gIGlzU3ViY2xhc3NPZlN0YXRlU2NvcGUsXG4gIG1ha2VGYWN0b3J5UHJvdmlkZXIsXG4gIG1ha2VDbGFzc1Byb3ZpZGVyLFxuICBhdHRhY2hCYXNlU3RhdGVDb21wYXQsXG59IGZyb20gJy4vcHJvdmlkZXJzJztcblxuLyoqXG4gKiBSZS1leHBvcnQgcHJvdmlkZXIgdHlwZXMuXG4gKi9cbmV4cG9ydCB0eXBlIHtcbiAgU3RhZ2VDb250ZXh0TGlrZSxcbiAgU2NvcGVGYWN0b3J5LFxuICBTY29wZVByb3ZpZGVyLFxuICBQcm92aWRlclJlc29sdmVyLFxuICBTdHJpY3RNb2RlLFxuICBSZXNvbHZlT3B0aW9ucyxcbn0gZnJvbSAnLi9wcm92aWRlcnMnO1xuIl19