/**
 * Scope Protection Implementation
 *
 * Provides a Proxy-based protection layer that intercepts direct property
 * assignments on scope objects and provides clear error messages.
 */
import { ScopeProtectionOptions } from './types';
/**
 * Creates a descriptive error message for direct property assignment.
 *
 * @param propertyName - The property that was being assigned
 * @param stageName - The stage where the error occurred
 * @returns A formatted error message with guidance
 */
export declare function createErrorMessage(propertyName: string, stageName: string): string;
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
export declare function createProtectedScope<T extends object>(scope: T, options?: ScopeProtectionOptions): T;
