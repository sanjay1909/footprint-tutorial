/**
 * registry.ts
 *
 * WHY: Central registry for scope provider resolvers. Allows plugins to register
 * custom resolvers that can handle different input types (e.g., Zod schemas).
 *
 * RESPONSIBILITIES:
 * - Maintain a list of registered resolvers
 * - Resolve arbitrary inputs to ScopeProviders using registered resolvers
 * - Provide built-in resolution for classes extending BaseState and factory functions
 *
 * DESIGN DECISIONS:
 * - Resolvers are checked in registration order (first match wins)
 * - Built-in resolvers (class, factory) are checked last as fallback
 * - Test helper __clearScopeResolversForTests prevents cross-test pollution
 *
 * RELATED:
 * - {@link resolve.ts} - Public API that uses this registry
 * - {@link guards.ts} - Heuristics for detecting classes vs factories
 * - {@link providers.ts} - Factory functions for creating providers
 */
import type { ProviderResolver, ResolveOptions, ScopeProvider } from './types';
export declare function registerScopeResolver(resolver: ProviderResolver): void;
export declare function __clearScopeResolversForTests(): void;
export declare function resolveScopeProvider<TScope>(input: unknown, options?: ResolveOptions): ScopeProvider<TScope>;
