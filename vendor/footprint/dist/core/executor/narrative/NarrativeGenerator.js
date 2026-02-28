"use strict";
/**
 * NarrativeGenerator — Active implementation of INarrativeGenerator
 *
 * WHY: Converts pipeline execution events into plain-English sentences at
 * traversal time, producing a human-readable story as a first-class output.
 * This enables any consumer — a cheaper LLM, a follow-up agent, a logging
 * system — to understand what happened without parsing technical structures.
 *
 * RESPONSIBILITIES:
 * - Accumulate narrative sentences in execution order
 * - Apply consistent sentence patterns for each event type
 * - Use stage description (build-time) for natural narrative output
 * - Fall back to displayName then stageName for stage identification
 * - Format decider rationale as natural-language clauses
 * - Format loop iterations as ordinal references
 * - Return a defensive copy of sentences to prevent external mutation
 *
 * DESIGN DECISIONS:
 * - Traversal-time generation: Sentences are appended as handlers execute,
 *   not reconstructed after the fact. This guarantees execution-order fidelity
 *   and avoids a post-processing walk.
 * - isFirstStage flag: The opening sentence uses a distinct pattern
 *   ("The process began…") to give the narrative a natural start.
 *   Subsequent stages are covered by transition events (onNext, onDecision, etc.).
 * - Description priority: When a stage provides a description string, the
 *   narrative uses it for context-rich output. Without it, falls back to
 *   "moved on to {name}" pattern.
 * - Defensive copy on getSentences(): Callers cannot mutate the internal array,
 *   preserving the generator's integrity across multiple reads.
 *
 * RELATED:
 * - {@link INarrativeGenerator} - The interface this class implements
 * - {@link NullNarrativeGenerator} - No-op sibling for zero-cost disabled path
 * - {@link PipelineContext} - Holds the generator instance passed to handlers
 *
 * @example
 * ```typescript
 * const narrator = new NarrativeGenerator();
 *
 * narrator.onStageExecuted('Initialize', undefined, 'Set up the agent with LLM and tools');
 * narrator.onNext('Initialize', 'Assemble Prompt', undefined, 'Build the prompt from system instructions');
 * narrator.onNext('Assemble Prompt', 'Call LLM', undefined, 'Send messages to the LLM provider');
 * narrator.onDecision('Route Decider', 'finalize', 'Finalize', 'the LLM provided a final answer', 'Decide whether to use tools or respond');
 *
 * narrator.getSentences();
 * // → [
 * //   "The process began: Set up the agent with LLM and tools.",
 * //   "Next step: Build the prompt from system instructions.",
 * //   "Next step: Send messages to the LLM provider.",
 * //   "It decided whether to use tools or respond: the LLM provided a final answer, so it chose Finalize."
 * // ]
 * ```
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3,
 *  5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2, 7.3, 10.1, 10.2_
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NarrativeGenerator = void 0;
class NarrativeGenerator {
    constructor() {
        this.sentences = [];
        this.isFirstStage = true;
    }
    /**
     * WHY: The first stage uses a distinct opening pattern to give the
     * narrative a natural beginning. When description is available,
     * uses it for a more descriptive opener.
     */
    onStageExecuted(stageName, displayName, description) {
        if (this.isFirstStage) {
            if (description) {
                this.sentences.push(`The process began: ${description}.`);
            }
            else {
                const name = displayName || stageName;
                this.sentences.push(`The process began with ${name}.`);
            }
            this.isFirstStage = false;
        }
    }
    /**
     * WHY: Linear continuations are the backbone of the narrative — they
     * let the reader follow the execution path step by step.
     * When description is available, uses it for context-rich output.
     */
    onNext(fromStage, toStage, toDisplayName, description) {
        if (description) {
            this.sentences.push(`Next step: ${description}.`);
        }
        else {
            const name = toDisplayName || toStage;
            this.sentences.push(`Next, it moved on to ${name}.`);
        }
    }
    /**
     * WHY: Decision points are the most valuable part of the narrative for
     * LLM context engineering. Including the rationale lets even a cheaper
     * model reason about why a branch was taken.
     * When deciderDescription is available, uses it for natural phrasing.
     */
    onDecision(deciderName, chosenBranch, chosenDisplayName, rationale, deciderDescription) {
        const branchName = chosenDisplayName || chosenBranch;
        if (deciderDescription && rationale) {
            this.sentences.push(`It ${deciderDescription}: ${rationale}, so it chose ${branchName}.`);
        }
        else if (deciderDescription) {
            this.sentences.push(`It ${deciderDescription} and chose ${branchName}.`);
        }
        else if (rationale) {
            this.sentences.push(`A decision was made: ${rationale}, so the path taken was ${branchName}.`);
        }
        else {
            this.sentences.push(`A decision was made, and the path taken was ${branchName}.`);
        }
    }
    /**
     * WHY: Captures the fan-out so the reader knows which paths ran
     * concurrently and how many there were.
     */
    onFork(parentStage, childNames) {
        const names = childNames.join(', ');
        this.sentences.push(`${childNames.length} paths were executed in parallel: ${names}.`);
    }
    /**
     * WHY: Captures which children were selected out of the total available,
     * so the reader understands the selection decision.
     */
    onSelected(parentStage, selectedNames, totalCount) {
        const names = selectedNames.join(', ');
        this.sentences.push(`${selectedNames.length} of ${totalCount} paths were selected: ${names}.`);
    }
    /**
     * WHY: Marks the boundary where execution dives into a nested context,
     * helping the reader follow the nesting structure.
     */
    onSubflowEntry(subflowName) {
        this.sentences.push(`Entering the ${subflowName} subflow.`);
    }
    /**
     * WHY: Marks the return from a nested context back to the parent flow.
     */
    onSubflowExit(subflowName) {
        this.sentences.push(`Exiting the ${subflowName} subflow.`);
    }
    /**
     * WHY: Captures repeated execution so the reader can track iteration
     * counts and understand retry/loop behavior.
     * When description is available, produces "On pass N: {description} again."
     */
    onLoop(targetStage, targetDisplayName, iteration, description) {
        if (description) {
            this.sentences.push(`On pass ${iteration}: ${description} again.`);
        }
        else {
            const name = targetDisplayName || targetStage;
            this.sentences.push(`On pass ${iteration} through ${name}.`);
        }
    }
    /**
     * WHY: Captures early termination so the reader knows where the
     * pipeline stopped before reaching the natural end.
     */
    onBreak(stageName, displayName) {
        const name = displayName || stageName;
        this.sentences.push(`Execution stopped at ${name}.`);
    }
    /**
     * WHY: Captures failure points so the reader (or a follow-up LLM)
     * can understand what went wrong and where.
     */
    onError(stageName, errorMessage, displayName) {
        const name = displayName || stageName;
        this.sentences.push(`An error occurred at ${name}: ${errorMessage}.`);
    }
    /**
     * WHY: Returns a defensive copy so callers cannot mutate the internal
     * sentence array, preserving the generator's integrity across multiple reads.
     *
     * @returns A shallow copy of the accumulated narrative sentences in execution order
     */
    getSentences() {
        return [...this.sentences];
    }
}
exports.NarrativeGenerator = NarrativeGenerator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFycmF0aXZlR2VuZXJhdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvZXhlY3V0b3IvbmFycmF0aXZlL05hcnJhdGl2ZUdlbmVyYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1REc7OztBQUlILE1BQWEsa0JBQWtCO0lBQS9CO1FBQ1UsY0FBUyxHQUFhLEVBQUUsQ0FBQztRQUN6QixpQkFBWSxHQUFHLElBQUksQ0FBQztJQThIOUIsQ0FBQztJQTVIQzs7OztPQUlHO0lBQ0gsZUFBZSxDQUFDLFNBQWlCLEVBQUUsV0FBb0IsRUFBRSxXQUFvQjtRQUMzRSxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN0QixJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNoQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsV0FBVyxHQUFHLENBQUMsQ0FBQztZQUM1RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFJLEdBQUcsV0FBVyxJQUFJLFNBQVMsQ0FBQztnQkFDdEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLElBQUksR0FBRyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUNELElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQzVCLENBQUM7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILE1BQU0sQ0FBQyxTQUFpQixFQUFFLE9BQWUsRUFBRSxhQUFzQixFQUFFLFdBQW9CO1FBQ3JGLElBQUksV0FBVyxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELENBQUM7YUFBTSxDQUFDO1lBQ04sTUFBTSxJQUFJLEdBQUcsYUFBYSxJQUFJLE9BQU8s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QUFvQixFQUFFLFdBQW9CO1FBQ25FLE1BQU0sSUFBSSxHQUFHLFdBQVcsSUFBSSxTQUFTLENBQUM7UUFDdEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLElBQUksS0FBSyxZQUFZLEdBQUcsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILFlBQVk7UUFDVixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDN0IsQ0FBQztDQUNGO0FBaElELGdEQWdJQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTmFycmF0aXZlR2VuZXJhdG9yIOKAlCBBY3RpdmUgaW1wbGVtZW50YXRpb24gb2YgSU5hcnJhdGl2ZUdlbmVyYXRvclxuICpcbiAqIFdIWTogQ29udmVydHMgcGlwZWxpbmUgZXhlY3V0aW9uIGV2ZW50cyBpbnRvIHBsYWluLUVuZ2xpc2ggc2VudGVuY2VzIGF0XG4gKiB0cmF2ZXJzYWwgdGltZSwgcHJvZHVjaW5nIGEgaHVtYW4tcmVhZGFibGUgc3RvcnkgYXMgYSBmaXJzdC1jbGFzcyBvdXRwdXQuXG4gKiBUaGlzIGVuYWJsZXMgYW55IGNvbnN1bWVyIOKAlCBhIGNoZWFwZXIgTExNLCBhIGZvbGxvdy11cCBhZ2VudCwgYSBsb2dnaW5nXG4gKiBzeXN0ZW0g4oCUIHRvIHVuZGVyc3RhbmQgd2hhdCBoYXBwZW5lZCB3aXRob3V0IHBhcnNpbmcgdGVjaG5pY2FsIHN0cnVjdHVyZXMuXG4gKlxuICogUkVTUE9OU0lCSUxJVElFUzpcbiAqIC0gQWNjdW11bGF0ZSBuYXJyYXRpdmUgc2VudGVuY2VzIGluIGV4ZWN1dGlvbiBvcmRlclxuICogLSBBcHBseSBjb25zaXN0ZW50IHNlbnRlbmNlIHBhdHRlcm5zIGZvciBlYWNoIGV2ZW50IHR5cGVcbiAqIC0gVXNlIHN0YWdlIGRlc2NyaXB0aW9uIChidWlsZC10aW1lKSBmb3IgbmF0dXJhbCBuYXJyYXRpdmUgb3V0cHV0XG4gKiAtIEZhbGwgYmFjayB0byBkaXNwbGF5TmFtZSB0aGVuIHN0YWdlTmFtZSBmb3Igc3RhZ2UgaWRlbnRpZmljYXRpb25cbiAqIC0gRm9ybWF0IGRlY2lkZXIgcmF0aW9uYWxlIGFzIG5hdHVyYWwtbGFuZ3VhZ2UgY2xhdXNlc1xuICogLSBGb3JtYXQgbG9vcCBpdGVyYXRpb25zIGFzIG9yZGluYWwgcmVmZXJlbmNlc1xuICogLSBSZXR1cm4gYSBkZWZlbnNpdmUgY29weSBvZiBzZW50ZW5jZXMgdG8gcHJldmVudCBleHRlcm5hbCBtdXRhdGlvblxuICpcbiAqIERFU0lHTiBERUNJU0lPTlM6XG4gKiAtIFRyYXZlcnNhbC10aW1lIGdlbmVyYXRpb246IFNlbnRlbmNlcyBhcmUgYXBwZW5kZWQgYXMgaGFuZGxlcnMgZXhlY3V0ZSxcbiAqICAgbm90IHJlY29uc3RydWN0ZWQgYWZ0ZXIgdGhlIGZhY3QuIFRoaXMgZ3VhcmFudGVlcyBleGVjdXRpb24tb3JkZXIgZmlkZWxpdHlcbiAqICAgYW5kIGF2b2lkcyBhIHBvc3QtcHJvY2Vzc2luZyB3YWxrLlxuICogLSBpc0ZpcnN0U3RhZ2UgZmxhZzogVGhlIG9wZW5pbmcgc2VudGVuY2UgdXNlcyBhIGRpc3RpbmN0IHBhdHRlcm5cbiAqICAgKFwiVGhlIHByb2Nlc3MgYmVnYW7igKZcIikgdG8gZ2l2ZSB0aGUgbmFycmF0aXZlIGEgbmF0dXJhbCBzdGFydC5cbiAqICAgU3Vic2VxdWVudCBzdGFnZXMgYXJlIGNvdmVyZWQgYnkgdHJhbnNpdGlvbiBldmVudHMgKG9uTmV4dCwgb25EZWNpc2lvbiwgZXRjLikuXG4gKiAtIERlc2NyaXB0aW9uIHByaW9yaXR5OiBXaGVuIGEgc3RhZ2UgcHJvdmlkZXMgYSBkZXNjcmlwdGlvbiBzdHJpbmcsIHRoZVxuICogICBuYXJyYXRpdmUgdXNlcyBpdCBmb3IgY29udGV4dC1yaWNoIG91dHB1dC4gV2l0aG91dCBpdCwgZmFsbHMgYmFjayB0b1xuICogICBcIm1vdmVkIG9uIHRvIHtuYW1lfVwiIHBhdHRlcm4uXG4gKiAtIERlZmVuc2l2ZSBjb3B5IG9uIGdldFNlbnRlbmNlcygpOiBDYWxsZXJzIGNhbm5vdCBtdXRhdGUgdGhlIGludGVybmFsIGFycmF5LFxuICogICBwcmVzZXJ2aW5nIHRoZSBnZW5lcmF0b3IncyBpbnRlZ3JpdHkgYWNyb3NzIG11bHRpcGxlIHJlYWRzLlxuICpcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBJTmFycmF0aXZlR2VuZXJhdG9yfSAtIFRoZSBpbnRlcmZhY2UgdGhpcyBjbGFzcyBpbXBsZW1lbnRzXG4gKiAtIHtAbGluayBOdWxsTmFycmF0aXZlR2VuZXJhdG9yfSAtIE5vLW9wIHNpYmxpbmcgZm9yIHplcm8tY29zdCBkaXNhYmxlZCBwYXRoXG4gKiAtIHtAbGluayBQaXBlbGluZUNvbnRleHR9IC0gSG9sZHMgdGhlIGdlbmVyYXRvciBpbnN0YW5jZSBwYXNzZWQgdG8gaGFuZGxlcnNcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3QgbmFycmF0b3IgPSBuZXcgTmFycmF0aXZlR2VuZXJhdG9yKCk7XG4gKlxuICogbmFycmF0b3Iub25TdGFnZUV4ZWN1dGVkKCdJbml0aWFsaXplJywgdW5kZWZpbmVkLCAnU2V0IHVwIHRoZSBhZ2VudCB3aXRoIExMTSBhbmQgdG9vbHMnKTtcbiAqIG5hcnJhdG9yLm9uTmV4dCgnSW5pdGlhbGl6ZScsICdBc3NlbWJsZSBQcm9tcHQnLCB1bmRlZmluZWQsICdCdWlsZCB0aGUgcHJvbXB0IGZyb20gc3lzdGVtIGluc3RydWN0aW9ucycpO1xuICogbmFycmF0b3Iub25OZXh0KCdBc3NlbWJsZSBQcm9tcHQnLCAnQ2FsbCBMTE0nLCB1bmRlZmluZWQsICdTZW5kIG1lc3NhZ2VzIHRvIHRoZSBMTE0gcHJvdmlkZXInKTtcbiAqIG5hcnJhdG9yLm9uRGVjaXNpb24oJ1JvdXRlIERlY2lkZXInLCAnZmluYWxpemUnLCAnRmluYWxpemUnLCAndGhlIExMTSBwcm92aWRlZCBhIGZpbmFsIGFuc3dlcicsICdEZWNpZGUgd2hldGhlciB0byB1c2UgdG9vbHMgb3IgcmVzcG9uZCcpO1xuICpcbiAqIG5hcnJhdG9yLmdldFNlbnRlbmNlcygpO1xuICogLy8g4oaSIFtcbiAqIC8vICAgXCJUaGUgcHJvY2VzcyBiZWdhbjogU2V0IHVwIHRoZSBhZ2VudCB3aXRoIExMTSBhbmQgdG9vbHMuXCIsXG4gKiAvLyAgIFwiTmV4dCBzdGVwOiBCdWlsZCB0aGUgcHJvbXB0IGZyb20gc3lzdGVtIGluc3RydWN0aW9ucy5cIixcbiAqIC8vICAgXCJOZXh0IHN0ZXA6IFNlbmQgbWVzc2FnZXMgdG8gdGhlIExMTSBwcm92aWRlci5cIixcbiAqIC8vICAgXCJJdCBkZWNpZGVkIHdoZXRoZXIgdG8gdXNlIHRvb2xzIG9yIHJlc3BvbmQ6IHRoZSBMTE0gcHJvdmlkZWQgYSBmaW5hbCBhbnN3ZXIsIHNvIGl0IGNob3NlIEZpbmFsaXplLlwiXG4gKiAvLyBdXG4gKiBgYGBcbiAqXG4gKiBfUmVxdWlyZW1lbnRzOiA4LjEsIDguMiwgOC4zLCA4LjQsIDguNSwgMy4xLCAzLjIsIDMuMywgNC4xLCA0LjIsIDQuMyxcbiAqICA1LjEsIDUuMiwgNS4zLCA2LjEsIDYuMiwgNy4xLCA3LjIsIDcuMywgMTAuMSwgMTAuMl9cbiAqL1xuXG5pbXBvcnQgeyBJTmFycmF0aXZlR2VuZXJhdG9yIH0gZnJvbSAnLi90eXBlcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXJyYXRpdmVHZW5lcmF0b3IgaW1wbGVtZW50cyBJTmFycmF0aXZlR2VuZXJhdG9yIHtcbiAgcHJpdmF0ZSBzZW50ZW5jZXM6IHN0cmluZ1tdID0gW107XG4gIHByaXZhdGUgaXNGaXJzdFN0YWdlID0gdHJ1ZTtcblxuICAvKipcbiAgICogV0hZOiBUaGUgZmlyc3Qgc3RhZ2UgdXNlcyBhIGRpc3RpbmN0IG9wZW5pbmcgcGF0dGVybiB0byBnaXZlIHRoZVxuICAgKiBuYXJyYXRpdmUgYSBuYXR1cmFsIGJlZ2lubmluZy4gV2hlbiBkZXNjcmlwdGlvbiBpcyBhdmFpbGFibGUsXG4gICAqIHVzZXMgaXQgZm9yIGEgbW9yZSBkZXNjcmlwdGl2ZSBvcGVuZXIuXG4gICAqL1xuICBvblN0YWdlRXhlY3V0ZWQoc3RhZ2VOYW1lOiBzdHJpbmcsIGRpc3BsYXlOYW1lPzogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICh0aGlzLmlzRmlyc3RTdGFnZSkge1xuICAgICAgaWYgKGRlc2NyaXB0aW9uKSB7XG4gICAgICAgIHRoaXMuc2VudGVuY2VzLnB1c2goYFRoZSBwcm9jZXNzIGJlZ2FuOiAke2Rlc2NyaXB0aW9ufS5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBkaXNwbGF5TmFtZSB8fCBzdGFnZU5hbWU7XG4gICAgICAgIHRoaXMuc2VudGVuY2VzLnB1c2goYFRoZSBwcm9jZXNzIGJlZ2FuIHdpdGggJHtuYW1lfS5gKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuaXNGaXJzdFN0YWdlID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogTGluZWFyIGNvbnRpbnVhdGlvbnMgYXJlIHRoZSBiYWNrYm9uZSBvZiB0aGUgbmFycmF0aXZlIOKAlCB0aGV5XG4gICAqIGxldCB0aGUgcmVhZGVyIGZvbGxvdyB0aGUgZXhlY3V0aW9uIHBhdGggc3RlcCBieSBzdGVwLlxuICAgKiBXaGVuIGRlc2NyaXB0aW9uIGlzIGF2YWlsYWJsZSwgdXNlcyBpdCBmb3IgY29udGV4dC1yaWNoIG91dHB1dC5cbiAgICovXG4gIG9uTmV4dChmcm9tU3RhZ2U6IHN0cmluZywgdG9TdGFnZTogc3RyaW5nLCB0b0Rpc3BsYXlOYW1lPzogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IHZvaWQge1xuICAgIGlmIChkZXNjcmlwdGlvbikge1xuICAgICAgdGhpcy5zZW50ZW5jZXMucHVzaChgTmV4dCBzdGVwOiAke2Rlc2NyaXB0aW9ufS5gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbmFtZSA9IHRvRGlzcGxheU5hbWUgfHwgdG9TdGFnZTtcbiAgICAgIHRoaXMuc2VudGVuY2VzLnB1c2goYE5leHQsIGl0IG1vdmVkIG9uIHRvICR7bmFtZX0uYCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogRGVjaXNpb24gcG9pbnRzIGFyZSB0aGUgbW9zdCB2YWx1YWJsZSBwYXJ0IG9mIHRoZSBuYXJyYXRpdmUgZm9yXG4gICAqIExMTSBjb250ZXh0IGVuZ2luZWVyaW5nLiBJbmNsdWRpbmcgdGhlIHJhdGlvbmFsZSBsZXRzIGV2ZW4gYSBjaGVhcGVyXG4gICAqIG1vZGVsIHJlYXNvbiBhYm91dCB3aHkgYSBicmFuY2ggd2FzIHRha2VuLlxuICAgKiBXaGVuIGRlY2lkZXJEZXNjcmlwdGlvbiBpcyBhdmFpbGFibGUsIHVzZXMgaXQgZm9yIG5hdHVyYWwgcGhyYXNpbmcuXG4gICAqL1xuICBvbkRlY2lzaW9uKGRlY2lkZXJOYW1lOiBzdHJpbmcsIGNob3NlbkJyYW5jaDogc3RyaW5nLCBjaG9zZW5EaXNwbGF5TmFtZT86IHN0cmluZywgcmF0aW9uYWxlPzogc3RyaW5nLCBkZWNpZGVyRGVzY3JpcHRpb24/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBicmFuY2hOYW1lID0gY2hvc2VuRGlzcGxheU5hbWUgfHwgY2hvc2VuQnJhbmNoO1xuICAgIGlmIChkZWNpZGVyRGVzY3JpcHRpb24gJiYgcmF0aW9uYWxlKSB7XG4gICAgICB0aGlzLnNlbnRlbmNlcy5wdXNoKGBJdCAke2RlY2lkZXJEZXNjcmlwdGlvbn06ICR7cmF0aW9uYWxlfSwgc28gaXQgY2hvc2UgJHticmFuY2hOYW1lfS5gKTtcbiAgICB9IGVsc2UgaWYgKGRlY2lkZXJEZXNjcmlwdGlvbikge1xuICAgICAgdGhpcy5zZW50ZW5jZXMucHVzaChgSXQgJHtkZWNpZGVyRGVzY3JpcHRpb259IGFuZCBjaG9zZSAke2JyYW5jaE5hbWV9LmApO1xuICAgIH0gZWxzZSBpZiAocmF0aW9uYWxlKSB7XG4gICAgICB0aGlzLnNlbnRlbmNlcy5wdXNoKGBBIGRlY2lzaW9uIHdhcyBtYWRlOiAke3JhdGlvbmFsZX0sIHNvIHRoZSBwYXRoIHRha2VuIHdhcyAke2JyYW5jaE5hbWV9LmApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlbnRlbmNlcy5wdXNoKGBBIGRlY2lzaW9uIHdhcyBtYWRlLCBhbmQgdGhlIHBhdGggdGFrZW4gd2FzICR7YnJhbmNoTmFtZX0uYCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogQ2FwdHVyZXMgdGhlIGZhbi1vdXQgc28gdGhlIHJlYWRlciBrbm93cyB3aGljaCBwYXRocyByYW5cbiAgICogY29uY3VycmVudGx5IGFuZCBob3cgbWFueSB0aGVyZSB3ZXJlLlxuICAgKi9cbiAgb25Gb3JrKHBhcmVudFN0YWdlOiBzdHJpbmcsIGNoaWxkTmFtZXM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgY29uc3QgbmFtZXMgPSBjaGlsZE5hbWVzLmpvaW4oJywgJyk7XG4gICAgdGhpcy5zZW50ZW5jZXMucHVzaChgJHtjaGlsZE5hbWVzLmxlbmd0aH0gcGF0aHMgd2VyZSBleGVjdXRlZCBpbiBwYXJhbGxlbDogJHtuYW1lc30uYCk7XG4gIH1cblxuICAvKipcbiAgICogV0hZOiBDYXB0dXJlcyB3aGljaCBjaGlsZHJlbiB3ZXJlIHNlbGVjdGVkIG91dCBvZiB0aGUgdG90YWwgYXZhaWxhYmxlLFxuICAgKiBzbyB0aGUgcmVhZGVyIHVuZGVyc3RhbmRzIHRoZSBzZWxlY3Rpb24gZGVjaXNpb24uXG4gICAqL1xuICBvblNlbGVjdGVkKHBhcmVudFN0YWdlOiBzdHJpbmcsIHNlbGVjdGVkTmFtZXM6IHN0cmluZ1tdLCB0b3RhbENvdW50OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBuYW1lcyA9IHNlbGVjdGVkTmFtZXMuam9pbignLCAnKTtcbiAgICB0aGlzLnNlbnRlbmNlcy5wdXNoKGAke3NlbGVjdGVkTmFtZXMubGVuZ3RofSBvZiAke3RvdGFsQ291bnR9IHBhdGhzIHdlcmUgc2VsZWN0ZWQ6ICR7bmFtZXN9LmApO1xuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogTWFya3MgdGhlIGJvdW5kYXJ5IHdoZXJlIGV4ZWN1dGlvbiBkaXZlcyBpbnRvIGEgbmVzdGVkIGNvbnRleHQsXG4gICAqIGhlbHBpbmcgdGhlIHJlYWRlciBmb2xsb3cgdGhlIG5lc3Rpbmcgc3RydWN0dXJlLlxuICAgKi9cbiAgb25TdWJmbG93RW50cnkoc3ViZmxvd05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuc2VudGVuY2VzLnB1c2goYEVudGVyaW5nIHRoZSAke3N1YmZsb3dOYW1lfSBzdWJmbG93LmApO1xuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogTWFya3MgdGhlIHJldHVybiBmcm9tIGEgbmVzdGVkIGNvbnRleHQgYmFjayB0byB0aGUgcGFyZW50IGZsb3cuXG4gICAqL1xuICBvblN1YmZsb3dFeGl0KHN1YmZsb3dOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnNlbnRlbmNlcy5wdXNoKGBFeGl0aW5nIHRoZSAke3N1YmZsb3dOYW1lfSBzdWJmbG93LmApO1xuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogQ2FwdHVyZXMgcmVwZWF0ZWQgZXhlY3V0aW9uIHNvIHRoZSByZWFkZXIgY2FuIHRyYWNrIGl0ZXJhdGlvblxuICAgKiBjb3VudHMgYW5kIHVuZGVyc3RhbmQgcmV0cnkvbG9vcCBiZWhhdmlvci5cbiAgICogV2hlbiBkZXNjcmlwdGlvbiBpcyBhdmFpbGFibGUsIHByb2R1Y2VzIFwiT24gcGFzcyBOOiB7ZGVzY3JpcHRpb259IGFnYWluLlwiXG4gICAqL1xuICBvbkxvb3AodGFyZ2V0U3RhZ2U6IHN0cmluZywgdGFyZ2V0RGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgaXRlcmF0aW9uOiBudW1iZXIsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSB7XG4gICAgICB0aGlzLnNlbnRlbmNlcy5wdXNoKGBPbiBwYXNzICR7aXRlcmF0aW9ufTogJHtkZXNjcmlwdGlvbn0gYWdhaW4uYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5hbWUgPSB0YXJnZXREaXNwbGF5TmFtZSB8fCB0YXJnZXRTdGFnZTtcbiAgICAgIHRoaXMuc2VudGVuY2VzLnB1c2goYE9uIHBhc3MgJHtpdGVyYXRpb259IHRocm91Z2ggJHtuYW1lfS5gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogV0hZOiBDYXB0dXJlcyBlYXJseSB0ZXJtaW5hdGlvbiBzbyB0aGUgcmVhZGVyIGtub3dzIHdoZXJlIHRoZVxuICAgKiBwaXBlbGluZSBzdG9wcGVkIGJlZm9yZSByZWFjaGluZyB0aGUgbmF0dXJhbCBlbmQuXG4gICAqL1xuICBvbkJyZWFrKHN0YWdlTmFtZTogc3RyaW5nLCBkaXNwbGF5TmFtZT86IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IG5hbWUgPSBkaXNwbGF5TmFtZSB8fCBzdGFnZU5hbWU7XG4gICAgdGhpcy5zZW50ZW5jZXMucHVzaChgRXhlY3V0aW9uIHN0b3BwZWQgYXQgJHtuYW1lfS5gKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBXSFk6IENhcHR1cmVzIGZhaWx1cmUgcG9pbnRzIHNvIHRoZSByZWFkZXIgKG9yIGEgZm9sbG93LXVwIExMTSlcbiAgICogY2FuIHVuZGVyc3RhbmQgd2hhdCB3ZW50IHdyb25nIGFuZCB3aGVyZS5cbiAgICovXG4gIG9uRXJyb3Ioc3RhZ2VOYW1lOiBzdHJpbmcsIGVycm9yTWVzc2FnZTogc3RyaW5nLCBkaXNwbGF5TmFtZT86IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IG5hbWUgPSBkaXNwbGF5TmFtZSB8fCBzdGFnZU5hbWU7XG4gICAgdGhpcy5zZW50ZW5jZXMucHVzaChgQW4gZXJyb3Igb2NjdXJyZWQgYXQgJHtuYW1lfTogJHtlcnJvck1lc3NhZ2V9LmApO1xuICB9XG5cbiAgLyoqXG4gICAqIFdIWTogUmV0dXJucyBhIGRlZmVuc2l2ZSBjb3B5IHNvIGNhbGxlcnMgY2Fubm90IG11dGF0ZSB0aGUgaW50ZXJuYWxcbiAgICogc2VudGVuY2UgYXJyYXksIHByZXNlcnZpbmcgdGhlIGdlbmVyYXRvcidzIGludGVncml0eSBhY3Jvc3MgbXVsdGlwbGUgcmVhZHMuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgc2hhbGxvdyBjb3B5IG9mIHRoZSBhY2N1bXVsYXRlZCBuYXJyYXRpdmUgc2VudGVuY2VzIGluIGV4ZWN1dGlvbiBvcmRlclxuICAgKi9cbiAgZ2V0U2VudGVuY2VzKCk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gWy4uLnRoaXMuc2VudGVuY2VzXTtcbiAgfVxufVxuIl19