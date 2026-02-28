"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactPatch = exports.getPipelineAndGlobalPaths = exports.getNestedValue = exports.updateValue = exports.updateNestedValue = exports.setNestedValue = void 0;
const lodash_clonedeep_1 = __importDefault(require("lodash.clonedeep"));
const lodash_get_1 = __importDefault(require("lodash.get"));
const lodash_has_1 = __importDefault(require("lodash.has"));
const lodash_set_1 = __importDefault(require("lodash.set"));
const WriteBuffer_1 = require("./WriteBuffer");
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
function setNestedValue(obj, pipelineId, _path, field, value, defaultValues) {
    const { pipelinePath, globalPath } = getPipelineAndGlobalPaths(pipelineId, _path);
    // If pipelineID is present update in pipeline else in global
    const path = pipelinePath || globalPath;
    const pathCopy = [...path];
    let current = obj;
    while (pathCopy.length > 0) {
        const key = pathCopy.shift();
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
            current[key] = key === pipelineId && defaultValues ? defaultValues : {};
        }
        current = current[key];
    }
    current[field] = value;
    return obj;
}
exports.setNestedValue = setNestedValue;
/**
 * Deep-merges a value into the object at the specified path.
 * WHY: Enables additive updates without losing existing nested data.
 *
 * DESIGN: Uses customMerge semantics:
 * - Arrays: Concatenate (not replace)
 * - Objects: Shallow merge at each level
 * - Primitives: Replace
 */
function updateNestedValue(obj, pipelineId, _path, field, value, defaultValues) {
    const { pipelinePath, globalPath } = getPipelineAndGlobalPaths(pipelineId, _path);
    // If pipelineID is present update in pipeline else in global
    const path = pipelinePath || globalPath;
    const pathCopy = [...path];
    let current = obj;
    while (pathCopy.length > 0) {
        const key = pathCopy.shift();
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
            current[key] = key === pipelineId && defaultValues ? defaultValues : {};
        }
        current = current[key];
    }
    updateValue(current, field, value);
    return obj;
}
exports.updateNestedValue = updateNestedValue;
/**
 * In-place value update with merge semantics.
 * WHY: Provides consistent merge behavior for direct object references.
 *
 * DESIGN DECISIONS:
 * - Arrays: Concatenate to preserve all values
 * - Objects: Shallow merge (spread operator)
 * - Primitives: Direct assignment
 */
function updateValue(object, key, value) {
    if (value && Array.isArray(value)) {
        const currentValue = object[key];
        object[key] = currentValue === undefined ? value : [...currentValue, ...value];
    }
    else if (value && typeof value === 'object' && Object.keys(value).length) {
        const currentValue = object[key];
        object[key] =
            currentValue === undefined
                ? value
                : {
                    ...currentValue,
                    ...value,
                };
    }
    else {
        object[key] = value;
    }
}
exports.updateValue = updateValue;
/**
 * Gets a value at a nested path, optionally accessing a specific field.
 * WHY: Provides safe deep access with prototype pollution protection.
 *
 * DESIGN: Uses hasOwnProperty check to avoid returning inherited prototype
 * properties like 'constructor', 'toString', etc. This prevents security
 * issues when user-controlled keys are used.
 */
function getNestedValue(root, path, field) {
    const node = path && path.length > 0 ? (0, lodash_get_1.default)(root, path) : root;
    if (field === undefined || node === undefined) {
        return node;
    }
    // Check if the field is an own property to avoid prototype pollution
    // (e.g., returning Object.prototype.constructor for key "constructor")
    if (node !== null && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, field)) {
        return node[field];
    }
    return undefined;
}
exports.getNestedValue = getNestedValue;
/**
 * Resolves pipeline-namespaced and global paths.
 * WHY: Pipelines store data under 'pipelines/{id}/' to prevent collisions.
 *
 * @returns Both pipeline-scoped and global paths for the given segments
 */
function getPipelineAndGlobalPaths(pipelineId, path = []) {
    return {
        pipelinePath: pipelineId ? ['pipelines', pipelineId, ...path] : undefined,
        globalPath: [...path],
    };
}
exports.getPipelineAndGlobalPaths = getPipelineAndGlobalPaths;
/**
 * Redacts sensitive values in a patch for logging/debugging.
 * WHY: Some data (credentials, PII) shouldn't appear in debug output.
 *
 * DESIGN: Only redacts paths that actually exist in the patch to preserve
 * the patch structure for debugging while hiding sensitive values.
 */
const redactPatch = (patch, redactedSet) => {
    const out = (0, lodash_clonedeep_1.default)(patch);
    for (const flat of redactedSet) {
        const pathArr = flat.split(WriteBuffer_1.DELIM);
        // Redact only if the key actually exists in this patch bundle
        if ((0, lodash_has_1.default)(out, pathArr)) {
            // Keep "undefined overwrite" semantics: only replace non-undefined
            const curr = (0, lodash_get_1.default)(out, pathArr);
            if (typeof curr !== 'undefined') {
                (0, lodash_set_1.default)(out, pathArr, 'REDACTED');
            }
        }
    }
    return out;
};
exports.redactPatch = redactPatch;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW50ZXJuYWwvbWVtb3J5L3V0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7O0dBWUc7Ozs7OztBQUVILHdFQUEwQztBQUMxQyw0REFBOEI7QUFDOUIsNERBQThCO0FBQzlCLDREQUE4QjtBQUU5QiwrQ0FBbUQ7QUFJbkQ7Ozs7Ozs7Ozs7R0FVRztBQUNILFNBQWdCLGNBQWMsQ0FDNUIsR0FBaUIsRUFDakIsVUFBa0IsRUFDbEIsS0FBZSxFQUNmLEtBQWEsRUFDYixLQUFRLEVBQ1IsYUFBdUI7SUFFdkIsTUFBTSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsR0FBRyx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDbEYsNkRBQTZEO0lBQzdELE1BQU0sSUFBSSxHQUFHLFlBQVksSUFBSSxVQUFVLENBQUM7SUFDeEMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQzNCLElBQUksT0FBTyxHQUFpQixHQUFHLENBQUM7SUFDaEMsT0FBTyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzNCLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQVksQ0FBQztRQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLEtBQUssVUFBVSxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDMUUsQ0FBQztRQUNELE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFL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O0lBQ0gsQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQyxDQUFDO0FBZFcsUUFBQSxXQUFXLGVBY3RCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNZW1vcnkgVXRpbGl0aWVzIC0gSGVscGVyIGZ1bmN0aW9ucyBmb3IgbmVzdGVkIG9iamVjdCBtYW5pcHVsYXRpb25cbiAqIFxuICogV0hZOiBUaGUgbWVtb3J5IHN5c3RlbSBuZWVkcyB0byByZWFkL3dyaXRlIGRlZXBseSBuZXN0ZWQgcGF0aHMgZWZmaWNpZW50bHkuXG4gKiBUaGVzZSB1dGlsaXRpZXMgcHJvdmlkZSBjb25zaXN0ZW50IHBhdGggdHJhdmVyc2FsIGFuZCB2YWx1ZSBtYW5pcHVsYXRpb24uXG4gKiBcbiAqIERFU0lHTjogVXNlcyBsb2Rhc2ggZm9yIHJlbGlhYmxlIGRlZXAgb3BlcmF0aW9ucyB3aGlsZSBhZGRpbmcgcGlwZWxpbmUtYXdhcmVcbiAqIHBhdGggcmVzb2x1dGlvbiAocGlwZWxpbmVzIGFyZSBuYW1lc3BhY2VkIHVuZGVyICdwaXBlbGluZXMve3BpcGVsaW5lSWR9LycpLlxuICogXG4gKiBSRUxBVEVEOlxuICogLSB7QGxpbmsgV3JpdGVCdWZmZXJ9IC0gVXNlcyB0aGVzZSBmb3IgcGF0Y2ggb3BlcmF0aW9uc1xuICogLSB7QGxpbmsgR2xvYmFsU3RvcmV9IC0gVXNlcyB0aGVzZSBmb3Igc3RhdGUgYWNjZXNzXG4gKi9cblxuaW1wb3J0IF9jbG9uZURlZXAgZnJvbSAnbG9kYXNoLmNsb25lZGVlcCc7XG5pbXBvcnQgX2dldCBmcm9tICdsb2Rhc2guZ2V0JztcbmltcG9ydCBfaGFzIGZyb20gJ2xvZGFzaC5oYXMnO1xuaW1wb3J0IF9zZXQgZnJvbSAnbG9kYXNoLnNldCc7XG5cbmltcG9ydCB7IERFTElNLCBNZW1vcnlQYXRjaCB9IGZyb20gJy4vV3JpdGVCdWZmZXInO1xuXG50eXBlIE5lc3RlZE9iamVjdCA9IHsgW2tleTogc3RyaW5nXTogYW55IH07XG5cbi8qKlxuICogU2V0cyBhIHZhbHVlIGF0IGEgbmVzdGVkIHBhdGgsIGNyZWF0aW5nIGludGVybWVkaWF0ZSBvYmplY3RzIGFzIG5lZWRlZC5cbiAqIFdIWTogRW5hYmxlcyB3cml0aW5nIHRvIGFyYml0cmFyeSBkZXB0aCB3aXRob3V0IG1hbnVhbCBvYmplY3QgY3JlYXRpb24uXG4gKiBcbiAqIEBwYXJhbSBvYmogLSBSb290IG9iamVjdCB0byBtb2RpZnlcbiAqIEBwYXJhbSBwaXBlbGluZUlkIC0gUGlwZWxpbmUgbmFtZXNwYWNlICh2YWx1ZXMgc3RvcmVkIHVuZGVyIHBpcGVsaW5lcy97aWR9LylcbiAqIEBwYXJhbSBfcGF0aCAtIFBhdGggc2VnbWVudHMgdG8gdGhlIHRhcmdldCBsb2NhdGlvblxuICogQHBhcmFtIGZpZWxkIC0gRmluYWwgZmllbGQgbmFtZSB0byBzZXRcbiAqIEBwYXJhbSB2YWx1ZSAtIFZhbHVlIHRvIHNldFxuICogQHBhcmFtIGRlZmF1bHRWYWx1ZXMgLSBEZWZhdWx0IG9iamVjdCBzdHJ1Y3R1cmUgZm9yIG5ldyBwaXBlbGluZSBuYW1lc3BhY2VzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXROZXN0ZWRWYWx1ZTxUPihcbiAgb2JqOiBOZXN0ZWRPYmplY3QsXG4gIHBpcGVsaW5lSWQ6IHN0cmluZyxcbiAgX3BhdGg6IHN0cmluZ1tdLFxuICBmaWVsZDogc3RyaW5nLFxuICB2YWx1ZTogVCxcbiAgZGVmYXVsdFZhbHVlcz86IHVua25vd24sXG4pOiBOZXN0ZWRPYmplY3Qge1xuICBjb25zdCB7IHBpcGVsaW5lUGF0aCwgZ2xvYmFsUGF0aCB9ID0gZ2V0UGlwZWxpbmVBbmRHbG9iYWxQYXRocyhwaXBlbGluZUlkLCBfcGF0aCk7XG4gIC8vIElmIHBpcGVsaW5lSUQgaXMgcHJlc2VudCB1cGRhdGUgaW4gcGlwZWxpbmUgZWxzZSBpbiBnbG9iYWxcbiAgY29uc3QgcGF0aCA9IHBpcGVsaW5lUGF0aCB8fCBnbG9iYWxQYXRoO1xuICBjb25zdCBwYXRoQ29weSA9IFsuLi5wYXRoXTtcbiAgbGV0IGN1cnJlbnQ6IE5lc3RlZE9iamVjdCA9IG9iajtcbiAgd2hpbGUgKHBhdGhDb3B5Lmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBrZXkgPSBwYXRoQ29weS5zaGlmdCgpIGFzIHN0cmluZztcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjdXJyZW50LCBrZXkpKSB7XG4gICAgICBjdXJyZW50W2tleV0gPSBrZXkgPT09IHBpcGVsaW5lSWQgJiYgZGVmYXVsdFZhbHVlcyA/IGRlZmF1bHRWYWx1ZXMgOiB7fTtcbiAgICB9XG4gICAgY3VycmVudCA9IGN1cnJlbnRba2V5XTtcbiAgfVxuXG4gIGN1cnJlbnRbZmllbGRdID0gdmFsdWU7XG4gIHJldHVybiBvYmo7XG59XG5cbi8qKlxuICogRGVlcC1tZXJnZXMgYSB2YWx1ZSBpbnRvIHRoZSBvYmplY3QgYXQgdGhlIHNwZWNpZmllZCBwYXRoLlxuICogV0hZOiBFbmFibGVzIGFkZGl0aXZlIHVwZGF0ZXMgd2l0aG91dCBsb3NpbmcgZXhpc3RpbmcgbmVzdGVkIGRhdGEuXG4gKiBcbiAqIERFU0lHTjogVXNlcyBjdXN0b21NZXJnZSBzZW1hbnRpY3M6XG4gKiAtIEFycmF5czogQ29uY2F0ZW5hdGUgKG5vdCByZXBsYWNlKVxuICogLSBPYmplY3RzOiBTaGFsbG93IG1lcmdlIGF0IGVhY2ggbGV2ZWxcbiAqIC0gUHJpbWl0aXZlczogUmVwbGFjZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTmVzdGVkVmFsdWU8VD4oXG4gIG9iajogYW55LFxuICBwaXBlbGluZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gIF9wYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdLFxuICBmaWVsZDogc3RyaW5nIHwgbnVtYmVyLFxuICB2YWx1ZTogVCxcbiAgZGVmYXVsdFZhbHVlcz86IHVua25vd24sXG4pOiBhbnkge1xuICBjb25zdCB7IHBpcGVsaW5lUGF0aCwgZ2xvYmFsUGF0aCB9ID0gZ2V0UGlwZWxpbmVBbmRHbG9iYWxQYXRocyhwaXBlbGluZUlkLCBfcGF0aCk7XG4gIC8vIElmIHBpcGVsaW5lSUQgaXMgcHJlc2VudCB1cGRhdGUgaW4gcGlwZWxpbmUgZWxzZSBpbiBnbG9iYWxcbiAgY29uc3QgcGF0aCA9IHBpcGVsaW5lUGF0aCB8fCBnbG9iYWxQYXRoO1xuICBjb25zdCBwYXRoQ29weSA9IFsuLi5wYXRoXTtcbiAgbGV0IGN1cnJlbnQ6IE5lc3RlZE9iamVjdCA9IG9iajtcbiAgd2hpbGUgKHBhdGhDb3B5Lmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBrZXkgPSBwYXRoQ29weS5zaGlmdCgpIGFzIHN0cmluZztcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjdXJyZW50LCBrZXkpKSB7XG4gICAgICBjdXJyZW50W2tleV0gPSBrZXkgPT09IHBpcGVsaW5lSWQgJiYgZGVmYXVsdFZhbHVlcyA/IGRlZmF1bHRWYWx1ZXMgOiB7fTtcbiAgICB9XG4gICAgY3VycmVudCA9IGN1cnJlbnRba2V5XTtcbiAgfVxuXG4gIHVwZGF0ZVZhbHVlKGN1cnJlbnQsIGZpZWxkLCB2YWx1ZSk7XG4gIHJldHVybiBvYmo7XG59XG5cbi8qKlxuICogSW4tcGxhY2UgdmFsdWUgdXBkYXRlIHdpdGggbWVyZ2Ugc2VtYW50aWNzLlxuICogV0hZOiBQcm92aWRlcyBjb25zaXN0ZW50IG1lcmdlIGJlaGF2aW9yIGZvciBkaXJlY3Qgb2JqZWN0IHJlZmVyZW5jZXMuXG4gKiBcbiAqIERFU0lHTiBERUNJU0lPTlM6XG4gKiAtIEFycmF5czogQ29uY2F0ZW5hdGUgdG8gcHJlc2VydmUgYWxsIHZhbHVlc1xuICogLSBPYmplY3RzOiBTaGFsbG93IG1lcmdlIChzcHJlYWQgb3BlcmF0b3IpXG4gKiAtIFByaW1pdGl2ZXM6IERpcmVjdCBhc3NpZ25tZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVWYWx1ZShvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBhbnkpOiB2b2lkIHtcbiAgaWYgKHZhbHVlICYmIEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgY29uc3QgY3VycmVudFZhbHVlID0gb2JqZWN0W2tleV0gYXMgYW55O1xuICAgIG9iamVjdFtrZXldID0gY3VycmVudFZhbHVlID09PSB1bmRlZmluZWQgPyB2YWx1ZSA6IFsuLi5jdXJyZW50VmFsdWUsIC4uLnZhbHVlXTtcbiAgfSBlbHNlIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGgpIHtcbiAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBvYmplY3Rba2V5XSBhcyBhbnk7XG4gICAgb2JqZWN0W2tleV0gPVxuICAgICAgY3VycmVudFZhbHVlID09PSB1bmRlZmluZWRcbiAgICAgICAgPyB2YWx1ZVxuICAgICAgICA6IHtcbiAgICAgICAgICAgIC4uLmN1cnJlbnRWYWx1ZSxcbiAgICAgICAgICAgIC4uLnZhbHVlLFxuICAgICAgICAgIH07XG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0W2tleV0gPSB2YWx1ZTtcbiAgfVxufVxuXG4vKipcbiAqIEdldHMgYSB2YWx1ZSBhdCBhIG5lc3RlZCBwYXRoLCBvcHRpb25hbGx5IGFjY2Vzc2luZyBhIHNwZWNpZmljIGZpZWxkLlxuICogV0hZOiBQcm92aWRlcyBzYWZlIGRlZXAgYWNjZXNzIHdpdGggcHJvdG90eXBlIHBvbGx1dGlvbiBwcm90ZWN0aW9uLlxuICogXG4gKiBERVNJR046IFVzZXMgaGFzT3duUHJvcGVydHkgY2hlY2sgdG8gYXZvaWQgcmV0dXJuaW5nIGluaGVyaXRlZCBwcm90b3R5cGVcbiAqIHByb3BlcnRpZXMgbGlrZSAnY29uc3RydWN0b3InLCAndG9TdHJpbmcnLCBldGMuIFRoaXMgcHJldmVudHMgc2VjdXJpdHlcbiAqIGlzc3VlcyB3aGVuIHVzZXItY29udHJvbGxlZCBrZXlzIGFyZSB1c2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TmVzdGVkVmFsdWUocm9vdDogYW55LCBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdLCBmaWVsZD86IHN0cmluZyB8IG51bWJlcik6IGFueSB7XG4gIGNvbnN0IG5vZGUgPSBwYXRoICYmIHBhdGgubGVuZ3RoID4gMCA/IF9nZXQocm9vdCwgcGF0aCkgOiByb290O1xuICBpZiAoZmllbGQgPT09IHVuZGVmaW5lZCB8fCBub2RlID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gbm9kZTtcbiAgfVxuICAvLyBDaGVjayBpZiB0aGUgZmllbGQgaXMgYW4gb3duIHByb3BlcnR5IHRvIGF2b2lkIHByb3RvdHlwZSBwb2xsdXRpb25cbiAgLy8gKGUuZy4sIHJldHVybmluZyBPYmplY3QucHJvdG90eXBlLmNvbnN0cnVjdG9yIGZvciBrZXkgXCJjb25zdHJ1Y3RvclwiKVxuICBpZiAobm9kZSAhPT0gbnVsbCAmJiB0eXBlb2Ygbm9kZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG5vZGUsIGZpZWxkKSkge1xuICAgIHJldHVybiBub2RlW2ZpZWxkXTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHBpcGVsaW5lLW5hbWVzcGFjZWQgYW5kIGdsb2JhbCBwYXRocy5cbiAqIFdIWTogUGlwZWxpbmVzIHN0b3JlIGRhdGEgdW5kZXIgJ3BpcGVsaW5lcy97aWR9LycgdG8gcHJldmVudCBjb2xsaXNpb25zLlxuICogXG4gKiBAcmV0dXJucyBCb3RoIHBpcGVsaW5lLXNjb3BlZCBhbmQgZ2xvYmFsIHBhdGhzIGZvciB0aGUgZ2l2ZW4gc2VnbWVudHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFBpcGVsaW5lQW5kR2xvYmFsUGF0aHMocGlwZWxpbmVJZD86IHN0cmluZywgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdKSB7XG4gIHJldHVybiB7XG4gICAgcGlwZWxpbmVQYXRoOiBwaXBlbGluZUlkID8gWydwaXBlbGluZXMnLCBwaXBlbGluZUlkLCAuLi5wYXRoXSA6IHVuZGVmaW5lZCxcbiAgICBnbG9iYWxQYXRoOiBbLi4ucGF0aF0sXG4gIH07XG59XG5cbi8qKlxuICogUmVkYWN0cyBzZW5zaXRpdmUgdmFsdWVzIGluIGEgcGF0Y2ggZm9yIGxvZ2dpbmcvZGVidWdnaW5nLlxuICogV0hZOiBTb21lIGRhdGEgKGNyZWRlbnRpYWxzLCBQSUkpIHNob3VsZG4ndCBhcHBlYXIgaW4gZGVidWcgb3V0cHV0LlxuICogXG4gKiBERVNJR046IE9ubHkgcmVkYWN0cyBwYXRocyB0aGF0IGFjdHVhbGx5IGV4aXN0IGluIHRoZSBwYXRjaCB0byBwcmVzZXJ2ZVxuICogdGhlIHBhdGNoIHN0cnVjdHVyZSBmb3IgZGVidWdnaW5nIHdoaWxlIGhpZGluZyBzZW5zaXRpdmUgdmFsdWVzLlxuICovXG5leHBvcnQgY29uc3QgcmVkYWN0UGF0Y2ggPSAocGF0Y2g6IE1lbW9yeVBhdGNoLCByZWRhY3RlZFNldDogU2V0PHN0cmluZz4pOiBNZW1vcnlQYXRjaCA9PiB7XG4gIGNvbnN0IG91dCA9IF9jbG9uZURlZXAocGF0Y2gpO1xuICBmb3IgKGNvbnN0IGZsYXQgb2YgcmVkYWN0ZWRTZXQpIHtcbiAgICBjb25zdCBwYXRoQXJyID0gZmxhdC5zcGxpdChERUxJTSk7XG4gICAgLy8gUmVkYWN0IG9ubHkgaWYgdGhlIGtleSBhY3R1YWxseSBleGlzdHMgaW4gdGhpcyBwYXRjaCBidW5kbGVcbiAgICBpZiAoX2hhcyhvdXQsIHBhdGhBcnIpKSB7XG4gICAgICAvLyBLZWVwIFwidW5kZWZpbmVkIG92ZXJ3cml0ZVwiIHNlbWFudGljczogb25seSByZXBsYWNlIG5vbi11bmRlZmluZWRcbiAgICAgIGNvbnN0IGN1cnIgPSBfZ2V0KG91dCwgcGF0aEFycik7XG4gICAgICBpZiAodHlwZW9mIGN1cnIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIF9zZXQob3V0LCBwYXRoQXJyLCAnUkVEQUNURUQnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn07XG4iXX0=