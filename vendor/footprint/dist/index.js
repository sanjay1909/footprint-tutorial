"use strict";
/**
 * TreeOfFunctionsLib - Public API
 *
 * WHY: This file defines the public interface for library consumers.
 * Internal implementation details are not exported.
 *
 * LAYER STRUCTURE:
 * - core/: Public API (builder, memory, executor)
 * - internal/: Library internals (not exported here)
 * - scope/: Consumer extensibility (BaseState, recorders, providers)
 * - utils/: Shared utilities (not exported here)
 *
 * Main entry points:
 * - flowChart(): D3-style factory function for building flowcharts (recommended)
 * - FlowChartBuilder: DSL class for building flow charts
 * - FlowChartExecutor: Runtime execution engine
 * - FlowChart: Type representing a compiled flowchart
 * - BaseState: Base class for custom scope implementations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createErrorMessage = exports.createProtectedScope = exports.applyOutputMapping = exports.seedSubflowGlobalStore = exports.getInitialScopeValues = exports.extractParentScopeValues = exports.isStageNodeReturn = exports.Pipeline = exports.FlowChartExecutor = exports.ExecutionHistory = exports.WriteBuffer = exports.StageMetadata = exports.GlobalStore = exports.PipelineRuntime = exports.StageContext = exports.BaseState = exports.specToStageNode = exports.SelectorList = exports.DeciderList = exports.flowChart = exports.FlowChartBuilder = void 0;
// ============================================================================
// FlowChartBuilder - Primary API for building flows
// ============================================================================
var builder_1 = require("./core/builder");
Object.defineProperty(exports, "FlowChartBuilder", { enumerable: true, get: function () { return builder_1.FlowChartBuilder; } });
// D3-style factory function (recommended entry point)
Object.defineProperty(exports, "flowChart", { enumerable: true, get: function () { return builder_1.flowChart; } });
// Fluent helpers returned by builder methods
Object.defineProperty(exports, "DeciderList", { enumerable: true, get: function () { return builder_1.DeciderList; } });
Object.defineProperty(exports, "SelectorList", { enumerable: true, get: function () { return builder_1.SelectorList; } });
// Utility for BE to convert spec back to StageNode
Object.defineProperty(exports, "specToStageNode", { enumerable: true, get: function () { return builder_1.specToStageNode; } });
// ============================================================================
// Scope - Base class for custom scope implementations
// ============================================================================
var BaseState_1 = require("./scope/BaseState");
Object.defineProperty(exports, "BaseState", { enumerable: true, get: function () { return BaseState_1.BaseState; } });
// ============================================================================
// Context - Runtime execution context classes (from core/memory)
// ============================================================================
// StageContext: Per-stage execution context
var StageContext_1 = require("./core/memory/StageContext");
Object.defineProperty(exports, "StageContext", { enumerable: true, get: function () { return StageContext_1.StageContext; } });
// PipelineRuntime: Top-level runtime that manages the execution tree
var PipelineRuntime_1 = require("./core/memory/PipelineRuntime");
Object.defineProperty(exports, "PipelineRuntime", { enumerable: true, get: function () { return PipelineRuntime_1.PipelineRuntime; } });
// GlobalStore: Shared state across all stages
var GlobalStore_1 = require("./core/memory/GlobalStore");
Object.defineProperty(exports, "GlobalStore", { enumerable: true, get: function () { return GlobalStore_1.GlobalStore; } });
// StageMetadata: Debug/error info for a stage
var StageMetadata_1 = require("./core/memory/StageMetadata");
Object.defineProperty(exports, "StageMetadata", { enumerable: true, get: function () { return StageMetadata_1.StageMetadata; } });
// ============================================================================
// State Management - Write buffer and execution history (from internal/)
// ============================================================================
// WriteBuffer: Buffered writes before commit
var WriteBuffer_1 = require("./internal/memory/WriteBuffer");
Object.defineProperty(exports, "WriteBuffer", { enumerable: true, get: function () { return WriteBuffer_1.WriteBuffer; } });
// ExecutionHistory: Committed state history
var ExecutionHistory_1 = require("./internal/history/ExecutionHistory");
Object.defineProperty(exports, "ExecutionHistory", { enumerable: true, get: function () { return ExecutionHistory_1.ExecutionHistory; } });
// ============================================================================
// FlowChartExecutor - Runtime execution engine (recommended)
// ============================================================================
var FlowChartExecutor_1 = require("./core/executor/FlowChartExecutor");
Object.defineProperty(exports, "FlowChartExecutor", { enumerable: true, get: function () { return FlowChartExecutor_1.FlowChartExecutor; } });
// ============================================================================
// Pipeline - Legacy runtime execution engine (use FlowChartExecutor instead)
// ============================================================================
var Pipeline_1 = require("./core/executor/Pipeline");
Object.defineProperty(exports, "Pipeline", { enumerable: true, get: function () { return Pipeline_1.Pipeline; } });
Object.defineProperty(exports, "isStageNodeReturn", { enumerable: true, get: function () { return Pipeline_1.isStageNodeReturn; } });
// SubflowInputMapper helpers for advanced use cases
var SubflowInputMapper_1 = require("./core/executor/handlers/SubflowInputMapper");
Object.defineProperty(exports, "extractParentScopeValues", { enumerable: true, get: function () { return SubflowInputMapper_1.extractParentScopeValues; } });
Object.defineProperty(exports, "getInitialScopeValues", { enumerable: true, get: function () { return SubflowInputMapper_1.getInitialScopeValues; } });
Object.defineProperty(exports, "seedSubflowGlobalStore", { enumerable: true, get: function () { return SubflowInputMapper_1.seedSubflowGlobalStore; } });
Object.defineProperty(exports, "applyOutputMapping", { enumerable: true, get: function () { return SubflowInputMapper_1.applyOutputMapping; } });
// ============================================================================
// Scope Protection - Prevents direct property assignment on scope objects
// ============================================================================
var protection_1 = require("./scope/protection");
Object.defineProperty(exports, "createProtectedScope", { enumerable: true, get: function () { return protection_1.createProtectedScope; } });
Object.defineProperty(exports, "createErrorMessage", { enumerable: true, get: function () { return protection_1.createErrorMessage; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FrQkc7OztBQUVILCtFQUErRTtBQUMvRSxvREFBb0Q7QUFDcEQsK0VBQStFO0FBRS9FLDBDQVN3QjtBQVJ0QiwyR0FBQSxnQkFBZ0IsT0FBQTtBQUNoQixzREFBc0Q7QUFDdEQsb0dBQUEsU0FBUyxPQUFBO0FBQ1QsNkNBQTZDO0FBQzdDLHNHQUFBLFdBQVcsT0FBQTtBQUNYLHVHQUFBLFlBQVksT0FBQTtBQUNaLG1EQUFtRDtBQUNuRCwwR0FBQSxlQUFlLE9BQUE7QUFzQmpCLCtFQUErRTtBQUMvRSxzREFBc0Q7QUFDdEQsK0VBQStFO0FBRS9FLCtDQUE4QztBQUFyQyxzR0FBQSxTQUFTLE9BQUE7QUFTbEIsK0VBQStFO0FBQy9FLGlFQUFpRTtBQUNqRSwrRUFBK0U7QUFFL0UsNENBQTRDO0FBQzVDLDJEQUEwRDtBQUFqRCw0R0FBQSxZQUFZLE9BQUE7QUFFckIscUVBQXFFO0FBQ3JFLGlFQUFnRTtBQUF2RCxrSEFBQSxlQUFlLE9BQUE7QUFHeEIsOENBQThDO0FBQzlDLHlEQUF3RDtBQUEvQywwR0FBQSxXQUFXLE9BQUE7QUFFcEIsOENBQThDO0FBQzlDLDZEQUE0RDtBQUFuRCw4R0FBQSxhQUFhLE9BQUE7QUFFdEIsK0VBQStFO0FBQy9FLHlFQUF5RTtBQUN6RSwrRUFBK0U7QUFFL0UsNkNBQTZDO0FBQzdDLDZEQUE0RDtBQUFuRCwwR0FBQSxXQUFXLE9BQUE7QUFHcEIsNENBQTRDO0FBQzVDLHdFQUF1RTtBQUE5RCxvSEFBQSxnQkFBZ0IsT0FBQTtBQUd6QiwrRUFBK0U7QUFDL0UsNkRBQTZEO0FBQzdELCtFQUErRTtBQUUvRSx1RUFFMkM7QUFEekMsc0hBQUEsaUJBQWlCLE9BQUE7QUFNbkIsK0VBQStFO0FBQy9FLDZFQUE2RTtBQUM3RSwrRUFBK0U7QUFFL0UscURBR2tDO0FBRmhDLG9HQUFBLFFBQVEsT0FBQTtBQUNSLDZHQUFBLGlCQUFpQixPQUFBO0FBdUNuQixvREFBb0Q7QUFDcEQsa0ZBS3FEO0FBSm5ELDhIQUFBLHdCQUF3QixPQUFBO0FBQ3hCLDJIQUFBLHFCQUFxQixPQUFBO0FBQ3JCLDRIQUFBLHNCQUFzQixPQUFBO0FBQ3RCLHdIQUFBLGtCQUFrQixPQUFBO0FBR3BCLCtFQUErRTtBQUMvRSwwRUFBMEU7QUFDMUUsK0VBQStFO0FBRS9FLGlEQUc0QjtBQUYxQixrSEFBQSxvQkFBb0IsT0FBQTtBQUNwQixnSEFBQSxrQkFBa0IsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVHJlZU9mRnVuY3Rpb25zTGliIC0gUHVibGljIEFQSVxuICogXG4gKiBXSFk6IFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBwdWJsaWMgaW50ZXJmYWNlIGZvciBsaWJyYXJ5IGNvbnN1bWVycy5cbiAqIEludGVybmFsIGltcGxlbWVudGF0aW9uIGRldGFpbHMgYXJlIG5vdCBleHBvcnRlZC5cbiAqIFxuICogTEFZRVIgU1RSVUNUVVJFOlxuICogLSBjb3JlLzogUHVibGljIEFQSSAoYnVpbGRlciwgbWVtb3J5LCBleGVjdXRvcilcbiAqIC0gaW50ZXJuYWwvOiBMaWJyYXJ5IGludGVybmFscyAobm90IGV4cG9ydGVkIGhlcmUpXG4gKiAtIHNjb3BlLzogQ29uc3VtZXIgZXh0ZW5zaWJpbGl0eSAoQmFzZVN0YXRlLCByZWNvcmRlcnMsIHByb3ZpZGVycylcbiAqIC0gdXRpbHMvOiBTaGFyZWQgdXRpbGl0aWVzIChub3QgZXhwb3J0ZWQgaGVyZSlcbiAqIFxuICogTWFpbiBlbnRyeSBwb2ludHM6XG4gKiAtIGZsb3dDaGFydCgpOiBEMy1zdHlsZSBmYWN0b3J5IGZ1bmN0aW9uIGZvciBidWlsZGluZyBmbG93Y2hhcnRzIChyZWNvbW1lbmRlZClcbiAqIC0gRmxvd0NoYXJ0QnVpbGRlcjogRFNMIGNsYXNzIGZvciBidWlsZGluZyBmbG93IGNoYXJ0c1xuICogLSBGbG93Q2hhcnRFeGVjdXRvcjogUnVudGltZSBleGVjdXRpb24gZW5naW5lXG4gKiAtIEZsb3dDaGFydDogVHlwZSByZXByZXNlbnRpbmcgYSBjb21waWxlZCBmbG93Y2hhcnRcbiAqIC0gQmFzZVN0YXRlOiBCYXNlIGNsYXNzIGZvciBjdXN0b20gc2NvcGUgaW1wbGVtZW50YXRpb25zXG4gKi9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRmxvd0NoYXJ0QnVpbGRlciAtIFByaW1hcnkgQVBJIGZvciBidWlsZGluZyBmbG93c1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgeyBcbiAgRmxvd0NoYXJ0QnVpbGRlcixcbiAgLy8gRDMtc3R5bGUgZmFjdG9yeSBmdW5jdGlvbiAocmVjb21tZW5kZWQgZW50cnkgcG9pbnQpXG4gIGZsb3dDaGFydCxcbiAgLy8gRmx1ZW50IGhlbHBlcnMgcmV0dXJuZWQgYnkgYnVpbGRlciBtZXRob2RzXG4gIERlY2lkZXJMaXN0LFxuICBTZWxlY3Rvckxpc3QsXG4gIC8vIFV0aWxpdHkgZm9yIEJFIHRvIGNvbnZlcnQgc3BlYyBiYWNrIHRvIFN0YWdlTm9kZVxuICBzcGVjVG9TdGFnZU5vZGUsXG59IGZyb20gJy4vY29yZS9idWlsZGVyJztcblxuZXhwb3J0IHR5cGUge1xuICAvLyBUeXBlcyBmb3IgZmxvdyBkZWZpbml0aW9uXG4gIEZsb3dDaGFydFNwZWMsXG4gIFN0YWdlRm4sXG4gIFBhcmFsbGVsU3BlYyxcbiAgQnJhbmNoQm9keSxcbiAgQnJhbmNoU3BlYyxcbiAgLy8gRmxvd0NoYXJ0IHR5cGUgKHJlbmFtZWQgZnJvbSBCdWlsdEZsb3cpXG4gIEZsb3dDaGFydCxcbiAgLy8gTGVnYWN5IGFsaWFzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gIEJ1aWx0RmxvdyxcbiAgRXhlY09wdGlvbnMsXG4gIC8vIEJ1aWxkLXRpbWUgZXh0cmFjdG9yIHR5cGVzIGZvciBjdXN0b21pemluZyB0b1NwZWMoKSBvdXRwdXRcbiAgQnVpbGRUaW1lTm9kZU1ldGFkYXRhLFxuICBCdWlsZFRpbWVFeHRyYWN0b3IsXG4gIC8vIFNlcmlhbGl6ZWQgc3RydWN0dXJlIGZvciBmcm9udGVuZCBjb25zdW1wdGlvblxuICBTZXJpYWxpemVkUGlwZWxpbmVTdHJ1Y3R1cmUsXG59IGZyb20gJy4vY29yZS9idWlsZGVyJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU2NvcGUgLSBCYXNlIGNsYXNzIGZvciBjdXN0b20gc2NvcGUgaW1wbGVtZW50YXRpb25zXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCB7IEJhc2VTdGF0ZSB9IGZyb20gJy4vc2NvcGUvQmFzZVN0YXRlJztcblxuZXhwb3J0IHR5cGUgeyBcbiAgU3RhZ2VDb250ZXh0TGlrZSwgXG4gIFNjb3BlRmFjdG9yeSwgXG4gIFNjb3BlUHJvdmlkZXIsIFxuICBQcm92aWRlclJlc29sdmVyLFxufSBmcm9tICcuL3Njb3BlL3Byb3ZpZGVycy90eXBlcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIENvbnRleHQgLSBSdW50aW1lIGV4ZWN1dGlvbiBjb250ZXh0IGNsYXNzZXMgKGZyb20gY29yZS9tZW1vcnkpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vIFN0YWdlQ29udGV4dDogUGVyLXN0YWdlIGV4ZWN1dGlvbiBjb250ZXh0XG5leHBvcnQgeyBTdGFnZUNvbnRleHQgfSBmcm9tICcuL2NvcmUvbWVtb3J5L1N0YWdlQ29udGV4dCc7XG5cbi8vIFBpcGVsaW5lUnVudGltZTogVG9wLWxldmVsIHJ1bnRpbWUgdGhhdCBtYW5hZ2VzIHRoZSBleGVjdXRpb24gdHJlZVxuZXhwb3J0IHsgUGlwZWxpbmVSdW50aW1lIH0gZnJvbSAnLi9jb3JlL21lbW9yeS9QaXBlbGluZVJ1bnRpbWUnO1xuZXhwb3J0IHR5cGUgeyBSdW50aW1lU25hcHNob3QsIE5hcnJhdGl2ZUVudHJ5IH0gZnJvbSAnLi9jb3JlL21lbW9yeS9QaXBlbGluZVJ1bnRpbWUnO1xuXG4vLyBHbG9iYWxTdG9yZTogU2hhcmVkIHN0YXRlIGFjcm9zcyBhbGwgc3RhZ2VzXG5leHBvcnQgeyBHbG9iYWxTdG9yZSB9IGZyb20gJy4vY29yZS9tZW1vcnkvR2xvYmFsU3RvcmUnO1xuXG4vLyBTdGFnZU1ldGFkYXRhOiBEZWJ1Zy9lcnJvciBpbmZvIGZvciBhIHN0YWdlXG5leHBvcnQgeyBTdGFnZU1ldGFkYXRhIH0gZnJvbSAnLi9jb3JlL21lbW9yeS9TdGFnZU1ldGFkYXRhJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU3RhdGUgTWFuYWdlbWVudCAtIFdyaXRlIGJ1ZmZlciBhbmQgZXhlY3V0aW9uIGhpc3RvcnkgKGZyb20gaW50ZXJuYWwvKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyBXcml0ZUJ1ZmZlcjogQnVmZmVyZWQgd3JpdGVzIGJlZm9yZSBjb21taXRcbmV4cG9ydCB7IFdyaXRlQnVmZmVyIH0gZnJvbSAnLi9pbnRlcm5hbC9tZW1vcnkvV3JpdGVCdWZmZXInO1xuZXhwb3J0IHR5cGUgeyBNZW1vcnlQYXRjaCB9IGZyb20gJy4vaW50ZXJuYWwvbWVtb3J5L1dyaXRlQnVmZmVyJztcblxuLy8gRXhlY3V0aW9uSGlzdG9yeTogQ29tbWl0dGVkIHN0YXRlIGhpc3RvcnlcbmV4cG9ydCB7IEV4ZWN1dGlvbkhpc3RvcnkgfSBmcm9tICcuL2ludGVybmFsL2hpc3RvcnkvRXhlY3V0aW9uSGlzdG9yeSc7XG5leHBvcnQgdHlwZSB7IENvbW1pdEJ1bmRsZSwgVHJhY2VJdGVtIH0gZnJvbSAnLi9pbnRlcm5hbC9oaXN0b3J5L0V4ZWN1dGlvbkhpc3RvcnknO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGbG93Q2hhcnRFeGVjdXRvciAtIFJ1bnRpbWUgZXhlY3V0aW9uIGVuZ2luZSAocmVjb21tZW5kZWQpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCB7IFxuICBGbG93Q2hhcnRFeGVjdXRvcixcbn0gZnJvbSAnLi9jb3JlL2V4ZWN1dG9yL0Zsb3dDaGFydEV4ZWN1dG9yJztcblxuLy8gUmUtZXhwb3J0IEZsb3dDaGFydCB0eXBlIGZyb20gZXhlY3V0b3IgbW9kdWxlIGFzIHdlbGwgKGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5KVxuZXhwb3J0IHR5cGUgeyBGbG93Q2hhcnQgYXMgRXhlY3V0b3JGbG93Q2hhcnQgfSBmcm9tICcuL2NvcmUvYnVpbGRlcic7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFBpcGVsaW5lIC0gTGVnYWN5IHJ1bnRpbWUgZXhlY3V0aW9uIGVuZ2luZSAodXNlIEZsb3dDaGFydEV4ZWN1dG9yIGluc3RlYWQpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCB7IFxuICBQaXBlbGluZSwgXG4gIGlzU3RhZ2VOb2RlUmV0dXJuLFxufSBmcm9tICcuL2NvcmUvZXhlY3V0b3IvUGlwZWxpbmUnO1xuXG5leHBvcnQgdHlwZSB7XG4gIFNlbGVjdG9yLCBcbiAgRGVjaWRlciwgXG4gIFN0YWdlTm9kZSwgXG59IGZyb20gJy4vY29yZS9leGVjdXRvci9QaXBlbGluZSc7XG5cbi8vIFJlLWV4cG9ydCBTZWxlY3RvciBhcyBGbG93Q2hhcnRTZWxlY3RvciBmb3IgY29uc3VtZXJzIHdobyBuZWVkIGl0XG5leHBvcnQgdHlwZSB7IFNlbGVjdG9yIGFzIEZsb3dDaGFydFNlbGVjdG9yIH0gZnJvbSAnLi9jb3JlL2V4ZWN1dG9yL1BpcGVsaW5lJztcblxuLy8gUGlwZWxpbmUgdHlwZXMgZm9yIGNvbnN1bWVyc1xuZXhwb3J0IHR5cGUgeyBcbiAgU3ViZmxvd1Jlc3VsdCxcbiAgU2VyaWFsaXplZFBpcGVsaW5lTm9kZSxcbiAgU3RhZ2VTbmFwc2hvdCBhcyBQaXBlbGluZVN0YWdlU25hcHNob3QsXG4gIFJ1bnRpbWVTdHJ1Y3R1cmVNZXRhZGF0YSxcbiAgVHJhdmVyc2FsRXh0cmFjdG9yLFxuICBFeHRyYWN0b3JFcnJvcixcbiAgUGlwZWxpbmVTdGFnZUZ1bmN0aW9uLFxuICBTdHJlYW1DYWxsYmFjayxcbiAgU3RyZWFtVG9rZW5IYW5kbGVyLFxuICBTdHJlYW1MaWZlY3ljbGVIYW5kbGVyLFxuICBTdHJlYW1IYW5kbGVycyxcbiAgVHJlZU9mRnVuY3Rpb25zUmVzcG9uc2UsXG4gIFBpcGVsaW5lUmVzcG9uc2UsXG4gIFBpcGVsaW5lUmVzcG9uc2VzLFxuICBOb2RlUmVzdWx0VHlwZSxcbiAgLy8gRmxvdyBjb250cm9sIG5hcnJhdGl2ZSB0eXBlc1xuICBGbG93Q29udHJvbFR5cGUsXG4gIEZsb3dNZXNzYWdlLFxuICAvLyBTdWJmbG93IGlucHV0IG1hcHBpbmcgdHlwZXNcbiAgU3ViZmxvd01vdW50T3B0aW9ucyxcbn0gZnJvbSAnLi9jb3JlL2V4ZWN1dG9yL3R5cGVzJztcblxuLy8gU3RhZ2VTbmFwc2hvdCB0eXBlIGZyb20gU3RhZ2VDb250ZXh0IChkaWZmZXJlbnQgZnJvbSBQaXBlbGluZVN0YWdlU25hcHNob3QpXG5leHBvcnQgdHlwZSB7IFN0YWdlU25hcHNob3QgfSBmcm9tICcuL2NvcmUvbWVtb3J5L1N0YWdlQ29udGV4dCc7XG5cbi8vIFN1YmZsb3dJbnB1dE1hcHBlciBoZWxwZXJzIGZvciBhZHZhbmNlZCB1c2UgY2FzZXNcbmV4cG9ydCB7XG4gIGV4dHJhY3RQYXJlbnRTY29wZVZhbHVlcyxcbiAgZ2V0SW5pdGlhbFNjb3BlVmFsdWVzLFxuICBzZWVkU3ViZmxvd0dsb2JhbFN0b3JlLFxuICBhcHBseU91dHB1dE1hcHBpbmcsXG59IGZyb20gJy4vY29yZS9leGVjdXRvci9oYW5kbGVycy9TdWJmbG93SW5wdXRNYXBwZXInO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTY29wZSBQcm90ZWN0aW9uIC0gUHJldmVudHMgZGlyZWN0IHByb3BlcnR5IGFzc2lnbm1lbnQgb24gc2NvcGUgb2JqZWN0c1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQge1xuICBjcmVhdGVQcm90ZWN0ZWRTY29wZSxcbiAgY3JlYXRlRXJyb3JNZXNzYWdlLFxufSBmcm9tICcuL3Njb3BlL3Byb3RlY3Rpb24nO1xuXG5leHBvcnQgdHlwZSB7XG4gIFNjb3BlUHJvdGVjdGlvbk1vZGUsXG4gIFNjb3BlUHJvdGVjdGlvbk9wdGlvbnMsXG59IGZyb20gJy4vc2NvcGUvcHJvdGVjdGlvbic7XG4iXX0=