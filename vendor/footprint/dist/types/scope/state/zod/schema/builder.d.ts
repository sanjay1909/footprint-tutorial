import { z } from 'zod';
/** Unique brand so only our builder can mint valid scope schemas */
export declare const SCOPE_SCHEMA_BRAND: unique symbol;
export type ScopeSchema<T extends z.ZodRawShape = any> = z.ZodObject<T> & {
    [SCOPE_SCHEMA_BRAND]: true;
};
/** Consumers define their scope shape here (object only). */
export declare function defineScopeSchema<Ext extends z.ZodRawShape>(ext: Ext): ScopeSchema<Ext>;
/** Runtime guard */
export declare function isScopeSchema(x: unknown): x is ScopeSchema;
