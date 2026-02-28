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
type CallableFunction = (...args: unknown[]) => unknown;
/** Heuristic: class constructor vs. plain function */
export declare function looksLikeClassCtor(fn: unknown): fn is CallableFunction;
/** Heuristic: factory function (a function that is NOT a class ctor) */
export declare function looksLikeFactory(fn: unknown): fn is CallableFunction;
/** True iff `ctor` is a class that extends BaseState (checks prototype chain) */
export declare function isSubclassOfStateScope(ctor: unknown): boolean;
export {};
