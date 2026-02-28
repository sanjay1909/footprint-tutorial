import { z } from 'zod';
import type { ScopeFactory, StrictMode } from '../../providers/types';
export type DefineScopeOptions = {
    /** Zod validation mode for writes; default "warn" */
    strict?: StrictMode;
};
/**
 * Build a ScopeFactory from a Zod object schema.
 * - Creates a lazy, copy-on-write proxy driven by the schema
 * - Attaches BaseState-compatible helpers (addDebugInfo, getValue, setObject, etc.)
 * - Honors strictness for validation on writes
 */
export declare function defineScopeFromZod<S extends z.ZodObject<any>>(schema: S, opts?: DefineScopeOptions): ScopeFactory<any>;
