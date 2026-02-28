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
import type { ReadEvent, Recorder, WriteEvent } from '../types';
/**
 * Detail level for NarrativeRecorder output.
 *
 * - 'summary': Per-stage read/write counts (compact, good for overview)
 * - 'full': Individual read/write operations with summarized values
 */
export type NarrativeDetail = 'summary' | 'full';
/**
 * A single recorded scope operation (read or write) within a stage.
 *
 * @property type - Whether this was a 'read' or 'write' operation
 * @property path - The namespace path (e.g., ['agent'], ['user'])
 * @property key - The key being accessed (e.g., 'lastResponse', 'name')
 * @property value - Summarized value string (not raw value — prevents token bloat)
 * @property operation - For writes: 'set' or 'update'
 */
export interface NarrativeOperation {
    /** Whether this was a 'read' or 'write' operation */
    type: 'read' | 'write';
    /** The namespace path for the operation */
    path: string[];
    /** The key being accessed */
    key: string;
    /** Summarized value string */
    valueSummary: string;
    /** For writes: the type of write operation */
    operation?: 'set' | 'update';
}
/**
 * Per-stage narrative data — all scope operations that occurred in one stage.
 *
 * @property stageName - The stage these operations belong to
 * @property reads - All read operations in execution order
 * @property writes - All write operations in execution order
 */
export interface StageNarrativeData {
    /** The stage these operations belong to */
    stageName: string;
    /** All read operations in execution order */
    reads: NarrativeOperation[];
    /** All write operations in execution order */
    writes: NarrativeOperation[];
}
/**
 * Options for creating a NarrativeRecorder instance.
 *
 * @property id - Optional unique identifier
 * @property detail - Detail level: 'summary' or 'full' (default: 'full')
 * @property maxValueLength - Max characters for value summaries (default: 80)
 */
export interface NarrativeRecorderOptions {
    /** Optional unique identifier */
    id?: string;
    /** Detail level: 'summary' or 'full' (default: 'full') */
    detail?: NarrativeDetail;
    /** Max characters for value summaries (default: 80) */
    maxValueLength?: number;
}
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
export declare class NarrativeRecorder implements Recorder {
    /**
     * Unique identifier for this recorder instance.
     */
    readonly id: string;
    /**
     * Per-stage narrative data, keyed by stage name.
     */
    private stages;
    /**
     * Ordered list of stage names as they were first encountered.
     * WHY: Preserves execution order for toSentences() output.
     */
    private stageOrder;
    /**
     * Detail level for output generation.
     */
    private detail;
    /**
     * Maximum characters for value summaries.
     */
    private maxValueLength;
    /**
     * Creates a new NarrativeRecorder instance.
     *
     * @param options - Optional configuration
     */
    constructor(options?: NarrativeRecorderOptions);
    /**
     * Called when a value is read from scope.
     *
     * WHY: Captures what data each stage consumed. This tells the narrative
     * reader what inputs influenced the stage's behavior.
     *
     * @param event - Details about the read operation
     */
    onRead(event: ReadEvent): void;
    /**
     * Called when a value is written to scope.
     *
     * WHY: Captures what data each stage produced. This tells the narrative
     * reader what outputs the stage generated — the actual values, not just
     * "something was written."
     *
     * @param event - Details about the write operation
     */
    onWrite(event: WriteEvent): void;
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
    getStageData(): Map<string, StageNarrativeData>;
    /**
     * Returns narrative data for a specific stage.
     *
     * @param stageName - The stage to get data for
     * @returns The stage's narrative data, or undefined if no data recorded
     */
    getStageDataFor(stageName: string): StageNarrativeData | undefined;
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
    toSentences(): Map<string, string[]>;
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
    toFlatSentences(): string[];
    /**
     * Clears all recorded data.
     *
     * Use this to reset the recorder for a new execution run.
     */
    clear(): void;
    /**
     * Sets the detail level for output generation.
     *
     * Note: Changing detail only affects future toSentences() calls.
     * Recorded data is always captured at full detail.
     *
     * @param level - The new detail level
     */
    setDetail(level: NarrativeDetail): void;
    /**
     * Returns the current detail level.
     */
    getDetail(): NarrativeDetail;
    /**
     * Gets or creates stage narrative data for the given stage name.
     */
    private getOrCreateStageData;
}
