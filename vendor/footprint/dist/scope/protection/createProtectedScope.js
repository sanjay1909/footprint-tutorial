"use strict";
/**
 * Scope Protection Implementation
 *
 * Provides a Proxy-based protection layer that intercepts direct property
 * assignments on scope objects and provides clear error messages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProtectedScope = exports.createErrorMessage = void 0;
/**
 * Creates a descriptive error message for direct property assignment.
 *
 * @param propertyName - The property that was being assigned
 * @param stageName - The stage where the error occurred
 * @returns A formatted error message with guidance
 */
function createErrorMessage(propertyName, stageName) {
    return `[Scope Access Error] Direct property assignment detected in stage "${stageName}".

❌ Incorrect: scope.${propertyName} = value

✅ Correct: scope.setObject([], '${propertyName}', value)
       or: scope.setValue('${propertyName}', value)

Why this matters:
Each stage receives a NEW scope instance from ScopeFactory. Direct property 
assignments are lost when the next stage executes. Use setObject() or setValue() 
to persist data to the shared GlobalStore.`;
}
exports.createErrorMessage = createErrorMessage;
/**
 * Wraps a scope object in a Proxy that intercepts direct property assignments.
 *
 * This function provides a defensive programming mechanism that prevents
 * developers from accidentally using direct property assignment on scope
 * objects, which silently fails to persist data across pipeline stages.
 *
 * @param scope - The raw scope object to protect
 * @param options - Protection options including mode and stage name
 * @returns A Proxy-wrapped scope that intercepts direct assignments
 *
 * @example
 * ```typescript
 * const rawScope = scopeFactory(context, 'myStage');
 * const scope = createProtectedScope(rawScope, {
 *   mode: 'error',
 *   stageName: 'myStage'
 * });
 *
 * // This will throw an error:
 * scope.config = { foo: 'bar' };
 *
 * // This works correctly:
 * scope.setObject([], 'config', { foo: 'bar' });
 * ```
 */
function createProtectedScope(scope, options = {}) {
    const { mode = 'error', stageName = 'unknown', logger = console.warn, 
    // Default allowed internal properties for StageContext compatibility
    allowedInternalProperties = [
        'writeBuffer', 'next', 'children', 'parent', 'executionHistory',
        'branchId', 'isDecider', 'isFork', 'debug', 'stageName', 'pipelineId',
        'globalStore'
    ] } = options;
    // If protection is off, return the scope unchanged
    if (mode === 'off') {
        return scope;
    }
    // Create a set of allowed internal properties for fast lookup
    const allowedInternals = new Set(allowedInternalProperties);
    return new Proxy(scope, {
        /**
         * Get trap - passes through to the underlying object unchanged.
         * This allows normal property reads and method calls.
         */
        get(target, prop, receiver) {
            return Reflect.get(target, prop, receiver);
        },
        /**
         * Set trap - intercepts property assignments.
         *
         * Blocks ALL property assignments except for explicitly allowed internal
         * properties (needed for StageContext compatibility).
         *
         * In 'error' mode, throws an error with a descriptive message.
         * In 'warn' mode, logs a warning but allows the assignment.
         */
        set(target, prop, value, receiver) {
            // Allow assignments to explicitly allowed internal properties
            // This handles lazy initialization of class properties like writeBuffer
            if (allowedInternals.has(prop)) {
                return Reflect.set(target, prop, value, receiver);
            }
            const propName = String(prop);
            const message = createErrorMessage(propName, stageName);
            if (mode === 'error') {
                throw new Error(message);
            }
            else if (mode === 'warn') {
                logger(message);
                return Reflect.set(target, prop, value, receiver);
            }
            // Fallback (shouldn't reach here with current modes)
            return Reflect.set(target, prop, value, receiver);
        }
    });
}
exports.createProtectedScope = createProtectedScope;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlUHJvdGVjdGVkU2NvcGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NvcGUvcHJvdGVjdGlvbi9jcmVhdGVQcm90ZWN0ZWRTY29wZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7OztBQUlIOzs7Ozs7R0FNRztBQUNILFNBQWdCLGtCQUFrQixDQUFDLFlBQW9CLEVBQUUsU0FBaUI7SUFDeEUsT0FBTyxzRUFBc0UsU0FBUzs7cUJBRW5FLFlBQVk7O2tDQUVDLFlBQVk7NkJBQ2pCLFlBQVk7Ozs7OzJDQUtFLENBQUM7QUFDNUMsQ0FBQztBQVpELGdEQVlDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F5Qkc7QUFDSCxTQUFnQixvQkFBb0IsQ0FDbEMsS0FBUSxFQUNSLFVBQWtDLEVBQUU7SUFFcEMsTUFBTSxFQUNKLElBQUksR0FBRyxPQUFPLEVBQ2QsU0FBUyxHQUFHLFNBQVMsRUFDckIsTUFBTSxHQUFHLE9BQU8sQ0FBQyxJQUFJO0lBQ3JCLHFFQUFxRTtJQUNyRSx5QkFBeUIsR0FBRztRQUMxQixhQUFhLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsa0JBQWtCO1FBQy9ELFVBQVUsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWTtRQUNyRSxhQUFhO0tBQ2QsRUFDRixHQUFHLE9BQU8sQ0FBQztJQUVaLG1EQUFtRDtJQUNuRCxJQUFJLElBQUksS0FBSyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFFRCw4REFBOEQ7SUFDOUQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsQ0FBa0IseUJBQXlCLENBQUMsQ0FBQztJQUU3RSxPQUFPLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRTtRQUN0Qjs7O1dBR0c7UUFDSCxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRO1lBQ3hCLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFFRDs7Ozs7Ozs7V0FRRztRQUNILEdBQUcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRO1lBQy9CLDhEQUE4RDtZQUM5RCx3RUFBd0U7WUFDeEUsSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDL0IsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3BELENBQUM7WUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsTUFBTSxPQUFPLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRXhELElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzNCLENBQUM7aUJBQU0sSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQzNCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDaEIsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3BELENBQUM7WUFFRCxxREFBcUQ7WUFDckQsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3BELENBQUM7S0FDRixDQUFDLENBQUM7QUFDTCxDQUFDO0FBL0RELG9EQStEQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2NvcGUgUHJvdGVjdGlvbiBJbXBsZW1lbnRhdGlvblxuICogXG4gKiBQcm92aWRlcyBhIFByb3h5LWJhc2VkIHByb3RlY3Rpb24gbGF5ZXIgdGhhdCBpbnRlcmNlcHRzIGRpcmVjdCBwcm9wZXJ0eVxuICogYXNzaWdubWVudHMgb24gc2NvcGUgb2JqZWN0cyBhbmQgcHJvdmlkZXMgY2xlYXIgZXJyb3IgbWVzc2FnZXMuXG4gKi9cblxuaW1wb3J0IHsgU2NvcGVQcm90ZWN0aW9uT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBkZXNjcmlwdGl2ZSBlcnJvciBtZXNzYWdlIGZvciBkaXJlY3QgcHJvcGVydHkgYXNzaWdubWVudC5cbiAqIFxuICogQHBhcmFtIHByb3BlcnR5TmFtZSAtIFRoZSBwcm9wZXJ0eSB0aGF0IHdhcyBiZWluZyBhc3NpZ25lZFxuICogQHBhcmFtIHN0YWdlTmFtZSAtIFRoZSBzdGFnZSB3aGVyZSB0aGUgZXJyb3Igb2NjdXJyZWRcbiAqIEByZXR1cm5zIEEgZm9ybWF0dGVkIGVycm9yIG1lc3NhZ2Ugd2l0aCBndWlkYW5jZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXJyb3JNZXNzYWdlKHByb3BlcnR5TmFtZTogc3RyaW5nLCBzdGFnZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgW1Njb3BlIEFjY2VzcyBFcnJvcl0gRGlyZWN0IHByb3BlcnR5IGFzc2lnbm1lbnQgZGV0ZWN0ZWQgaW4gc3RhZ2UgXCIke3N0YWdlTmFtZX1cIi5cblxu4p2MIEluY29ycmVjdDogc2NvcGUuJHtwcm9wZXJ0eU5hbWV9ID0gdmFsdWVcblxu4pyFIENvcnJlY3Q6IHNjb3BlLnNldE9iamVjdChbXSwgJyR7cHJvcGVydHlOYW1lfScsIHZhbHVlKVxuICAgICAgIG9yOiBzY29wZS5zZXRWYWx1ZSgnJHtwcm9wZXJ0eU5hbWV9JywgdmFsdWUpXG5cbldoeSB0aGlzIG1hdHRlcnM6XG5FYWNoIHN0YWdlIHJlY2VpdmVzIGEgTkVXIHNjb3BlIGluc3RhbmNlIGZyb20gU2NvcGVGYWN0b3J5LiBEaXJlY3QgcHJvcGVydHkgXG5hc3NpZ25tZW50cyBhcmUgbG9zdCB3aGVuIHRoZSBuZXh0IHN0YWdlIGV4ZWN1dGVzLiBVc2Ugc2V0T2JqZWN0KCkgb3Igc2V0VmFsdWUoKSBcbnRvIHBlcnNpc3QgZGF0YSB0byB0aGUgc2hhcmVkIEdsb2JhbFN0b3JlLmA7XG59XG5cbi8qKlxuICogV3JhcHMgYSBzY29wZSBvYmplY3QgaW4gYSBQcm94eSB0aGF0IGludGVyY2VwdHMgZGlyZWN0IHByb3BlcnR5IGFzc2lnbm1lbnRzLlxuICogXG4gKiBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGEgZGVmZW5zaXZlIHByb2dyYW1taW5nIG1lY2hhbmlzbSB0aGF0IHByZXZlbnRzXG4gKiBkZXZlbG9wZXJzIGZyb20gYWNjaWRlbnRhbGx5IHVzaW5nIGRpcmVjdCBwcm9wZXJ0eSBhc3NpZ25tZW50IG9uIHNjb3BlXG4gKiBvYmplY3RzLCB3aGljaCBzaWxlbnRseSBmYWlscyB0byBwZXJzaXN0IGRhdGEgYWNyb3NzIHBpcGVsaW5lIHN0YWdlcy5cbiAqIFxuICogQHBhcmFtIHNjb3BlIC0gVGhlIHJhdyBzY29wZSBvYmplY3QgdG8gcHJvdGVjdFxuICogQHBhcmFtIG9wdGlvbnMgLSBQcm90ZWN0aW9uIG9wdGlvbnMgaW5jbHVkaW5nIG1vZGUgYW5kIHN0YWdlIG5hbWVcbiAqIEByZXR1cm5zIEEgUHJveHktd3JhcHBlZCBzY29wZSB0aGF0IGludGVyY2VwdHMgZGlyZWN0IGFzc2lnbm1lbnRzXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCByYXdTY29wZSA9IHNjb3BlRmFjdG9yeShjb250ZXh0LCAnbXlTdGFnZScpO1xuICogY29uc3Qgc2NvcGUgPSBjcmVhdGVQcm90ZWN0ZWRTY29wZShyYXdTY29wZSwgeyBcbiAqICAgbW9kZTogJ2Vycm9yJywgXG4gKiAgIHN0YWdlTmFtZTogJ215U3RhZ2UnIFxuICogfSk7XG4gKiBcbiAqIC8vIFRoaXMgd2lsbCB0aHJvdyBhbiBlcnJvcjpcbiAqIHNjb3BlLmNvbmZpZyA9IHsgZm9vOiAnYmFyJyB9O1xuICogXG4gKiAvLyBUaGlzIHdvcmtzIGNvcnJlY3RseTpcbiAqIHNjb3BlLnNldE9iamVjdChbXSwgJ2NvbmZpZycsIHsgZm9vOiAnYmFyJyB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUHJvdGVjdGVkU2NvcGU8VCBleHRlbmRzIG9iamVjdD4oXG4gIHNjb3BlOiBULFxuICBvcHRpb25zOiBTY29wZVByb3RlY3Rpb25PcHRpb25zID0ge31cbik6IFQge1xuICBjb25zdCB7IFxuICAgIG1vZGUgPSAnZXJyb3InLCBcbiAgICBzdGFnZU5hbWUgPSAndW5rbm93bicsIFxuICAgIGxvZ2dlciA9IGNvbnNvbGUud2FybixcbiAgICAvLyBEZWZhdWx0IGFsbG93ZWQgaW50ZXJuYWwgcHJvcGVydGllcyBmb3IgU3RhZ2VDb250ZXh0IGNvbXBhdGliaWxpdHlcbiAgICBhbGxvd2VkSW50ZXJuYWxQcm9wZXJ0aWVzID0gW1xuICAgICAgJ3dyaXRlQnVmZmVyJywgJ25leHQnLCAnY2hpbGRyZW4nLCAncGFyZW50JywgJ2V4ZWN1dGlvbkhpc3RvcnknLFxuICAgICAgJ2JyYW5jaElkJywgJ2lzRGVjaWRlcicsICdpc0ZvcmsnLCAnZGVidWcnLCAnc3RhZ2VOYW1lJywgJ3BpcGVsaW5lSWQnLFxuICAgICAgJ2dsb2JhbFN0b3JlJ1xuICAgIF1cbiAgfSA9IG9wdGlvbnM7XG4gIFxuICAvLyBJZiBwcm90ZWN0aW9uIGlzIG9mZiwgcmV0dXJuIHRoZSBzY29wZSB1bmNoYW5nZWRcbiAgaWYgKG1vZGUgPT09ICdvZmYnKSB7XG4gICAgcmV0dXJuIHNjb3BlO1xuICB9XG4gIFxuICAvLyBDcmVhdGUgYSBzZXQgb2YgYWxsb3dlZCBpbnRlcm5hbCBwcm9wZXJ0aWVzIGZvciBmYXN0IGxvb2t1cFxuICBjb25zdCBhbGxvd2VkSW50ZXJuYWxzID0gbmV3IFNldDxzdHJpbmcgfCBzeW1ib2w+KGFsbG93ZWRJbnRlcm5hbFByb3BlcnRpZXMpO1xuICBcbiAgcmV0dXJuIG5ldyBQcm94eShzY29wZSwge1xuICAgIC8qKlxuICAgICAqIEdldCB0cmFwIC0gcGFzc2VzIHRocm91Z2ggdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0IHVuY2hhbmdlZC5cbiAgICAgKiBUaGlzIGFsbG93cyBub3JtYWwgcHJvcGVydHkgcmVhZHMgYW5kIG1ldGhvZCBjYWxscy5cbiAgICAgKi9cbiAgICBnZXQodGFyZ2V0LCBwcm9wLCByZWNlaXZlcikge1xuICAgICAgcmV0dXJuIFJlZmxlY3QuZ2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpO1xuICAgIH0sXG4gICAgXG4gICAgLyoqXG4gICAgICogU2V0IHRyYXAgLSBpbnRlcmNlcHRzIHByb3BlcnR5IGFzc2lnbm1lbnRzLlxuICAgICAqIFxuICAgICAqIEJsb2NrcyBBTEwgcHJvcGVydHkgYXNzaWdubWVudHMgZXhjZXB0IGZvciBleHBsaWNpdGx5IGFsbG93ZWQgaW50ZXJuYWxcbiAgICAgKiBwcm9wZXJ0aWVzIChuZWVkZWQgZm9yIFN0YWdlQ29udGV4dCBjb21wYXRpYmlsaXR5KS5cbiAgICAgKiBcbiAgICAgKiBJbiAnZXJyb3InIG1vZGUsIHRocm93cyBhbiBlcnJvciB3aXRoIGEgZGVzY3JpcHRpdmUgbWVzc2FnZS5cbiAgICAgKiBJbiAnd2FybicgbW9kZSwgbG9ncyBhIHdhcm5pbmcgYnV0IGFsbG93cyB0aGUgYXNzaWdubWVudC5cbiAgICAgKi9cbiAgICBzZXQodGFyZ2V0LCBwcm9wLCB2YWx1ZSwgcmVjZWl2ZXIpIHtcbiAgICAgIC8vIEFsbG93IGFzc2lnbm1lbnRzIHRvIGV4cGxpY2l0bHkgYWxsb3dlZCBpbnRlcm5hbCBwcm9wZXJ0aWVzXG4gICAgICAvLyBUaGlzIGhhbmRsZXMgbGF6eSBpbml0aWFsaXphdGlvbiBvZiBjbGFzcyBwcm9wZXJ0aWVzIGxpa2Ugd3JpdGVCdWZmZXJcbiAgICAgIGlmIChhbGxvd2VkSW50ZXJuYWxzLmhhcyhwcm9wKSkge1xuICAgICAgICByZXR1cm4gUmVmbGVjdC5zZXQodGFyZ2V0LCBwcm9wLCB2YWx1ZSwgcmVjZWl2ZXIpO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBwcm9wTmFtZSA9IFN0cmluZyhwcm9wKTtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjcmVhdGVFcnJvck1lc3NhZ2UocHJvcE5hbWUsIHN0YWdlTmFtZSk7XG4gICAgICBcbiAgICAgIGlmIChtb2RlID09PSAnZXJyb3InKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ3dhcm4nKSB7XG4gICAgICAgIGxvZ2dlcihtZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuIFJlZmxlY3Quc2V0KHRhcmdldCwgcHJvcCwgdmFsdWUsIHJlY2VpdmVyKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgKHNob3VsZG4ndCByZWFjaCBoZXJlIHdpdGggY3VycmVudCBtb2RlcylcbiAgICAgIHJldHVybiBSZWZsZWN0LnNldCh0YXJnZXQsIHByb3AsIHZhbHVlLCByZWNlaXZlcik7XG4gICAgfVxuICB9KTtcbn1cbiJdfQ==