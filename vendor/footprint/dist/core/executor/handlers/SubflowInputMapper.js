"use strict";
/**
 * SubflowInputMapper.ts
 *
 * WHY: Provides modular helper functions for subflow input/output mapping.
 * This module is extracted to follow Single Responsibility Principle and enable
 * independent unit testing of mapping logic.
 *
 * ## Mental Model: Subflow = Pure Function
 *
 * A **Subflow** behaves like a **pure function** in programming:
 * ```typescript
 * // Subflow is conceptually like this:
 * function subflow(args: InputType): OutputType {
 *   // internal work with isolated scope (local variables)...
 *   return result;
 * }
 *
 * // Parent calls it like:
 * const result = subflow(inputMapper(parentScope));
 * outputMapper(result) → writes to parentScope
 * ```
 *
 * Key characteristics:
 * - **Isolated scope**: Subflow has its own local variables (GlobalStore)
 * - **No closure**: Cannot access parent scope directly
 * - **Explicit inputs**: Must receive data via `inputMapper` parameters
 * - **Explicit outputs**: Must return data via `outputMapper` return value
 *
 * ## Data Flow Reference
 *
 * | What | How it flows |
 * |------|--------------|
 * | Input to subflow | `inputMapper(parentScope)` → subflow's `readOnlyContext` → `ScopeFactory` → stage scope |
 * | Subflow return value | Last stage's return → available to parent's next stage |
 * | Subflow scope → parent scope | `outputMapper(subflowOutput, parentScope)` → writes to parent GlobalStore |
 * | No outputMapper | Subflow scope changes are discarded (stay in subflow's GlobalStore) |
 *
 * ## Behavior Matrix
 *
 * | Scenario | Behavior |
 * |----------|----------|
 * | No `inputMapper` | Subflow starts with empty scope (like function with no args) |
 * | No `outputMapper` | Subflow scope changes discarded (like void function) |
 * | Both present | Full data contract (args in, results out) |
 * | Neither present | Subflow runs in complete isolation (side effects only) |
 *
 * RESPONSIBILITIES:
 * - Extract values from parent scope using inputMapper
 * - Create subflow PipelineContext with correct readOnlyContext
 * - Seed subflow's GlobalStore with initial values
 * - Apply output mapping after subflow completion
 *
 * DESIGN DECISIONS:
 * - Separation of Concerns: Each helper function has a single responsibility
 * - Testability: Pure functions that can be unit tested independently
 * - Composability: SubflowExecutor composes these helpers rather than implementing inline
 * - Debuggability: Each step can be logged and inspected separately
 *
 * RELATED:
 * - {@link SubflowExecutor} - Uses these helpers for subflow execution
 * - {@link PipelineRuntime} - Provides the GlobalStore that gets seeded
 * - {@link StageContext} - Used for writing output mapping values
 *
 * _Requirements: subflow-input-mapping 8.1, 8.2, 8.3, 8.4, 8.5_
 * _Requirements: subflow-scope-isolation 1.1, 1.2, 1.4, 5.1, 5.2, 5.3_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyOutputMapping = exports.seedSubflowGlobalStore = exports.createSubflowPipelineContext = exports.getInitialScopeValues = exports.extractParentScopeValues = void 0;
/**
 * extractParentScopeValues
 * ------------------------------------------------------------------
 * Extracts values from parent scope using the inputMapper function.
 *
 * WHY: This is a pure function that can be unit tested independently.
 * It isolates the inputMapper invocation from the rest of the subflow setup.
 *
 * @param parentScope - The parent flow's scope object
 * @param options - Subflow mount options containing the inputMapper
 * @returns Object of key-value pairs to seed in subflow
 *
 * _Requirements: subflow-input-mapping 8.1_
 */
function extractParentScopeValues(parentScope, options) {
    if (!(options === null || options === void 0 ? void 0 : options.inputMapper)) {
        return {};
    }
    const result = options.inputMapper(parentScope);
    // Handle null/undefined returns as empty object
    if (result === null || result === undefined) {
        return {};
    }
    return result;
}
exports.extractParentScopeValues = extractParentScopeValues;
/**
 * getInitialScopeValues
 * ------------------------------------------------------------------
 * Gets the initial scope values for a subflow.
 *
 * WHY: Always uses isolated mode - only inputMapper values are included.
 * This enforces the "subflow = pure function" mental model where subflows
 * only receive data explicitly passed via inputMapper.
 *
 * @param parentScope - The parent flow's scope object
 * @param options - Subflow mount options
 * @returns Object of initial values for subflow's readOnlyContext
 *
 * _Requirements: subflow-input-mapping 6.1, 8.2_
 * _Requirements: subflow-scope-isolation 7.2, 7.3_
 */
function getInitialScopeValues(parentScope, options) {
    // SIMPLIFIED: Removed scopeMode handling, always isolated
    // Subflow = Pure Function: only inputMapper values are passed as "arguments"
    return extractParentScopeValues(parentScope, options);
}
exports.getInitialScopeValues = getInitialScopeValues;
/**
 * createSubflowPipelineContext
 * ------------------------------------------------------------------
 * Creates a new PipelineContext for subflow execution.
 *
 * WHY: The key change is setting `readOnlyContext` to the mapped input values,
 * so that StageRunner passes these values to ScopeFactory. This ensures
 * subflow stages can access inputMapper values via their scope.
 *
 * ## Why This Is Needed
 *
 * The bug was that `inputMapper` values were seeded to subflow's GlobalStore,
 * but `StageRunner` uses `ctx.readOnlyContext` when creating scopes via `ScopeFactory`.
 * Without this fix, stages would receive the parent's `readOnlyContext` instead
 * of the mapped input values.
 *
 * @param parentCtx - The parent pipeline's context
 * @param subflowRuntime - The subflow's isolated PipelineRuntime
 * @param mappedInput - The values from inputMapper to use as readOnlyContext
 * @returns A new PipelineContext for the subflow
 *
 * _Requirements: subflow-scope-isolation 1.1, 1.2, 1.4, 5.1, 5.2, 5.3_
 */
function createSubflowPipelineContext(parentCtx, subflowRuntime, mappedInput) {
    return {
        // Copy from parent context
        stageMap: parentCtx.stageMap,
        root: parentCtx.root,
        ScopeFactory: parentCtx.ScopeFactory,
        subflows: parentCtx.subflows,
        throttlingErrorChecker: parentCtx.throttlingErrorChecker,
        streamHandlers: parentCtx.streamHandlers,
        scopeProtectionMode: parentCtx.scopeProtectionMode,
        extractor: parentCtx.extractor,
        // Override with subflow-specific values
        pipelineRuntime: subflowRuntime,
        readOnlyContext: mappedInput, // KEY FIX: Use mapped input as readOnlyContext
        // Propagate narrative generator from parent so subflow events are recorded
        narrativeGenerator: parentCtx.narrativeGenerator,
    };
}
exports.createSubflowPipelineContext = createSubflowPipelineContext;
/**
 * seedSubflowGlobalStore
 * ------------------------------------------------------------------
 * Seeds the subflow's GlobalStore with initial values.
 *
 * WHY: Called before subflow execution begins to make inputMapper values
 * available to all stages in the subflow via the GlobalStore.
 *
 * DESIGN: Uses the root stage context's setGlobal method to write values
 * to the GlobalStore, making them accessible to all stages in the subflow.
 *
 * @param subflowRuntime - The subflow's PipelineRuntime
 * @param initialValues - Object of key-value pairs to seed
 *
 * _Requirements: subflow-input-mapping 2.2, 8.2_
 */
function seedSubflowGlobalStore(subflowRuntime, initialValues) {
    const rootContext = subflowRuntime.rootStageContext;
    for (const [key, value] of Object.entries(initialValues)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // For nested objects (e.g., { agent: { messages: [...] } }),
            // write each nested key via setObject to use pipeline-namespaced paths.
            // WHY: setGlobal writes to root GlobalStore, but stages read from
            // pipeline-namespaced scope via setObject/getValue. Using setObject
            // ensures the data lands in the correct namespace.
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                rootContext.setObject([key], nestedKey, nestedValue);
            }
        }
        else {
            // Scalar values go to root level via setGlobal (backward compat)
            rootContext.setGlobal(key, value);
        }
    }
    // Commit the patch to make values visible immediately
    rootContext.commit();
}
exports.seedSubflowGlobalStore = seedSubflowGlobalStore;
/**
 * applyOutputMapping
 * ------------------------------------------------------------------
 * Applies output mapping after subflow completion.
 *
 * WHY: Writes mapped values back to parent scope, enabling subflows to
 * return data to their parent flow in a controlled way.
 *
 * DESIGN: This is called after the subflow completes successfully.
 * If no outputMapper is provided, returns undefined (no-op).
 *
 * @param subflowOutput - The subflow's final output
 * @param parentScope - The parent flow's scope object
 * @param parentContext - The parent stage's context (for writing)
 * @param options - Subflow mount options containing the outputMapper
 * @returns The mapped output values (for debugging), or undefined if no mapper
 *
 * _Requirements: subflow-input-mapping 3.4, 3.5, 8.3_
 */
function applyOutputMapping(subflowOutput, parentScope, parentContext, options) {
    if (!(options === null || options === void 0 ? void 0 : options.outputMapper)) {
        return undefined;
    }
    const mappedOutput = options.outputMapper(subflowOutput, parentScope);
    // Handle null/undefined returns
    if (mappedOutput === null || mappedOutput === undefined) {
        return undefined;
    }
    // Write mapped values to parent context using merge semantics.
    // WHY: A subflow is a contributor — it adds data to the parent scope,
    // not replaces it. Arrays are appended, objects are shallow-merged,
    // scalars are replaced. This matches the "subflow as function return"
    // mental model where the return value enriches the caller's state.
    //
    // Uses StageContext.appendToArray() and mergeObject() primitives
    // so the write goes through the standard WriteBuffer → commit path.
    for (const [key, value] of Object.entries(mappedOutput)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Nested object: merge each nested key with appropriate semantics
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                if (Array.isArray(nestedValue)) {
                    parentContext.appendToArray([key], nestedKey, nestedValue);
                }
                else if (typeof nestedValue === 'object' && nestedValue !== null) {
                    parentContext.mergeObject([key], nestedKey, nestedValue);
                }
                else {
                    parentContext.setObject([key], nestedKey, nestedValue);
                }
            }
        }
        else if (Array.isArray(value)) {
            // Top-level array: append to existing
            const existing = parentContext.getGlobal(key);
            if (Array.isArray(existing)) {
                parentContext.setGlobal(key, [...existing, ...value]);
            }
            else {
                parentContext.setGlobal(key, value);
            }
        }
        else {
            parentContext.setGlobal(key, value);
        }
    }
    return mappedOutput;
}
exports.applyOutputMapping = applyOutputMapping;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3ViZmxvd0lucHV0TWFwcGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvZXhlY3V0b3IvaGFuZGxlcnMvU3ViZmxvd0lucHV0TWFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpRUc7OztBQU1IOzs7Ozs7Ozs7Ozs7O0dBYUc7QUFDSCxTQUFnQix3QkFBd0IsQ0FDdEMsV0FBeUIsRUFDekIsT0FBMEQ7SUFFMUQsSUFBSSxDQUFDLENBQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLFdBQVcsQ0FBQSxFQUFFLENBQUM7UUFDMUIsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUVoRCxnREFBZ0Q7SUFDaEQsSUFBSSxNQUFNLEtBQUssSUFBSSxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUM1QyxPQUFPLEVBQUUsQ0FBQztJQUNaLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDO0FBaEJELDREQWdCQztBQUVEOzs7Ozs7Ozs7Ozs7Ozs7R0FlRztBQUNILFNBQWdCLHFCQUFxQixDQUNuQyxXQUF5QixFQUN6QixPQUEwRDtJQUUxRCwwREFBMEQ7SUFDMUQsNkVBQTZFO0lBQzdFLE9BQU8sd0JBQXdCLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBNEIsQ0FBQztBQUNuRixDQUFDO0FBUEQsc0RBT0M7QUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXNCRztBQUNILFNBQWdCLDRCQUE0QixDQUMxQyxTQUF3QyxFQUN4QyxjQUErQixFQUMvQixXQUFvQztJQUVwQyxPQUFPO1FBQ0wsMkJBQTJCO1FBQzNCLFFBQVEsRUFBRSxTQUFTLENBQUMs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InNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU3ViZmxvd0lucHV0TWFwcGVyLnRzXG4gKlxuICogV0hZOiBQcm92aWRlcyBtb2R1bGFyIGhlbHBlciBmdW5jdGlvbnMgZm9yIHN1YmZsb3cgaW5wdXQvb3V0cHV0IG1hcHBpbmcuXG4gKiBUaGlzIG1vZHVsZSBpcyBleHRyYWN0ZWQgdG8gZm9sbG93IFNpbmdsZSBSZXNwb25zaWJpbGl0eSBQcmluY2lwbGUgYW5kIGVuYWJsZVxuICogaW5kZXBlbmRlbnQgdW5pdCB0ZXN0aW5nIG9mIG1hcHBpbmcgbG9naWMuXG4gKlxuICogIyMgTWVudGFsIE1vZGVsOiBTdWJmbG93ID0gUHVyZSBGdW5jdGlvblxuICpcbiAqIEEgKipTdWJmbG93KiogYmVoYXZlcyBsaWtlIGEgKipwdXJlIGZ1bmN0aW9uKiogaW4gcHJvZ3JhbW1pbmc6XG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBTdWJmbG93IGlzIGNvbmNlcHR1YWxseSBsaWtlIHRoaXM6XG4gKiBmdW5jdGlvbiBzdWJmbG93KGFyZ3M6IElucHV0VHlwZSk6IE91dHB1dFR5cGUge1xuICogICAvLyBpbnRlcm5hbCB3b3JrIHdpdGggaXNvbGF0ZWQgc2NvcGUgKGxvY2FsIHZhcmlhYmxlcykuLi5cbiAqICAgcmV0dXJuIHJlc3VsdDtcbiAqIH1cbiAqXG4gKiAvLyBQYXJlbnQgY2FsbHMgaXQgbGlrZTpcbiAqIGNvbnN0IHJlc3VsdCA9IHN1YmZsb3coaW5wdXRNYXBwZXIocGFyZW50U2NvcGUpKTtcbiAqIG91dHB1dE1hcHBlcihyZXN1bHQpIOKGkiB3cml0ZXMgdG8gcGFyZW50U2NvcGVcbiAqIGBgYFxuICpcbiAqIEtleSBjaGFyYWN0ZXJpc3RpY3M6XG4gKiAtICoqSXNvbGF0ZWQgc2NvcGUqKjogU3ViZmxvdyBoYXMgaXRzIG93biBsb2NhbCB2YXJpYWJsZXMgKEdsb2JhbFN0b3JlKVxuICogLSAqKk5vIGNsb3N1cmUqKjogQ2Fubm90IGFjY2VzcyBwYXJlbnQgc2NvcGUgZGlyZWN0bHlcbiAqIC0gKipFeHBsaWNpdCBpbnB1dHMqKjogTXVzdCByZWNlaXZlIGRhdGEgdmlhIGBpbnB1dE1hcHBlcmAgcGFyYW1ldGVyc1xuICogLSAqKkV4cGxpY2l0IG91dHB1dHMqKjogTXVzdCByZXR1cm4gZGF0YSB2aWEgYG91dHB1dE1hcHBlcmAgcmV0dXJuIHZhbHVlXG4gKlxuICogIyMgRGF0YSBGbG93IFJlZmVyZW5jZVxuICpcbiAqIHwgV2hhdCB8IEhvdyBpdCBmbG93cyB8XG4gKiB8LS0tLS0tfC0tLS0tLS0tLS0tLS0tfFxuICogfCBJbnB1dCB0byBzdWJmbG93IHwgYGlucHV0TWFwcGVyKHBhcmVudFNjb3BlKWAg4oaSIHN1YmZsb3cncyBgcmVhZE9ubHlDb250ZXh0YCDihpIgYFNjb3BlRmFjdG9yeWAg4oaSIHN0YWdlIHNjb3BlIHxcbiAqIHwgU3ViZmxvdyByZXR1cm4gdmFsdWUgfCBMYXN0IHN0YWdlJ3MgcmV0dXJuIOKGkiBhdmFpbGFibGUgdG8gcGFyZW50J3MgbmV4dCBzdGFnZSB8XG4gKiB8IFN1YmZsb3cgc2NvcGUg4oaSIHBhcmVudCBzY29wZSB8IGBvdXRwdXRNYXBwZXIoc3ViZmxvd091dHB1dCwgcGFyZW50U2NvcGUpYCDihpIgd3JpdGVzIHRvIHBhcmVudCBHbG9iYWxTdG9yZSB8XG4gKiB8IE5vIG91dHB1dE1hcHBlciB8IFN1YmZsb3cgc2NvcGUgY2hhbmdlcyBhcmUgZGlzY2FyZGVkIChzdGF5IGluIHN1YmZsb3cncyBHbG9iYWxTdG9yZSkgfFxuICpcbiAqICMjIEJlaGF2aW9yIE1hdHJpeFxuICpcbiAqIHwgU2NlbmFyaW8gfCBCZWhhdmlvciB8XG4gKiB8LS0tLS0tLS0tLXwtLS0tLS0tLS0tfFxuICogfCBObyBgaW5wdXRNYXBwZXJgIHwgU3ViZmxvdyBzdGFydHMgd2l0aCBlbXB0eSBzY29wZSAobGlrZSBmdW5jdGlvbiB3aXRoIG5vIGFyZ3MpIHxcbiAqIHwgTm8gYG91dHB1dE1hcHBlcmAgfCBTdWJmbG93IHNjb3BlIGNoYW5nZXMgZGlzY2FyZGVkIChsaWtlIHZvaWQgZnVuY3Rpb24pIHxcbiAqIHwgQm90aCBwcmVzZW50IHwgRnVsbCBkYXRhIGNvbnRyYWN0IChhcmdzIGluLCByZXN1bHRzIG91dCkgfFxuICogfCBOZWl0aGVyIHByZXNlbnQgfCBTdWJmbG93IHJ1bnMgaW4gY29tcGxldGUgaXNvbGF0aW9uIChzaWRlIGVmZmVjdHMgb25seSkgfFxuICpcbiAqIFJFU1BPTlNJQklMSVRJRVM6XG4gKiAtIEV4dHJhY3QgdmFsdWVzIGZyb20gcGFyZW50IHNjb3BlIHVzaW5nIGlucHV0TWFwcGVyXG4gKiAtIENyZWF0ZSBzdWJmbG93IFBpcGVsaW5lQ29udGV4dCB3aXRoIGNvcnJlY3QgcmVhZE9ubHlDb250ZXh0XG4gKiAtIFNlZWQgc3ViZmxvdydzIEdsb2JhbFN0b3JlIHdpdGggaW5pdGlhbCB2YWx1ZXNcbiAqIC0gQXBwbHkgb3V0cHV0IG1hcHBpbmcgYWZ0ZXIgc3ViZmxvdyBjb21wbGV0aW9uXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gU2VwYXJhdGlvbiBvZiBDb25jZXJuczogRWFjaCBoZWxwZXIgZnVuY3Rpb24gaGFzIGEgc2luZ2xlIHJlc3BvbnNpYmlsaXR5XG4gKiAtIFRlc3RhYmlsaXR5OiBQdXJlIGZ1bmN0aW9ucyB0aGF0IGNhbiBiZSB1bml0IHRlc3RlZCBpbmRlcGVuZGVudGx5XG4gKiAtIENvbXBvc2FiaWxpdHk6IFN1YmZsb3dFeGVjdXRvciBjb21wb3NlcyB0aGVzZSBoZWxwZXJzIHJhdGhlciB0aGFuIGltcGxlbWVudGluZyBpbmxpbmVcbiAqIC0gRGVidWdnYWJpbGl0eTogRWFjaCBzdGVwIGNhbiBiZSBsb2dnZWQgYW5kIGluc3BlY3RlZCBzZXBhcmF0ZWx5XG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIFN1YmZsb3dFeGVjdXRvcn0gLSBVc2VzIHRoZXNlIGhlbHBlcnMgZm9yIHN1YmZsb3cgZXhlY3V0aW9uXG4gKiAtIHtAbGluayBQaXBlbGluZVJ1bnRpbWV9IC0gUHJvdmlkZXMgdGhlIEdsb2JhbFN0b3JlIHRoYXQgZ2V0cyBzZWVkZWRcbiAqIC0ge0BsaW5rIFN0YWdlQ29udGV4dH0gLSBVc2VkIGZvciB3cml0aW5nIG91dHB1dCBtYXBwaW5nIHZhbHVlc1xuICpcbiAqIF9SZXF1aXJlbWVudHM6IHN1YmZsb3ctaW5wdXQtbWFwcGluZyA4LjEsIDguMiwgOC4zLCA4LjQsIDguNV9cbiAqIF9SZXF1aXJlbWVudHM6IHN1YmZsb3ctc2NvcGUtaXNvbGF0aW9uIDEuMSwgMS4yLCAxLjQsIDUuMSwgNS4yLCA1LjNfXG4gKi9cblxuaW1wb3J0IHsgU3RhZ2VDb250ZXh0IH0gZnJvbSAnLi4vLi4vbWVtb3J5L1N0YWdlQ29udGV4dCc7XG5pbXBvcnQgeyBQaXBlbGluZVJ1bnRpbWUgfSBmcm9tICcuLi8uLi9tZW1vcnkvUGlwZWxpbmVSdW50aW1lJztcbmltcG9ydCB0eXBlIHsgU3ViZmxvd01vdW50T3B0aW9ucywgUGlwZWxpbmVDb250ZXh0IH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIGV4dHJhY3RQYXJlbnRTY29wZVZhbHVlc1xuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBFeHRyYWN0cyB2YWx1ZXMgZnJvbSBwYXJlbnQgc2NvcGUgdXNpbmcgdGhlIGlucHV0TWFwcGVyIGZ1bmN0aW9uLlxuICpcbiAqIFdIWTogVGhpcyBpcyBhIHB1cmUgZnVuY3Rpb24gdGhhdCBjYW4gYmUgdW5pdCB0ZXN0ZWQgaW5kZXBlbmRlbnRseS5cbiAqIEl0IGlzb2xhdGVzIHRoZSBpbnB1dE1hcHBlciBpbnZvY2F0aW9uIGZyb20gdGhlIHJlc3Qgb2YgdGhlIHN1YmZsb3cgc2V0dXAuXG4gKlxuICogQHBhcmFtIHBhcmVudFNjb3BlIC0gVGhlIHBhcmVudCBmbG93J3Mgc2NvcGUgb2JqZWN0XG4gKiBAcGFyYW0gb3B0aW9ucyAtIFN1YmZsb3cgbW91bnQgb3B0aW9ucyBjb250YWluaW5nIHRoZSBpbnB1dE1hcHBlclxuICogQHJldHVybnMgT2JqZWN0IG9mIGtleS12YWx1ZSBwYWlycyB0byBzZWVkIGluIHN1YmZsb3dcbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiBzdWJmbG93LWlucHV0LW1hcHBpbmcgOC4xX1xuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFBhcmVudFNjb3BlVmFsdWVzPFRQYXJlbnRTY29wZSwgVFN1YmZsb3dJbnB1dD4oXG4gIHBhcmVudFNjb3BlOiBUUGFyZW50U2NvcGUsXG4gIG9wdGlvbnM/OiBTdWJmbG93TW91bnRPcHRpb25zPFRQYXJlbnRTY29wZSwgVFN1YmZsb3dJbnB1dD5cbik6IFRTdWJmbG93SW5wdXQgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIGlmICghb3B0aW9ucz8uaW5wdXRNYXBwZXIpIHtcbiAgICByZXR1cm4ge307XG4gIH1cbiAgXG4gIGNvbnN0IHJlc3VsdCA9IG9wdGlvbnMuaW5wdXRNYXBwZXIocGFyZW50U2NvcGUpO1xuICBcbiAgLy8gSGFuZGxlIG51bGwvdW5kZWZpbmVkIHJldHVybnMgYXMgZW1wdHkgb2JqZWN0XG4gIGlmIChyZXN1bHQgPT09IG51bGwgfHwgcmVzdWx0ID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4ge307XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogZ2V0SW5pdGlhbFNjb3BlVmFsdWVzXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIEdldHMgdGhlIGluaXRpYWwgc2NvcGUgdmFsdWVzIGZvciBhIHN1YmZsb3cuXG4gKlxuICogV0hZOiBBbHdheXMgdXNlcyBpc29sYXRlZCBtb2RlIC0gb25seSBpbnB1dE1hcHBlciB2YWx1ZXMgYXJlIGluY2x1ZGVkLlxuICogVGhpcyBlbmZvcmNlcyB0aGUgXCJzdWJmbG93ID0gcHVyZSBmdW5jdGlvblwiIG1lbnRhbCBtb2RlbCB3aGVyZSBzdWJmbG93c1xuICogb25seSByZWNlaXZlIGRhdGEgZXhwbGljaXRseSBwYXNzZWQgdmlhIGlucHV0TWFwcGVyLlxuICpcbiAqIEBwYXJhbSBwYXJlbnRTY29wZSAtIFRoZSBwYXJlbnQgZmxvdydzIHNjb3BlIG9iamVjdFxuICogQHBhcmFtIG9wdGlvbnMgLSBTdWJmbG93IG1vdW50IG9wdGlvbnNcbiAqIEByZXR1cm5zIE9iamVjdCBvZiBpbml0aWFsIHZhbHVlcyBmb3Igc3ViZmxvdydzIHJlYWRPbmx5Q29udGV4dFxuICpcbiAqIF9SZXF1aXJlbWVudHM6IHN1YmZsb3ctaW5wdXQtbWFwcGluZyA2LjEsIDguMl9cbiAqIF9SZXF1aXJlbWVudHM6IHN1YmZsb3ctc2NvcGUtaXNvbGF0aW9uIDcuMiwgNy4zX1xuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5pdGlhbFNjb3BlVmFsdWVzPFRQYXJlbnRTY29wZSwgVFN1YmZsb3dJbnB1dD4oXG4gIHBhcmVudFNjb3BlOiBUUGFyZW50U2NvcGUsXG4gIG9wdGlvbnM/OiBTdWJmbG93TW91bnRPcHRpb25zPFRQYXJlbnRTY29wZSwgVFN1YmZsb3dJbnB1dD5cbik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgLy8gU0lNUExJRklFRDogUmVtb3ZlZCBzY29wZU1vZGUgaGFuZGxpbmcsIGFsd2F5cyBpc29sYXRlZFxuICAvLyBTdWJmbG93ID0gUHVyZSBGdW5jdGlvbjogb25seSBpbnB1dE1hcHBlciB2YWx1ZXMgYXJlIHBhc3NlZCBhcyBcImFyZ3VtZW50c1wiXG4gIHJldHVybiBleHRyYWN0UGFyZW50U2NvcGVWYWx1ZXMocGFyZW50U2NvcGUsIG9wdGlvbnMpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufVxuXG4vKipcbiAqIGNyZWF0ZVN1YmZsb3dQaXBlbGluZUNvbnRleHRcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogQ3JlYXRlcyBhIG5ldyBQaXBlbGluZUNvbnRleHQgZm9yIHN1YmZsb3cgZXhlY3V0aW9uLlxuICogXG4gKiBXSFk6IFRoZSBrZXkgY2hhbmdlIGlzIHNldHRpbmcgYHJlYWRPbmx5Q29udGV4dGAgdG8gdGhlIG1hcHBlZCBpbnB1dCB2YWx1ZXMsXG4gKiBzbyB0aGF0IFN0YWdlUnVubmVyIHBhc3NlcyB0aGVzZSB2YWx1ZXMgdG8gU2NvcGVGYWN0b3J5LiBUaGlzIGVuc3VyZXNcbiAqIHN1YmZsb3cgc3RhZ2VzIGNhbiBhY2Nlc3MgaW5wdXRNYXBwZXIgdmFsdWVzIHZpYSB0aGVpciBzY29wZS5cbiAqXG4gKiAjIyBXaHkgVGhpcyBJcyBOZWVkZWRcbiAqIFxuICogVGhlIGJ1ZyB3YXMgdGhhdCBgaW5wdXRNYXBwZXJgIHZhbHVlcyB3ZXJlIHNlZWRlZCB0byBzdWJmbG93J3MgR2xvYmFsU3RvcmUsXG4gKiBidXQgYFN0YWdlUnVubmVyYCB1c2VzIGBjdHgucmVhZE9ubHlDb250ZXh0YCB3aGVuIGNyZWF0aW5nIHNjb3BlcyB2aWEgYFNjb3BlRmFjdG9yeWAuXG4gKiBXaXRob3V0IHRoaXMgZml4LCBzdGFnZXMgd291bGQgcmVjZWl2ZSB0aGUgcGFyZW50J3MgYHJlYWRPbmx5Q29udGV4dGAgaW5zdGVhZFxuICogb2YgdGhlIG1hcHBlZCBpbnB1dCB2YWx1ZXMuXG4gKlxuICogQHBhcmFtIHBhcmVudEN0eCAtIFRoZSBwYXJlbnQgcGlwZWxpbmUncyBjb250ZXh0XG4gKiBAcGFyYW0gc3ViZmxvd1J1bnRpbWUgLSBUaGUgc3ViZmxvdydzIGlzb2xhdGVkIFBpcGVsaW5lUnVudGltZVxuICogQHBhcmFtIG1hcHBlZElucHV0IC0gVGhlIHZhbHVlcyBmcm9tIGlucHV0TWFwcGVyIHRvIHVzZSBhcyByZWFkT25seUNvbnRleHRcbiAqIEByZXR1cm5zIEEgbmV3IFBpcGVsaW5lQ29udGV4dCBmb3IgdGhlIHN1YmZsb3dcbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiBzdWJmbG93LXNjb3BlLWlzb2xhdGlvbiAxLjEsIDEuMiwgMS40LCA1LjEsIDUuMiwgNS4zX1xuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3ViZmxvd1BpcGVsaW5lQ29udGV4dDxUT3V0ID0gYW55LCBUU2NvcGUgPSBhbnk+KFxuICBwYXJlbnRDdHg6IFBpcGVsaW5lQ29udGV4dDxUT3V0LCBUU2NvcGU+LFxuICBzdWJmbG93UnVudGltZTogUGlwZWxpbmVSdW50aW1lLFxuICBtYXBwZWRJbnB1dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbik6IFBpcGVsaW5lQ29udGV4dDxUT3V0LCBUU2NvcGU+IHtcbiAgcmV0dXJuIHtcbiAgICAvLyBDb3B5IGZyb20gcGFyZW50IGNvbnRleHRcbiAgICBzdGFnZU1hcDogcGFyZW50Q3R4LnN0YWdlTWFwLFxuICAgIHJvb3Q6IHBhcmVudEN0eC5yb290LFxuICAgIFNjb3BlRmFjdG9yeTogcGFyZW50Q3R4LlNjb3BlRmFjdG9yeSxcbiAgICBzdWJmbG93czogcGFyZW50Q3R4LnN1YmZsb3dzLFxuICAgIHRocm90dGxpbmdFcnJvckNoZWNrZXI6IHBhcmVudEN0eC50aHJvdHRsaW5nRXJyb3JDaGVja2VyLFxuICAgIHN0cmVhbUhhbmRsZXJzOiBwYXJlbnRDdHguc3RyZWFtSGFuZGxlcnMsXG4gICAgc2NvcGVQcm90ZWN0aW9uTW9kZTogcGFyZW50Q3R4LnNjb3BlUHJvdGVjdGlvbk1vZGUsXG4gICAgZXh0cmFjdG9yOiBwYXJlbnRDdHguZXh0cmFjdG9yLFxuICAgIFxuICAgIC8vIE92ZXJyaWRlIHdpdGggc3ViZmxvdy1zcGVjaWZpYyB2YWx1ZXNcbiAgICBwaXBlbGluZVJ1bnRpbWU6IHN1YmZsb3dSdW50aW1lLFxuICAgIHJlYWRPbmx5Q29udGV4dDogbWFwcGVkSW5wdXQsICAvLyBLRVkgRklYOiBVc2UgbWFwcGVkIGlucHV0IGFzIHJlYWRPbmx5Q29udGV4dFxuXG4gICAgLy8gUHJvcGFnYXRlIG5hcnJhdGl2ZSBnZW5lcmF0b3IgZnJvbSBwYXJlbnQgc28gc3ViZmxvdyBldmVudHMgYXJlIHJlY29yZGVkXG4gICAgbmFycmF0aXZlR2VuZXJhdG9yOiBwYXJlbnRDdHgubmFycmF0aXZlR2VuZXJhdG9yLFxuICB9O1xufVxuXG4vKipcbiAqIHNlZWRTdWJmbG93R2xvYmFsU3RvcmVcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogU2VlZHMgdGhlIHN1YmZsb3cncyBHbG9iYWxTdG9yZSB3aXRoIGluaXRpYWwgdmFsdWVzLlxuICpcbiAqIFdIWTogQ2FsbGVkIGJlZm9yZSBzdWJmbG93IGV4ZWN1dGlvbiBiZWdpbnMgdG8gbWFrZSBpbnB1dE1hcHBlciB2YWx1ZXNcbiAqIGF2YWlsYWJsZSB0byBhbGwgc3RhZ2VzIGluIHRoZSBzdWJmbG93IHZpYSB0aGUgR2xvYmFsU3RvcmUuXG4gKlxuICogREVTSUdOOiBVc2VzIHRoZSByb290IHN0YWdlIGNvbnRleHQncyBzZXRHbG9iYWwgbWV0aG9kIHRvIHdyaXRlIHZhbHVlc1xuICogdG8gdGhlIEdsb2JhbFN0b3JlLCBtYWtpbmcgdGhlbSBhY2Nlc3NpYmxlIHRvIGFsbCBzdGFnZXMgaW4gdGhlIHN1YmZsb3cuXG4gKlxuICogQHBhcmFtIHN1YmZsb3dSdW50aW1lIC0gVGhlIHN1YmZsb3cncyBQaXBlbGluZVJ1bnRpbWVcbiAqIEBwYXJhbSBpbml0aWFsVmFsdWVzIC0gT2JqZWN0IG9mIGtleS12YWx1ZSBwYWlycyB0byBzZWVkXG4gKlxuICogX1JlcXVpcmVtZW50czogc3ViZmxvdy1pbnB1dC1tYXBwaW5nIDIuMiwgOC4yX1xuICovXG5leHBvcnQgZnVuY3Rpb24gc2VlZFN1YmZsb3dHbG9iYWxTdG9yZShcbiAgc3ViZmxvd1J1bnRpbWU6IFBpcGVsaW5lUnVudGltZSxcbiAgaW5pdGlhbFZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbik6IHZvaWQge1xuICBjb25zdCByb290Q29udGV4dCA9IHN1YmZsb3dSdW50aW1lLnJvb3RTdGFnZUNvbnRleHQ7XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhpbml0aWFsVmFsdWVzKSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgLy8gRm9yIG5lc3RlZCBvYmplY3RzIChlLmcuLCB7IGFnZW50OiB7IG1lc3NhZ2VzOiBbLi4uXSB9IH0pLFxuICAgICAgLy8gd3JpdGUgZWFjaCBuZXN0ZWQga2V5IHZpYSBzZXRPYmplY3QgdG8gdXNlIHBpcGVsaW5lLW5hbWVzcGFjZWQgcGF0aHMuXG4gICAgICAvLyBXSFk6IHNldEdsb2JhbCB3cml0ZXMgdG8gcm9vdCBHbG9iYWxTdG9yZSwgYnV0IHN0YWdlcyByZWFkIGZyb21cbiAgICAgIC8vIHBpcGVsaW5lLW5hbWVzcGFjZWQgc2NvcGUgdmlhIHNldE9iamVjdC9nZXRWYWx1ZS4gVXNpbmcgc2V0T2JqZWN0XG4gICAgICAvLyBlbnN1cmVzIHRoZSBkYXRhIGxhbmRzIGluIHRoZSBjb3JyZWN0IG5hbWVzcGFjZS5cbiAgICAgIGZvciAoY29uc3QgW25lc3RlZEtleSwgbmVzdGVkVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSkge1xuICAgICAgICByb290Q29udGV4dC5zZXRPYmplY3QoW2tleV0sIG5lc3RlZEtleSwgbmVzdGVkVmFsdWUpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTY2FsYXIgdmFsdWVzIGdvIHRvIHJvb3QgbGV2ZWwgdmlhIHNldEdsb2JhbCAoYmFja3dhcmQgY29tcGF0KVxuICAgICAgcm9vdENvbnRleHQuc2V0R2xvYmFsKGtleSwgdmFsdWUpO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gQ29tbWl0IHRoZSBwYXRjaCB0byBtYWtlIHZhbHVlcyB2aXNpYmxlIGltbWVkaWF0ZWx5XG4gIHJvb3RDb250ZXh0LmNvbW1pdCgpO1xufVxuXG4vKipcbiAqIGFwcGx5T3V0cHV0TWFwcGluZ1xuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBBcHBsaWVzIG91dHB1dCBtYXBwaW5nIGFmdGVyIHN1YmZsb3cgY29tcGxldGlvbi5cbiAqXG4gKiBXSFk6IFdyaXRlcyBtYXBwZWQgdmFsdWVzIGJhY2sgdG8gcGFyZW50IHNjb3BlLCBlbmFibGluZyBzdWJmbG93cyB0b1xuICogcmV0dXJuIGRhdGEgdG8gdGhlaXIgcGFyZW50IGZsb3cgaW4gYSBjb250cm9sbGVkIHdheS5cbiAqXG4gKiBERVNJR046IFRoaXMgaXMgY2FsbGVkIGFmdGVyIHRoZSBzdWJmbG93IGNvbXBsZXRlcyBzdWNjZXNzZnVsbHkuXG4gKiBJZiBubyBvdXRwdXRNYXBwZXIgaXMgcHJvdmlkZWQsIHJldHVybnMgdW5kZWZpbmVkIChuby1vcCkuXG4gKlxuICogQHBhcmFtIHN1YmZsb3dPdXRwdXQgLSBUaGUgc3ViZmxvdydzIGZpbmFsIG91dHB1dFxuICogQHBhcmFtIHBhcmVudFNjb3BlIC0gVGhlIHBhcmVudCBmbG93J3Mgc2NvcGUgb2JqZWN0XG4gKiBAcGFyYW0gcGFyZW50Q29udGV4dCAtIFRoZSBwYXJlbnQgc3RhZ2UncyBjb250ZXh0IChmb3Igd3JpdGluZylcbiAqIEBwYXJhbSBvcHRpb25zIC0gU3ViZmxvdyBtb3VudCBvcHRpb25zIGNvbnRhaW5pbmcgdGhlIG91dHB1dE1hcHBlclxuICogQHJldHVybnMgVGhlIG1hcHBlZCBvdXRwdXQgdmFsdWVzIChmb3IgZGVidWdnaW5nKSwgb3IgdW5kZWZpbmVkIGlmIG5vIG1hcHBlclxuICpcbiAqIF9SZXF1aXJlbWVudHM6IHN1YmZsb3ctaW5wdXQtbWFwcGluZyAzLjQsIDMuNSwgOC4zX1xuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlPdXRwdXRNYXBwaW5nPFRQYXJlbnRTY29wZSwgVFN1YmZsb3dPdXRwdXQ+KFxuICBzdWJmbG93T3V0cHV0OiBUU3ViZmxvd091dHB1dCxcbiAgcGFyZW50U2NvcGU6IFRQYXJlbnRTY29wZSxcbiAgcGFyZW50Q29udGV4dDogU3RhZ2VDb250ZXh0LFxuICBvcHRpb25zPzogU3ViZmxvd01vdW50T3B0aW9uczxUUGFyZW50U2NvcGUsIGFueSwgVFN1YmZsb3dPdXRwdXQ+XG4pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gIGlmICghb3B0aW9ucz8ub3V0cHV0TWFwcGVyKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNvbnN0IG1hcHBlZE91dHB1dCA9IG9wdGlvbnMub3V0cHV0TWFwcGVyKHN1YmZsb3dPdXRwdXQsIHBhcmVudFNjb3BlKTtcblxuICAvLyBIYW5kbGUgbnVsbC91bmRlZmluZWQgcmV0dXJuc1xuICBpZiAobWFwcGVkT3V0cHV0ID09PSBudWxsIHx8IG1hcHBlZE91dHB1dCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIFdyaXRlIG1hcHBlZCB2YWx1ZXMgdG8gcGFyZW50IGNvbnRleHQgdXNpbmcgbWVyZ2Ugc2VtYW50aWNzLlxuICAvLyBXSFk6IEEgc3ViZmxvdyBpcyBhIGNvbnRyaWJ1dG9yIOKAlCBpdCBhZGRzIGRhdGEgdG8gdGhlIHBhcmVudCBzY29wZSxcbiAgLy8gbm90IHJlcGxhY2VzIGl0LiBBcnJheXMgYXJlIGFwcGVuZGVkLCBvYmplY3RzIGFyZSBzaGFsbG93LW1lcmdlZCxcbiAgLy8gc2NhbGFycyBhcmUgcmVwbGFjZWQuIFRoaXMgbWF0Y2hlcyB0aGUgXCJzdWJmbG93IGFzIGZ1bmN0aW9uIHJldHVyblwiXG4gIC8vIG1lbnRhbCBtb2RlbCB3aGVyZSB0aGUgcmV0dXJuIHZhbHVlIGVucmljaGVzIHRoZSBjYWxsZXIncyBzdGF0ZS5cbiAgLy9cbiAgLy8gVXNlcyBTdGFnZUNvbnRleHQuYXBwZW5kVG9BcnJheSgpIGFuZCBtZXJnZU9iamVjdCgpIHByaW1pdGl2ZXNcbiAgLy8gc28gdGhlIHdyaXRlIGdvZXMgdGhyb3VnaCB0aGUgc3RhbmRhcmQgV3JpdGVCdWZmZXIg4oaSIGNvbW1pdCBwYXRoLlxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhtYXBwZWRPdXRwdXQpKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAvLyBOZXN0ZWQgb2JqZWN0OiBtZXJnZSBlYWNoIG5lc3RlZCBrZXkgd2l0aCBhcHByb3ByaWF0ZSBzZW1hbnRpY3NcbiAgICAgIGZvciAoY29uc3QgW25lc3RlZEtleSwgbmVzdGVkVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXN0ZWRWYWx1ZSkpIHtcbiAgICAgICAgICBwYXJlbnRDb250ZXh0LmFwcGVuZFRvQXJyYXkoW2tleV0sIG5lc3RlZEtleSwgbmVzdGVkVmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBuZXN0ZWRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbmVzdGVkVmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICBwYXJlbnRDb250ZXh0Lm1lcmdlT2JqZWN0KFtrZXldLCBuZXN0ZWRLZXksIG5lc3RlZFZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJlbnRDb250ZXh0LnNldE9iamVjdChba2V5XSwgbmVzdGVkS2V5LCBuZXN0ZWRWYWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAvLyBUb3AtbGV2ZWwgYXJyYXk6IGFwcGVuZCB0byBleGlzdGluZ1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSBwYXJlbnRDb250ZXh0LmdldEdsb2JhbChrZXkpO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZXhpc3RpbmcpKSB7XG4gICAgICAgIHBhcmVudENvbnRleHQuc2V0R2xvYmFsKGtleSwgWy4uLmV4aXN0aW5nLCAuLi52YWx1ZV0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFyZW50Q29udGV4dC5zZXRHbG9iYWwoa2V5LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmVudENvbnRleHQuc2V0R2xvYmFsKGtleSwgdmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtYXBwZWRPdXRwdXQ7XG59XG4iXX0=