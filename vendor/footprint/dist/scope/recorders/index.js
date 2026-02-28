"use strict";
/**
 * Scope Recorders - Barrel Export
 * ----------------------------------------------------------------------------
 * This module provides a single entry point for all recorder-related exports.
 * Consumers can import everything they need from this location:
 *
 * @example
 * ```typescript
 * import {
 *   Recorder,
 *   MetricRecorder,
 *   DebugRecorder,
 *   ReadEvent,
 *   WriteEvent,
 *   CommitEvent,
 *   ErrorEvent,
 *   StageEvent,
 *   RecorderContext,
 * } from './scope/recorders';
 * ```
 *
 * @module scope/recorders
 *
 * Requirements: 7.1 - Recorder interface is exported for consumer implementation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NarrativeRecorder = exports.DebugRecorder = exports.MetricRecorder = void 0;
// ============================================================================
// Library-Provided Recorders
// ============================================================================
/**
 * MetricRecorder - Production-focused recorder for timing and execution counts.
 * Tracks read/write/commit counts per stage and measures stage execution duration.
 */
var MetricRecorder_1 = require("./MetricRecorder");
Object.defineProperty(exports, "MetricRecorder", { enumerable: true, get: function () { return MetricRecorder_1.MetricRecorder; } });
/**
 * DebugRecorder - Development-focused recorder for detailed debugging information.
 * Captures errors, mutations, and verbose logs for troubleshooting.
 */
var DebugRecorder_1 = require("./DebugRecorder");
Object.defineProperty(exports, "DebugRecorder", { enumerable: true, get: function () { return DebugRecorder_1.DebugRecorder; } });
/**
 * NarrativeRecorder - Captures per-stage scope reads/writes for narrative enrichment.
 * Bridges the gap between flow-level narrative (NarrativeGenerator) and data-level detail.
 * Produces structured per-stage data and text sentences that can be merged with
 * NarrativeGenerator output for the full picture: what happened AND what was produced.
 */
var NarrativeRecorder_1 = require("./NarrativeRecorder");
Object.defineProperty(exports, "NarrativeRecorder", { enumerable: true, get: function () { return NarrativeRecorder_1.NarrativeRecorder; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NvcGUvcmVjb3JkZXJzL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBd0JHOzs7QUEyQkgsK0VBQStFO0FBQy9FLDZCQUE2QjtBQUM3QiwrRUFBK0U7QUFFL0U7OztHQUdHO0FBQ0gsbURBQWtEO0FBQXpDLGdIQUFBLGNBQWMsT0FBQTtBQUd2Qjs7O0dBR0c7QUFDSCxpREFBZ0Q7QUFBdkMsOEdBQUEsYUFBYSxPQUFBO0FBR3RCOzs7OztHQUtHO0FBQ0gseURBQXdEO0FBQS9DLHNIQUFBLGlCQUFpQixPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTY29wZSBSZWNvcmRlcnMgLSBCYXJyZWwgRXhwb3J0XG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyBhIHNpbmdsZSBlbnRyeSBwb2ludCBmb3IgYWxsIHJlY29yZGVyLXJlbGF0ZWQgZXhwb3J0cy5cbiAqIENvbnN1bWVycyBjYW4gaW1wb3J0IGV2ZXJ5dGhpbmcgdGhleSBuZWVkIGZyb20gdGhpcyBsb2NhdGlvbjpcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogaW1wb3J0IHtcbiAqICAgUmVjb3JkZXIsXG4gKiAgIE1ldHJpY1JlY29yZGVyLFxuICogICBEZWJ1Z1JlY29yZGVyLFxuICogICBSZWFkRXZlbnQsXG4gKiAgIFdyaXRlRXZlbnQsXG4gKiAgIENvbW1pdEV2ZW50LFxuICogICBFcnJvckV2ZW50LFxuICogICBTdGFnZUV2ZW50LFxuICogICBSZWNvcmRlckNvbnRleHQsXG4gKiB9IGZyb20gJy4vc2NvcGUvcmVjb3JkZXJzJztcbiAqIGBgYFxuICpcbiAqIEBtb2R1bGUgc2NvcGUvcmVjb3JkZXJzXG4gKlxuICogUmVxdWlyZW1lbnRzOiA3LjEgLSBSZWNvcmRlciBpbnRlcmZhY2UgaXMgZXhwb3J0ZWQgZm9yIGNvbnN1bWVyIGltcGxlbWVudGF0aW9uXG4gKi9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVjb3JkZXIgSW50ZXJmYWNlIGFuZCBFdmVudCBUeXBlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIFJlLWV4cG9ydCB0aGUgUmVjb3JkZXIgaW50ZXJmYWNlIGZvciBjb25zdW1lciBpbXBsZW1lbnRhdGlvbi5cbiAqIENvbnN1bWVycyBjYW4gaW1wbGVtZW50IHRoaXMgaW50ZXJmYWNlIHRvIGNyZWF0ZSBjdXN0b20gZG9tYWluLXNwZWNpZmljXG4gKiByZWNvcmRlcnMgKGUuZy4sIExMTVJlY29yZGVyLCBBUElSZWNvcmRlcikuXG4gKi9cbmV4cG9ydCB0eXBlIHsgUmVjb3JkZXIgfSBmcm9tICcuLi90eXBlcyc7XG5cbi8qKlxuICogUmUtZXhwb3J0IGFsbCBldmVudCB0eXBlcyBmb3IgY29uc3VtZXIgdXNlLlxuICogVGhlc2UgdHlwZXMgYXJlIHBhc3NlZCB0byByZWNvcmRlciBob29rcyBhbmQgcHJvdmlkZSBjb250ZXh0IGFib3V0XG4gKiBzY29wZSBvcGVyYXRpb25zLlxuICovXG5leHBvcnQgdHlwZSB7XG4gIFJlY29yZGVyQ29udGV4dCxcbiAgUmVhZEV2ZW50LFxuICBXcml0ZUV2ZW50LFxuICBDb21taXRFdmVudCxcbiAgRXJyb3JFdmVudCxcbiAgU3RhZ2VFdmVudCxcbn0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBMaWJyYXJ5LVByb3ZpZGVkIFJlY29yZGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIE1ldHJpY1JlY29yZGVyIC0gUHJvZHVjdGlvbi1mb2N1c2VkIHJlY29yZGVyIGZvciB0aW1pbmcgYW5kIGV4ZWN1dGlvbiBjb3VudHMuXG4gKiBUcmFja3MgcmVhZC93cml0ZS9jb21taXQgY291bnRzIHBlciBzdGFnZSBhbmQgbWVhc3VyZXMgc3RhZ2UgZXhlY3V0aW9uIGR1cmF0aW9uLlxuICovXG5leHBvcnQgeyBNZXRyaWNSZWNvcmRlciB9IGZyb20gJy4vTWV0cmljUmVjb3JkZXInO1xuZXhwb3J0IHR5cGUgeyBTdGFnZU1ldHJpY3MsIEFnZ3JlZ2F0ZWRNZXRyaWNzIH0gZnJvbSAnLi9NZXRyaWNSZWNvcmRlcic7XG5cbi8qKlxuICogRGVidWdSZWNvcmRlciAtIERldmVsb3BtZW50LWZvY3VzZWQgcmVjb3JkZXIgZm9yIGRldGFpbGVkIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi5cbiAqIENhcHR1cmVzIGVycm9ycywgbXV0YXRpb25zLCBhbmQgdmVyYm9zZSBsb2dzIGZvciB0cm91Ymxlc2hvb3RpbmcuXG4gKi9cbmV4cG9ydCB7IERlYnVnUmVjb3JkZXIgfSBmcm9tICcuL0RlYnVnUmVjb3JkZXInO1xuZXhwb3J0IHR5cGUgeyBEZWJ1Z1ZlcmJvc2l0eSwgRGVidWdFbnRyeSwgRGVidWdSZWNvcmRlck9wdGlvbnMgfSBmcm9tICcuL0RlYnVnUmVjb3JkZXInO1xuXG4vKipcbiAqIE5hcnJhdGl2ZVJlY29yZGVyIC0gQ2FwdHVyZXMgcGVyLXN0YWdlIHNjb3BlIHJlYWRzL3dyaXRlcyBmb3IgbmFycmF0aXZlIGVucmljaG1lbnQuXG4gKiBCcmlkZ2VzIHRoZSBnYXAgYmV0d2VlbiBmbG93LWxldmVsIG5hcnJhdGl2ZSAoTmFycmF0aXZlR2VuZXJhdG9yKSBhbmQgZGF0YS1sZXZlbCBkZXRhaWwuXG4gKiBQcm9kdWNlcyBzdHJ1Y3R1cmVkIHBlci1zdGFnZSBkYXRhIGFuZCB0ZXh0IHNlbnRlbmNlcyB0aGF0IGNhbiBiZSBtZXJnZWQgd2l0aFxuICogTmFycmF0aXZlR2VuZXJhdG9yIG91dHB1dCBmb3IgdGhlIGZ1bGwgcGljdHVyZTogd2hhdCBoYXBwZW5lZCBBTkQgd2hhdCB3YXMgcHJvZHVjZWQuXG4gKi9cbmV4cG9ydCB7IE5hcnJhdGl2ZVJlY29yZGVyIH0gZnJvbSAnLi9OYXJyYXRpdmVSZWNvcmRlcic7XG5leHBvcnQgdHlwZSB7XG4gIE5hcnJhdGl2ZURldGFpbCxcbiAgTmFycmF0aXZlT3BlcmF0aW9uLFxuICBTdGFnZU5hcnJhdGl2ZURhdGEsXG4gIE5hcnJhdGl2ZVJlY29yZGVyT3B0aW9ucyxcbn0gZnJvbSAnLi9OYXJyYXRpdmVSZWNvcmRlcic7XG4iXX0=