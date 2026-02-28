"use strict";
/**
 * Internal History Module
 *
 * WHY: This module contains internal implementation details for execution
 * history tracking. These are NOT part of the public API and may change.
 *
 * EXPORTS:
 * - ExecutionHistory: Time-travel snapshot storage for pipeline execution
 *
 * CONSUMERS:
 * - GlobalStore uses ExecutionHistory for time-travel debugging
 * - Debug UI uses commit bundles for visualization
 *
 * WARNING: Do not import from this module directly in consumer code.
 * Use the public API from 'core/memory/' instead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryHistory = exports.ExecutionHistory = void 0;
var ExecutionHistory_1 = require("./ExecutionHistory");
Object.defineProperty(exports, "ExecutionHistory", { enumerable: true, get: function () { return ExecutionHistory_1.ExecutionHistory; } });
Object.defineProperty(exports, "MemoryHistory", { enumerable: true, get: function () { return ExecutionHistory_1.MemoryHistory; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW50ZXJuYWwvaGlzdG9yeS9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7QUFFSCx1REFLNEI7QUFKMUIsb0hBQUEsZ0JBQWdCLE9BQUE7QUFDaEIsaUhBQUEsYUFBYSxPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBJbnRlcm5hbCBIaXN0b3J5IE1vZHVsZVxuICogXG4gKiBXSFk6IFRoaXMgbW9kdWxlIGNvbnRhaW5zIGludGVybmFsIGltcGxlbWVudGF0aW9uIGRldGFpbHMgZm9yIGV4ZWN1dGlvblxuICogaGlzdG9yeSB0cmFja2luZy4gVGhlc2UgYXJlIE5PVCBwYXJ0IG9mIHRoZSBwdWJsaWMgQVBJIGFuZCBtYXkgY2hhbmdlLlxuICogXG4gKiBFWFBPUlRTOlxuICogLSBFeGVjdXRpb25IaXN0b3J5OiBUaW1lLXRyYXZlbCBzbmFwc2hvdCBzdG9yYWdlIGZvciBwaXBlbGluZSBleGVjdXRpb25cbiAqIFxuICogQ09OU1VNRVJTOlxuICogLSBHbG9iYWxTdG9yZSB1c2VzIEV4ZWN1dGlvbkhpc3RvcnkgZm9yIHRpbWUtdHJhdmVsIGRlYnVnZ2luZ1xuICogLSBEZWJ1ZyBVSSB1c2VzIGNvbW1pdCBidW5kbGVzIGZvciB2aXN1YWxpemF0aW9uXG4gKiBcbiAqIFdBUk5JTkc6IERvIG5vdCBpbXBvcnQgZnJvbSB0aGlzIG1vZHVsZSBkaXJlY3RseSBpbiBjb25zdW1lciBjb2RlLlxuICogVXNlIHRoZSBwdWJsaWMgQVBJIGZyb20gJ2NvcmUvbWVtb3J5LycgaW5zdGVhZC5cbiAqL1xuXG5leHBvcnQge1xuICBFeGVjdXRpb25IaXN0b3J5LFxuICBNZW1vcnlIaXN0b3J5LCAvLyBMZWdhY3kgYWxpYXNcbiAgdHlwZSBUcmFjZUl0ZW0sXG4gIHR5cGUgQ29tbWl0QnVuZGxlLFxufSBmcm9tICcuL0V4ZWN1dGlvbkhpc3RvcnknO1xuIl19