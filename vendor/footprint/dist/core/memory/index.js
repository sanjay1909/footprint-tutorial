"use strict";
/**
 * Core Memory Module - Public API for pipeline state management
 *
 * WHY: This module provides the memory model for pipeline execution:
 * - GlobalStore: Shared state container
 * - StageContext: Stage-scoped state access with atomic commits
 * - PipelineRuntime: Top-level runtime container
 * - StageMetadata: Per-stage metadata collector
 *
 * DESIGN: Follows the compiler/runtime analogy:
 * - GlobalStore = heap memory
 * - StageContext = stack frame with transaction buffer
 * - PipelineRuntime = VM instance
 * - StageMetadata = diagnostic collector
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugContext = exports.StageMetadata = exports.TreePipelineContext = exports.PipelineRuntime = exports.StageContext = exports.GlobalStore = void 0;
// Core classes
var GlobalStore_1 = require("./GlobalStore");
Object.defineProperty(exports, "GlobalStore", { enumerable: true, get: function () { return GlobalStore_1.GlobalStore; } });
var StageContext_1 = require("./StageContext");
Object.defineProperty(exports, "StageContext", { enumerable: true, get: function () { return StageContext_1.StageContext; } });
var PipelineRuntime_1 = require("./PipelineRuntime");
Object.defineProperty(exports, "PipelineRuntime", { enumerable: true, get: function () { return PipelineRuntime_1.PipelineRuntime; } });
Object.defineProperty(exports, "TreePipelineContext", { enumerable: true, get: function () { return PipelineRuntime_1.TreePipelineContext; } });
var StageMetadata_1 = require("./StageMetadata");
Object.defineProperty(exports, "StageMetadata", { enumerable: true, get: function () { return StageMetadata_1.StageMetadata; } });
Object.defineProperty(exports, "DebugContext", { enumerable: true, get: function () { return StageMetadata_1.DebugContext; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY29yZS9tZW1vcnkvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7OztHQWNHOzs7QUFFSCxlQUFlO0FBQ2YsNkNBQTRDO0FBQW5DLDBHQUFBLFdBQVcsT0FBQTtBQUNwQiwrQ0FBa0U7QUFBekQsNEdBQUEsWUFBWSxPQUFBO0FBQ3JCLHFEQUFvSDtBQUEzRyxrSEFBQSxlQUFlLE9BQUE7QUFBRSxzSEFBQSxtQkFBbUIsT0FBQTtBQUM3QyxpREFBOEQ7QUFBckQsOEdBQUEsYUFBYSxPQUFBO0FBQUUsNkdBQUEsWUFBWSxPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb3JlIE1lbW9yeSBNb2R1bGUgLSBQdWJsaWMgQVBJIGZvciBwaXBlbGluZSBzdGF0ZSBtYW5hZ2VtZW50XG4gKiBcbiAqIFdIWTogVGhpcyBtb2R1bGUgcHJvdmlkZXMgdGhlIG1lbW9yeSBtb2RlbCBmb3IgcGlwZWxpbmUgZXhlY3V0aW9uOlxuICogLSBHbG9iYWxTdG9yZTogU2hhcmVkIHN0YXRlIGNvbnRhaW5lclxuICogLSBTdGFnZUNvbnRleHQ6IFN0YWdlLXNjb3BlZCBzdGF0ZSBhY2Nlc3Mgd2l0aCBhdG9taWMgY29tbWl0c1xuICogLSBQaXBlbGluZVJ1bnRpbWU6IFRvcC1sZXZlbCBydW50aW1lIGNvbnRhaW5lclxuICogLSBTdGFnZU1ldGFkYXRhOiBQZXItc3RhZ2UgbWV0YWRhdGEgY29sbGVjdG9yXG4gKiBcbiAqIERFU0lHTjogRm9sbG93cyB0aGUgY29tcGlsZXIvcnVudGltZSBhbmFsb2d5OlxuICogLSBHbG9iYWxTdG9yZSA9IGhlYXAgbWVtb3J5XG4gKiAtIFN0YWdlQ29udGV4dCA9IHN0YWNrIGZyYW1lIHdpdGggdHJhbnNhY3Rpb24gYnVmZmVyXG4gKiAtIFBpcGVsaW5lUnVudGltZSA9IFZNIGluc3RhbmNlXG4gKiAtIFN0YWdlTWV0YWRhdGEgPSBkaWFnbm9zdGljIGNvbGxlY3RvclxuICovXG5cbi8vIENvcmUgY2xhc3Nlc1xuZXhwb3J0IHsgR2xvYmFsU3RvcmUgfSBmcm9tICcuL0dsb2JhbFN0b3JlJztcbmV4cG9ydCB7IFN0YWdlQ29udGV4dCwgdHlwZSBTdGFnZVNuYXBzaG90IH0gZnJvbSAnLi9TdGFnZUNvbnRleHQnO1xuZXhwb3J0IHsgUGlwZWxpbmVSdW50aW1lLCBUcmVlUGlwZWxpbmVDb250ZXh0LCB0eXBlIE5hcnJhdGl2ZUVudHJ5LCB0eXBlIFJ1bnRpbWVTbmFwc2hvdCB9IGZyb20gJy4vUGlwZWxpbmVSdW50aW1lJztcbmV4cG9ydCB7IFN0YWdlTWV0YWRhdGEsIERlYnVnQ29udGV4dCB9IGZyb20gJy4vU3RhZ2VNZXRhZGF0YSc7XG5cbi8vIFR5cGVzXG5leHBvcnQgdHlwZSB7IFNjb3BlRmFjdG9yeSB9IGZyb20gJy4vdHlwZXMnO1xuIl19