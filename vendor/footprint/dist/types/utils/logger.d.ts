/**
 * logger - Simple logging utility for the library
 *
 * WHY: Provides a consistent logging interface that can be easily
 * swapped out or configured in the future.
 *
 * DESIGN: Thin wrapper around console methods. Keeps the library
 * decoupled from specific logging implementations.
 */
export declare const logger: {
    info: (message?: any, ...optionalParams: any[]) => void;
    log: (message?: any, ...optionalParams: any[]) => void;
    debug: (message?: any, ...optionalParams: any[]) => void;
    error: (message?: any, ...optionalParams: any[]) => void;
    warn: (message?: any, ...optionalParams: any[]) => void;
};
