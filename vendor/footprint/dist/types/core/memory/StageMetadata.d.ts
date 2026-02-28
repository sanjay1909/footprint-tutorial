/**
 * StageMetadata - Per-stage metadata collector for logs, errors, metrics, and evals
 * ----------------------------------------------------------------------------
 *  Collects non-execution metadata during a stage's run. This data is used for:
 *    - Debugging and troubleshooting (logs, errors)
 *    - Performance monitoring (metrics)
 *    - Quality evaluation (evals)
 *    - Flow control narrative (flowMessages)
 *
 *  This is separate from the main execution state (GlobalStore) because metadata
 *  is observational - it doesn't affect pipeline logic, just provides visibility.
 *
 *  Think of it like a compiler's diagnostic collector - it gathers warnings,
 *  errors, and timing info without affecting the compilation output.
 */
import type { FlowMessage } from '../executor/types';
/**
 * StageMetadata - Collects observational data during stage execution
 *
 * Five categories of metadata:
 *   - logContext: Debug logs and trace information
 *   - errorContext: Error details and stack traces
 *   - metricContext: Performance metrics and timings
 *   - evalContext: Quality evaluation data
 *   - flowMessages: Flow control narrative entries
 *
 * _Requirements: flow-control-narrative REQ-5_
 */
export declare class StageMetadata {
    logContext: {
        [key: string]: any;
    };
    errorContext: {
        [key: string]: any;
    };
    metricContext: {
        [key: string]: any;
    };
    evalContext: {
        [key: string]: any;
    };
    flowMessages: FlowMessage[];
    /**
     * addLog() - Append a log entry (merge semantics)
     */
    addLog(key: string, value: any, path?: string[]): void;
    /**
     * setLog() - Set a log entry (overwrite semantics)
     */
    setLog(key: string, value: any, path?: string[]): void;
    /**
     * addError() - Record an error entry
     */
    addError(key: string, value: any, path?: string[]): void;
    /**
     * addMetric() - Append a metric entry (merge semantics)
     */
    addMetric(key: string, value: any, path?: string[]): void;
    /**
     * setMetric() - Set a metric entry (overwrite semantics)
     */
    setMetric(key: string, value: any, path?: string[]): void;
    /**
     * addEval() - Append an evaluation entry (merge semantics)
     */
    addEval(key: string, value: any, path?: string[]): void;
    /**
     * setEval() - Set an evaluation entry (overwrite semantics)
     */
    setEval(key: string, value: any, path?: string[]): void;
    /**
     * addFlowMessage() - Add a flow control narrative entry
     *
     * Flow messages capture control flow decisions made by the execution engine.
     * They form the "headings" in the narrative story, complementing the
     * stage-level "bullet points" in logContext.
     *
     * _Requirements: flow-control-narrative REQ-5_
     */
    addFlowMessage(flowMessage: FlowMessage): void;
}
export { StageMetadata as DebugContext };
