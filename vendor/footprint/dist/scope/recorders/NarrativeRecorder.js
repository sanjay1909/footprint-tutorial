"use strict";
/**
 * NarrativeRecorder — Scope-level recorder that captures per-stage reads and writes
 * for enriching narrative output with actual data values.
 * ----------------------------------------------------------------------------
 * WHY: The NarrativeGenerator (pipeline-level) captures FLOW — what stages ran,
 * which branches were taken, how many loops occurred. But it doesn't capture
 * DATA — what values were read, what was written, what changed.
 *
 * NarrativeRecorder bridges this gap. It observes scope operations (reads/writes)
 * and produces per-stage summaries that can be merged with NarrativeGenerator
 * sentences to give the FULL picture: what happened AND what was produced.
 *
 * THE FULL PICTURE:
 *   NarrativeGenerator (flow):  "CallLLM sent messages to the provider."
 *   NarrativeRecorder (data):   "  - Read: messages (3 items)"
 *                               "  - Wrote: lastResponse.model = 'gpt-4'"
 *                               "  - Wrote: lastResponse.usage.totalTokens = 847"
 *
 * Combined, a cheap LLM can answer follow-up questions from the trace alone,
 * without re-running the pipeline or making additional tool calls.
 *
 * DESIGN DECISIONS:
 * - Per-stage grouping: Reads/writes are grouped by stage name, matching
 *   NarrativeGenerator's per-stage sentence structure.
 * - Value summarization: Values are summarized (not raw-dumped) to keep
 *   narrative concise. Arrays show length, objects show key count, strings
 *   are truncated. This prevents token bloat when injecting into LLM context.
 * - Configurable detail: `detail` option controls verbosity. 'summary' mode
 *   shows read/write counts. 'full' mode shows individual operations with values.
 * - Chronological order: Operations are recorded in execution order within
 *   each stage, preserving the temporal narrative.
 *
 * RELATED:
 * - {@link NarrativeGenerator} — Pipeline-level flow narrative (what happened)
 * - {@link DebugRecorder} — Development-focused verbose logging
 * - {@link MetricRecorder} — Production-focused timing/counts
 * - {@link LLMRecorder} — LLM-specific call tracking (in agentFootprints)
 *
 * @module scope/recorders/NarrativeRecorder
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NarrativeRecorder = void 0;
// ============================================================================
// NarrativeRecorder Implementation
// ============================================================================
/**
 * NarrativeRecorder — captures per-stage scope operations for narrative enrichment.
 *
 * WHY: Bridges the gap between flow-level narrative (NarrativeGenerator) and
 * data-level detail. Produces structured per-stage data and text sentences
 * that can be merged with NarrativeGenerator output.
 *
 * @example
 * ```typescript
 * const recorder = new NarrativeRecorder();
 * scope.attachRecorder(recorder);
 *
 * // ... execute pipeline ...
 *
 * // Get structured per-stage data
 * const stageData = recorder.getStageData();
 * // → Map { 'CallLLM' => { reads: [...], writes: [...] }, ... }
 *
 * // Get text sentences for each stage
 * const sentences = recorder.toSentences();
 * // → Map { 'CallLLM' => ['  - Read: messages (3 items)', '  - Wrote: lastResponse.model = "gpt-4"'], ... }
 *
 * // Merge with NarrativeGenerator output
 * const narrative = narrativeGenerator.getSentences();
 * const enriched = mergeNarrative(narrative, sentences);
 * ```
 */
class NarrativeRecorder {
    /**
     * Creates a new NarrativeRecorder instance.
     *
     * @param options - Optional configuration
     */
    constructor(options) {
        var _a, _b, _c;
        /**
         * Per-stage narrative data, keyed by stage name.
         */
        this.stages = new Map();
        /**
         * Ordered list of stage names as they were first encountered.
         * WHY: Preserves execution order for toSentences() output.
         */
        this.stageOrder = [];
        this.id = (_a = options === null || options === void 0 ? void 0 : options.id) !== null && _a !== void 0 ? _a : `narrative-recorder-${Date.now()}`;
        this.detail = (_b = options === null || options === void 0 ? void 0 : options.detail) !== null && _b !== void 0 ? _b : 'full';
        this.maxValueLength = (_c = options === null || options === void 0 ? void 0 : options.maxValueLength) !== null && _c !== void 0 ? _c : 80;
    }
    // ==========================================================================
    // Recorder Hooks
    // ==========================================================================
    /**
     * Called when a value is read from scope.
     *
     * WHY: Captures what data each stage consumed. This tells the narrative
     * reader what inputs influenced the stage's behavior.
     *
     * @param event - Details about the read operation
     */
    onRead(event) {
        var _a;
        const stageData = this.getOrCreateStageData(event.stageName);
        stageData.reads.push({
            type: 'read',
            path: event.path,
            key: (_a = event.key) !== null && _a !== void 0 ? _a : '',
            valueSummary: summarizeValue(event.value, this.maxValueLength),
        });
    }
    /**
     * Called when a value is written to scope.
     *
     * WHY: Captures what data each stage produced. This tells the narrative
     * reader what outputs the stage generated — the actual values, not just
     * "something was written."
     *
     * @param event - Details about the write operation
     */
    onWrite(event) {
        const stageData = this.getOrCreateStageData(event.stageName);
        stageData.writes.push({
            type: 'write',
            path: event.path,
            key: event.key,
            valueSummary: summarizeValue(event.value, this.maxValueLength),
            operation: event.operation,
        });
    }
    // ==========================================================================
    // Access Methods
    // ==========================================================================
    /**
     * Returns structured per-stage narrative data.
     *
     * WHY: Structured data allows consumers to build custom narrative formats,
     * filter by stage, or combine with other data sources.
     *
     * @returns Map of stage names to their narrative data (defensive copy)
     *
     * @example
     * ```typescript
     * const stageData = recorder.getStageData();
     * const callLLM = stageData.get('CallLLM');
     * if (callLLM) {
     *   console.log(`CallLLM read ${callLLM.reads.length} values`);
     *   console.log(`CallLLM wrote ${callLLM.writes.length} values`);
     * }
     * ```
     */
    getStageData() {
        const copy = new Map();
        for (const [name, data] of this.stages) {
            copy.set(name, {
                stageName: data.stageName,
                reads: [...data.reads],
                writes: [...data.writes],
            });
        }
        return copy;
    }
    /**
     * Returns narrative data for a specific stage.
     *
     * @param stageName - The stage to get data for
     * @returns The stage's narrative data, or undefined if no data recorded
     */
    getStageDataFor(stageName) {
        const data = this.stages.get(stageName);
        if (!data)
            return undefined;
        return {
            stageName: data.stageName,
            reads: [...data.reads],
            writes: [...data.writes],
        };
    }
    /**
     * Returns text sentences per stage, suitable for merging with NarrativeGenerator output.
     *
     * WHY: Produces human-readable lines that can be nested under each
     * NarrativeGenerator sentence to show what data flowed through the stage.
     *
     * In 'summary' mode: "  - Read 3 values, wrote 2 values"
     * In 'full' mode:     "  - Read: messages (3 items)"
     *                     "  - Wrote: lastResponse.model = 'gpt-4'"
     *
     * @returns Map of stage names to arrays of text lines, in execution order
     *
     * @example
     * ```typescript
     * const sentences = recorder.toSentences();
     * for (const [stageName, lines] of sentences) {
     *   console.log(`${stageName}:`);
     *   for (const line of lines) {
     *     console.log(line);
     *   }
     * }
     * ```
     */
    toSentences() {
        const result = new Map();
        for (const stageName of this.stageOrder) {
            const data = this.stages.get(stageName);
            if (!data)
                continue;
            const lines = [];
            if (this.detail === 'summary') {
                // Compact summary mode
                const parts = [];
                if (data.reads.length > 0) {
                    parts.push(`read ${data.reads.length} value${data.reads.length > 1 ? 's' : ''}`);
                }
                if (data.writes.length > 0) {
                    parts.push(`wrote ${data.writes.length} value${data.writes.length > 1 ? 's' : ''}`);
                }
                if (parts.length > 0) {
                    lines.push(`  - ${capitalize(parts.join(', '))}`);
                }
            }
            else {
                // Full detail mode — individual operations
                for (const read of data.reads) {
                    const path = formatPath(read.path, read.key);
                    if (read.valueSummary) {
                        lines.push(`  - Read: ${path} = ${read.valueSummary}`);
                    }
                    else {
                        lines.push(`  - Read: ${path}`);
                    }
                }
                for (const write of data.writes) {
                    const path = formatPath(write.path, write.key);
                    lines.push(`  - Wrote: ${path} = ${write.valueSummary}`);
                }
            }
            if (lines.length > 0) {
                result.set(stageName, lines);
            }
        }
        return result;
    }
    /**
     * Returns a flat array of all narrative lines across all stages, in execution order.
     *
     * WHY: For simple consumption where per-stage grouping isn't needed.
     * Each line is prefixed with the stage name for context.
     *
     * @returns Array of narrative lines in execution order
     *
     * @example
     * ```typescript
     * const lines = recorder.toFlatSentences();
     * // → [
     * //   "Initialize: Read config.apiKey",
     * //   "Initialize: Wrote agent.model = 'gpt-4'",
     * //   "CallLLM: Read messages (3 items)",
     * //   "CallLLM: Wrote lastResponse.content = 'Hello...'",
     * // ]
     * ```
     */
    toFlatSentences() {
        const result = [];
        const perStage = this.toSentences();
        for (const [stageName, lines] of perStage) {
            for (const line of lines) {
                // Remove the leading "  - " indent and prefix with stage name
                const cleaned = line.replace(/^\s+-\s+/, '');
                result.push(`${stageName}: ${cleaned}`);
            }
        }
        return result;
    }
    /**
     * Clears all recorded data.
     *
     * Use this to reset the recorder for a new execution run.
     */
    clear() {
        this.stages.clear();
        this.stageOrder = [];
    }
    /**
     * Sets the detail level for output generation.
     *
     * Note: Changing detail only affects future toSentences() calls.
     * Recorded data is always captured at full detail.
     *
     * @param level - The new detail level
     */
    setDetail(level) {
        this.detail = level;
    }
    /**
     * Returns the current detail level.
     */
    getDetail() {
        return this.detail;
    }
    // ==========================================================================
    // Private Helpers
    // ==========================================================================
    /**
     * Gets or creates stage narrative data for the given stage name.
     */
    getOrCreateStageData(stageName) {
        let data = this.stages.get(stageName);
        if (!data) {
            data = {
                stageName,
                reads: [],
                writes: [],
            };
            this.stages.set(stageName, data);
            this.stageOrder.push(stageName);
        }
        return data;
    }
}
exports.NarrativeRecorder = NarrativeRecorder;
// ============================================================================
// Private Helpers
// ============================================================================
/**
 * Summarizes a value for narrative display.
 *
 * WHY: Raw values can be huge (full LLM responses, large arrays). Summaries
 * keep the narrative concise while conveying the essential information.
 *
 * Rules:
 * - null/undefined → "undefined"
 * - string → truncated to maxLen with "..." suffix
 * - number/boolean → string representation
 * - array → "({length} items)" or first few values if short
 * - object → "{key1, key2, ...}" showing top-level keys
 *
 * @param value - The value to summarize
 * @param maxLen - Maximum characters for the summary
 * @returns A concise string representation
 */
function summarizeValue(value, maxLen) {
    if (value === undefined)
        return 'undefined';
    if (value === null)
        return 'null';
    if (typeof value === 'string') {
        if (value.length <= maxLen)
            return `"${value}"`;
        return `"${value.slice(0, maxLen - 3)}..."`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        if (value.length === 0)
            return '[]';
        return `(${value.length} item${value.length > 1 ? 's' : ''})`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0)
            return '{}';
        const preview = keys.slice(0, 4).join(', ');
        const suffix = keys.length > 4 ? `, ... (${keys.length} keys)` : '';
        const result = `{${preview}${suffix}}`;
        if (result.length <= maxLen)
            return result;
        return `{${keys.length} keys}`;
    }
    return String(value);
}
/**
 * Formats a path + key into a readable dotted string.
 *
 * @example
 * formatPath(['agent'], 'lastResponse') → "agent.lastResponse"
 * formatPath(['user', 'profile'], 'name') → "user.profile.name"
 * formatPath([], 'root') → "root"
 */
function formatPath(path, key) {
    if (path.length === 0)
        return key;
    return `${path.join('.')}.${key}`;
}
/**
 * Capitalizes the first letter of a string.
 */
function capitalize(s) {
    if (s.length === 0)
        return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFycmF0aXZlUmVjb3JkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NvcGUvcmVjb3JkZXJzL05hcnJhdGl2ZVJlY29yZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBdUNHOzs7QUFzRUgsK0VBQStFO0FBQy9FLG1DQUFtQztBQUNuQywrRUFBK0U7QUFFL0U7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBMEJHO0FBQ0gsTUFBYSxpQkFBaUI7SUEyQjVCOzs7O09BSUc7SUFDSCxZQUFZLE9BQWtDOztRQTFCOUM7O1dBRUc7UUFDSyxXQUFNLEdBQW9DLElBQUksR0FBRyxFQUFFLENBQUM7UUFFNUQ7OztXQUdHO1FBQ0ssZUFBVSxHQUFhLEVBQUUsQ0FBQztRQWtCaEMsSUFBSSxDQUFDLEVBQUUsR0FBRyxNQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxFQUFFLG1DQUFJLHNCQUFzQixJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUM1RCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLE1BQU0sbUNBQUksTUFBTSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxjQUFjLEdBQUcsTUFBQSxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsY0FBYyxtQ0FBSSxFQUFFLENBQUM7SUFDdEQsQ0FBQztJQUVELDZFQUE2RTtJQUM3RSxpQkFBaUI7SUFDakIsNkVBQTZFO0lBRTdFOzs7Ozs7O09BT0c7SUFDSCxNQUFNLENBQUMsS0FBZ0I7O1FBQ3JCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0QsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDbkIsSUFBSSxFQUFFLE1BQU07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LENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ3BDLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsVUFBVSxDQUFDLENBQVM7SUFDM0IsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUM7UUFBRSxPQUFPLENBQUMsQ0FBQztJQUM3QixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBOYXJyYXRpdmVSZWNvcmRlciDigJQgU2NvcGUtbGV2ZWwgcmVjb3JkZXIgdGhhdCBjYXB0dXJlcyBwZXItc3RhZ2UgcmVhZHMgYW5kIHdyaXRlc1xuICogZm9yIGVucmljaGluZyBuYXJyYXRpdmUgb3V0cHV0IHdpdGggYWN0dWFsIGRhdGEgdmFsdWVzLlxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogV0hZOiBUaGUgTmFycmF0aXZlR2VuZXJhdG9yIChwaXBlbGluZS1sZXZlbCkgY2FwdHVyZXMgRkxPVyDigJQgd2hhdCBzdGFnZXMgcmFuLFxuICogd2hpY2ggYnJhbmNoZXMgd2VyZSB0YWtlbiwgaG93IG1hbnkgbG9vcHMgb2NjdXJyZWQuIEJ1dCBpdCBkb2Vzbid0IGNhcHR1cmVcbiAqIERBVEEg4oCUIHdoYXQgdmFsdWVzIHdlcmUgcmVhZCwgd2hhdCB3YXMgd3JpdHRlbiwgd2hhdCBjaGFuZ2VkLlxuICpcbiAqIE5hcnJhdGl2ZVJlY29yZGVyIGJyaWRnZXMgdGhpcyBnYXAuIEl0IG9ic2VydmVzIHNjb3BlIG9wZXJhdGlvbnMgKHJlYWRzL3dyaXRlcylcbiAqIGFuZCBwcm9kdWNlcyBwZXItc3RhZ2Ugc3VtbWFyaWVzIHRoYXQgY2FuIGJlIG1lcmdlZCB3aXRoIE5hcnJhdGl2ZUdlbmVyYXRvclxuICogc2VudGVuY2VzIHRvIGdpdmUgdGhlIEZVTEwgcGljdHVyZTogd2hhdCBoYXBwZW5lZCBBTkQgd2hhdCB3YXMgcHJvZHVjZWQuXG4gKlxuICogVEhFIEZVTEwgUElDVFVSRTpcbiAqICAgTmFycmF0aXZlR2VuZXJhdG9yIChmbG93KTogIFwiQ2FsbExMTSBzZW50IG1lc3NhZ2VzIHRvIHRoZSBwcm92aWRlci5cIlxuICogICBOYXJyYXRpdmVSZWNvcmRlciAoZGF0YSk6ICAgXCIgIC0gUmVhZDogbWVzc2FnZXMgKDMgaXRlbXMpXCJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAtIFdyb3RlOiBsYXN0UmVzcG9uc2UubW9kZWwgPSAnZ3B0LTQnXCJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAtIFdyb3RlOiBsYXN0UmVzcG9uc2UudXNhZ2UudG90YWxUb2tlbnMgPSA4NDdcIlxuICpcbiAqIENvbWJpbmVkLCBhIGNoZWFwIExMTSBjYW4gYW5zd2VyIGZvbGxvdy11cCBxdWVzdGlvbnMgZnJvbSB0aGUgdHJhY2UgYWxvbmUsXG4gKiB3aXRob3V0IHJlLXJ1bm5pbmcgdGhlIHBpcGVsaW5lIG9yIG1ha2luZyBhZGRpdGlvbmFsIHRvb2wgY2FsbHMuXG4gKlxuICogREVTSUdOIERFQ0lTSU9OUzpcbiAqIC0gUGVyLXN0YWdlIGdyb3VwaW5nOiBSZWFkcy93cml0ZXMgYXJlIGdyb3VwZWQgYnkgc3RhZ2UgbmFtZSwgbWF0Y2hpbmdcbiAqICAgTmFycmF0aXZlR2VuZXJhdG9yJ3MgcGVyLXN0YWdlIHNlbnRlbmNlIHN0cnVjdHVyZS5cbiAqIC0gVmFsdWUgc3VtbWFyaXphdGlvbjogVmFsdWVzIGFyZSBzdW1tYXJpemVkIChub3QgcmF3LWR1bXBlZCkgdG8ga2VlcFxuICogICBuYXJyYXRpdmUgY29uY2lzZS4gQXJyYXlzIHNob3cgbGVuZ3RoLCBvYmplY3RzIHNob3cga2V5IGNvdW50LCBzdHJpbmdzXG4gKiAgIGFyZSB0cnVuY2F0ZWQuIFRoaXMgcHJldmVudHMgdG9rZW4gYmxvYXQgd2hlbiBpbmplY3RpbmcgaW50byBMTE0gY29udGV4dC5cbiAqIC0gQ29uZmlndXJhYmxlIGRldGFpbDogYGRldGFpbGAgb3B0aW9uIGNvbnRyb2xzIHZlcmJvc2l0eS4gJ3N1bW1hcnknIG1vZGVcbiAqICAgc2hvd3MgcmVhZC93cml0ZSBjb3VudHMuICdmdWxsJyBtb2RlIHNob3dzIGluZGl2aWR1YWwgb3BlcmF0aW9ucyB3aXRoIHZhbHVlcy5cbiAqIC0gQ2hyb25vbG9naWNhbCBvcmRlcjogT3BlcmF0aW9ucyBhcmUgcmVjb3JkZWQgaW4gZXhlY3V0aW9uIG9yZGVyIHdpdGhpblxuICogICBlYWNoIHN0YWdlLCBwcmVzZXJ2aW5nIHRoZSB0ZW1wb3JhbCBuYXJyYXRpdmUuXG4gKlxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIE5hcnJhdGl2ZUdlbmVyYXRvcn0g4oCUIFBpcGVsaW5lLWxldmVsIGZsb3cgbmFycmF0aXZlICh3aGF0IGhhcHBlbmVkKVxuICogLSB7QGxpbmsgRGVidWdSZWNvcmRlcn0g4oCUIERldmVsb3BtZW50LWZvY3VzZWQgdmVyYm9zZSBsb2dnaW5nXG4gKiAtIHtAbGluayBNZXRyaWNSZWNvcmRlcn0g4oCUIFByb2R1Y3Rpb24tZm9jdXNlZCB0aW1pbmcvY291bnRzXG4gKiAtIHtAbGluayBMTE1SZWNvcmRlcn0g4oCUIExMTS1zcGVjaWZpYyBjYWxsIHRyYWNraW5nIChpbiBhZ2VudEZvb3RwcmludHMpXG4gKlxuICogQG1vZHVsZSBzY29wZS9yZWNvcmRlcnMvTmFycmF0aXZlUmVjb3JkZXJcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IFJlYWRFdmVudCwgUmVjb3JkZXIsIFdyaXRlRXZlbnQsIENvbW1pdEV2ZW50LCBTdGFnZUV2ZW50IH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUeXBlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIERldGFpbCBsZXZlbCBmb3IgTmFycmF0aXZlUmVjb3JkZXIgb3V0cHV0LlxuICpcbiAqIC0gJ3N1bW1hcnknOiBQZXItc3RhZ2UgcmVhZC93cml0ZSBjb3VudHMgKGNvbXBhY3QsIGdvb2QgZm9yIG92ZXJ2aWV3KVxuICogLSAnZnVsbCc6IEluZGl2aWR1YWwgcmVhZC93cml0ZSBvcGVyYXRpb25zIHdpdGggc3VtbWFyaXplZCB2YWx1ZXNcbiAqL1xuZXhwb3J0IHR5cGUgTmFycmF0aXZlRGV0YWlsID0gJ3N1bW1hcnknIHwgJ2Z1bGwnO1xuXG4vKipcbiAqIEEgc2luZ2xlIHJlY29yZGVkIHNjb3BlIG9wZXJhdGlvbiAocmVhZCBvciB3cml0ZSkgd2l0aGluIGEgc3RhZ2UuXG4gKlxuICogQHByb3BlcnR5IHR5cGUgLSBXaGV0aGVyIHRoaXMgd2FzIGEgJ3JlYWQnIG9yICd3cml0ZScgb3BlcmF0aW9uXG4gKiBAcHJvcGVydHkgcGF0aCAtIFRoZSBuYW1lc3BhY2UgcGF0aCAoZS5nLiwgWydhZ2VudCddLCBbJ3VzZXInXSlcbiAqIEBwcm9wZXJ0eSBrZXkgLSBUaGUga2V5IGJlaW5nIGFjY2Vzc2VkIChlLmcuLCAnbGFzdFJlc3BvbnNlJywgJ25hbWUnKVxuICogQHByb3BlcnR5IHZhbHVlIC0gU3VtbWFyaXplZCB2YWx1ZSBzdHJpbmcgKG5vdCByYXcgdmFsdWUg4oCUIHByZXZlbnRzIHRva2VuIGJsb2F0KVxuICogQHByb3BlcnR5IG9wZXJhdGlvbiAtIEZvciB3cml0ZXM6ICdzZXQnIG9yICd1cGRhdGUnXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aXZlT3BlcmF0aW9uIHtcbiAgLyoqIFdoZXRoZXIgdGhpcyB3YXMgYSAncmVhZCcgb3IgJ3dyaXRlJyBvcGVyYXRpb24gKi9cbiAgdHlwZTogJ3JlYWQnIHwgJ3dyaXRlJztcbiAgLyoqIFRoZSBuYW1lc3BhY2UgcGF0aCBmb3IgdGhlIG9wZXJhdGlvbiAqL1xuICBwYXRoOiBzdHJpbmdbXTtcbiAgLyoqIFRoZSBrZXkgYmVpbmcgYWNjZXNzZWQgKi9cbiAga2V5OiBzdHJpbmc7XG4gIC8qKiBTdW1tYXJpemVkIHZhbHVlIHN0cmluZyAqL1xuICB2YWx1ZVN1bW1hcnk6IHN0cmluZztcbiAgLyoqIEZvciB3cml0ZXM6IHRoZSB0eXBlIG9mIHdyaXRlIG9wZXJhdGlvbiAqL1xuICBvcGVyYXRpb24/OiAnc2V0JyB8ICd1cGRhdGUnO1xufVxuXG4vKipcbiAqIFBlci1zdGFnZSBuYXJyYXRpdmUgZGF0YSDigJQgYWxsIHNjb3BlIG9wZXJhdGlvbnMgdGhhdCBvY2N1cnJlZCBpbiBvbmUgc3RhZ2UuXG4gKlxuICogQHByb3BlcnR5IHN0YWdlTmFtZSAtIFRoZSBzdGFnZSB0aGVzZSBvcGVyYXRpb25zIGJlbG9uZyB0b1xuICogQHByb3BlcnR5IHJlYWRzIC0gQWxsIHJlYWQgb3BlcmF0aW9ucyBpbiBleGVjdXRpb24gb3JkZXJcbiAqIEBwcm9wZXJ0eSB3cml0ZXMgLSBBbGwgd3JpdGUgb3BlcmF0aW9ucyBpbiBleGVjdXRpb24gb3JkZXJcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTdGFnZU5hcnJhdGl2ZURhdGEge1xuICAvKiogVGhlIHN0YWdlIHRoZXNlIG9wZXJhdGlvbnMgYmVsb25nIHRvICovXG4gIHN0YWdlTmFtZTogc3RyaW5nO1xuICAvKiogQWxsIHJlYWQgb3BlcmF0aW9ucyBpbiBleGVjdXRpb24gb3JkZXIgKi9cbiAgcmVhZHM6IE5hcnJhdGl2ZU9wZXJhdGlvbltdO1xuICAvKiogQWxsIHdyaXRlIG9wZXJhdGlvbnMgaW4gZXhlY3V0aW9uIG9yZGVyICovXG4gIHdyaXRlczogTmFycmF0aXZlT3BlcmF0aW9uW107XG59XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgY3JlYXRpbmcgYSBOYXJyYXRpdmVSZWNvcmRlciBpbnN0YW5jZS5cbiAqXG4gKiBAcHJvcGVydHkgaWQgLSBPcHRpb25hbCB1bmlxdWUgaWRlbnRpZmllclxuICogQHByb3BlcnR5IGRldGFpbCAtIERldGFpbCBsZXZlbDogJ3N1bW1hcnknIG9yICdmdWxsJyAoZGVmYXVsdDogJ2Z1bGwnKVxuICogQHByb3BlcnR5IG1heFZhbHVlTGVuZ3RoIC0gTWF4IGNoYXJhY3RlcnMgZm9yIHZhbHVlIHN1bW1hcmllcyAoZGVmYXVsdDogODApXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aXZlUmVjb3JkZXJPcHRpb25zIHtcbiAgLyoqIE9wdGlvbmFsIHVuaXF1ZSBpZGVudGlmaWVyICovXG4gIGlkPzogc3RyaW5nO1xuICAvKiogRGV0YWlsIGxldmVsOiAnc3VtbWFyeScgb3IgJ2Z1bGwnIChkZWZhdWx0OiAnZnVsbCcpICovXG4gIGRldGFpbD86IE5hcnJhdGl2ZURldGFpbDtcbiAgLyoqIE1heCBjaGFyYWN0ZXJzIGZvciB2YWx1ZSBzdW1tYXJpZXMgKGRlZmF1bHQ6IDgwKSAqL1xuICBtYXhWYWx1ZUxlbmd0aD86IG51bWJlcjtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTmFycmF0aXZlUmVjb3JkZXIgSW1wbGVtZW50YXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBOYXJyYXRpdmVSZWNvcmRlciDigJQgY2FwdHVyZXMgcGVyLXN0YWdlIHNjb3BlIG9wZXJhdGlvbnMgZm9yIG5hcnJhdGl2ZSBlbnJpY2htZW50LlxuICpcbiAqIFdIWTogQnJpZGdlcyB0aGUgZ2FwIGJldHdlZW4gZmxvdy1sZXZlbCBuYXJyYXRpdmUgKE5hcnJhdGl2ZUdlbmVyYXRvcikgYW5kXG4gKiBkYXRhLWxldmVsIGRldGFpbC4gUHJvZHVjZXMgc3RydWN0dXJlZCBwZXItc3RhZ2UgZGF0YSBhbmQgdGV4dCBzZW50ZW5jZXNcbiAqIHRoYXQgY2FuIGJlIG1lcmdlZCB3aXRoIE5hcnJhdGl2ZUdlbmVyYXRvciBvdXRwdXQuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IHJlY29yZGVyID0gbmV3IE5hcnJhdGl2ZVJlY29yZGVyKCk7XG4gKiBzY29wZS5hdHRhY2hSZWNvcmRlcihyZWNvcmRlcik7XG4gKlxuICogLy8gLi4uIGV4ZWN1dGUgcGlwZWxpbmUgLi4uXG4gKlxuICogLy8gR2V0IHN0cnVjdHVyZWQgcGVyLXN0YWdlIGRhdGFcbiAqIGNvbnN0IHN0YWdlRGF0YSA9IHJlY29yZGVyLmdldFN0YWdlRGF0YSgpO1xuICogLy8g4oaSIE1hcCB7ICdDYWxsTExNJyA9PiB7IHJlYWRzOiBbLi4uXSwgd3JpdGVzOiBbLi4uXSB9LCAuLi4gfVxuICpcbiAqIC8vIEdldCB0ZXh0IHNlbnRlbmNlcyBmb3IgZWFjaCBzdGFnZVxuICogY29uc3Qgc2VudGVuY2VzID0gcmVjb3JkZXIudG9TZW50ZW5jZXMoKTtcbiAqIC8vIOKGkiBNYXAgeyAnQ2FsbExMTScgPT4gWycgIC0gUmVhZDogbWVzc2FnZXMgKDMgaXRlbXMpJywgJyAgLSBXcm90ZTogbGFzdFJlc3BvbnNlLm1vZGVsID0gXCJncHQtNFwiJ10sIC4uLiB9XG4gKlxuICogLy8gTWVyZ2Ugd2l0aCBOYXJyYXRpdmVHZW5lcmF0b3Igb3V0cHV0XG4gKiBjb25zdCBuYXJyYXRpdmUgPSBuYXJyYXRpdmVHZW5lcmF0b3IuZ2V0U2VudGVuY2VzKCk7XG4gKiBjb25zdCBlbnJpY2hlZCA9IG1lcmdlTmFycmF0aXZlKG5hcnJhdGl2ZSwgc2VudGVuY2VzKTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgTmFycmF0aXZlUmVjb3JkZXIgaW1wbGVtZW50cyBSZWNvcmRlciB7XG4gIC8qKlxuICAgKiBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyByZWNvcmRlciBpbnN0YW5jZS5cbiAgICovXG4gIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFBlci1zdGFnZSBuYXJyYXRpdmUgZGF0YSwga2V5ZWQgYnkgc3RhZ2UgbmFtZS5cbiAgICovXG4gIHByaXZhdGUgc3RhZ2VzOiBNYXA8c3RyaW5nLCBTdGFnZU5hcnJhdGl2ZURhdGE+ID0gbmV3IE1hcCgpO1xuXG4gIC8qKlxuICAgKiBPcmRlcmVkIGxpc3Qgb2Ygc3RhZ2UgbmFtZXMgYXMgdGhleSB3ZXJlIGZpcnN0IGVuY291bnRlcmVkLlxuICAgKiBXSFk6IFByZXNlcnZlcyBleGVjdXRpb24gb3JkZXIgZm9yIHRvU2VudGVuY2VzKCkgb3V0cHV0LlxuICAgKi9cbiAgcHJpdmF0ZSBzdGFnZU9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXG4gIC8qKlxuICAgKiBEZXRhaWwgbGV2ZWwgZm9yIG91dHB1dCBnZW5lcmF0aW9uLlxuICAgKi9cbiAgcHJpdmF0ZSBkZXRhaWw6IE5hcnJhdGl2ZURldGFpbDtcblxuICAvKipcbiAgICogTWF4aW11bSBjaGFyYWN0ZXJzIGZvciB2YWx1ZSBzdW1tYXJpZXMuXG4gICAqL1xuICBwcml2YXRlIG1heFZhbHVlTGVuZ3RoOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgTmFycmF0aXZlUmVjb3JkZXIgaW5zdGFuY2UuXG4gICAqXG4gICAqIEBwYXJhbSBvcHRpb25zIC0gT3B0aW9uYWwgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9ucz86IE5hcnJhdGl2ZVJlY29yZGVyT3B0aW9ucykge1xuICAgIHRoaXMuaWQgPSBvcHRpb25zPy5pZCA/PyBgbmFycmF0aXZlLXJlY29yZGVyLSR7RGF0ZS5ub3coKX1gO1xuICAgIHRoaXMuZGV0YWlsID0gb3B0aW9ucz8uZGV0YWlsID8/ICdmdWxsJztcbiAgICB0aGlzLm1heFZhbHVlTGVuZ3RoID0gb3B0aW9ucz8ubWF4VmFsdWVMZW5ndGggPz8gODA7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBSZWNvcmRlciBIb29rc1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBDYWxsZWQgd2hlbiBhIHZhbHVlIGlzIHJlYWQgZnJvbSBzY29wZS5cbiAgICpcbiAgICogV0hZOiBDYXB0dXJlcyB3aGF0IGRhdGEgZWFjaCBzdGFnZSBjb25zdW1lZC4gVGhpcyB0ZWxscyB0aGUgbmFycmF0aXZlXG4gICAqIHJlYWRlciB3aGF0IGlucHV0cyBpbmZsdWVuY2VkIHRoZSBzdGFnZSdzIGJlaGF2aW9yLlxuICAgKlxuICAgKiBAcGFyYW0gZXZlbnQgLSBEZXRhaWxzIGFib3V0IHRoZSByZWFkIG9wZXJhdGlvblxuICAgKi9cbiAgb25SZWFkKGV2ZW50OiBSZWFkRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBzdGFnZURhdGEgPSB0aGlzLmdldE9yQ3JlYXRlU3RhZ2VEYXRhKGV2ZW50LnN0YWdlTmFtZSk7XG4gICAgc3RhZ2VEYXRhLnJlYWRzLnB1c2goe1xuICAgICAgdHlwZTogJ3JlYWQnLFxuICAgICAgcGF0aDogZXZlbnQucGF0aCxcbiAgICAgIGtleTogZXZlbnQua2V5ID8/ICcnLFxuICAgICAgdmFsdWVTdW1tYXJ5OiBzdW1tYXJpemVWYWx1ZShldmVudC52YWx1ZSwgdGhpcy5tYXhWYWx1ZUxlbmd0aCksXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIHdoZW4gYSB2YWx1ZSBpcyB3cml0dGVuIHRvIHNjb3BlLlxuICAgKlxuICAgKiBXSFk6IENhcHR1cmVzIHdoYXQgZGF0YSBlYWNoIHN0YWdlIHByb2R1Y2VkLiBUaGlzIHRlbGxzIHRoZSBuYXJyYXRpdmVcbiAgICogcmVhZGVyIHdoYXQgb3V0cHV0cyB0aGUgc3RhZ2UgZ2VuZXJhdGVkIOKAlCB0aGUgYWN0dWFsIHZhbHVlcywgbm90IGp1c3RcbiAgICogXCJzb21ldGhpbmcgd2FzIHdyaXR0ZW4uXCJcbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gRGV0YWlscyBhYm91dCB0aGUgd3JpdGUgb3BlcmF0aW9uXG4gICAqL1xuICBvbldyaXRlKGV2ZW50OiBXcml0ZUV2ZW50KTogdm9pZCB7XG4gICAgY29uc3Qgc3RhZ2VEYXRhID0gdGhpcy5nZXRPckNyZWF0ZVN0YWdlRGF0YShldmVudC5zdGFnZU5hbWUpO1xuICAgIHN0YWdlRGF0YS53cml0ZXMucHVzaCh7XG4gICAgICB0eXBlOiAnd3JpdGUnLFxuICAgICAgcGF0aDogZXZlbnQucGF0aCxcbiAgICAgIGtleTogZXZlbnQua2V5LFxuICAgICAgdmFsdWVTdW1tYXJ5OiBzdW1tYXJpemVWYWx1ZShldmVudC52YWx1ZSwgdGhpcy5tYXhWYWx1ZUxlbmd0aCksXG4gICAgICBvcGVyYXRpb246IGV2ZW50Lm9wZXJhdGlvbixcbiAgICB9KTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEFjY2VzcyBNZXRob2RzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIFJldHVybnMgc3RydWN0dXJlZCBwZXItc3RhZ2UgbmFycmF0aXZlIGRhdGEuXG4gICAqXG4gICAqIFdIWTogU3RydWN0dXJlZCBkYXRhIGFsbG93cyBjb25zdW1lcnMgdG8gYnVpbGQgY3VzdG9tIG5hcnJhdGl2ZSBmb3JtYXRzLFxuICAgKiBmaWx0ZXIgYnkgc3RhZ2UsIG9yIGNvbWJpbmUgd2l0aCBvdGhlciBkYXRhIHNvdXJjZXMuXG4gICAqXG4gICAqIEByZXR1cm5zIE1hcCBvZiBzdGFnZSBuYW1lcyB0byB0aGVpciBuYXJyYXRpdmUgZGF0YSAoZGVmZW5zaXZlIGNvcHkpXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3Qgc3RhZ2VEYXRhID0gcmVjb3JkZXIuZ2V0U3RhZ2VEYXRhKCk7XG4gICAqIGNvbnN0IGNhbGxMTE0gPSBzdGFnZURhdGEuZ2V0KCdDYWxsTExNJyk7XG4gICAqIGlmIChjYWxsTExNKSB7XG4gICAqICAgY29uc29sZS5sb2coYENhbGxMTE0gcmVhZCAke2NhbGxMTE0ucmVhZHMubGVuZ3RofSB2YWx1ZXNgKTtcbiAgICogICBjb25zb2xlLmxvZyhgQ2FsbExMTSB3cm90ZSAke2NhbGxMTE0ud3JpdGVzLmxlbmd0aH0gdmFsdWVzYCk7XG4gICAqIH1cbiAgICogYGBgXG4gICAqL1xuICBnZXRTdGFnZURhdGEoKTogTWFwPHN0cmluZywgU3RhZ2VOYXJyYXRpdmVEYXRhPiB7XG4gICAgY29uc3QgY29weSA9IG5ldyBNYXA8c3RyaW5nLCBTdGFnZU5hcnJhdGl2ZURhdGE+KCk7XG4gICAgZm9yIChjb25zdCBbbmFtZSwgZGF0YV0gb2YgdGhpcy5zdGFnZXMpIHtcbiAgICAgIGNvcHkuc2V0KG5hbWUsIHtcbiAgICAgICAgc3RhZ2VOYW1lOiBkYXRhLnN0YWdlTmFtZSxcbiAgICAgICAgcmVhZHM6IFsuLi5kYXRhLnJlYWRzXSxcbiAgICAgICAgd3JpdGVzOiBbLi4uZGF0YS53cml0ZXNdLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBjb3B5O1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgbmFycmF0aXZlIGRhdGEgZm9yIGEgc3BlY2lmaWMgc3RhZ2UuXG4gICAqXG4gICAqIEBwYXJhbSBzdGFnZU5hbWUgLSBUaGUgc3RhZ2UgdG8gZ2V0IGRhdGEgZm9yXG4gICAqIEByZXR1cm5zIFRoZSBzdGFnZSdzIG5hcnJhdGl2ZSBkYXRhLCBvciB1bmRlZmluZWQgaWYgbm8gZGF0YSByZWNvcmRlZFxuICAgKi9cbiAgZ2V0U3RhZ2VEYXRhRm9yKHN0YWdlTmFtZTogc3RyaW5nKTogU3RhZ2VOYXJyYXRpdmVEYXRhIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBkYXRhID0gdGhpcy5zdGFnZXMuZ2V0KHN0YWdlTmFtZSk7XG4gICAgaWYgKCFkYXRhKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIHJldHVybiB7XG4gICAgICBzdGFnZU5hbWU6IGRhdGEuc3RhZ2VOYW1lLFxuICAgICAgcmVhZHM6IFsuLi5kYXRhLnJlYWRzXSxcbiAgICAgIHdyaXRlczogWy4uLmRhdGEud3JpdGVzXSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGV4dCBzZW50ZW5jZXMgcGVyIHN0YWdlLCBzdWl0YWJsZSBmb3IgbWVyZ2luZyB3aXRoIE5hcnJhdGl2ZUdlbmVyYXRvciBvdXRwdXQuXG4gICAqXG4gICAqIFdIWTogUHJvZHVjZXMgaHVtYW4tcmVhZGFibGUgbGluZXMgdGhhdCBjYW4gYmUgbmVzdGVkIHVuZGVyIGVhY2hcbiAgICogTmFycmF0aXZlR2VuZXJhdG9yIHNlbnRlbmNlIHRvIHNob3cgd2hhdCBkYXRhIGZsb3dlZCB0aHJvdWdoIHRoZSBzdGFnZS5cbiAgICpcbiAgICogSW4gJ3N1bW1hcnknIG1vZGU6IFwiICAtIFJlYWQgMyB2YWx1ZXMsIHdyb3RlIDIgdmFsdWVzXCJcbiAgICogSW4gJ2Z1bGwnIG1vZGU6ICAgICBcIiAgLSBSZWFkOiBtZXNzYWdlcyAoMyBpdGVtcylcIlxuICAgKiAgICAgICAgICAgICAgICAgICAgIFwiICAtIFdyb3RlOiBsYXN0UmVzcG9uc2UubW9kZWwgPSAnZ3B0LTQnXCJcbiAgICpcbiAgICogQHJldHVybnMgTWFwIG9mIHN0YWdlIG5hbWVzIHRvIGFycmF5cyBvZiB0ZXh0IGxpbmVzLCBpbiBleGVjdXRpb24gb3JkZXJcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBzZW50ZW5jZXMgPSByZWNvcmRlci50b1NlbnRlbmNlcygpO1xuICAgKiBmb3IgKGNvbnN0IFtzdGFnZU5hbWUsIGxpbmVzXSBvZiBzZW50ZW5jZXMpIHtcbiAgICogICBjb25zb2xlLmxvZyhgJHtzdGFnZU5hbWV9OmApO1xuICAgKiAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgKiAgICAgY29uc29sZS5sb2cobGluZSk7XG4gICAqICAgfVxuICAgKiB9XG4gICAqIGBgYFxuICAgKi9cbiAgdG9TZW50ZW5jZXMoKTogTWFwPHN0cmluZywgc3RyaW5nW10+IHtcbiAgICBjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cbiAgICBmb3IgKGNvbnN0IHN0YWdlTmFtZSBvZiB0aGlzLnN0YWdlT3JkZXIpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnN0YWdlcy5nZXQoc3RhZ2VOYW1lKTtcbiAgICAgIGlmICghZGF0YSkgY29udGludWU7XG5cbiAgICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICBpZiAodGhpcy5kZXRhaWwgPT09ICdzdW1tYXJ5Jykge1xuICAgICAgICAvLyBDb21wYWN0IHN1bW1hcnkgbW9kZVxuICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGRhdGEucmVhZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHBhcnRzLnB1c2goYHJlYWQgJHtkYXRhLnJlYWRzLmxlbmd0aH0gdmFsdWUke2RhdGEucmVhZHMubGVuZ3RoID4gMSA/ICdzJyA6ICcnfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLndyaXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcGFydHMucHVzaChgd3JvdGUgJHtkYXRhLndyaXRlcy5sZW5ndGh9IHZhbHVlJHtkYXRhLndyaXRlcy5sZW5ndGggPiAxID8gJ3MnIDogJyd9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBsaW5lcy5wdXNoKGAgIC0gJHtjYXBpdGFsaXplKHBhcnRzLmpvaW4oJywgJykpfWApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGdWxsIGRldGFpbCBtb2RlIOKAlCBpbmRpdmlkdWFsIG9wZXJhdGlvbnNcbiAgICAgICAgZm9yIChjb25zdCByZWFkIG9mIGRhdGEucmVhZHMpIHtcbiAgICAgICAgICBjb25zdCBwYXRoID0gZm9ybWF0UGF0aChyZWFkLnBhdGgsIHJlYWQua2V5KTtcbiAgICAgICAgICBpZiAocmVhZC52YWx1ZVN1bW1hcnkpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgLSBSZWFkOiAke3BhdGh9ID0gJHtyZWFkLnZhbHVlU3VtbWFyeX1gKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAtIFJlYWQ6ICR7cGF0aH1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCB3cml0ZSBvZiBkYXRhLndyaXRlcykge1xuICAgICAgICAgIGNvbnN0IHBhdGggPSBmb3JtYXRQYXRoKHdyaXRlLnBhdGgsIHdyaXRlLmtleSk7XG4gICAgICAgICAgbGluZXMucHVzaChgICAtIFdyb3RlOiAke3BhdGh9ID0gJHt3cml0ZS52YWx1ZVN1bW1hcnl9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGxpbmVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmVzdWx0LnNldChzdGFnZU5hbWUsIGxpbmVzKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSBmbGF0IGFycmF5IG9mIGFsbCBuYXJyYXRpdmUgbGluZXMgYWNyb3NzIGFsbCBzdGFnZXMsIGluIGV4ZWN1dGlvbiBvcmRlci5cbiAgICpcbiAgICogV0hZOiBGb3Igc2ltcGxlIGNvbnN1bXB0aW9uIHdoZXJlIHBlci1zdGFnZSBncm91cGluZyBpc24ndCBuZWVkZWQuXG4gICAqIEVhY2ggbGluZSBpcyBwcmVmaXhlZCB3aXRoIHRoZSBzdGFnZSBuYW1lIGZvciBjb250ZXh0LlxuICAgKlxuICAgKiBAcmV0dXJucyBBcnJheSBvZiBuYXJyYXRpdmUgbGluZXMgaW4gZXhlY3V0aW9uIG9yZGVyXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgbGluZXMgPSByZWNvcmRlci50b0ZsYXRTZW50ZW5jZXMoKTtcbiAgICogLy8g4oaSIFtcbiAgICogLy8gICBcIkluaXRpYWxpemU6IFJlYWQgY29uZmlnLmFwaUtleVwiLFxuICAgKiAvLyAgIFwiSW5pdGlhbGl6ZTogV3JvdGUgYWdlbnQubW9kZWwgPSAnZ3B0LTQnXCIsXG4gICAqIC8vICAgXCJDYWxsTExNOiBSZWFkIG1lc3NhZ2VzICgzIGl0ZW1zKVwiLFxuICAgKiAvLyAgIFwiQ2FsbExMTTogV3JvdGUgbGFzdFJlc3BvbnNlLmNvbnRlbnQgPSAnSGVsbG8uLi4nXCIsXG4gICAqIC8vIF1cbiAgICogYGBgXG4gICAqL1xuICB0b0ZsYXRTZW50ZW5jZXMoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBwZXJTdGFnZSA9IHRoaXMudG9TZW50ZW5jZXMoKTtcbiAgICBmb3IgKGNvbnN0IFtzdGFnZU5hbWUsIGxpbmVzXSBvZiBwZXJTdGFnZSkge1xuICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgIC8vIFJlbW92ZSB0aGUgbGVhZGluZyBcIiAgLSBcIiBpbmRlbnQgYW5kIHByZWZpeCB3aXRoIHN0YWdlIG5hbWVcbiAgICAgICAgY29uc3QgY2xlYW5lZCA9IGxpbmUucmVwbGFjZSgvXlxccystXFxzKy8sICcnKTtcbiAgICAgICAgcmVzdWx0LnB1c2goYCR7c3RhZ2VOYW1lfTogJHtjbGVhbmVkfWApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFycyBhbGwgcmVjb3JkZWQgZGF0YS5cbiAgICpcbiAgICogVXNlIHRoaXMgdG8gcmVzZXQgdGhlIHJlY29yZGVyIGZvciBhIG5ldyBleGVjdXRpb24gcnVuLlxuICAgKi9cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgdGhpcy5zdGFnZXMuY2xlYXIoKTtcbiAgICB0aGlzLnN0YWdlT3JkZXIgPSBbXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIHRoZSBkZXRhaWwgbGV2ZWwgZm9yIG91dHB1dCBnZW5lcmF0aW9uLlxuICAgKlxuICAgKiBOb3RlOiBDaGFuZ2luZyBkZXRhaWwgb25seSBhZmZlY3RzIGZ1dHVyZSB0b1NlbnRlbmNlcygpIGNhbGxzLlxuICAgKiBSZWNvcmRlZCBkYXRhIGlzIGFsd2F5cyBjYXB0dXJlZCBhdCBmdWxsIGRldGFpbC5cbiAgICpcbiAgICogQHBhcmFtIGxldmVsIC0gVGhlIG5ldyBkZXRhaWwgbGV2ZWxcbiAgICovXG4gIHNldERldGFpbChsZXZlbDogTmFycmF0aXZlRGV0YWlsKTogdm9pZCB7XG4gICAgdGhpcy5kZXRhaWwgPSBsZXZlbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IGRldGFpbCBsZXZlbC5cbiAgICovXG4gIGdldERldGFpbCgpOiBOYXJyYXRpdmVEZXRhaWwge1xuICAgIHJldHVybiB0aGlzLmRldGFpbDtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFByaXZhdGUgSGVscGVyc1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBHZXRzIG9yIGNyZWF0ZXMgc3RhZ2UgbmFycmF0aXZlIGRhdGEgZm9yIHRoZSBnaXZlbiBzdGFnZSBuYW1lLlxuICAgKi9cbiAgcHJpdmF0ZSBnZXRPckNyZWF0ZVN0YWdlRGF0YShzdGFnZU5hbWU6IHN0cmluZyk6IFN0YWdlTmFycmF0aXZlRGF0YSB7XG4gICAgbGV0IGRhdGEgPSB0aGlzLnN0YWdlcy5nZXQoc3RhZ2VOYW1lKTtcbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgIGRhdGEgPSB7XG4gICAgICAgIHN0YWdlTmFtZSxcbiAgICAgICAgcmVhZHM6IFtdLFxuICAgICAgICB3cml0ZXM6IFtdLFxuICAgICAgfTtcbiAgICAgIHRoaXMuc3RhZ2VzLnNldChzdGFnZU5hbWUsIGRhdGEpO1xuICAgICAgdGhpcy5zdGFnZU9yZGVyLnB1c2goc3RhZ2VOYW1lKTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUHJpdmF0ZSBIZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogU3VtbWFyaXplcyBhIHZhbHVlIGZvciBuYXJyYXRpdmUgZGlzcGxheS5cbiAqXG4gKiBXSFk6IFJhdyB2YWx1ZXMgY2FuIGJlIGh1Z2UgKGZ1bGwgTExNIHJlc3BvbnNlcywgbGFyZ2UgYXJyYXlzKS4gU3VtbWFyaWVzXG4gKiBrZWVwIHRoZSBuYXJyYXRpdmUgY29uY2lzZSB3aGlsZSBjb252ZXlpbmcgdGhlIGVzc2VudGlhbCBpbmZvcm1hdGlvbi5cbiAqXG4gKiBSdWxlczpcbiAqIC0gbnVsbC91bmRlZmluZWQg4oaSIFwidW5kZWZpbmVkXCJcbiAqIC0gc3RyaW5nIOKGkiB0cnVuY2F0ZWQgdG8gbWF4TGVuIHdpdGggXCIuLi5cIiBzdWZmaXhcbiAqIC0gbnVtYmVyL2Jvb2xlYW4g4oaSIHN0cmluZyByZXByZXNlbnRhdGlvblxuICogLSBhcnJheSDihpIgXCIoe2xlbmd0aH0gaXRlbXMpXCIgb3IgZmlyc3QgZmV3IHZhbHVlcyBpZiBzaG9ydFxuICogLSBvYmplY3Qg4oaSIFwie2tleTEsIGtleTIsIC4uLn1cIiBzaG93aW5nIHRvcC1sZXZlbCBrZXlzXG4gKlxuICogQHBhcmFtIHZhbHVlIC0gVGhlIHZhbHVlIHRvIHN1bW1hcml6ZVxuICogQHBhcmFtIG1heExlbiAtIE1heGltdW0gY2hhcmFjdGVycyBmb3IgdGhlIHN1bW1hcnlcbiAqIEByZXR1cm5zIEEgY29uY2lzZSBzdHJpbmcgcmVwcmVzZW50YXRpb25cbiAqL1xuZnVuY3Rpb24gc3VtbWFyaXplVmFsdWUodmFsdWU6IHVua25vd24sIG1heExlbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybiAndW5kZWZpbmVkJztcbiAgaWYgKHZhbHVlID09PSBudWxsKSByZXR1cm4gJ251bGwnO1xuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgaWYgKHZhbHVlLmxlbmd0aCA8PSBtYXhMZW4pIHJldHVybiBgXCIke3ZhbHVlfVwiYDtcbiAgICByZXR1cm4gYFwiJHt2YWx1ZS5zbGljZSgwLCBtYXhMZW4gLSAzKX0uLi5cImA7XG4gIH1cblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgaWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkgcmV0dXJuICdbXSc7XG4gICAgcmV0dXJuIGAoJHt2YWx1ZS5sZW5ndGh9IGl0ZW0ke3ZhbHVlLmxlbmd0aCA+IDEgPyAncycgOiAnJ30pYDtcbiAgfVxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHJldHVybiAne30nO1xuICAgIGNvbnN0IHByZXZpZXcgPSBrZXlzLnNsaWNlKDAsIDQpLmpvaW4oJywgJyk7XG4gICAgY29uc3Qgc3VmZml4ID0ga2V5cy5sZW5ndGggPiA0ID8gYCwgLi4uICgke2tleXMubGVuZ3RofSBrZXlzKWAgOiAnJztcbiAgICBjb25zdCByZXN1bHQgPSBgeyR7cHJldmlld30ke3N1ZmZpeH19YDtcbiAgICBpZiAocmVzdWx0Lmxlbmd0aCA8PSBtYXhMZW4pIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGB7JHtrZXlzLmxlbmd0aH0ga2V5c31gO1xuICB9XG5cbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG59XG5cbi8qKlxuICogRm9ybWF0cyBhIHBhdGggKyBrZXkgaW50byBhIHJlYWRhYmxlIGRvdHRlZCBzdHJpbmcuXG4gKlxuICogQGV4YW1wbGVcbiAqIGZvcm1hdFBhdGgoWydhZ2VudCddLCAnbGFzdFJlc3BvbnNlJykg4oaSIFwiYWdlbnQubGFzdFJlc3BvbnNlXCJcbiAqIGZvcm1hdFBhdGgoWyd1c2VyJywgJ3Byb2ZpbGUnXSwgJ25hbWUnKSDihpIgXCJ1c2VyLnByb2ZpbGUubmFtZVwiXG4gKiBmb3JtYXRQYXRoKFtdLCAncm9vdCcpIOKGkiBcInJvb3RcIlxuICovXG5mdW5jdGlvbiBmb3JtYXRQYXRoKHBhdGg6IHN0cmluZ1tdLCBrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGtleTtcbiAgcmV0dXJuIGAke3BhdGguam9pbignLicpfS4ke2tleX1gO1xufVxuXG4vKipcbiAqIENhcGl0YWxpemVzIHRoZSBmaXJzdCBsZXR0ZXIgb2YgYSBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGNhcGl0YWxpemUoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHMubGVuZ3RoID09PSAwKSByZXR1cm4gcztcbiAgcmV0dXJuIHMuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzLnNsaWNlKDEpO1xufVxuIl19