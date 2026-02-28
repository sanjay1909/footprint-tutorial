"use strict";
/**
 * Utils Module - Shared utilities for the library
 *
 * WHY: Provides common utilities used across the library:
 * - logger: Simple logging interface
 * - scopeLog: Stage-aware logging with context
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.treeConsole = exports.logger = void 0;
var logger_1 = require("./logger");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return logger_1.logger; } });
var scopeLog_1 = require("./scopeLog");
Object.defineProperty(exports, "treeConsole", { enumerable: true, get: function () { return scopeLog_1.treeConsole; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdXRpbHMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBRUgsbUNBQWtDO0FBQXpCLGdHQUFBLE1BQU0sT0FBQTtBQUNmLHVDQUF5QztBQUFoQyx1R0FBQSxXQUFXLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFV0aWxzIE1vZHVsZSAtIFNoYXJlZCB1dGlsaXRpZXMgZm9yIHRoZSBsaWJyYXJ5XG4gKiBcbiAqIFdIWTogUHJvdmlkZXMgY29tbW9uIHV0aWxpdGllcyB1c2VkIGFjcm9zcyB0aGUgbGlicmFyeTpcbiAqIC0gbG9nZ2VyOiBTaW1wbGUgbG9nZ2luZyBpbnRlcmZhY2VcbiAqIC0gc2NvcGVMb2c6IFN0YWdlLWF3YXJlIGxvZ2dpbmcgd2l0aCBjb250ZXh0XG4gKi9cblxuZXhwb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuZXhwb3J0IHsgdHJlZUNvbnNvbGUgfSBmcm9tICcuL3Njb3BlTG9nJztcbiJdfQ==