/**
 * BaseState.ts
 *
 * WHY: Base class that library consumers extend to create custom scope classes.
 * Provides a consistent interface for accessing pipeline context, debug logging,
 * metrics, and state management.
 *
 * RESPONSIBILITIES:
 * - Provide debug/metric/eval logging methods
 * - Provide getValue/setValue/updateValue methods for state access
 * - Provide getInitialValueFor for accessing global context
 * - Provide getReadOnlyValues for accessing read-only context
 *
 * DESIGN DECISIONS:
 * - Uses a runtime brand (Symbol) to detect subclasses reliably
 * - Wraps StageContext to provide a consumer-friendly API
 * - Methods are intentionally simple - complex logic belongs in StageContext
 *
 * RELATED:
 * - {@link StageContext} - The underlying context this class wraps
 * - {@link Scope} - Uses BaseState subclasses for scope creation
 * - {@link guards.ts} - Uses isSubclassOfStateScope to detect BaseState subclasses
 */
import { StageContext } from '../core/memory/StageContext';
/**
 * BaseState
 * ------------------------------------------------------------------
 * Base class that library consumers extend to create custom scope classes.
 *
 * WHY: Provides a consistent interface for accessing pipeline context,
 * debug logging, metrics, and state management. Consumers extend this
 * class to add domain-specific properties and methods.
 *
 * USAGE:
 * ```typescript
 * class MyScope extends BaseState {
 *   get userName(): string {
 *     return this.getValue(['user'], 'name') as string;
 *   }
 *   set userName(value: string) {
 *     this.setObject(['user'], 'name', value);
 *   }
 * }
 * ```
 *
 * DESIGN DECISIONS:
 * - Uses a runtime brand (Symbol) to detect subclasses reliably
 * - Protected members allow subclasses to access context directly
 * - Methods are intentionally simple - complex logic belongs in StageContext
 */
export declare class BaseState {
    static readonly BRAND: unique symbol;
    protected _stageContext: StageContext;
    protected _stageName: string;
    protected readonly _readOnlyValues?: unknown;
    constructor(context: StageContext, stageName: string, readOnlyValues?: unknown);
    addDebugInfo(key: string, value: unknown): void;
    addDebugMessage(value: unknown): void;
    addErrorInfo(key: string, value: unknown): void;
    addMetric(metricName: string, value: unknown): void;
    addEval(metricName: string, value: unknown): void;
    getInitialValueFor(key: string): any;
    getValue(path: string[], key?: string): any;
    setObject(path: string[], key: string, value: unknown, shouldRedact?: boolean, description?: string): any;
    updateObject(path: string[], key: string, value: unknown, description?: string): void;
    setGlobal(key: string, value: unknown, description?: string): any;
    getGlobal(key: string): any;
    setObjectInRoot(key: string, value: unknown): any;
    getReadOnlyValues(): unknown;
    getPipelineId(): any;
}
