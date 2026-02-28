/**
 * resolve.ts
 *
 * WHY: Public API for converting arbitrary scope inputs (factory functions,
 * classes, schemas) into the ScopeFactory type that the pipeline expects.
 *
 * RESPONSIBILITIES:
 * - Normalize various input types to a consistent ScopeFactory
 * - Re-export registerScopeResolver for plugin registration
 * - Re-export types for consumer use
 *
 * DESIGN DECISIONS:
 * - Single entry point for scope resolution
 * - Delegates to registry for actual resolution logic
 * - Returns a ScopeFactory that can be used directly by the pipeline
 *
 * RELATED:
 * - {@link registry.ts} - Contains the resolution logic
 * - {@link types.ts} - Type definitions
 */
import type { ResolveOptions, ScopeFactory } from './types';
/** Normalize a factory/class/schema-like input into a ScopeFactory the pipeline expects */
export declare function toScopeFactory<TScope>(input: unknown, options?: ResolveOptions): ScopeFactory<TScope>;
export { registerScopeResolver } from './registry';
export type { ResolveOptions, ScopeProvider } from './types';
