"use strict";
/**
 * NullNarrativeGenerator — No-op implementation of INarrativeGenerator.
 *
 * WHY: When narrative generation is disabled (the default), the Pipeline
 * still holds an INarrativeGenerator reference so handlers can call it
 * unconditionally. This Null Object satisfies the interface with empty
 * method bodies — zero allocation, zero string formatting, zero array
 * pushes. Production pipelines that never call `enableNarrative()` pay
 * exactly zero cost for the narrative feature.
 *
 * DESIGN: Every method is an empty body. `getSentences()` returns a bare
 * `[]` literal rather than a stored field to avoid even a single array
 * allocation at construction time. This is the Null Object pattern:
 * callers never need to null-check the generator reference.
 *
 * RELATED:
 * - {@link INarrativeGenerator} - The interface this implements
 * - {@link NarrativeGenerator} - The active implementation that accumulates sentences
 * - {@link Pipeline} - Chooses between this and NarrativeGenerator based on the enableNarrative flag
 *
 * _Requirements: 1.2, 9.3_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullNarrativeGenerator = void 0;
/**
 * No-op narrative generator for when narrative is disabled.
 *
 * WHY: Implements the Null Object pattern so handlers can call narrative
 * methods unconditionally without branching on an enabled/disabled flag.
 * All methods are empty — zero allocation, zero string formatting.
 *
 * RESPONSIBILITIES:
 * - Satisfy the INarrativeGenerator contract with no-op implementations
 * - Guarantee zero runtime cost when narrative is not needed
 *
 * DESIGN DECISIONS:
 * - Empty method bodies instead of conditional checks in handlers:
 *   eliminates per-call branching and keeps handler code clean
 * - Returns `[]` literal from getSentences() instead of a stored field:
 *   avoids allocating an array at construction time
 *
 * @example
 * ```typescript
 * // Pipeline uses NullNarrativeGenerator when narrative is disabled:
 * const generator: INarrativeGenerator = new NullNarrativeGenerator();
 * generator.onStageExecuted('myStage', 'My Stage'); // no-op
 * generator.getSentences(); // → []
 * ```
 *
 * _Requirements: 1.2, 9.3_
 */
class NullNarrativeGenerator {
    onStageExecuted() { }
    onNext() { }
    onDecision() { }
    onFork() { }
    onSelected() { }
    onSubflowEntry() { }
    onSubflowExit() { }
    onLoop() { }
    onBreak() { }
    onError() { }
    getSentences() { return []; }
}
exports.NullNarrativeGenerator = NullNarrativeGenerator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTnVsbE5hcnJhdGl2ZUdlbmVyYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9jb3JlL2V4ZWN1dG9yL25hcnJhdGl2ZS9OdWxsTmFycmF0aXZlR2VuZXJhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBcUJHOzs7QUFJSDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EwQkc7QUFDSCxNQUFhLHNCQUFzQjtJQUNqQyxlQUFlLEtBQVUsQ0FBQztJQUMxQixNQUFNLEtBQVUsQ0FBQztJQUNqQixVQUFVLEtBQVUsQ0FBQztJQUNyQixNQUFNLEtBQVUsQ0FBQztJQUNqQixVQUFVLEtBQVUsQ0FBQztJQUNyQixjQUFjLEtBQVUsQ0FBQztJQUN6QixhQUFhLEtBQVUsQ0FBQztJQUN4QixNQUFNLEtBQVUsQ0FBQztJQUNqQixPQUFPLEtBQVUsQ0FBQztJQUNsQixPQUFPLEtBQVUsQ0FBQztJQUNsQixZQUFZLEtBQWUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0NBQ3hDO0FBWkQsd0RBWUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE51bGxOYXJyYXRpdmVHZW5lcmF0b3Ig4oCUIE5vLW9wIGltcGxlbWVudGF0aW9uIG9mIElOYXJyYXRpdmVHZW5lcmF0b3IuXG4gKlxuICogV0hZOiBXaGVuIG5hcnJhdGl2ZSBnZW5lcmF0aW9uIGlzIGRpc2FibGVkICh0aGUgZGVmYXVsdCksIHRoZSBQaXBlbGluZVxuICogc3RpbGwgaG9sZHMgYW4gSU5hcnJhdGl2ZUdlbmVyYXRvciByZWZlcmVuY2Ugc28gaGFuZGxlcnMgY2FuIGNhbGwgaXRcbiAqIHVuY29uZGl0aW9uYWxseS4gVGhpcyBOdWxsIE9iamVjdCBzYXRpc2ZpZXMgdGhlIGludGVyZmFjZSB3aXRoIGVtcHR5XG4gKiBtZXRob2QgYm9kaWVzIOKAlCB6ZXJvIGFsbG9jYXRpb24sIHplcm8gc3RyaW5nIGZvcm1hdHRpbmcsIHplcm8gYXJyYXlcbiAqIHB1c2hlcy4gUHJvZHVjdGlvbiBwaXBlbGluZXMgdGhhdCBuZXZlciBjYWxsIGBlbmFibGVOYXJyYXRpdmUoKWAgcGF5XG4gKiBleGFjdGx5IHplcm8gY29zdCBmb3IgdGhlIG5hcnJhdGl2ZSBmZWF0dXJlLlxuICpcbiAqIERFU0lHTjogRXZlcnkgbWV0aG9kIGlzIGFuIGVtcHR5IGJvZHkuIGBnZXRTZW50ZW5jZXMoKWAgcmV0dXJucyBhIGJhcmVcbiAqIGBbXWAgbGl0ZXJhbCByYXRoZXIgdGhhbiBhIHN0b3JlZCBmaWVsZCB0byBhdm9pZCBldmVuIGEgc2luZ2xlIGFycmF5XG4gKiBhbGxvY2F0aW9uIGF0IGNvbnN0cnVjdGlvbiB0aW1lLiBUaGlzIGlzIHRoZSBOdWxsIE9iamVjdCBwYXR0ZXJuOlxuICogY2FsbGVycyBuZXZlciBuZWVkIHRvIG51bGwtY2hlY2sgdGhlIGdlbmVyYXRvciByZWZlcmVuY2UuXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIElOYXJyYXRpdmVHZW5lcmF0b3J9IC0gVGhlIGludGVyZmFjZSB0aGlzIGltcGxlbWVudHNcbiAqIC0ge0BsaW5rIE5hcnJhdGl2ZUdlbmVyYXRvcn0gLSBUaGUgYWN0aXZlIGltcGxlbWVudGF0aW9uIHRoYXQgYWNjdW11bGF0ZXMgc2VudGVuY2VzXG4gKiAtIHtAbGluayBQaXBlbGluZX0gLSBDaG9vc2VzIGJldHdlZW4gdGhpcyBhbmQgTmFycmF0aXZlR2VuZXJhdG9yIGJhc2VkIG9uIHRoZSBlbmFibGVOYXJyYXRpdmUgZmxhZ1xuICpcbiAqIF9SZXF1aXJlbWVudHM6IDEuMiwgOS4zX1xuICovXG5cbmltcG9ydCB7IElOYXJyYXRpdmVHZW5lcmF0b3IgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBOby1vcCBuYXJyYXRpdmUgZ2VuZXJhdG9yIGZvciB3aGVuIG5hcnJhdGl2ZSBpcyBkaXNhYmxlZC5cbiAqXG4gKiBXSFk6IEltcGxlbWVudHMgdGhlIE51bGwgT2JqZWN0IHBhdHRlcm4gc28gaGFuZGxlcnMgY2FuIGNhbGwgbmFycmF0aXZlXG4gKiBtZXRob2RzIHVuY29uZGl0aW9uYWxseSB3aXRob3V0IGJyYW5jaGluZyBvbiBhbiBlbmFibGVkL2Rpc2FibGVkIGZsYWcuXG4gKiBBbGwgbWV0aG9kcyBhcmUgZW1wdHkg4oCUIHplcm8gYWxsb2NhdGlvbiwgemVybyBzdHJpbmcgZm9ybWF0dGluZy5cbiAqXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBTYXRpc2Z5IHRoZSBJTmFycmF0aXZlR2VuZXJhdG9yIGNvbnRyYWN0IHdpdGggbm8tb3AgaW1wbGVtZW50YXRpb25zXG4gKiAtIEd1YXJhbnRlZSB6ZXJvIHJ1bnRpbWUgY29zdCB3aGVuIG5hcnJhdGl2ZSBpcyBub3QgbmVlZGVkXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gRW1wdHkgbWV0aG9kIGJvZGllcyBpbnN0ZWFkIG9mIGNvbmRpdGlvbmFsIGNoZWNrcyBpbiBoYW5kbGVyczpcbiAqICAgZWxpbWluYXRlcyBwZXItY2FsbCBicmFuY2hpbmcgYW5kIGtlZXBzIGhhbmRsZXIgY29kZSBjbGVhblxuICogLSBSZXR1cm5zIGBbXWAgbGl0ZXJhbCBmcm9tIGdldFNlbnRlbmNlcygpIGluc3RlYWQgb2YgYSBzdG9yZWQgZmllbGQ6XG4gKiAgIGF2b2lkcyBhbGxvY2F0aW5nIGFuIGFycmF5IGF0IGNvbnN0cnVjdGlvbiB0aW1lXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIC8vIFBpcGVsaW5lIHVzZXMgTnVsbE5hcnJhdGl2ZUdlbmVyYXRvciB3aGVuIG5hcnJhdGl2ZSBpcyBkaXNhYmxlZDpcbiAqIGNvbnN0IGdlbmVyYXRvcjogSU5hcnJhdGl2ZUdlbmVyYXRvciA9IG5ldyBOdWxsTmFycmF0aXZlR2VuZXJhdG9yKCk7XG4gKiBnZW5lcmF0b3Iub25TdGFnZUV4ZWN1dGVkKCdteVN0YWdlJywgJ015IFN0YWdlJyk7IC8vIG5vLW9wXG4gKiBnZW5lcmF0b3IuZ2V0U2VudGVuY2VzKCk7IC8vIOKGkiBbXVxuICogYGBgXG4gKlxuICogX1JlcXVpcmVtZW50czogMS4yLCA5LjNfXG4gKi9cbmV4cG9ydCBjbGFzcyBOdWxsTmFycmF0aXZlR2VuZXJhdG9yIGltcGxlbWVudHMgSU5hcnJhdGl2ZUdlbmVyYXRvciB7XG4gIG9uU3RhZ2VFeGVjdXRlZCgpOiB2b2lkIHt9XG4gIG9uTmV4dCgpOiB2b2lkIHt9XG4gIG9uRGVjaXNpb24oKTogdm9pZCB7fVxuICBvbkZvcmsoKTogdm9pZCB7fVxuICBvblNlbGVjdGVkKCk6IHZvaWQge31cbiAgb25TdWJmbG93RW50cnkoKTogdm9pZCB7fVxuICBvblN1YmZsb3dFeGl0KCk6IHZvaWQge31cbiAgb25Mb29wKCk6IHZvaWQge31cbiAgb25CcmVhaygpOiB2b2lkIHt9XG4gIG9uRXJyb3IoKTogdm9pZCB7fVxuICBnZXRTZW50ZW5jZXMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cbn1cbiJdfQ==