"use strict";
/**
 * executor/index.ts
 *
 * WHY: Barrel export for the executor module.
 * Provides a single import point for all executor functionality.
 *
 * RESPONSIBILITIES:
 * - Re-export FlowChartExecutor (public API)
 * - Re-export Pipeline (core execution engine)
 * - Re-export all types
 * - Re-export handlers for advanced use cases
 *
 * DESIGN DECISIONS:
 * - FlowChartExecutor is the primary public API
 * - Pipeline is exposed for advanced consumers who need direct access
 * - Types are re-exported for TypeScript consumers
 * - Handlers are re-exported for testing and extension
 *
 * RELATED:
 * - {@link ../index.ts} - Core module barrel that re-exports from here
 * - {@link FlowChartExecutor} - Public API wrapper
 * - {@link Pipeline} - Core execution engine
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullNarrativeGenerator = exports.NarrativeGenerator = exports.isStageNodeReturn = exports.Pipeline = exports.FlowChartExecutor = void 0;
// Public API
var FlowChartExecutor_1 = require("./FlowChartExecutor");
Object.defineProperty(exports, "FlowChartExecutor", { enumerable: true, get: function () { return FlowChartExecutor_1.FlowChartExecutor; } });
// Core execution engine
var Pipeline_1 = require("./Pipeline");
Object.defineProperty(exports, "Pipeline", { enumerable: true, get: function () { return Pipeline_1.Pipeline; } });
Object.defineProperty(exports, "isStageNodeReturn", { enumerable: true, get: function () { return Pipeline_1.isStageNodeReturn; } });
// Types
__exportStar(require("./types"), exports);
// Handlers (for advanced use cases and testing)
__exportStar(require("./handlers"), exports);
// Narrative generation
var narrative_1 = require("./narrative");
Object.defineProperty(exports, "NarrativeGenerator", { enumerable: true, get: function () { return narrative_1.NarrativeGenerator; } });
Object.defineProperty(exports, "NullNarrativeGenerator", { enumerable: true, get: function () { return narrative_1.NullNarrativeGenerator; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsYUFBYTtBQUNiLHlEQUF3RDtBQUEvQyxzSEFBQSxpQkFBaUIsT0FBQTtBQUUxQix3QkFBd0I7QUFDeEIsdUNBQXlEO0FBQWhELG9HQUFBLFFBQVEsT0FBQTtBQUFFLDZHQUFBLGlCQUFpQixPQUFBO0FBR3BDLFFBQVE7QUFDUiwwQ0FBd0I7QUFFeEIsZ0RBQWdEO0FBQ2hELDZDQUEyQjtBQUUzQix1QkFBdUI7QUFDdkIseUNBQThGO0FBQWhFLCtHQUFBLGtCQUFrQixPQUFBO0FBQUUsbUhBQUEsc0JBQXNCLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGV4ZWN1dG9yL2luZGV4LnRzXG4gKlxuICogV0hZOiBCYXJyZWwgZXhwb3J0IGZvciB0aGUgZXhlY3V0b3IgbW9kdWxlLlxuICogUHJvdmlkZXMgYSBzaW5nbGUgaW1wb3J0IHBvaW50IGZvciBhbGwgZXhlY3V0b3IgZnVuY3Rpb25hbGl0eS5cbiAqXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBSZS1leHBvcnQgRmxvd0NoYXJ0RXhlY3V0b3IgKHB1YmxpYyBBUEkpXG4gKiAtIFJlLWV4cG9ydCBQaXBlbGluZSAoY29yZSBleGVjdXRpb24gZW5naW5lKVxuICogLSBSZS1leHBvcnQgYWxsIHR5cGVzXG4gKiAtIFJlLWV4cG9ydCBoYW5kbGVycyBmb3IgYWR2YW5jZWQgdXNlIGNhc2VzXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gRmxvd0NoYXJ0RXhlY3V0b3IgaXMgdGhlIHByaW1hcnkgcHVibGljIEFQSVxuICogLSBQaXBlbGluZSBpcyBleHBvc2VkIGZvciBhZHZhbmNlZCBjb25zdW1lcnMgd2hvIG5lZWQgZGlyZWN0IGFjY2Vzc1xuICogLSBUeXBlcyBhcmUgcmUtZXhwb3J0ZWQgZm9yIFR5cGVTY3JpcHQgY29uc3VtZXJzXG4gKiAtIEhhbmRsZXJzIGFyZSByZS1leHBvcnRlZCBmb3IgdGVzdGluZyBhbmQgZXh0ZW5zaW9uXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIC4uL2luZGV4LnRzfSAtIENvcmUgbW9kdWxlIGJhcnJlbCB0aGF0IHJlLWV4cG9ydHMgZnJvbSBoZXJlXG4gKiAtIHtAbGluayBGbG93Q2hhcnRFeGVjdXRvcn0gLSBQdWJsaWMgQVBJIHdyYXBwZXJcbiAqIC0ge0BsaW5rIFBpcGVsaW5lfSAtIENvcmUgZXhlY3V0aW9uIGVuZ2luZVxuICovXG5cbi8vIFB1YmxpYyBBUElcbmV4cG9ydCB7IEZsb3dDaGFydEV4ZWN1dG9yIH0gZnJvbSAnLi9GbG93Q2hhcnRFeGVjdXRvcic7XG5cbi8vIENvcmUgZXhlY3V0aW9uIGVuZ2luZVxuZXhwb3J0IHsgUGlwZWxpbmUsIGlzU3RhZ2VOb2RlUmV0dXJuIH0gZnJvbSAnLi9QaXBlbGluZSc7XG5leHBvcnQgdHlwZSB7IFN0YWdlTm9kZSwgRGVjaWRlciwgU2VsZWN0b3IgfSBmcm9tICcuL1BpcGVsaW5lJztcblxuLy8gVHlwZXNcbmV4cG9ydCAqIGZyb20gJy4vdHlwZXMnO1xuXG4vLyBIYW5kbGVycyAoZm9yIGFkdmFuY2VkIHVzZSBjYXNlcyBhbmQgdGVzdGluZylcbmV4cG9ydCAqIGZyb20gJy4vaGFuZGxlcnMnO1xuXG4vLyBOYXJyYXRpdmUgZ2VuZXJhdGlvblxuZXhwb3J0IHsgSU5hcnJhdGl2ZUdlbmVyYXRvciwgTmFycmF0aXZlR2VuZXJhdG9yLCBOdWxsTmFycmF0aXZlR2VuZXJhdG9yIH0gZnJvbSAnLi9uYXJyYXRpdmUnO1xuIl19