/**
 * Memory Utilities - Helper functions for nested object manipulation
 *
 * WHY: The memory system needs to read/write deeply nested paths efficiently.
 * These utilities provide consistent path traversal and value manipulation.
 *
 * DESIGN: Uses lodash for reliable deep operations while adding pipeline-aware
 * path resolution (pipelines are namespaced under 'pipelines/{pipelineId}/').
 *
 * RELATED:
 * - {@link WriteBuffer} - Uses these for patch operations
 * - {@link GlobalStore} - Uses these for state access
 */
import { MemoryPatch } from './WriteBuffer';
type NestedObject = {
    [key: string]: any;
};
/**
 * Sets a value at a nested path, creating intermediate objects as needed.
 * WHY: Enables writing to arbitrary depth without manual object creation.
 *
 * @param obj - Root object to modify
 * @param pipelineId - Pipeline namespace (values stored under pipelines/{id}/)
 * @param _path - Path segments to the target location
 * @param field - Final field name to set
 * @param value - Value to set
 * @param defaultValues - Default object structure for new pipeline namespaces
 */
export declare function setNestedValue<T>(obj: NestedObject, pipelineId: string, _path: string[], field: string, value: T, defaultValues?: unknown): NestedObject;
/**
 * Deep-merges a value into the object at the specified path.
 * WHY: Enables additive updates without losing existing nested data.
 *
 * DESIGN: Uses customMerge semantics:
 * - Arrays: Concatenate (not replace)
 * - Objects: Shallow merge at each level
 * - Primitives: Replace
 */
export declare function updateNestedValue<T>(obj: any, pipelineId: string | undefined, _path: (string | number)[], field: string | number, value: T, defaultValues?: unknown): any;
/**
 * In-place value update with merge semantics.
 * WHY: Provides consistent merge behavior for direct object references.
 *
 * DESIGN DECISIONS:
 * - Arrays: Concatenate to preserve all values
 * - Objects: Shallow merge (spread operator)
 * - Primitives: Direct assignment
 */
export declare function updateValue(object: any, key: string | number, value: any): void;
/**
 * Gets a value at a nested path, optionally accessing a specific field.
 * WHY: Provides safe deep access with prototype pollution protection.
 *
 * DESIGN: Uses hasOwnProperty check to avoid returning inherited prototype
 * properties like 'constructor', 'toString', etc. This prevents security
 * issues when user-controlled keys are used.
 */
export declare function getNestedValue(root: any, path: (string | number)[], field?: string | number): any;
/**
 * Resolves pipeline-namespaced and global paths.
 * WHY: Pipelines store data under 'pipelines/{id}/' to prevent collisions.
 *
 * @returns Both pipeline-scoped and global paths for the given segments
 */
export declare function getPipelineAndGlobalPaths(pipelineId?: string, path?: (string | number)[]): {
    pipelinePath: (string | number)[] | undefined;
    globalPath: (string | number)[];
};
/**
 * Redacts sensitive values in a patch for logging/debugging.
 * WHY: Some data (credentials, PII) shouldn't appear in debug output.
 *
 * DESIGN: Only redacts paths that actually exist in the patch to preserve
 * the patch structure for debugging while hiding sensitive values.
 */
export declare const redactPatch: (patch: MemoryPatch, redactedSet: Set<string>) => MemoryPatch;
export {};
