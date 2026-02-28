"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWithThis = exports.getRecordValueType = exports.unwrap = exports.isZodNode = void 0;
const zod_1 = require("zod");
function isZodNode(x) {
    return !!(x &&
        typeof x === 'object' &&
        (x._def !== undefined ||
            typeof x.parse === 'function' ||
            typeof x.safeParse === 'function'));
}
exports.isZodNode = isZodNode;
/** Peel wrappers; returns the underlying base Zod node (or null). */
function unwrap(schema) {
    var _a;
    let s = schema !== null && schema !== void 0 ? schema : null;
    while (isZodNode(s)) {
        const def = (_a = s._def) !== null && _a !== void 0 ? _a : {};
        if (isZodNode(def.innerType)) {
            s = def.innerType;
            continue;
        } // default/optional/nullable
        if (isZodNode(def.schema)) {
            s = def.schema;
            continue;
        } // effects/branded/catch
        if (isZodNode(def.type)) {
            s = def.type;
            continue;
        } // readonly
        break;
    }
    return isZodNode(s) ? s : null;
}
exports.unwrap = unwrap;
/** Version-tolerant access to ZodRecord value schema. */
function getRecordValueType(rec) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const r = rec;
    const def = (_a = r._def) !== null && _a !== void 0 ? _a : {};
    // Common places across zod v3/v4 and different bundles
    return ((_j = (_g = (_e = (_d = (_c = (_b = r.valueSchema) !== null && _b !== void 0 ? _b : r.valueType) !== null && _c !== void 0 ? _c : def.valueType) !== null && _d !== void 0 ? _d : def.value) !== null && _e !== void 0 ? _e : 
    // occasionally nested under another schema/def node
    (def.schema && ((_f = def.schema.valueType) !== null && _f !== void 0 ? _f : def.schema.value))) !== null && _g !== void 0 ? _g : (def.innerType && ((_h = def.innerType.valueType) !== null && _h !== void 0 ? _h : def.innerType.value))) !== null && _j !== void 0 ? _j : null);
}
exports.getRecordValueType = getRecordValueType;
/** Heuristic: errors that indicate a Zod binding/vendor problem, not user data error. */
function looksLikeBindingError(err) {
    var _a;
    const msg = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : '';
    return msg.includes('_zod') || msg.includes('inst._zod') || msg.includes('Cannot read properties of undefined');
}
/**
 * Parse with maximum tolerance across CJS/ESM and wrapper stacks:
 *  1) schema.safeParse(value)
 *  2) schema.safeParse.call(schema, value)
 *  3) schema.parse(value)
 *  4) wrapper fallback: z.any().pipe(schema).safeParse(value)
 *
 * On invalid data: throws ZodError (never hides validation failures).
 * On binding glitches: falls through to wrapper (never crashes on '_zod').
 */
const WRAPPER_CACHE = new WeakMap();
function parseWithThis(schema, value) {
    var _a;
    const anySchema = schema;
    // 1) direct safeParse
    if (typeof anySchema.safeParse === 'function') {
        try {
            const res = anySchema.safeParse(value);
            if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'success')) {
                if (res.success)
                    return res.data;
                throw res.error; // ZodError on invalid
            }
        }
        catch (err) {
            if (!looksLikeBindingError(err))
                throw err;
        }
    }
    // 2) bound safeParse
    if (typeof anySchema.safeParse === 'function') {
        try {
            const res = anySchema.safeParse.call(schema, value);
            if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'success')) {
                if (res.success)
                    return res.data;
                throw res.error;
            }
        }
        catch (err) {
            if (!looksLikeBindingError(err))
                throw err;
        }
    }
    // 3) parse (throws on invalid)
    if (typeof anySchema.parse === 'function') {
        try {
            return anySchema.parse(value);
        }
        catch (err) {
            if (!looksLikeBindingError(err))
                throw err;
        }
    }
    // 4) wrapper fallback (uses our local z import)
    let wrapper = WRAPPER_CACHE.get(schema);
    if (!wrapper) {
        wrapper = zod_1.z.any().pipe(schema);
        WRAPPER_CACHE.set(schema, wrapper);
    }
    const res = wrapper.safeParse(value);
    if (res && res.success)
        return res.data;
    throw (_a = res === null || res === void 0 ? void 0 : res.error) !== null && _a !== void 0 ? _a : new TypeError('Zod validation binding failed (wrapper fallback).');
}
exports.parseWithThis = parseWithThis;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVIZWxwZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvc2NvcGUvc3RhdGUvem9kL3V0aWxzL3ZhbGlkYXRlSGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUF5RDtBQUV6RCxTQUFnQixTQUFTLENBQUMsQ0FBVTtJQUNsQyxPQUFPLENBQUMsQ0FBQyxDQUNQLENBQUM7UUFDRCxPQUFPLENBQUMsS0FBSyxRQUFRO1FBQ3JCLENBQUUsQ0FBUyxDQUFDLElBQUksS0FBSyxTQUFTO1lBQzVCLE9BQVEsQ0FBUyxDQUFDLEtBQUssS0FBSyxVQUFVO1lBQ3RDLE9BQVEsQ0FBUyxDQUFDLFNBQVMsS0FBSyxVQUFVLENBQUMsQ0FDOUMsQ0FBQztBQUNKLENBQUM7QUFSRCw4QkFRQztBQUVELHFFQUFxRTtBQUNyRSxTQUFnQixNQUFNLENBQUMsTUFBcUM7O0lBQzFELElBQUksQ0FBQyxHQUFZLE1BQU0sYUFBTixNQUFNLGNBQU4sTUFBTSxHQUFJLElBQUksQ0FBQztJQUNoQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3BCLE1BQU0sR0FBRyxHQUFHLE1BQUMsQ0FBUyxDQUFDLElBQUksbUNBQUksRUFBRSxDQUFDO1FBQ2xDLElBQUksU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzdCLENBQUMsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDO1lBQ2xCLFNBQVM7UUFDWCxDQUFDLENBQUMsNEJBQTRCO1FBQzlCLElBQUksU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzFCLENBQUMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO1lBQ2YsU0FBUztRQUNYLENBQUMsQ0FBQyx3QkFBd0I7UUFDMUIsSUFBSSxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDeEIsQ0FBQyxHQUFH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QVMsQ0FBQyxtREFBbUQsQ0FBQyxDQUFDO0FBQ3pGLENBQUM7QUFoREQsc0NBZ0RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdHlwZSBab2RSZWNvcmQsIHR5cGUgWm9kVHlwZUFueSwgeiB9IGZyb20gJ3pvZCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1pvZE5vZGUoeDogdW5rbm93bik6IHggaXMgWm9kVHlwZUFueSB7XG4gIHJldHVybiAhIShcbiAgICB4ICYmXG4gICAgdHlwZW9mIHggPT09ICdvYmplY3QnICYmXG4gICAgKCh4IGFzIGFueSkuX2RlZiAhPT0gdW5kZWZpbmVkIHx8XG4gICAgICB0eXBlb2YgKHggYXMgYW55KS5wYXJzZSA9PT0gJ2Z1bmN0aW9uJyB8fFxuICAgICAgdHlwZW9mICh4IGFzIGFueSkuc2FmZVBhcnNlID09PSAnZnVuY3Rpb24nKVxuICApO1xufVxuXG4vKiogUGVlbCB3cmFwcGVyczsgcmV0dXJucyB0aGUgdW5kZXJseWluZyBiYXNlIFpvZCBub2RlIChvciBudWxsKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bndyYXAoc2NoZW1hOiBab2RUeXBlQW55IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFpvZFR5cGVBbnkgfCBudWxsIHtcbiAgbGV0IHM6IHVua25vd24gPSBzY2hlbWEgPz8gbnVsbDtcbiAgd2hpbGUgKGlzWm9kTm9kZShzKSkge1xuICAgIGNvbnN0IGRlZiA9IChzIGFzIGFueSkuX2RlZiA/PyB7fTtcbiAgICBpZiAoaXNab2ROb2RlKGRlZi5pbm5lclR5cGUpKSB7XG4gICAgICBzID0gZGVmLmlubmVyVHlwZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gLy8gZGVmYXVsdC9vcHRpb25hbC9udWxsYWJsZVxuICAgIGlmIChpc1pvZE5vZGUoZGVmLnNjaGVtYSkpIHtcbiAgICAgIHMgPSBkZWYuc2NoZW1hO1xuICAgICAgY29udGludWU7XG4gICAgfSAvLyBlZmZlY3RzL2JyYW5kZWQvY2F0Y2hcbiAgICBpZiAoaXNab2ROb2RlKGRlZi50eXBlKSkge1xuICAgICAgcyA9IGRlZi50eXBlO1xuICAgICAgY29udGludWU7XG4gICAgfSAvLyByZWFkb25seVxuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiBpc1pvZE5vZGUocykgPyAocyBhcyBab2RUeXBlQW55KSA6IG51bGw7XG59XG5cbi8qKiBWZXJzaW9uLXRvbGVyYW50IGFjY2VzcyB0byBab2RSZWNvcmQgdmFsdWUgc2NoZW1hLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFJlY29yZFZhbHVlVHlwZShyZWM6IFpvZFJlY29yZDxhbnksIGFueT4pOiBab2RUeXBlQW55IHwgbnVsbCB7XG4gIGNvbnN0IHI6IGFueSA9IHJlYyBhcyBhbnk7XG4gIGNvbnN0IGRlZiA9IHIuX2RlZiA/PyB7fTtcblxuICAvLyBDb21tb24gcGxhY2VzIGFjcm9zcyB6b2QgdjMvdjQgYW5kIGRpZmZlcmVudCBidW5kbGVzXG4gIHJldHVybiAoXG4gICAgci52YWx1ZVNjaGVtYSA/PyAvLyBzb21lIEVTTSBidWlsZHNcbiAgICByLnZhbHVlVHlwZSA/PyAvLyBvbGRlciB2MyB0eXBpbmdzXG4gICAgZGVmLnZhbHVlVHlwZSA/PyAvLyB2MyBpbnRlcm5hbCBkZWZcbiAgICBkZWYudmFsdWUgPz8gLy8gc29tZSB2NCBidWlsZHNcbiAgICAvLyBvY2Nhc2lvbmFsbHkgbmVzdGVkIHVuZGVyIGFub3RoZXIgc2NoZW1hL2RlZiBub2RlXG4gICAgKGRlZi5zY2hlbWEgJiYgKGRlZi5zY2hlbWEudmFsdWVUeXBlID8/IGRlZi5zY2hlbWEudmFsdWUpKSA/P1xuICAgIChkZWYuaW5uZXJUeXBlICYmIChkZWYuaW5uZXJUeXBlLnZhbHVlVHlwZSA/PyBkZWYuaW5uZXJUeXBlLnZhbHVlKSkgPz9cbiAgICBudWxsXG4gICk7XG59XG5cbi8qKiBIZXVyaXN0aWM6IGVycm9ycyB0aGF0IGluZGljYXRlIGEgWm9kIGJpbmRpbmcvdmVuZG9yIHByb2JsZW0sIG5vdCB1c2VyIGRhdGEgZXJyb3IuICovXG5mdW5jdGlvbiBsb29rc0xpa2VCaW5kaW5nRXJyb3IoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG4gIGNvbnN0IG1zZyA9IChlcnIgYXMgYW55KT8ubWVzc2FnZSA/PyAnJztcbiAgcmV0dXJuIG1zZy5pbmNsdWRlcygnX3pvZCcpIHx8IG1zZy5pbmNsdWRlcygnaW5zdC5fem9kJykgfHwgbXNnLmluY2x1ZGVzKCdDYW5ub3QgcmVhZCBwcm9wZXJ0aWVzIG9mIHVuZGVmaW5lZCcpO1xufVxuXG4vKipcbiAqIFBhcnNlIHdpdGggbWF4aW11bSB0b2xlcmFuY2UgYWNyb3NzIENKUy9FU00gYW5kIHdyYXBwZXIgc3RhY2tzOlxuICogIDEpIHNjaGVtYS5zYWZlUGFyc2UodmFsdWUpXG4gKiAgMikgc2NoZW1hLnNhZmVQYXJzZS5jYWxsKHNjaGVtYSwgdmFsdWUpXG4gKiAgMykgc2NoZW1hLnBhcnNlKHZhbHVlKVxuICogIDQpIHdyYXBwZXIgZmFsbGJhY2s6IHouYW55KCkucGlwZShzY2hlbWEpLnNhZmVQYXJzZSh2YWx1ZSlcbiAqXG4gKiBPbiBpbnZhbGlkIGRhdGE6IHRocm93cyBab2RFcnJvciAobmV2ZXIgaGlkZXMgdmFsaWRhdGlvbiBmYWlsdXJlcykuXG4gKiBPbiBiaW5kaW5nIGdsaXRjaGVzOiBmYWxscyB0aHJvdWdoIHRvIHdyYXBwZXIgKG5ldmVyIGNyYXNoZXMgb24gJ196b2QnKS5cbiAqL1xuY29uc3QgV1JBUFBFUl9DQUNIRSA9IG5ldyBXZWFrTWFwPFpvZFR5cGVBbnksIFpvZFR5cGVBbnk+KCk7XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VXaXRoVGhpcyhzY2hlbWE6IFpvZFR5cGVBbnksIHZhbHVlOiB1bmtub3duKTogdW5rbm93biB7XG4gIGNvbnN0IGFueVNjaGVtYSA9IHNjaGVtYSBhcyBhbnk7XG5cbiAgLy8gMSkgZGlyZWN0IHNhZmVQYXJzZVxuICBpZiAodHlwZW9mIGFueVNjaGVtYS5zYWZlUGFyc2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzID0gYW55U2NoZW1hLnNhZmVQYXJzZSh2YWx1ZSk7XG4gICAgICBpZiAocmVzICYmIHR5cGVvZiByZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXMsICdzdWNjZXNzJykpIHtcbiAgICAgICAgaWYgKHJlcy5zdWNjZXNzKSByZXR1cm4gcmVzLmRhdGE7XG4gICAgICAgIHRocm93IHJlcy5lcnJvcjsgLy8gWm9kRXJyb3Igb24gaW52YWxpZFxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKCFsb29rc0xpa2VCaW5kaW5nRXJyb3IoZXJyKSkgdGhyb3cgZXJyO1xuICAgIH1cbiAgfVxuXG4gIC8vIDIpIGJvdW5kIHNhZmVQYXJzZVxuICBpZiAodHlwZW9mIGFueVNjaGVtYS5zYWZlUGFyc2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzID0gYW55U2NoZW1hLnNhZmVQYXJzZS5jYWxsKHNjaGVtYSwgdmFsdWUpO1xuICAgICAgaWYgKHJlcyAmJiB0eXBlb2YgcmVzID09PSAnb2JqZWN0JyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzLCAnc3VjY2VzcycpKSB7XG4gICAgICAgIGlmIChyZXMuc3VjY2VzcykgcmV0dXJuIHJlcy5kYXRhO1xuICAgICAgICB0aHJvdyByZXMuZXJyb3I7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoIWxvb2tzTGlrZUJpbmRpbmdFcnJvcihlcnIpKSB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG5cbiAgLy8gMykgcGFyc2UgKHRocm93cyBvbiBpbnZhbGlkKVxuICBpZiAodHlwZW9mIGFueVNjaGVtYS5wYXJzZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYW55U2NoZW1hLnBhcnNlKHZhbHVlKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmICghbG9va3NMaWtlQmluZGluZ0Vycm9yKGVycikpIHRocm93IGVycjtcbiAgICB9XG4gIH1cblxuICAvLyA0KSB3cmFwcGVyIGZhbGxiYWNrICh1c2VzIG91ciBsb2NhbCB6IGltcG9ydClcbiAgbGV0IHdyYXBwZXIgPSBXUkFQUEVSX0NBQ0hFLmdldChzY2hlbWEpO1xuICBpZiAoIXdyYXBwZXIpIHtcbiAgICB3cmFwcGVyID0gKHouYW55KCkgYXMgYW55KS5waXBlKHNjaGVtYSBhcyBhbnkpO1xuICAgIFdSQVBQRVJfQ0FDSEUuc2V0KHNjaGVtYSwgd3JhcHBlciEpO1xuICB9XG4gIGNvbnN0IHJlcyA9ICh3cmFwcGVyIGFzIGFueSkuc2FmZVBhcnNlKHZhbHVlKTtcbiAgaWYgKHJlcyAmJiByZXMuc3VjY2VzcykgcmV0dXJuIHJlcy5kYXRhO1xuXG4gIHRocm93IHJlcz8uZXJyb3IgPz8gbmV3IFR5cGVFcnJvcignWm9kIHZhbGlkYXRpb24gYmluZGluZyBmYWlsZWQgKHdyYXBwZXIgZmFsbGJhY2spLicpO1xufVxuIl19