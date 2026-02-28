"use strict";
/**
 * Scope Protection Module
 *
 * Provides a Proxy-based protection layer that intercepts direct property
 * assignments on scope objects and provides clear error messages.
 *
 * This prevents the common mistake of using `scope.property = value` instead
 * of `scope.setObject()` or `scope.setValue()`, which silently fails to
 * persist data across pipeline stages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createErrorMessage = exports.createProtectedScope = void 0;
var createProtectedScope_1 = require("./createProtectedScope");
Object.defineProperty(exports, "createProtectedScope", { enumerable: true, get: function () { return createProtectedScope_1.createProtectedScope; } });
Object.defineProperty(exports, "createErrorMessage", { enumerable: true, get: function () { return createProtectedScope_1.createErrorMessage; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NvcGUvcHJvdGVjdGlvbi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7OztHQVNHOzs7QUFFSCwrREFBa0Y7QUFBekUsNEhBQUEsb0JBQW9CLE9BQUE7QUFBRSwwSEFBQSxrQkFBa0IsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2NvcGUgUHJvdGVjdGlvbiBNb2R1bGVcbiAqIFxuICogUHJvdmlkZXMgYSBQcm94eS1iYXNlZCBwcm90ZWN0aW9uIGxheWVyIHRoYXQgaW50ZXJjZXB0cyBkaXJlY3QgcHJvcGVydHlcbiAqIGFzc2lnbm1lbnRzIG9uIHNjb3BlIG9iamVjdHMgYW5kIHByb3ZpZGVzIGNsZWFyIGVycm9yIG1lc3NhZ2VzLlxuICogXG4gKiBUaGlzIHByZXZlbnRzIHRoZSBjb21tb24gbWlzdGFrZSBvZiB1c2luZyBgc2NvcGUucHJvcGVydHkgPSB2YWx1ZWAgaW5zdGVhZFxuICogb2YgYHNjb3BlLnNldE9iamVjdCgpYCBvciBgc2NvcGUuc2V0VmFsdWUoKWAsIHdoaWNoIHNpbGVudGx5IGZhaWxzIHRvXG4gKiBwZXJzaXN0IGRhdGEgYWNyb3NzIHBpcGVsaW5lIHN0YWdlcy5cbiAqL1xuXG5leHBvcnQgeyBjcmVhdGVQcm90ZWN0ZWRTY29wZSwgY3JlYXRlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi9jcmVhdGVQcm90ZWN0ZWRTY29wZSc7XG5leHBvcnQgeyBTY29wZVByb3RlY3Rpb25Nb2RlLCBTY29wZVByb3RlY3Rpb25PcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG4iXX0=