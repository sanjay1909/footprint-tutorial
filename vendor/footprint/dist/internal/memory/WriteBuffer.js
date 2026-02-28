"use strict";
/**
 * WriteBuffer - Transactional write buffer for stage mutations
 *
 * WHY: Stages need atomic commit semantics - all mutations succeed or none do.
 * This buffer collects writes during execution and commits them atomically.
 *
 * DESIGN: Similar to a database transaction buffer or compiler IR:
 * - Changes are staged here before being committed to GlobalStore
 * - Enables read-after-write consistency within a stage
 * - Records operation trace for time-travel debugging
 *
 * RESPONSIBILITIES:
 * - Collect overwrite patches (set operations)
 * - Collect update patches (merge operations)
 * - Track operation order for deterministic replay
 * - Provide atomic commit with all patches and trace
 *
 * RELATED:
 * - {@link GlobalStore} - Receives committed patches
 * - {@link StageContext} - Uses WriteBuffer for stage-scoped mutations
 *
 * @example
 * ```typescript
 * const buffer = new WriteBuffer(baseState);
 * buffer.set(['user', 'name'], 'Alice');
 * buffer.merge(['user', 'tags'], ['admin']);
 * const { overwrite, updates, trace } = buffer.commit();
 * ```
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatchedMemoryContext = exports.applySmartMerge = exports.WriteBuffer = exports.DELIM = void 0;
const lodash_clonedeep_1 = __importDefault(require("lodash.clonedeep"));
const lodash_get_1 = __importDefault(require("lodash.get"));
const lodash_set_1 = __importDefault(require("lodash.set"));
/**
 * Delimiter for path serialization.
 * WHY: ASCII Unit-Separator (U+001F) cannot appear in JS identifiers
 * and renders invisibly in logs, making it ideal for path joining.
 */
exports.DELIM = '\u001F';
/**
 * Normalizes an array path into a stable string key.
 * WHY: Enables efficient path comparison and deduplication in Sets.
 */
const norm = (path) => path.map(String).join(exports.DELIM);
class WriteBuffer {
    constructor(base) {
        // Patch buckets - separate tracking for overwrites vs merges
        this.overwritePatch = {};
        this.updatePatch = {};
        // Operation trace - chronological log for deterministic replay
        this.opTrace = [];
        // Redacted paths - for sensitive data that shouldn't appear in logs
        this.redactedPaths = new Set();
        // DESIGN: Deep clone to ensure isolation from external mutations
        this.baseSnapshot = (0, lodash_clonedeep_1.default)(base);
        this.workingCopy = (0, lodash_clonedeep_1.default)(base);
    }
    /**
     * Hard overwrite at the specified path.
     * WHY: Some operations need to completely replace a value, not merge.
     *
     * @param path - Array path to the target location
     * @param value - Value to set (will be deep cloned)
     * @param shouldRedact - If true, path won't appear in debug logs
     */
    set(path, value, shouldRedact = false) {
        (0, lodash_set_1.default)(this.workingCopy, path, value);
        (0, lodash_set_1.default)(this.overwritePatch, path, (0, lodash_clonedeep_1.default)(value));
        if (shouldRedact) {
            this.redactedPaths.add(norm(path));
        }
        this.opTrace.push({ path: norm(path), verb: 'set' });
    }
    /**
     * Deep union merge at the specified path.
     * WHY: Enables additive updates without losing existing data.
     * Arrays are unioned, objects are recursively merged.
     *
     * @param path - Array path to the target location
     * @param value - Value to merge (will be deep merged with existing)
     * @param shouldRedact - If true, path won't appear in debug logs
     */
    merge(path, value, shouldRedact = false) {
        var _a, _b;
        const existing = (_a = (0, lodash_get_1.default)(this.workingCopy, path)) !== null && _a !== void 0 ? _a : {};
        const merged = deepSmartMerge(existing, value);
        (0, lodash_set_1.default)(this.workingCopy, path, merged);
        (0, lodash_set_1.default)(this.updatePatch, path, deepSmartMerge((_b = (0, lodash_get_1.default)(this.updatePatch, path)) !== null && _b !== void 0 ? _b : {}, value));
        if (shouldRedact) {
            this.redactedPaths.add(norm(path));
        }
        this.opTrace.push({ path: norm(path), verb: 'merge' });
    }
    /**
     * Read current value at path (includes uncommitted changes).
     * WHY: Enables read-after-write consistency within a stage.
     */
    get(path, defaultValue) {
        return (0, lodash_get_1.default)(this.workingCopy, path, defaultValue);
    }
    /**
     * Flush all staged mutations and return the commit bundle.
     * WHY: Atomic commit ensures all-or-nothing semantics.
     *
     * @returns Commit bundle with patches, redacted paths, and operation trace
     */
    commit() {
        const payload = {
            overwrite: (0, lodash_clonedeep_1.default)(this.overwritePatch),
            updates: (0, lodash_clonedeep_1.default)(this.updatePatch),
            redactedPaths: new Set(this.redactedPaths),
            trace: [...this.opTrace],
        };
        // Reset for next stage - defensive programming
        this.overwritePatch = {};
        this.updatePatch = {};
        this.opTrace.length = 0;
        this.redactedPaths.clear();
        this.workingCopy = (0, lodash_clonedeep_1.default)(this.baseSnapshot);
        return payload;
    }
}
exports.WriteBuffer = WriteBuffer;
exports.PatchedMemoryContext = WriteBuffer;
/**
 * Deep union merge helper.
 * WHY: Standard Object.assign doesn't handle nested objects or arrays correctly.
 *
 * DESIGN DECISIONS:
 * - Arrays: Union without duplicates (encounter order preserved)
 * - Objects: Recursive merge
 * - Primitives: Source wins
 */
function deepSmartMerge(dst, src) {
    if (src === null || typeof src !== 'object')
        return src;
    // Array vs array -> union (preserves encounter order)
    if (Array.isArray(src) && Array.isArray(dst)) {
        return [...new Set([...dst, ...src])];
    }
    // Array vs Object -> source wins (replace)
    if (Array.isArray(src)) {
        return [...src];
    }
    // Object merge - recurse into nested properties
    const out = { ...(dst && typeof dst === 'object' ? dst : {}) };
    for (const k of Object.keys(src)) {
        out[k] = deepSmartMerge(out[k], src[k]);
    }
    return out;
}
/**
 * Applies a commit bundle to a base state by replaying operations in order.
 * WHY: Deterministic replay ensures consistent state reconstruction.
 *
 * DESIGN: Two-phase application:
 * 1. UPDATE phase: Union-merge via deepSmartMerge
 * 2. OVERWRITE phase: Direct set for final values
 *
 * This guarantees "last writer wins" semantics.
 */
function applySmartMerge(base, updates, overwrite, trace) {
    var _a;
    const out = (0, lodash_clonedeep_1.default)(base);
    for (const { path, verb } of trace) {
        const segs = path.split(exports.DELIM);
        if (verb === 'set') {
            const val = (0, lodash_get_1.default)(overwrite, segs);
            (0, lodash_set_1.default)(out, segs, (0, lodash_clonedeep_1.default)(val));
        }
        else {
            // merge
            const current = (_a = (0, lodash_get_1.default)(out, segs)) !== null && _a !== void 0 ? _a : {};
            const merged = deepSmartMerge(current, (0, lodash_get_1.default)(updates, segs));
            (0, lodash_set_1.default)(out, segs, merged);
        }
    }
    return out;
}
exports.applySmartMerge = applySmartMerge;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV3JpdGVCdWZmZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW50ZXJuYWwvbWVtb3J5L1dyaXRlQnVmZmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRCRzs7Ozs7O0FBRUgsd0VBQTBDO0FBQzFDLDREQUE4QjtBQUM5Qiw0REFBOEI7QUFNOUI7Ozs7R0FJRztBQUNVLFFBQUEsS0FBSyxHQUFHLFFBQVEsQ0FBQztBQUU5Qjs7O0dBR0c7QUFDSCxNQUFNLElBQUksR0FBRyxDQUFDLElBQXlCLEVBQVUsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQUssQ0FBQyxDQUFDO0FBRWpGLE1BQWEsV0FBVztJQWN0QixZQUFZLElBQVM7UUFWckIsNkRBQTZEO1FBQ3JELG1CQUFjLEdBQWdCLEVBQUUsQ0FBQztRQUNqQyxnQkFBVyxHQUFnQixFQUFFLENBQUM7UUFFdEMsK0RBQStEO1FBQ3ZELFlBQU8sR0FBOEMsRUFBRSxDQUFDO1FBRWhFLG9FQUFvRTtRQUM1RCxrQkFBYSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFHeEMsaUVBQWlFO1FBQ2pFLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBQSwwQkFBVSxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBQSwwQkFBVSxFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0gsR0FBRyxDQUFDLElBQXlCLEVBQUUsS0FBVSxFQUFFLFlBQVksR0FBRyxLQUFLO1FBQzdELElBQUEsb0JBQUksRUFBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQyxJQUFBLG9CQUFJLEVBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLEVBQUUsSUFBQSww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QyxJQUFBLG9CQUFJLEVBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFBLDBCQUFVLEVBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNuQyxDQUFDO2FBQU0sQ0FBQztZQUNOLFFBQVE7WUFDUixNQUFNLE9BQU8sR0FBRyxNQUFBLElBQUEsb0JBQUksRUFBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLG1DQUFJLEVBQUUsQ0FBQztZQUN0QyxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsT0FBTyxFQUFFLElBQUEsb0JBQUksRUFBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM1RCxJQUFBLG9CQUFJLEVBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxQixDQUFDO0lBQ0gsQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQztBQXBCRCwwQ0FvQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFdyaXRlQnVmZmVyIC0gVHJhbnNhY3Rpb25hbCB3cml0ZSBidWZmZXIgZm9yIHN0YWdlIG11dGF0aW9uc1xuICogXG4gKiBXSFk6IFN0YWdlcyBuZWVkIGF0b21pYyBjb21taXQgc2VtYW50aWNzIC0gYWxsIG11dGF0aW9ucyBzdWNjZWVkIG9yIG5vbmUgZG8uXG4gKiBUaGlzIGJ1ZmZlciBjb2xsZWN0cyB3cml0ZXMgZHVyaW5nIGV4ZWN1dGlvbiBhbmQgY29tbWl0cyB0aGVtIGF0b21pY2FsbHkuXG4gKiBcbiAqIERFU0lHTjogU2ltaWxhciB0byBhIGRhdGFiYXNlIHRyYW5zYWN0aW9uIGJ1ZmZlciBvciBjb21waWxlciBJUjpcbiAqIC0gQ2hhbmdlcyBhcmUgc3RhZ2VkIGhlcmUgYmVmb3JlIGJlaW5nIGNvbW1pdHRlZCB0byBHbG9iYWxTdG9yZVxuICogLSBFbmFibGVzIHJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3kgd2l0aGluIGEgc3RhZ2VcbiAqIC0gUmVjb3JkcyBvcGVyYXRpb24gdHJhY2UgZm9yIHRpbWUtdHJhdmVsIGRlYnVnZ2luZ1xuICogXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBDb2xsZWN0IG92ZXJ3cml0ZSBwYXRjaGVzIChzZXQgb3BlcmF0aW9ucylcbiAqIC0gQ29sbGVjdCB1cGRhdGUgcGF0Y2hlcyAobWVyZ2Ugb3BlcmF0aW9ucylcbiAqIC0gVHJhY2sgb3BlcmF0aW9uIG9yZGVyIGZvciBkZXRlcm1pbmlzdGljIHJlcGxheVxuICogLSBQcm92aWRlIGF0b21pYyBjb21taXQgd2l0aCBhbGwgcGF0Y2hlcyBhbmQgdHJhY2VcbiAqIFxuICogUkVMQVRFRDpcbiAqIC0ge0BsaW5rIEdsb2JhbFN0b3JlfSAtIFJlY2VpdmVzIGNvbW1pdHRlZCBwYXRjaGVzXG4gKiAtIHtAbGluayBTdGFnZUNvbnRleHR9IC0gVXNlcyBXcml0ZUJ1ZmZlciBmb3Igc3RhZ2Utc2NvcGVkIG11dGF0aW9uc1xuICogXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3QgYnVmZmVyID0gbmV3IFdyaXRlQnVmZmVyKGJhc2VTdGF0ZSk7XG4gKiBidWZmZXIuc2V0KFsndXNlcicsICduYW1lJ10sICdBbGljZScpO1xuICogYnVmZmVyLm1lcmdlKFsndXNlcicsICd0YWdzJ10sIFsnYWRtaW4nXSk7XG4gKiBjb25zdCB7IG92ZXJ3cml0ZSwgdXBkYXRlcywgdHJhY2UgfSA9IGJ1ZmZlci5jb21taXQoKTtcbiAqIGBgYFxuICovXG5cbmltcG9ydCBfY2xvbmVEZWVwIGZyb20gJ2xvZGFzaC5jbG9uZWRlZXAnO1xuaW1wb3J0IF9nZXQgZnJvbSAnbG9kYXNoLmdldCc7XG5pbXBvcnQgX3NldCBmcm9tICdsb2Rhc2guc2V0JztcblxuZXhwb3J0IGludGVyZmFjZSBNZW1vcnlQYXRjaCB7XG4gIFtrZXk6IHN0cmluZ106IGFueTtcbn1cblxuLyoqXG4gKiBEZWxpbWl0ZXIgZm9yIHBhdGggc2VyaWFsaXphdGlvbi5cbiAqIFdIWTogQVNDSUkgVW5pdC1TZXBhcmF0b3IgKFUrMDAxRikgY2Fubm90IGFwcGVhciBpbiBKUyBpZGVudGlmaWVyc1xuICogYW5kIHJlbmRlcnMgaW52aXNpYmx5IGluIGxvZ3MsIG1ha2luZyBpdCBpZGVhbCBmb3IgcGF0aCBqb2luaW5nLlxuICovXG5leHBvcnQgY29uc3QgREVMSU0gPSAnXFx1MDAxRic7XG5cbi8qKlxuICogTm9ybWFsaXplcyBhbiBhcnJheSBwYXRoIGludG8gYSBzdGFibGUgc3RyaW5nIGtleS5cbiAqIFdIWTogRW5hYmxlcyBlZmZpY2llbnQgcGF0aCBjb21wYXJpc29uIGFuZCBkZWR1cGxpY2F0aW9uIGluIFNldHMuXG4gKi9cbmNvbnN0IG5vcm0gPSAocGF0aDogKHN0cmluZyB8IG51bWJlcilbXSk6IHN0cmluZyA9PiBwYXRoLm1hcChTdHJpbmcpLmpvaW4oREVMSU0pO1xuXG5leHBvcnQgY2xhc3MgV3JpdGVCdWZmZXIge1xuICBwcml2YXRlIHJlYWRvbmx5IGJhc2VTbmFwc2hvdDogYW55O1xuICBwcml2YXRlIHdvcmtpbmdDb3B5OiBhbnk7XG5cbiAgLy8gUGF0Y2ggYnVja2V0cyAtIHNlcGFyYXRlIHRyYWNraW5nIGZvciBvdmVyd3JpdGVzIHZzIG1lcmdlc1xuICBwcml2YXRlIG92ZXJ3cml0ZVBhdGNoOiBNZW1vcnlQYXRjaCA9IHt9O1xuICBwcml2YXRlIHVwZGF0ZVBhdGNoOiBNZW1vcnlQYXRjaCA9IHt9O1xuXG4gIC8vIE9wZXJhdGlvbiB0cmFjZSAtIGNocm9ub2xvZ2ljYWwgbG9nIGZvciBkZXRlcm1pbmlzdGljIHJlcGxheVxuICBwcml2YXRlIG9wVHJhY2U6IHsgcGF0aDogc3RyaW5nOyB2ZXJiOiAnc2V0JyB8ICdtZXJnZScgfVtdID0gW107XG5cbiAgLy8gUmVkYWN0ZWQgcGF0aHMgLSBmb3Igc2Vuc2l0aXZlIGRhdGEgdGhhdCBzaG91bGRuJ3QgYXBwZWFyIGluIGxvZ3NcbiAgcHJpdmF0ZSByZWRhY3RlZFBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgY29uc3RydWN0b3IoYmFzZTogYW55KSB7XG4gICAgLy8gREVTSUdOOiBEZWVwIGNsb25lIHRvIGVuc3VyZSBpc29sYXRpb24gZnJvbSBleHRlcm5hbCBtdXRhdGlvbnNcbiAgICB0aGlzLmJhc2VTbmFwc2hvdCA9IF9jbG9uZURlZXAoYmFzZSk7XG4gICAgdGhpcy53b3JraW5nQ29weSA9IF9jbG9uZURlZXAoYmFzZSk7XG4gIH1cblxuICAvKipcbiAgICogSGFyZCBvdmVyd3JpdGUgYXQgdGhlIHNwZWNpZmllZCBwYXRoLlxuICAgKiBXSFk6IFNvbWUgb3BlcmF0aW9ucyBuZWVkIHRvIGNvbXBsZXRlbHkgcmVwbGFjZSBhIHZhbHVlLCBub3QgbWVyZ2UuXG4gICAqIFxuICAgKiBAcGFyYW0gcGF0aCAtIEFycmF5IHBhdGggdG8gdGhlIHRhcmdldCBsb2NhdGlvblxuICAgKiBAcGFyYW0gdmFsdWUgLSBWYWx1ZSB0byBzZXQgKHdpbGwgYmUgZGVlcCBjbG9uZWQpXG4gICAqIEBwYXJhbSBzaG91bGRSZWRhY3QgLSBJZiB0cnVlLCBwYXRoIHdvbid0IGFwcGVhciBpbiBkZWJ1ZyBsb2dzXG4gICAqL1xuICBzZXQocGF0aDogKHN0cmluZyB8IG51bWJlcilbXSwgdmFsdWU6IGFueSwgc2hvdWxkUmVkYWN0ID0gZmFsc2UpOiB2b2lkIHtcbiAgICBfc2V0KHRoaXMud29ya2luZ0NvcHksIHBhdGgsIHZhbHVlKTtcbiAgICBfc2V0KHRoaXMub3ZlcndyaXRlUGF0Y2gsIHBhdGgsIF9jbG9uZURlZXAodmFsdWUpKTtcbiAgICBpZiAoc2hvdWxkUmVkYWN0KSB7XG4gICAgICB0aGlzLnJlZGFjdGVkUGF0aHMuYWRkKG5vcm0ocGF0aCkpO1xuICAgIH1cbiAgICB0aGlzLm9wVHJhY2UucHVzaCh7IHBhdGg6IG5vcm0ocGF0aCksIHZlcmI6ICdzZXQnIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIERlZXAgdW5pb24gbWVyZ2UgYXQgdGhlIHNwZWNpZmllZCBwYXRoLlxuICAgKiBXSFk6IEVuYWJsZXMgYWRkaXRpdmUgdXBkYXRlcyB3aXRob3V0IGxvc2luZyBleGlzdGluZyBkYXRhLlxuICAgKiBBcnJheXMgYXJlIHVuaW9uZWQsIG9iamVjdHMgYXJlIHJlY3Vyc2l2ZWx5IG1lcmdlZC5cbiAgICogXG4gICAqIEBwYXJhbSBwYXRoIC0gQXJyYXkgcGF0aCB0byB0aGUgdGFyZ2V0IGxvY2F0aW9uXG4gICAqIEBwYXJhbSB2YWx1ZSAtIFZhbHVlIHRvIG1lcmdlICh3aWxsIGJlIGRlZXAgbWVyZ2VkIHdpdGggZXhpc3RpbmcpXG4gICAqIEBwYXJhbSBzaG91bGRSZWRhY3QgLSBJZiB0cnVlLCBwYXRoIHdvbid0IGFwcGVhciBpbiBkZWJ1ZyBsb2dzXG4gICAqL1xuICBtZXJnZShwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdLCB2YWx1ZTogYW55LCBzaG91bGRSZWRhY3QgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gX2dldCh0aGlzLndvcmtpbmdDb3B5LCBwYXRoKSA/PyB7fTtcbiAgICBjb25zdCBtZXJnZWQgPSBkZWVwU21hcnRNZXJnZShleGlzdGluZywgdmFsdWUpO1xuICAgIF9zZXQodGhpcy53b3JraW5nQ29weSwgcGF0aCwgbWVyZ2VkKTtcbiAgICBfc2V0KHRoaXMudXBkYXRlUGF0Y2gsIHBhdGgsIGRlZXBTbWFydE1lcmdlKF9nZXQodGhpcy51cGRhdGVQYXRjaCwgcGF0aCkgPz8ge30sIHZhbHVlKSk7XG4gICAgaWYgKHNob3VsZFJlZGFjdCkge1xuICAgICAgdGhpcy5yZWRhY3RlZFBhdGhzLmFkZChub3JtKHBhdGgpKTtcbiAgICB9XG4gICAgdGhpcy5vcFRyYWNlLnB1c2goeyBwYXRoOiBub3JtKHBhdGgpLCB2ZXJiOiAnbWVyZ2UnIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlYWQgY3VycmVudCB2YWx1ZSBhdCBwYXRoIChpbmNsdWRlcyB1bmNvbW1pdHRlZCBjaGFuZ2VzKS5cbiAgICogV0hZOiBFbmFibGVzIHJlYWQtYWZ0ZXItd3JpdGUgY29uc2lzdGVuY3kgd2l0aGluIGEgc3RhZ2UuXG4gICAqL1xuICBnZXQocGF0aDogKHN0cmluZyB8IG51bWJlcilbXSwgZGVmYXVsdFZhbHVlPzogYW55KSB7XG4gICAgcmV0dXJuIF9nZXQodGhpcy53b3JraW5nQ29weSwgcGF0aCwgZGVmYXVsdFZhbHVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGbHVzaCBhbGwgc3RhZ2VkIG11dGF0aW9ucyBhbmQgcmV0dXJuIHRoZSBjb21taXQgYnVuZGxlLlxuICAgKiBXSFk6IEF0b21pYyBjb21taXQgZW5zdXJlcyBhbGwtb3Itbm90aGluZyBzZW1hbnRpY3MuXG4gICAqIFxuICAgKiBAcmV0dXJucyBDb21taXQgYnVuZGxlIHdpdGggcGF0Y2hlcywgcmVkYWN0ZWQgcGF0aHMsIGFuZCBvcGVyYXRpb24gdHJhY2VcbiAgICovXG4gIGNvbW1pdCgpOiB7XG4gICAgb3ZlcndyaXRlOiBNZW1vcnlQYXRjaDtcbiAgICB1cGRhdGVzOiBNZW1vcnlQYXRjaDtcbiAgICByZWRhY3RlZFBhdGhzOiBTZXQ8c3RyaW5nPjtcbiAgICB0cmFjZTogeyBwYXRoOiBzdHJpbmc7IHZlcmI6ICdzZXQnIHwgJ21lcmdlJyB9W107XG4gIH0ge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBvdmVyd3JpdGU6IF9jbG9uZURlZXAodGhpcy5vdmVyd3JpdGVQYXRjaCksXG4gICAgICB1cGRhdGVzOiBfY2xvbmVEZWVwKHRoaXMudXBkYXRlUGF0Y2gpLFxuICAgICAgcmVkYWN0ZWRQYXRoczogbmV3IFNldCh0aGlzLnJlZGFjdGVkUGF0aHMpLFxuICAgICAgdHJhY2U6IFsuLi50aGlzLm9wVHJhY2VdLFxuICAgIH07XG5cbiAgICAvLyBSZXNldCBmb3IgbmV4dCBzdGFnZSAtIGRlZmVuc2l2ZSBwcm9ncmFtbWluZ1xuICAgIHRoaXMub3ZlcndyaXRlUGF0Y2ggPSB7fTtcbiAgICB0aGlzLnVwZGF0ZVBhdGNoID0ge307XG4gICAgdGhpcy5vcFRyYWNlLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5yZWRhY3RlZFBhdGhzLmNsZWFyKCk7XG4gICAgdGhpcy53b3JraW5nQ29weSA9IF9jbG9uZURlZXAodGhpcy5iYXNlU25hcHNob3QpO1xuXG4gICAgcmV0dXJuIHBheWxvYWQ7XG4gIH1cbn1cblxuLyoqXG4gKiBEZWVwIHVuaW9uIG1lcmdlIGhlbHBlci5cbiAqIFdIWTogU3RhbmRhcmQgT2JqZWN0LmFzc2lnbiBkb2Vzbid0IGhhbmRsZSBuZXN0ZWQgb2JqZWN0cyBvciBhcnJheXMgY29ycmVjdGx5LlxuICogXG4gKiBERVNJR04gREVDSVNJT05TOlxuICogLSBBcnJheXM6IFVuaW9uIHdpdGhvdXQgZHVwbGljYXRlcyAoZW5jb3VudGVyIG9yZGVyIHByZXNlcnZlZClcbiAqIC0gT2JqZWN0czogUmVjdXJzaXZlIG1lcmdlXG4gKiAtIFByaW1pdGl2ZXM6IFNvdXJjZSB3aW5zXG4gKi9cbmZ1bmN0aW9uIGRlZXBTbWFydE1lcmdlKGRzdDogYW55LCBzcmM6IGFueSk6IGFueSB7XG4gIGlmIChzcmMgPT09IG51bGwgfHwgdHlwZW9mIHNyYyAhPT0gJ29iamVjdCcpIHJldHVybiBzcmM7XG5cbiAgLy8gQXJyYXkgdnMgYXJyYXkgLT4gdW5pb24gKHByZXNlcnZlcyBlbmNvdW50ZXIgb3JkZXIpXG4gIGlmIChBcnJheS5pc0FycmF5KHNyYykgJiYgQXJyYXkuaXNBcnJheShkc3QpKSB7XG4gICAgcmV0dXJuIFsuLi5uZXcgU2V0KFsuLi5kc3QsIC4uLnNyY10pXTtcbiAgfVxuXG4gIC8vIEFycmF5IHZzIE9iamVjdCAtPiBzb3VyY2Ugd2lucyAocmVwbGFjZSlcbiAgaWYgKEFycmF5LmlzQXJyYXkoc3JjKSkge1xuICAgIHJldHVybiBbLi4uc3JjXTtcbiAgfVxuXG4gIC8vIE9iamVjdCBtZXJnZSAtIHJlY3Vyc2UgaW50byBuZXN0ZWQgcHJvcGVydGllc1xuICBjb25zdCBvdXQ6IGFueSA9IHsgLi4uKGRzdCAmJiB0eXBlb2YgZHN0ID09PSAnb2JqZWN0JyA/IGRzdCA6IHt9KSB9O1xuICBmb3IgKGNvbnN0IGsgb2YgT2JqZWN0LmtleXMoc3JjKSkge1xuICAgIG91dFtrXSA9IGRlZXBTbWFydE1lcmdlKG91dFtrXSwgc3JjW2tdKTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG4vKipcbiAqIEFwcGxpZXMgYSBjb21taXQgYnVuZGxlIHRvIGEgYmFzZSBzdGF0ZSBieSByZXBsYXlpbmcgb3BlcmF0aW9ucyBpbiBvcmRlci5cbiAqIFdIWTogRGV0ZXJtaW5pc3RpYyByZXBsYXkgZW5zdXJlcyBjb25zaXN0ZW50IHN0YXRlIHJlY29uc3RydWN0aW9uLlxuICogXG4gKiBERVNJR046IFR3by1waGFzZSBhcHBsaWNhdGlvbjpcbiAqIDEuIFVQREFURSBwaGFzZTogVW5pb24tbWVyZ2UgdmlhIGRlZXBTbWFydE1lcmdlXG4gKiAyLiBPVkVSV1JJVEUgcGhhc2U6IERpcmVjdCBzZXQgZm9yIGZpbmFsIHZhbHVlc1xuICogXG4gKiBUaGlzIGd1YXJhbnRlZXMgXCJsYXN0IHdyaXRlciB3aW5zXCIgc2VtYW50aWNzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlTbWFydE1lcmdlKFxuICBiYXNlOiBhbnksXG4gIHVwZGF0ZXM6IE1lbW9yeVBhdGNoLFxuICBvdmVyd3JpdGU6IE1lbW9yeVBhdGNoLFxuICB0cmFjZTogeyBwYXRoOiBzdHJpbmc7IHZlcmI6ICdzZXQnIHwgJ21lcmdlJyB9W10sXG4pOiBhbnkge1xuICBjb25zdCBvdXQgPSBfY2xvbmVEZWVwKGJhc2UpO1xuICBmb3IgKGNvbnN0IHsgcGF0aCwgdmVyYiB9IG9mIHRyYWNlKSB7XG4gICAgY29uc3Qgc2VncyA9IHBhdGguc3BsaXQoREVMSU0pO1xuICAgIGlmICh2ZXJiID09PSAnc2V0Jykge1xuICAgICAgY29uc3QgdmFsID0gX2dldChvdmVyd3JpdGUsIHNlZ3MpO1xuICAgICAgX3NldChvdXQsIHNlZ3MsIF9jbG9uZURlZXAodmFsKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIG1lcmdlXG4gICAgICBjb25zdCBjdXJyZW50ID0gX2dldChvdXQsIHNlZ3MpID8/IHt9O1xuICAgICAgY29uc3QgbWVyZ2VkID0gZGVlcFNtYXJ0TWVyZ2UoY3VycmVudCwgX2dldCh1cGRhdGVzLCBzZWdzKSk7XG4gICAgICBfc2V0KG91dCwgc2VncywgbWVyZ2VkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLy8gTGVnYWN5IGFsaWFzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGR1cmluZyBtaWdyYXRpb25cbmV4cG9ydCB7IFdyaXRlQnVmZmVyIGFzIFBhdGNoZWRNZW1vcnlDb250ZXh0IH07XG4iXX0=