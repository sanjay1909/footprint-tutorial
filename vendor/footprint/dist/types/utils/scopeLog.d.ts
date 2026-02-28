/**
 * scopeLog - Logging utilities for pipeline execution
 *
 * WHY: Provides structured logging for pipeline stages with consistent formatting.
 * Logs include pipeline ID, stage name, path, and key-value pairs.
 *
 * DESIGN: Wraps the logger with stage-aware context and also records to
 * the stage's debug metadata for later inspection.
 */
import { StageContext } from '../core/memory/StageContext';
export declare const treeConsole: {
    log: (localScope: StageContext, stageName: string, path: string[], key: string, value: unknown, reset?: boolean) => void;
    error: (localScope: StageContext, stageName: string, path: string[], key: string, value: unknown, reset?: boolean) => void;
    metric: (localScope: StageContext, stageName: string, path: string[], key: string, value: unknown, reset?: boolean) => void;
    eval: (localScope: StageContext, stageName: string, path: string[], key: string, value: unknown, reset?: boolean) => void;
};
