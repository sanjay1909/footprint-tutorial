"use strict";
/**
 * Core Module - Barrel Export
 *
 * WHY: This barrel export provides a single entry point for all core public API
 * exports. The core module contains the primary building blocks for constructing
 * and executing flowchart-based pipelines.
 *
 * LAYER: Public API
 * Consumers should import from this module for all core functionality.
 *
 * SUBMODULES:
 * - builder/: FlowChartBuilder for constructing flowcharts
 * - memory/: StageContext, GlobalStore, PipelineRuntime for state management
 * - executor/: FlowChartExecutor, Pipeline for execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyOutputMapping = exports.seedSubflowGlobalStore = exports.createSubflowPipelineContext = exports.getInitialScopeValues = exports.extractParentScopeValues = exports.DeciderHandler = exports.LoopHandler = exports.SubflowExecutor = exports.ChildrenExecutor = exports.NodeResolver = exports.StageRunner = exports.NullNarrativeGenerator = exports.NarrativeGenerator = exports.isStageNodeReturn = exports.Pipeline = exports.FlowChartExecutor = exports.StageMetadata = exports.PipelineRuntime = exports.GlobalStore = exports.StageContext = exports.specToStageNode = exports.flowChart = exports.SelectorList = exports.DeciderList = exports.FlowChartBuilder = void 0;
// ─────────────────────────── Builder Module ───────────────────────────
var builder_1 = require("./builder");
Object.defineProperty(exports, "FlowChartBuilder", { enumerable: true, get: function () { return builder_1.FlowChartBuilder; } });
Object.defineProperty(exports, "DeciderList", { enumerable: true, get: function () { return builder_1.DeciderList; } });
Object.defineProperty(exports, "SelectorList", { enumerable: true, get: function () { return builder_1.SelectorList; } });
Object.defineProperty(exports, "flowChart", { enumerable: true, get: function () { return builder_1.flowChart; } });
Object.defineProperty(exports, "specToStageNode", { enumerable: true, get: function () { return builder_1.specToStageNode; } });
// ─────────────────────────── Memory Module ───────────────────────────
var memory_1 = require("./memory");
Object.defineProperty(exports, "StageContext", { enumerable: true, get: function () { return memory_1.StageContext; } });
Object.defineProperty(exports, "GlobalStore", { enumerable: true, get: function () { return memory_1.GlobalStore; } });
Object.defineProperty(exports, "PipelineRuntime", { enumerable: true, get: function () { return memory_1.PipelineRuntime; } });
Object.defineProperty(exports, "StageMetadata", { enumerable: true, get: function () { return memory_1.StageMetadata; } });
// ─────────────────────────── Executor Module ───────────────────────────
var executor_1 = require("./executor");
Object.defineProperty(exports, "FlowChartExecutor", { enumerable: true, get: function () { return executor_1.FlowChartExecutor; } });
Object.defineProperty(exports, "Pipeline", { enumerable: true, get: function () { return executor_1.Pipeline; } });
Object.defineProperty(exports, "isStageNodeReturn", { enumerable: true, get: function () { return executor_1.isStageNodeReturn; } });
// Narrative generation
var executor_2 = require("./executor");
Object.defineProperty(exports, "NarrativeGenerator", { enumerable: true, get: function () { return executor_2.NarrativeGenerator; } });
Object.defineProperty(exports, "NullNarrativeGenerator", { enumerable: true, get: function () { return executor_2.NullNarrativeGenerator; } });
// Re-export handlers for advanced use cases
var handlers_1 = require("./executor/handlers");
Object.defineProperty(exports, "StageRunner", { enumerable: true, get: function () { return handlers_1.StageRunner; } });
Object.defineProperty(exports, "NodeResolver", { enumerable: true, get: function () { return handlers_1.NodeResolver; } });
Object.defineProperty(exports, "ChildrenExecutor", { enumerable: true, get: function () { return handlers_1.ChildrenExecutor; } });
Object.defineProperty(exports, "SubflowExecutor", { enumerable: true, get: function () { return handlers_1.SubflowExecutor; } });
Object.defineProperty(exports, "LoopHandler", { enumerable: true, get: function () { return handlers_1.LoopHandler; } });
Object.defineProperty(exports, "DeciderHandler", { enumerable: true, get: function () { return handlers_1.DeciderHandler; } });
// SubflowInputMapper functions
Object.defineProperty(exports, "extractParentScopeValues", { enumerable: true, get: function () { return handlers_1.extractParentScopeValues; } });
Object.defineProperty(exports, "getInitialScopeValues", { enumerable: true, get: function () { return handlers_1.getInitialScopeValues; } });
Object.defineProperty(exports, "createSubflowPipelineContext", { enumerable: true, get: function () { return handlers_1.createSubflowPipelineContext; } });
Object.defineProperty(exports, "seedSubflowGlobalStore", { enumerable: true, get: function () { return handlers_1.seedSubflowGlobalStore; } });
Object.defineProperty(exports, "applyOutputMapping", { enumerable: true, get: function () { return handlers_1.applyOutputMapping; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29yZS9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7O0dBY0c7OztBQUVILHlFQUF5RTtBQUN6RSxxQ0FNbUI7QUFMakIsMkdBQUEsZ0JBQWdCLE9BQUE7QUFDaEIsc0dBQUEsV0FBVyxPQUFBO0FBQ1gsdUdBQUEsWUFBWSxPQUFBO0FBQ1osb0dBQUEsU0FBUyxPQUFBO0FBQ1QsMEdBQUEsZUFBZSxPQUFBO0FBbUJqQix3RUFBd0U7QUFDeEUsbUNBS2tCO0FBSmhCLHNHQUFBLFlBQVksT0FBQTtBQUNaLHFHQUFBLFdBQVcsT0FBQTtBQUNYLHlHQUFBLGVBQWUsT0FBQTtBQUNmLHVHQUFBLGFBQWEsT0FBQTtBQVFmLDBFQUEwRTtBQUMxRSx1Q0FJb0I7QUFIbEIsNkdBQUEsaUJBQWlCLE9BQUE7QUFDakIsb0dBQUEsUUFBUSxPQUFBO0FBQ1IsNkdBQUEsaUJBQWlCLE9BQUE7QUF5Qm5CLHVCQUF1QjtBQUN2Qix1Q0FHb0I7QUFGbEIsOEdBQUEsa0JBQWtCLE9BQUE7QUFDbEIsa0hBQUEsc0JBQXNCLE9BQUE7QUFPeEIsNENBQTRDO0FBQzVDLGdEQWE2QjtBQVozQix1R0FBQSxXQUFXLE9BQUE7QUFDWCx3R0FBQSxZQUFZLE9BQUE7QUFDWiw0R0FBQSxnQkFBZ0IsT0FBQTtBQUNoQiwyR0FBQSxlQUFlLE9BQUE7QUFDZix1R0FBQSxXQUFXLE9BQUE7QUFDWCwwR0FBQSxjQUFjLE9BQUE7QUFDZCwrQkFBK0I7QUFDL0Isb0hBQUEsd0JBQXdCLE9BQUE7QUFDeEIsaUhBQUEscUJBQXFCLE9BQUE7QUFDckIsd0hBQUEsNEJBQTRCLE9BQUE7QUFDNUIsa0hBQUEsc0JBQXNCLE9BQUE7QUFDdEIsOEdBQUEsa0JBQWtCLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvcmUgTW9kdWxlIC0gQmFycmVsIEV4cG9ydFxuICpcbiAqIFdIWTogVGhpcyBiYXJyZWwgZXhwb3J0IHByb3ZpZGVzIGEgc2luZ2xlIGVudHJ5IHBvaW50IGZvciBhbGwgY29yZSBwdWJsaWMgQVBJXG4gKiBleHBvcnRzLiBUaGUgY29yZSBtb2R1bGUgY29udGFpbnMgdGhlIHByaW1hcnkgYnVpbGRpbmcgYmxvY2tzIGZvciBjb25zdHJ1Y3RpbmdcbiAqIGFuZCBleGVjdXRpbmcgZmxvd2NoYXJ0LWJhc2VkIHBpcGVsaW5lcy5cbiAqXG4gKiBMQVlFUjogUHVibGljIEFQSVxuICogQ29uc3VtZXJzIHNob3VsZCBpbXBvcnQgZnJvbSB0aGlzIG1vZHVsZSBmb3IgYWxsIGNvcmUgZnVuY3Rpb25hbGl0eS5cbiAqXG4gKiBTVUJNT0RVTEVTOlxuICogLSBidWlsZGVyLzogRmxvd0NoYXJ0QnVpbGRlciBmb3IgY29uc3RydWN0aW5nIGZsb3djaGFydHNcbiAqIC0gbWVtb3J5LzogU3RhZ2VDb250ZXh0LCBHbG9iYWxTdG9yZSwgUGlwZWxpbmVSdW50aW1lIGZvciBzdGF0ZSBtYW5hZ2VtZW50XG4gKiAtIGV4ZWN1dG9yLzogRmxvd0NoYXJ0RXhlY3V0b3IsIFBpcGVsaW5lIGZvciBleGVjdXRpb25cbiAqL1xuXG4vLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgQnVpbGRlciBNb2R1bGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5leHBvcnQge1xuICBGbG93Q2hhcnRCdWlsZGVyLFxuICBEZWNpZGVyTGlzdCxcbiAgU2VsZWN0b3JMaXN0LFxuICBmbG93Q2hhcnQsXG4gIHNwZWNUb1N0YWdlTm9kZSxcbn0gZnJvbSAnLi9idWlsZGVyJztcblxuZXhwb3J0IHR5cGUge1xuICBGbG93Q2hhcnRTcGVjLFxuICBCdWlsZFRpbWVOb2RlTWV0YWRhdGEsXG4gIEJ1aWxkVGltZUV4dHJhY3RvcixcbiAgU2ltcGxpZmllZFBhcmFsbGVsU3BlYyxcbiAgU2VyaWFsaXplZFBpcGVsaW5lU3RydWN0dXJlLFxuICBGbG93Q2hhcnQsXG4gIEV4ZWNPcHRpb25zLFxuICBCdWlsdEZsb3csXG4gIFN0YWdlRm4sXG4gIFBhcmFsbGVsU3BlYyxcbiAgQnJhbmNoQm9keSxcbiAgQnJhbmNoU3BlYyxcbiAgU3ViZmxvd1JlZixcbn0gZnJvbSAnLi9idWlsZGVyJztcblxuLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIE1lbW9yeSBNb2R1bGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5leHBvcnQge1xuICBTdGFnZUNvbnRleHQsXG4gIEdsb2JhbFN0b3JlLFxuICBQaXBlbGluZVJ1bnRpbWUsXG4gIFN0YWdlTWV0YWRhdGEsXG59IGZyb20gJy4vbWVtb3J5JztcblxuZXhwb3J0IHR5cGUge1xuICBTY29wZUZhY3RvcnksXG4gIFJ1bnRpbWVTbmFwc2hvdCxcbn0gZnJvbSAnLi9tZW1vcnknO1xuXG4vLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAgRXhlY3V0b3IgTW9kdWxlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuZXhwb3J0IHtcbiAgRmxvd0NoYXJ0RXhlY3V0b3IsXG4gIFBpcGVsaW5lLFxuICBpc1N0YWdlTm9kZVJldHVybixcbn0gZnJvbSAnLi9leGVjdXRvcic7XG5cbmV4cG9ydCB0eXBlIHtcbiAgU3RhZ2VOb2RlLFxuICBEZWNpZGVyLFxuICBTZWxlY3RvcixcbiAgUGlwZWxpbmVTdGFnZUZ1bmN0aW9uLFxuICBTdHJlYW1IYW5kbGVycyxcbiAgU3RyZWFtVG9rZW5IYW5kbGVyLFxuICBTdHJlYW1MaWZlY3ljbGVIYW5kbGVyLFxuICBUcmVlT2ZGdW5jdGlvbnNSZXNwb25zZSxcbiAgUGlwZWxpbmVSZXNwb25zZSxcbiAgUGlwZWxpbmVSZXNwb25zZXMsXG4gIFN1YmZsb3dSZXN1bHQsXG4gIFJ1bnRpbWVTdHJ1Y3R1cmVNZXRhZGF0YSxcbiAgU3RhZ2VTbmFwc2hvdCxcbiAgVHJhdmVyc2FsRXh0cmFjdG9yLFxuICBFeHRyYWN0b3JFcnJvcixcbiAgU3ViZmxvd01vdW50T3B0aW9ucyxcbiAgUGlwZWxpbmVDb250ZXh0LFxuICBGbG93Q29udHJvbFR5cGUsXG4gIEZsb3dNZXNzYWdlLFxufSBmcm9tICcuL2V4ZWN1dG9yJztcblxuLy8gTmFycmF0aXZlIGdlbmVyYXRpb25cbmV4cG9ydCB7XG4gIE5hcnJhdGl2ZUdlbmVyYXRvcixcbiAgTnVsbE5hcnJhdGl2ZUdlbmVyYXRvcixcbn0gZnJvbSAnLi9leGVjdXRvcic7XG5cbmV4cG9ydCB0eXBlIHtcbiAgSU5hcnJhdGl2ZUdlbmVyYXRvcixcbn0gZnJvbSAnLi9leGVjdXRvcic7XG5cbi8vIFJlLWV4cG9ydCBoYW5kbGVycyBmb3IgYWR2YW5jZWQgdXNlIGNhc2VzXG5leHBvcnQge1xuICBTdGFnZVJ1bm5lcixcbiAgTm9kZVJlc29sdmVyLFxuICBDaGlsZHJlbkV4ZWN1dG9yLFxuICBTdWJmbG93RXhlY3V0b3IsXG4gIExvb3BIYW5kbGVyLFxuICBEZWNpZGVySGFuZGxlcixcbiAgLy8gU3ViZmxvd0lucHV0TWFwcGVyIGZ1bmN0aW9uc1xuICBleHRyYWN0UGFyZW50U2NvcGVWYWx1ZXMsXG4gIGdldEluaXRpYWxTY29wZVZhbHVlcyxcbiAgY3JlYXRlU3ViZmxvd1BpcGVsaW5lQ29udGV4dCxcbiAgc2VlZFN1YmZsb3dHbG9iYWxTdG9yZSxcbiAgYXBwbHlPdXRwdXRNYXBwaW5nLFxufSBmcm9tICcuL2V4ZWN1dG9yL2hhbmRsZXJzJztcbiJdfQ==