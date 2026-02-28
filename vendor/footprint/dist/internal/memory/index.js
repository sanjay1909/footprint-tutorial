"use strict";
/**
 * Internal Memory Module
 *
 * WHY: This module contains internal implementation details for the memory
 * system. These are NOT part of the public API and may change without notice.
 *
 * EXPORTS:
 * - WriteBuffer: Transactional write buffer for stage mutations
 * - Memory utilities: Helper functions for nested object manipulation
 *
 * CONSUMERS:
 * - StageContext uses WriteBuffer for stage-scoped mutations
 * - GlobalStore uses utilities for state access
 *
 * WARNING: Do not import from this module directly in consumer code.
 * Use the public API from 'core/memory/' instead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactPatch = exports.getPipelineAndGlobalPaths = exports.getNestedValue = exports.updateValue = exports.updateNestedValue = exports.setNestedValue = exports.DELIM = exports.applySmartMerge = exports.PatchedMemoryContext = exports.WriteBuffer = void 0;
// WriteBuffer - Transactional write buffer
var WriteBuffer_1 = require("./WriteBuffer");
Object.defineProperty(exports, "WriteBuffer", { enumerable: true, get: function () { return WriteBuffer_1.WriteBuffer; } });
Object.defineProperty(exports, "PatchedMemoryContext", { enumerable: true, get: function () { return WriteBuffer_1.PatchedMemoryContext; } });
Object.defineProperty(exports, "applySmartMerge", { enumerable: true, get: function () { return WriteBuffer_1.applySmartMerge; } });
Object.defineProperty(exports, "DELIM", { enumerable: true, get: function () { return WriteBuffer_1.DELIM; } });
// Memory utilities
var utils_1 = require("./utils");
Object.defineProperty(exports, "setNestedValue", { enumerable: true, get: function () { return utils_1.setNestedValue; } });
Object.defineProperty(exports, "updateNestedValue", { enumerable: true, get: function () { return utils_1.updateNestedValue; } });
Object.defineProperty(exports, "updateValue", { enumerable: true, get: function () { return utils_1.updateValue; } });
Object.defineProperty(exports, "getNestedValue", { enumerable: true, get: function () { return utils_1.getNestedValue; } });
Object.defineProperty(exports, "getPipelineAndGlobalPaths", { enumerable: true, get: function () { return utils_1.getPipelineAndGlobalPaths; } });
Object.defineProperty(exports, "redactPatch", { enumerable: true, get: function () { return utils_1.redactPatch; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW50ZXJuYWwvbWVtb3J5L2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRzs7O0FBRUgsMkNBQTJDO0FBQzNDLDZDQU11QjtBQUxyQiwwR0FBQSxXQUFXLE9BQUE7QUFDWCxtSEFBQSxvQkFBb0IsT0FBQTtBQUNwQiw4R0FBQSxlQUFlLE9BQUE7QUFDZixvR0FBQSxLQUFLLE9BQUE7QUFJUCxtQkFBbUI7QUFDbkIsaUNBT2lCO0FBTmYsdUdBQUEsY0FBYyxPQUFBO0FBQ2QsMEdBQUEsaUJBQWlCLE9BQUE7QUFDakIsb0dBQUEsV0FBVyxPQUFBO0FBQ1gsdUdBQUEsY0FBYyxPQUFBO0FBQ2Qsa0hBQUEseUJBQXlCLE9BQUE7QUFDekIsb0dBQUEsV0FBVyxPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBJbnRlcm5hbCBNZW1vcnkgTW9kdWxlXG4gKiBcbiAqIFdIWTogVGhpcyBtb2R1bGUgY29udGFpbnMgaW50ZXJuYWwgaW1wbGVtZW50YXRpb24gZGV0YWlscyBmb3IgdGhlIG1lbW9yeVxuICogc3lzdGVtLiBUaGVzZSBhcmUgTk9UIHBhcnQgb2YgdGhlIHB1YmxpYyBBUEkgYW5kIG1heSBjaGFuZ2Ugd2l0aG91dCBub3RpY2UuXG4gKiBcbiAqIEVYUE9SVFM6XG4gKiAtIFdyaXRlQnVmZmVyOiBUcmFuc2FjdGlvbmFsIHdyaXRlIGJ1ZmZlciBmb3Igc3RhZ2UgbXV0YXRpb25zXG4gKiAtIE1lbW9yeSB1dGlsaXRpZXM6IEhlbHBlciBmdW5jdGlvbnMgZm9yIG5lc3RlZCBvYmplY3QgbWFuaXB1bGF0aW9uXG4gKiBcbiAqIENPTlNVTUVSUzpcbiAqIC0gU3RhZ2VDb250ZXh0IHVzZXMgV3JpdGVCdWZmZXIgZm9yIHN0YWdlLXNjb3BlZCBtdXRhdGlvbnNcbiAqIC0gR2xvYmFsU3RvcmUgdXNlcyB1dGlsaXRpZXMgZm9yIHN0YXRlIGFjY2Vzc1xuICogXG4gKiBXQVJOSU5HOiBEbyBub3QgaW1wb3J0IGZyb20gdGhpcyBtb2R1bGUgZGlyZWN0bHkgaW4gY29uc3VtZXIgY29kZS5cbiAqIFVzZSB0aGUgcHVibGljIEFQSSBmcm9tICdjb3JlL21lbW9yeS8nIGluc3RlYWQuXG4gKi9cblxuLy8gV3JpdGVCdWZmZXIgLSBUcmFuc2FjdGlvbmFsIHdyaXRlIGJ1ZmZlclxuZXhwb3J0IHtcbiAgV3JpdGVCdWZmZXIsXG4gIFBhdGNoZWRNZW1vcnlDb250ZXh0LCAvLyBMZWdhY3kgYWxpYXNcbiAgYXBwbHlTbWFydE1lcmdlLFxuICBERUxJTSxcbiAgdHlwZSBNZW1vcnlQYXRjaCxcbn0gZnJvbSAnLi9Xcml0ZUJ1ZmZlcic7XG5cbi8vIE1lbW9yeSB1dGlsaXRpZXNcbmV4cG9ydCB7XG4gIHNldE5lc3RlZFZhbHVlLFxuICB1cGRhdGVOZXN0ZWRWYWx1ZSxcbiAgdXBkYXRlVmFsdWUsXG4gIGdldE5lc3RlZFZhbHVlLFxuICBnZXRQaXBlbGluZUFuZEdsb2JhbFBhdGhzLFxuICByZWRhY3RQYXRjaCxcbn0gZnJvbSAnLi91dGlscyc7XG4iXX0=