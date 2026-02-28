"use strict";
/**
 * StageRunner.ts
 *
 * WHY: Executes individual stage functions with scope protection and streaming support.
 * This module is extracted from Pipeline.ts following the Single Responsibility Principle,
 * isolating the concerns of stage execution from pipeline traversal.
 *
 * RESPONSIBILITIES:
 * - Create scope via ScopeFactory for each stage
 * - Apply scope protection (createProtectedScope) to intercept direct property assignments
 * - Handle streaming stages (onStart, onToken, onEnd lifecycle)
 * - Handle sync+async safety (only await real Promises to avoid thenable assimilation)
 *
 * DESIGN DECISIONS:
 * - Scope protection is applied at the stage level, not globally, to allow per-stage configuration
 * - Streaming callbacks are created lazily only for streaming stages to minimize overhead
 * - Sync+async safety uses `instanceof Promise` rather than duck-typing to avoid side effects
 *
 * DOES NOT HANDLE:
 * - Commit logic (caller handles via context.commitPatch())
 * - Extractor calls (caller handles via callExtractor())
 * - Break flag propagation (caller checks breakFlag after run)
 *
 * RELATED:
 * - {@link Pipeline} - Orchestrates stage execution order and calls StageRunner
 * - {@link StageContext} - Provides stage-scoped state access
 * - {@link createProtectedScope} - Wraps scope to intercept direct assignments
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageRunner = void 0;
const createProtectedScope_1 = require("../../../scope/protection/createProtectedScope");
/**
 * StageRunner
 * ------------------------------------------------------------------
 * Runs a single stage function with scope protection and streaming support.
 *
 * WHY: Isolates the complexity of stage execution (scope creation, protection,
 * streaming) from the pipeline traversal logic. This makes both Pipeline and
 * StageRunner easier to test and maintain.
 *
 * DESIGN: Uses PipelineContext for shared state access rather than direct
 * field access, enabling dependency injection for testing.
 *
 * @template TOut - The output type of stage functions
 * @template TScope - The scope type passed to stage functions
 *
 * @example
 * ```typescript
 * const runner = new StageRunner(pipelineContext);
 * const output = await runner.run(node, stageFunc, context, breakFn);
 * ```
 */
class StageRunner {
    constructor(ctx) {
        this.ctx = ctx;
    }
    /**
     * Run a single stage function.
     *
     * WHY: Centralizes the stage execution logic including scope creation,
     * protection, and streaming support in one place.
     *
     * DESIGN: The method handles both sync and async stages uniformly by
     * only awaiting real Promises (using instanceof check). This avoids
     * "thenable assimilation" side-effects on arbitrary objects.
     *
     * @param node - The stage node to execute
     * @param stageFunc - The stage function to run
     * @param context - The stage context for state access
     * @param breakFn - Function to call to trigger break (early termination)
     * @returns The stage output (may be undefined for void stages)
     *
     * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
     */
    async run(node, stageFunc, context, breakFn) {
        var _a, _b, _c, _d, _e, _f;
        // Create scope via ScopeFactory
        // WHY: Each stage gets its own scope instance for isolation
        const rawScope = this.ctx.ScopeFactory(context, node.name, this.ctx.readOnlyContext);
        // Wrap scope with protection to intercept direct property assignments
        // WHY: Prevents accidental mutations that bypass the WriteBuffer
        const scope = (0, createProtectedScope_1.createProtectedScope)(rawScope, {
            mode: this.ctx.scopeProtectionMode,
            stageName: node.name,
        });
        // Determine if this is a streaming stage and create the appropriate callback
        // WHY: Streaming stages need a callback to emit tokens incrementally
        let streamCallback;
        let accumulatedText = '';
        if (node.isStreaming) {
            const streamId = (_a = node.streamId) !== null && _a !== void 0 ? _a : node.name;
            // Create bound callback that routes tokens to the handler with the correct streamId
            streamCallback = (token) => {
                var _a, _b;
                accumulatedText += token;
                (_b = (_a = this.ctx.streamHandlers) === null || _a === void 0 ? void 0 : _a.onToken) === null || _b === void 0 ? void 0 : _b.call(_a, streamId, token);
            };
            // Call onStart lifecycle hook before execution
            (_c = (_b = this.ctx.streamHandlers) === null || _b === void 0 ? void 0 : _b.onStart) === null || _c === void 0 ? void 0 : _c.call(_b, streamId);
        }
        // Execute the stage function
        const output = stageFunc(scope, breakFn, streamCallback);
        // Sync+async safety: only await real Promises
        // WHY: Avoids "thenable assimilation" side-effects on arbitrary objects
        // that happen to have a .then() method
        let result;
        if (output instanceof Promise) {
            result = await output;
        }
        else {
            result = output;
        }
        // Call onEnd lifecycle hook after execution for streaming stages
        if (node.isStreaming) {
            const streamId = (_d = node.streamId) !== null && _d !== void 0 ? _d : node.name;
            (_f = (_e = this.ctx.streamHandlers) === null || _e === void 0 ? void 0 : _e.onEnd) === null || _f === void 0 ? void 0 : _f.call(_e, streamId, accumulatedText);
        }
        return result;
    }
}
exports.StageRunner = StageRunner;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhZ2VSdW5uZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9oYW5kbGVycy9TdGFnZVJ1bm5lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBNkJHOzs7QUFHSCx5RkFBc0Y7QUFJdEY7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHO0FBQ0gsTUFBYSxXQUFXO0lBQ3RCLFlBQTZCLEdBQWtDO1FBQWxDLFFBQUcsR0FBSCxHQUFHLENBQStCO0lBQUcsQ0FBQztJQUVuRTs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FpQkc7SUFDSCxLQUFLLENBQUMsR0FBRyxDQUNQLElBQTZCLEVBQzdCLFNBQThDLEVBQzlDLE9BQXFCLEVBQ3JCLE9BQW1COztRQUVuQixnQ0FBZ0M7UUFDaEMsNERBQTREO1FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFckYsc0VBQXNFO1FBQ3RFLGlFQUFpRTtRQUNqRSxNQUFNLEtBQUssR0FBRyxJQUFBLDJDQUFvQixFQUFDLFFBQWtCLEVBQUU7WUFDckQsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1lBQ2xDLFNBQVMsRUFBRSxJQUFJLENBQUMsSUFBSTtTQUNyQixDQUFXLENBQUM7UUFFYiw2RUFBNkU7UUFDN0UscUVBQXFFO1FBQ3JFLElBQUksY0FBMEMsQ0FBQztRQUMvQyxJQUFJLGVBQWUsR0FBRyxFQUFFLENBQUM7UUFFekIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDckIsTUFBTSxRQUFRLEdBQUcsTUFBQSxJQUFJLENBQUMsUUFBUSxtQ0FBSSxJQUFJLENBQUMsSUFBSSxDQUFDO1lBRTVDLG9GQUFvRjtZQUNwRixjQUFjLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTs7Z0JBQ2pDLGVBQWUsSUFBSSxLQUFLLENBQUM7Z0JBQ3pCLE1BQUEsTUFBQSxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsMENBQUUsT0FBTyxtREFBRyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEQsQ0FBQyxDQUFDO1lBRUYsK0NBQStDO1lBQy9DLE1BQUEsTUFBQSxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsMENBQUUsT0FBTyxtREFBRyxRQUFRLENBQUMsQ0FBQztRQUMvQyxDQUFDO1FBRUQsNkJBQTZCO1FBQzdCLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRXpELDhDQUE4QztRQUM5Qyx3RUFBd0U7UUFDeEUsdUNBQXVDO1FBQ3ZDLElBQUksTUFBWSxDQUFDO1FBQ2pCLElBQUksTUFBTSxZQUFZLE9BQU8sRUFBRSxDQUFDO1lBQzlCLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQztRQUN4QixDQUFDO2FBQU0sQ0FBQztZQUNOLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDbEIsQ0FBQztRQUVELGlFQUFpRTtRQUNqRSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQixNQUFNLFFBQVEsR0FBRyxNQUFBLElBQUksQ0FBQyxRQUFRLG1DQUFJLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDNUMsTUFBQSxNQUFBLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYywwQ0FBRSxLQUFLLG1EQUFHLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztDQUNGO0FBN0VELGtDQTZFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU3RhZ2VSdW5uZXIudHNcbiAqXG4gKiBXSFk6IEV4ZWN1dGVzIGluZGl2aWR1YWwgc3RhZ2UgZnVuY3Rpb25zIHdpdGggc2NvcGUgcHJvdGVjdGlvbiBhbmQgc3RyZWFtaW5nIHN1cHBvcnQuXG4gKiBUaGlzIG1vZHVsZSBpcyBleHRyYWN0ZWQgZnJvbSBQaXBlbGluZS50cyBmb2xsb3dpbmcgdGhlIFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUsXG4gKiBpc29sYXRpbmcgdGhlIGNvbmNlcm5zIG9mIHN0YWdlIGV4ZWN1dGlvbiBmcm9tIHBpcGVsaW5lIHRyYXZlcnNhbC5cbiAqXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBDcmVhdGUgc2NvcGUgdmlhIFNjb3BlRmFjdG9yeSBmb3IgZWFjaCBzdGFnZVxuICogLSBBcHBseSBzY29wZSBwcm90ZWN0aW9uIChjcmVhdGVQcm90ZWN0ZWRTY29wZSkgdG8gaW50ZXJjZXB0IGRpcmVjdCBwcm9wZXJ0eSBhc3NpZ25tZW50c1xuICogLSBIYW5kbGUgc3RyZWFtaW5nIHN0YWdlcyAob25TdGFydCwgb25Ub2tlbiwgb25FbmQgbGlmZWN5Y2xlKVxuICogLSBIYW5kbGUgc3luYythc3luYyBzYWZldHkgKG9ubHkgYXdhaXQgcmVhbCBQcm9taXNlcyB0byBhdm9pZCB0aGVuYWJsZSBhc3NpbWlsYXRpb24pXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gU2NvcGUgcHJvdGVjdGlvbiBpcyBhcHBsaWVkIGF0IHRoZSBzdGFnZSBsZXZlbCwgbm90IGdsb2JhbGx5LCB0byBhbGxvdyBwZXItc3RhZ2UgY29uZmlndXJhdGlvblxuICogLSBTdHJlYW1pbmcgY2FsbGJhY2tzIGFyZSBjcmVhdGVkIGxhemlseSBvbmx5IGZvciBzdHJlYW1pbmcgc3RhZ2VzIHRvIG1pbmltaXplIG92ZXJoZWFkXG4gKiAtIFN5bmMrYXN5bmMgc2FmZXR5IHVzZXMgYGluc3RhbmNlb2YgUHJvbWlzZWAgcmF0aGVyIHRoYW4gZHVjay10eXBpbmcgdG8gYXZvaWQgc2lkZSBlZmZlY3RzXG4gKlxuICogRE9FUyBOT1QgSEFORExFOlxuICogLSBDb21taXQgbG9naWMgKGNhbGxlciBoYW5kbGVzIHZpYSBjb250ZXh0LmNvbW1pdFBhdGNoKCkpXG4gKiAtIEV4dHJhY3RvciBjYWxscyAoY2FsbGVyIGhhbmRsZXMgdmlhIGNhbGxFeHRyYWN0b3IoKSlcbiAqIC0gQnJlYWsgZmxhZyBwcm9wYWdhdGlvbiAoY2FsbGVyIGNoZWNrcyBicmVha0ZsYWcgYWZ0ZXIgcnVuKVxuICpcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBQaXBlbGluZX0gLSBPcmNoZXN0cmF0ZXMgc3RhZ2UgZXhlY3V0aW9uIG9yZGVyIGFuZCBjYWxscyBTdGFnZVJ1bm5lclxuICogLSB7QGxpbmsgU3RhZ2VDb250ZXh0fSAtIFByb3ZpZGVzIHN0YWdlLXNjb3BlZCBzdGF0ZSBhY2Nlc3NcbiAqIC0ge0BsaW5rIGNyZWF0ZVByb3RlY3RlZFNjb3BlfSAtIFdyYXBzIHNjb3BlIHRvIGludGVyY2VwdCBkaXJlY3QgYXNzaWdubWVudHNcbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiAxLjEsIDEuMiwgMS4zLCAxLjQsIDEuNSwgMS42X1xuICovXG5cbmltcG9ydCB7IFN0YWdlQ29udGV4dCB9IGZyb20gJy4uLy4uL21lbW9yeS9TdGFnZUNvbnRleHQnO1xuaW1wb3J0IHsgY3JlYXRlUHJvdGVjdGVkU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9zY29wZS9wcm90ZWN0aW9uL2NyZWF0ZVByb3RlY3RlZFNjb3BlJztcbmltcG9ydCB0eXBlIHsgU3RhZ2VOb2RlIH0gZnJvbSAnLi4vUGlwZWxpbmUnO1xuaW1wb3J0IHR5cGUgeyBQaXBlbGluZUNvbnRleHQsIFBpcGVsaW5lU3RhZ2VGdW5jdGlvbiwgU3RyZWFtQ2FsbGJhY2sgfSBmcm9tICcuLi90eXBlcyc7XG5cbi8qKlxuICogU3RhZ2VSdW5uZXJcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogUnVucyBhIHNpbmdsZSBzdGFnZSBmdW5jdGlvbiB3aXRoIHNjb3BlIHByb3RlY3Rpb24gYW5kIHN0cmVhbWluZyBzdXBwb3J0LlxuICpcbiAqIFdIWTogSXNvbGF0ZXMgdGhlIGNvbXBsZXhpdHkgb2Ygc3RhZ2UgZXhlY3V0aW9uIChzY29wZSBjcmVhdGlvbiwgcHJvdGVjdGlvbixcbiAqIHN0cmVhbWluZykgZnJvbSB0aGUgcGlwZWxpbmUgdHJhdmVyc2FsIGxvZ2ljLiBUaGlzIG1ha2VzIGJvdGggUGlwZWxpbmUgYW5kXG4gKiBTdGFnZVJ1bm5lciBlYXNpZXIgdG8gdGVzdCBhbmQgbWFpbnRhaW4uXG4gKlxuICogREVTSUdOOiBVc2VzIFBpcGVsaW5lQ29udGV4dCBmb3Igc2hhcmVkIHN0YXRlIGFjY2VzcyByYXRoZXIgdGhhbiBkaXJlY3RcbiAqIGZpZWxkIGFjY2VzcywgZW5hYmxpbmcgZGVwZW5kZW5jeSBpbmplY3Rpb24gZm9yIHRlc3RpbmcuXG4gKlxuICogQHRlbXBsYXRlIFRPdXQgLSBUaGUgb3V0cHV0IHR5cGUgb2Ygc3RhZ2UgZnVuY3Rpb25zXG4gKiBAdGVtcGxhdGUgVFNjb3BlIC0gVGhlIHNjb3BlIHR5cGUgcGFzc2VkIHRvIHN0YWdlIGZ1bmN0aW9uc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBydW5uZXIgPSBuZXcgU3RhZ2VSdW5uZXIocGlwZWxpbmVDb250ZXh0KTtcbiAqIGNvbnN0IG91dHB1dCA9IGF3YWl0IHJ1bm5lci5ydW4obm9kZSwgc3RhZ2VGdW5jLCBjb250ZXh0LCBicmVha0ZuKTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgU3RhZ2VSdW5uZXI8VE91dCA9IGFueSwgVFNjb3BlID0gYW55PiB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY3R4OiBQaXBlbGluZUNvbnRleHQ8VE91dCwgVFNjb3BlPikge31cblxuICAvKipcbiAgICogUnVuIGEgc2luZ2xlIHN0YWdlIGZ1bmN0aW9uLlxuICAgKlxuICAgKiBXSFk6IENlbnRyYWxpemVzIHRoZSBzdGFnZSBleGVjdXRpb24gbG9naWMgaW5jbHVkaW5nIHNjb3BlIGNyZWF0aW9uLFxuICAgKiBwcm90ZWN0aW9uLCBhbmQgc3RyZWFtaW5nIHN1cHBvcnQgaW4gb25lIHBsYWNlLlxuICAgKlxuICAgKiBERVNJR046IFRoZSBtZXRob2QgaGFuZGxlcyBib3RoIHN5bmMgYW5kIGFzeW5jIHN0YWdlcyB1bmlmb3JtbHkgYnlcbiAgICogb25seSBhd2FpdGluZyByZWFsIFByb21pc2VzICh1c2luZyBpbnN0YW5jZW9mIGNoZWNrKS4gVGhpcyBhdm9pZHNcbiAgICogXCJ0aGVuYWJsZSBhc3NpbWlsYXRpb25cIiBzaWRlLWVmZmVjdHMgb24gYXJiaXRyYXJ5IG9iamVjdHMuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIC0gVGhlIHN0YWdlIG5vZGUgdG8gZXhlY3V0ZVxuICAgKiBAcGFyYW0gc3RhZ2VGdW5jIC0gVGhlIHN0YWdlIGZ1bmN0aW9uIHRvIHJ1blxuICAgKiBAcGFyYW0gY29udGV4dCAtIFRoZSBzdGFnZSBjb250ZXh0IGZvciBzdGF0ZSBhY2Nlc3NcbiAgICogQHBhcmFtIGJyZWFrRm4gLSBGdW5jdGlvbiB0byBjYWxsIHRvIHRyaWdnZXIgYnJlYWsgKGVhcmx5IHRlcm1pbmF0aW9uKVxuICAgKiBAcmV0dXJucyBUaGUgc3RhZ2Ugb3V0cHV0IChtYXkgYmUgdW5kZWZpbmVkIGZvciB2b2lkIHN0YWdlcylcbiAgICpcbiAgICogX1JlcXVpcmVtZW50czogMS4xLCAxLjIsIDEuMywgMS40LCAxLjUsIDEuNl9cbiAgICovXG4gIGFzeW5jIHJ1bihcbiAgICBub2RlOiBTdGFnZU5vZGU8VE91dCwgVFNjb3BlPixcbiAgICBzdGFnZUZ1bmM6IFBpcGVsaW5lU3RhZ2VGdW5jdGlvbjxUT3V0LCBUU2NvcGU+LFxuICAgIGNvbnRleHQ6IFN0YWdlQ29udGV4dCxcbiAgICBicmVha0ZuOiAoKSA9PiB2b2lkLFxuICApOiBQcm9taXNlPFRPdXQ+IHtcbiAgICAvLyBDcmVhdGUgc2NvcGUgdmlhIFNjb3BlRmFjdG9yeVxuICAgIC8vIFdIWTogRWFjaCBzdGFnZSBnZXRzIGl0cyBvd24gc2NvcGUgaW5zdGFuY2UgZm9yIGlzb2xhdGlvblxuICAgIGNvbnN0IHJhd1Njb3BlID0gdGhpcy5jdHguU2NvcGVGYWN0b3J5KGNvbnRleHQsIG5vZGUubmFtZSwgdGhpcy5jdHgucmVhZE9ubHlDb250ZXh0KTtcblxuICAgIC8vIFdyYXAgc2NvcGUgd2l0aCBwcm90ZWN0aW9uIHRvIGludGVyY2VwdCBkaXJlY3QgcHJvcGVydHkgYXNzaWdubWVudHNcbiAgICAvLyBXSFk6IFByZXZlbnRzIGFjY2lkZW50YWwgbXV0YXRpb25zIHRoYXQgYnlwYXNzIHRoZSBXcml0ZUJ1ZmZlclxuICAgIGNvbnN0IHNjb3BlID0gY3JlYXRlUHJvdGVjdGVkU2NvcGUocmF3U2NvcGUgYXMgb2JqZWN0LCB7XG4gICAgICBtb2RlOiB0aGlzLmN0eC5zY29wZVByb3RlY3Rpb25Nb2RlLFxuICAgICAgc3RhZ2VOYW1lOiBub2RlLm5hbWUsXG4gICAgfSkgYXMgVFNjb3BlO1xuXG4gICAgLy8gRGV0ZXJtaW5lIGlmIHRoaXMgaXMgYSBzdHJlYW1pbmcgc3RhZ2UgYW5kIGNyZWF0ZSB0aGUgYXBwcm9wcmlhdGUgY2FsbGJhY2tcbiAgICAvLyBXSFk6IFN0cmVhbWluZyBzdGFnZXMgbmVlZCBhIGNhbGxiYWNrIHRvIGVtaXQgdG9rZW5zIGluY3JlbWVudGFsbHlcbiAgICBsZXQgc3RyZWFtQ2FsbGJhY2s6IFN0cmVhbUNhbGxiYWNrIHwgdW5kZWZpbmVkO1xuICAgIGxldCBhY2N1bXVsYXRlZFRleHQgPSAnJztcblxuICAgIGlmIChub2RlLmlzU3RyZWFtaW5nKSB7XG4gICAgICBjb25zdCBzdHJlYW1JZCA9IG5vZGUuc3RyZWFtSWQgPz8gbm9kZS5uYW1lO1xuXG4gICAgICAvLyBDcmVhdGUgYm91bmQgY2FsbGJhY2sgdGhhdCByb3V0ZXMgdG9rZW5zIHRvIHRoZSBoYW5kbGVyIHdpdGggdGhlIGNvcnJlY3Qgc3RyZWFtSWRcbiAgICAgIHN0cmVhbUNhbGxiYWNrID0gKHRva2VuOiBzdHJpbmcpID0+IHtcbiAgICAgICAgYWNjdW11bGF0ZWRUZXh0ICs9IHRva2VuO1xuICAgICAgICB0aGlzLmN0eC5zdHJlYW1IYW5kbGVycz8ub25Ub2tlbj8uKHN0cmVhbUlkLCB0b2tlbik7XG4gICAgICB9O1xuXG4gICAgICAvLyBDYWxsIG9uU3RhcnQgbGlmZWN5Y2xlIGhvb2sgYmVmb3JlIGV4ZWN1dGlvblxuICAgICAgdGhpcy5jdHguc3RyZWFtSGFuZGxlcnM/Lm9uU3RhcnQ/LihzdHJlYW1JZCk7XG4gICAgfVxuXG4gICAgLy8gRXhlY3V0ZSB0aGUgc3RhZ2UgZnVuY3Rpb25cbiAgICBjb25zdCBvdXRwdXQgPSBzdGFnZUZ1bmMoc2NvcGUsIGJyZWFrRm4sIHN0cmVhbUNhbGxiYWNrKTtcblxuICAgIC8vIFN5bmMrYXN5bmMgc2FmZXR5OiBvbmx5IGF3YWl0IHJlYWwgUHJvbWlzZXNcbiAgICAvLyBXSFk6IEF2b2lkcyBcInRoZW5hYmxlIGFzc2ltaWxhdGlvblwiIHNpZGUtZWZmZWN0cyBvbiBhcmJpdHJhcnkgb2JqZWN0c1xuICAgIC8vIHRoYXQgaGFwcGVuIHRvIGhhdmUgYSAudGhlbigpIG1ldGhvZFxuICAgIGxldCByZXN1bHQ6IFRPdXQ7XG4gICAgaWYgKG91dHB1dCBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IG91dHB1dDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gb3V0cHV0O1xuICAgIH1cblxuICAgIC8vIENhbGwgb25FbmQgbGlmZWN5Y2xlIGhvb2sgYWZ0ZXIgZXhlY3V0aW9uIGZvciBzdHJlYW1pbmcgc3RhZ2VzXG4gICAgaWYgKG5vZGUuaXNTdHJlYW1pbmcpIHtcbiAgICAgIGNvbnN0IHN0cmVhbUlkID0gbm9kZS5zdHJlYW1JZCA/PyBub2RlLm5hbWU7XG4gICAgICB0aGlzLmN0eC5zdHJlYW1IYW5kbGVycz8ub25FbmQ/LihzdHJlYW1JZCwgYWNjdW11bGF0ZWRUZXh0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG4iXX0=