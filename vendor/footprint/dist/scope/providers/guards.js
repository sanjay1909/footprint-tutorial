"use strict";
/**
 * guards.ts
 *
 * WHY: Heuristic functions for detecting whether an input is a class constructor,
 * factory function, or BaseState subclass. Used by the registry to determine
 * which provider type to create.
 *
 * RESPONSIBILITIES:
 * - Detect class constructors vs plain functions
 * - Detect factory functions (functions that are NOT class constructors)
 * - Detect classes that extend BaseState
 *
 * DESIGN DECISIONS:
 * - Uses multiple heuristics for class detection (stringify, prototype inspection)
 * - Checks prototype chain for BaseState inheritance
 * - Intentionally conservative - prefers false negatives over false positives
 *
 * RELATED:
 * - {@link BaseState} - The base class we check for inheritance
 * - {@link registry.ts} - Uses these guards for resolution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSubclassOfStateScope = exports.looksLikeFactory = exports.looksLikeClassCtor = void 0;
const BaseState_1 = require("../BaseState");
/** Heuristic: class constructor vs. plain function */
function looksLikeClassCtor(fn) {
    if (typeof fn !== 'function')
        return false;
    // Primary: Native classes stringify starting with "class "
    try {
        const src = Function.prototype.toString.call(fn);
        if (/^\s*class\s/.test(src))
            return true;
    }
    catch (_a) {
        /* ignore */
    }
    // Fallback: functions that behave like classes usually have a prototype object
    // with more than just "constructor" (i.e., instance methods defined).
    const proto = fn.prototype;
    if (!proto || proto.constructor !== fn)
        return false;
    // If there are instance methods, it's definitely a class-like ctor.
    const ownNames = Object.getOwnPropertyNames(proto);
    if (ownNames.length > 1)
        return true;
    // As a last resort, treat functions with a "prototype" as NOT classes
    // unless the stringify check already caught them. This keeps arrows/normal fns out.
    return false;
}
exports.looksLikeClassCtor = looksLikeClassCtor;
/** Heuristic: factory function (a function that is NOT a class ctor) */
function looksLikeFactory(fn) {
    return typeof fn === 'function' && !looksLikeClassCtor(fn);
}
exports.looksLikeFactory = looksLikeFactory;
/** True iff `ctor` is a class that extends BaseState (checks prototype chain) */
function isSubclassOfStateScope(ctor) {
    if (!looksLikeClassCtor(ctor))
        return false;
    const baseProto = BaseState_1.BaseState.prototype;
    let p = ctor.prototype;
    while (p) {
        if (p === baseProto)
            return true;
        p = Object.getPrototypeOf(p);
    }
    return false;
}
exports.isSubclassOfStateScope = isSubclassOfStateScope;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VhcmRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Njb3BlL3Byb3ZpZGVycy9ndWFyZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW9CRzs7O0FBRUgsNENBQXlDO0FBS3pDLHNEQUFzRDtBQUN0RCxTQUFnQixrQkFBa0IsQ0FBQyxFQUFXO0lBQzVDLElBQUksT0FBTyxFQUFFLEtBQUssVUFBVTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBRTNDLDJEQUEyRDtJQUMzRCxJQUFJLENBQUM7UUFDSCxNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakQsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzNDLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDUCxZQUFZO0lBQ2QsQ0FBQztJQUVELCtFQUErRTtJQUMvRSxzRUFBc0U7SUFDdEUsTUFBTSxLQUFLLEdBQUksRUFBVSxDQUFDLFNBQVMsQ0FBQztJQUNwQyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxXQUFXLEtBQUssRUFBRTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBRXJELG9FQUFvRTtJQUNwRSxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbkQsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUVyQyxzRUFBc0U7SUFDdEUsb0ZBQW9GO0lBQ3BGLE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQXZCRCxnREF1QkM7QUFFRCx3RUFBd0U7QUFDeEUsU0FBZ0IsZ0JBQWdCLENBQUMsRUFBVztJQUMxQyxPQUFPLE9BQU8sRUFBRSxLQUFLLFVBQVUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzdELENBQUM7QUFGRCw0Q0FFQztBQUVELGlGQUFpRjtBQUNqRixTQUFnQixzQkFBc0IsQ0FBQyxJQUFhO0lBQ2xELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUM1QyxNQUFNLFNBQVMsR0FBRyxxQkFBUyxDQUFDLFNBQVMsQ0FBQztJQUN0QyxJQUFJLENBQUMsR0FBUyxJQUFZLENBQUMsU0FBUyxDQUFDO0lBQ3JDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDVCxJQUFJLENBQUMsS0FBSyxTQUFTO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDakMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQVRELHdEQVNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBndWFyZHMudHNcbiAqXG4gKiBXSFk6IEhldXJpc3RpYyBmdW5jdGlvbnMgZm9yIGRldGVjdGluZyB3aGV0aGVyIGFuIGlucHV0IGlzIGEgY2xhc3MgY29uc3RydWN0b3IsXG4gKiBmYWN0b3J5IGZ1bmN0aW9uLCBvciBCYXNlU3RhdGUgc3ViY2xhc3MuIFVzZWQgYnkgdGhlIHJlZ2lzdHJ5IHRvIGRldGVybWluZVxuICogd2hpY2ggcHJvdmlkZXIgdHlwZSB0byBjcmVhdGUuXG4gKlxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gRGV0ZWN0IGNsYXNzIGNvbnN0cnVjdG9ycyB2cyBwbGFpbiBmdW5jdGlvbnNcbiAqIC0gRGV0ZWN0IGZhY3RvcnkgZnVuY3Rpb25zIChmdW5jdGlvbnMgdGhhdCBhcmUgTk9UIGNsYXNzIGNvbnN0cnVjdG9ycylcbiAqIC0gRGV0ZWN0IGNsYXNzZXMgdGhhdCBleHRlbmQgQmFzZVN0YXRlXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gVXNlcyBtdWx0aXBsZSBoZXVyaXN0aWNzIGZvciBjbGFzcyBkZXRlY3Rpb24gKHN0cmluZ2lmeSwgcHJvdG90eXBlIGluc3BlY3Rpb24pXG4gKiAtIENoZWNrcyBwcm90b3R5cGUgY2hhaW4gZm9yIEJhc2VTdGF0ZSBpbmhlcml0YW5jZVxuICogLSBJbnRlbnRpb25hbGx5IGNvbnNlcnZhdGl2ZSAtIHByZWZlcnMgZmFsc2UgbmVnYXRpdmVzIG92ZXIgZmFsc2UgcG9zaXRpdmVzXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIEJhc2VTdGF0ZX0gLSBUaGUgYmFzZSBjbGFzcyB3ZSBjaGVjayBmb3IgaW5oZXJpdGFuY2VcbiAqIC0ge0BsaW5rIHJlZ2lzdHJ5LnRzfSAtIFVzZXMgdGhlc2UgZ3VhcmRzIGZvciByZXNvbHV0aW9uXG4gKi9cblxuaW1wb3J0IHsgQmFzZVN0YXRlIH0gZnJvbSAnLi4vQmFzZVN0YXRlJztcblxuLy8gVXNpbmcgYSB0eXBlIGFsaWFzIHRvIGF2b2lkIGVzbGludCBiYW4tdHlwZXMgcnVsZSB3aGlsZSBtYWludGFpbmluZyB0eXBlIHNhZmV0eVxudHlwZSBDYWxsYWJsZUZ1bmN0aW9uID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdW5rbm93bjtcblxuLyoqIEhldXJpc3RpYzogY2xhc3MgY29uc3RydWN0b3IgdnMuIHBsYWluIGZ1bmN0aW9uICovXG5leHBvcnQgZnVuY3Rpb24gbG9va3NMaWtlQ2xhc3NDdG9yKGZuOiB1bmtub3duKTogZm4gaXMgQ2FsbGFibGVGdW5jdGlvbiB7XG4gIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblxuICAvLyBQcmltYXJ5OiBOYXRpdmUgY2xhc3NlcyBzdHJpbmdpZnkgc3RhcnRpbmcgd2l0aCBcImNsYXNzIFwiXG4gIHRyeSB7XG4gICAgY29uc3Qgc3JjID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZm4pO1xuICAgIGlmICgvXlxccypjbGFzc1xccy8udGVzdChzcmMpKSByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgLyogaWdub3JlICovXG4gIH1cblxuICAvLyBGYWxsYmFjazogZnVuY3Rpb25zIHRoYXQgYmVoYXZlIGxpa2UgY2xhc3NlcyB1c3VhbGx5IGhhdmUgYSBwcm90b3R5cGUgb2JqZWN0XG4gIC8vIHdpdGggbW9yZSB0aGFuIGp1c3QgXCJjb25zdHJ1Y3RvclwiIChpLmUuLCBpbnN0YW5jZSBtZXRob2RzIGRlZmluZWQpLlxuICBjb25zdCBwcm90byA9IChmbiBhcyBhbnkpLnByb3RvdHlwZTtcbiAgaWYgKCFwcm90byB8fCBwcm90by5jb25zdHJ1Y3RvciAhPT0gZm4pIHJldHVybiBmYWxzZTtcblxuICAvLyBJZiB0aGVyZSBhcmUgaW5zdGFuY2UgbWV0aG9kcywgaXQncyBkZWZpbml0ZWx5IGEgY2xhc3MtbGlrZSBjdG9yLlxuICBjb25zdCBvd25OYW1lcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHByb3RvKTtcbiAgaWYgKG93bk5hbWVzLmxlbmd0aCA+IDEpIHJldHVybiB0cnVlO1xuXG4gIC8vIEFzIGEgbGFzdCByZXNvcnQsIHRyZWF0IGZ1bmN0aW9ucyB3aXRoIGEgXCJwcm90b3R5cGVcIiBhcyBOT1QgY2xhc3Nlc1xuICAvLyB1bmxlc3MgdGhlIHN0cmluZ2lmeSBjaGVjayBhbHJlYWR5IGNhdWdodCB0aGVtLiBUaGlzIGtlZXBzIGFycm93cy9ub3JtYWwgZm5zIG91dC5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKiogSGV1cmlzdGljOiBmYWN0b3J5IGZ1bmN0aW9uIChhIGZ1bmN0aW9uIHRoYXQgaXMgTk9UIGEgY2xhc3MgY3RvcikgKi9cbmV4cG9ydCBmdW5jdGlvbiBsb29rc0xpa2VGYWN0b3J5KGZuOiB1bmtub3duKTogZm4gaXMgQ2FsbGFibGVGdW5jdGlvbiB7XG4gIHJldHVybiB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicgJiYgIWxvb2tzTGlrZUNsYXNzQ3Rvcihmbik7XG59XG5cbi8qKiBUcnVlIGlmZiBgY3RvcmAgaXMgYSBjbGFzcyB0aGF0IGV4dGVuZHMgQmFzZVN0YXRlIChjaGVja3MgcHJvdG90eXBlIGNoYWluKSAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU3ViY2xhc3NPZlN0YXRlU2NvcGUoY3RvcjogdW5rbm93bik6IGJvb2xlYW4ge1xuICBpZiAoIWxvb2tzTGlrZUNsYXNzQ3RvcihjdG9yKSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBiYXNlUHJvdG8gPSBCYXNlU3RhdGUucHJvdG90eXBlO1xuICBsZXQgcDogYW55ID0gKGN0b3IgYXMgYW55KS5wcm90b3R5cGU7XG4gIHdoaWxlIChwKSB7XG4gICAgaWYgKHAgPT09IGJhc2VQcm90bykgcmV0dXJuIHRydWU7XG4gICAgcCA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihwKTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG4iXX0=