"use strict";
/**
 * ExecutionHistory - Time-travel snapshot storage for pipeline execution
 *
 * WHY: Enables debugging and visualization of pipeline execution by storing
 * the commit bundles from each stage in chronological order.
 *
 * DESIGN: Like git history for pipeline execution:
 * - Each commit bundle is a "commit" that can be replayed
 * - No full snapshots stored - just data-diff bundles
 * - Memory footprint stays < 100KB for typical pipelines
 * - materialise() reconstructs state at any point by replaying commits
 *
 * RESPONSIBILITIES:
 * - Store commit bundles in chronological order
 * - Reconstruct state at any point via replay
 * - Provide audit trail for pipeline runs
 *
 * RELATED:
 * - {@link WriteBuffer} - Produces commit bundles
 * - {@link GlobalStore} - Uses history for time-travel
 *
 * @example
 * ```typescript
 * const history = new ExecutionHistory(initialState);
 * history.record({ stage: 'validate', trace: [...], overwrite: {...}, updates: {...} });
 * const stateAtStep1 = history.materialise(1);
 * ```
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryHistory = exports.ExecutionHistory = void 0;
const lodash_clonedeep_1 = __importDefault(require("lodash.clonedeep"));
const WriteBuffer_1 = require("../memory/WriteBuffer");
class ExecutionHistory {
    constructor(initialMemory) {
        /** Ordered list of commit bundles */
        this.steps = [];
        // DESIGN: Deep clone to ensure isolation from external mutations
        this.base = (0, lodash_clonedeep_1.default)(initialMemory);
    }
    /**
     * Reconstructs the full state at any given step.
     * WHY: Enables time-travel debugging by replaying commits.
     *
     * DESIGN: Replays commits from the beginning up to stepIdx.
     * This is O(n) but keeps memory footprint low since we don't
     * store full snapshots at each step.
     *
     * @param stepIdx - Step index to materialise to (default: latest)
     * @returns The reconstructed state at the specified step
     */
    materialise(stepIdx = this.steps.length) {
        let out = (0, lodash_clonedeep_1.default)(this.base);
        for (let i = 0; i < stepIdx; i++) {
            const { overwrite, updates, trace } = this.steps[i];
            out = (0, WriteBuffer_1.applySmartMerge)(out, updates, overwrite, trace);
        }
        return out;
    }
    /**
     * Persists a commit bundle for a finished stage.
     * WHY: Builds the execution history for debugging and visualization.
     *
     * @param bundle - The commit bundle from a completed stage
     */
    record(bundle) {
        // Auto-increment idx so UI can address steps by index
        bundle.idx = this.steps.length;
        this.steps.push(bundle);
    }
    /**
     * Gets all recorded commit bundles.
     * WHY: Enables UI to display execution timeline.
     */
    list() {
        return this.steps;
    }
    /**
     * Wipes history.
     * WHY: Used by integration tests to reset state between tests.
     */
    clear() {
        this.steps = [];
    }
}
exports.ExecutionHistory = ExecutionHistory;
exports.MemoryHistory = ExecutionHistory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXhlY3V0aW9uSGlzdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbnRlcm5hbC9oaXN0b3J5L0V4ZWN1dGlvbkhpc3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EyQkc7Ozs7OztBQUVILHdFQUEwQztBQUUxQyx1REFBcUU7QUF3QnJFLE1BQWEsZ0JBQWdCO0lBTTNCLFlBQVksYUFBa0I7UUFIOUIscUNBQXFDO1FBQzdCLFVBQUssR0FBbUIsRUFBRSxDQUFDO1FBR2pDLGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsMEJBQVUsRUFBQyxhQUFhLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7T0FVRztJQUNILFdBQVcsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNO1FBQ3JDLElBQUksR0FBRyxHQUFHLElBQUEsMEJBQVUsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEQsR0FBRyxHQUFHLElBQUEsNkJBQWUsRUFBQyxHQUFHLEVBQUUsT0FBc0IsRUFBRSxTQUF3QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RGLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILE1BQU0sQ0FBQyxNQUFvQjtRQUN6QixzREFBc0Q7UUFDdEQsTUFBTSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUMvQixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsSUFBSTtRQUNGLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNwQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSztRQUNILElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO0lBQ2xCLENBQUM7Q0FDRjtBQTFERCw0Q0EwREM7QUFHNEIseUNBQWEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEV4ZWN1dGlvbkhpc3RvcnkgLSBUaW1lLXRyYXZlbCBzbmFwc2hvdCBzdG9yYWdlIGZvciBwaXBlbGluZSBleGVjdXRpb25cbiAqIFxuICogV0hZOiBFbmFibGVzIGRlYnVnZ2luZyBhbmQgdmlzdWFsaXphdGlvbiBvZiBwaXBlbGluZSBleGVjdXRpb24gYnkgc3RvcmluZ1xuICogdGhlIGNvbW1pdCBidW5kbGVzIGZyb20gZWFjaCBzdGFnZSBpbiBjaHJvbm9sb2dpY2FsIG9yZGVyLlxuICogXG4gKiBERVNJR046IExpa2UgZ2l0IGhpc3RvcnkgZm9yIHBpcGVsaW5lIGV4ZWN1dGlvbjpcbiAqIC0gRWFjaCBjb21taXQgYnVuZGxlIGlzIGEgXCJjb21taXRcIiB0aGF0IGNhbiBiZSByZXBsYXllZFxuICogLSBObyBmdWxsIHNuYXBzaG90cyBzdG9yZWQgLSBqdXN0IGRhdGEtZGlmZiBidW5kbGVzXG4gKiAtIE1lbW9yeSBmb290cHJpbnQgc3RheXMgPCAxMDBLQiBmb3IgdHlwaWNhbCBwaXBlbGluZXNcbiAqIC0gbWF0ZXJpYWxpc2UoKSByZWNvbnN0cnVjdHMgc3RhdGUgYXQgYW55IHBvaW50IGJ5IHJlcGxheWluZyBjb21taXRzXG4gKiBcbiAqIFJFU1BPTlNJQklMSVRJRVM6XG4gKiAtIFN0b3JlIGNvbW1pdCBidW5kbGVzIGluIGNocm9ub2xvZ2ljYWwgb3JkZXJcbiAqIC0gUmVjb25zdHJ1Y3Qgc3RhdGUgYXQgYW55IHBvaW50IHZpYSByZXBsYXlcbiAqIC0gUHJvdmlkZSBhdWRpdCB0cmFpbCBmb3IgcGlwZWxpbmUgcnVuc1xuICogXG4gKiBSRUxBVEVEOlxuICogLSB7QGxpbmsgV3JpdGVCdWZmZXJ9IC0gUHJvZHVjZXMgY29tbWl0IGJ1bmRsZXNcbiAqIC0ge0BsaW5rIEdsb2JhbFN0b3JlfSAtIFVzZXMgaGlzdG9yeSBmb3IgdGltZS10cmF2ZWxcbiAqIFxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGhpc3RvcnkgPSBuZXcgRXhlY3V0aW9uSGlzdG9yeShpbml0aWFsU3RhdGUpO1xuICogaGlzdG9yeS5yZWNvcmQoeyBzdGFnZTogJ3ZhbGlkYXRlJywgdHJhY2U6IFsuLi5dLCBvdmVyd3JpdGU6IHsuLi59LCB1cGRhdGVzOiB7Li4ufSB9KTtcbiAqIGNvbnN0IHN0YXRlQXRTdGVwMSA9IGhpc3RvcnkubWF0ZXJpYWxpc2UoMSk7XG4gKiBgYGBcbiAqL1xuXG5pbXBvcnQgX2Nsb25lRGVlcCBmcm9tICdsb2Rhc2guY2xvbmVkZWVwJztcblxuaW1wb3J0IHsgYXBwbHlTbWFydE1lcmdlLCBNZW1vcnlQYXRjaCB9IGZyb20gJy4uL21lbW9yeS9Xcml0ZUJ1ZmZlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJhY2VJdGVtIHtcbiAgLyoqIENhbm9uaWNhbCBwYXRoIHN0cmluZyAoam9pbmVkIGJ5IFxcdTAwMUYgZGVsaW1pdGVyKSAqL1xuICBwYXRoOiBzdHJpbmc7XG4gIC8qKiBPcGVyYXRpb24gdmVyYiAtICdzZXQnIGZvciBvdmVyd3JpdGUsICdtZXJnZScgZm9yIGRlZXAgbWVyZ2UgKi9cbiAgdmVyYjogJ3NldCcgfCAnbWVyZ2UnO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbW1pdEJ1bmRsZSB7XG4gIC8qKiBTdGVwIGluZGV4IC0gc2V0IGJ5IEV4ZWN1dGlvbkhpc3Rvcnkgd2hlbiByZWNvcmRlZCAqL1xuICBpZHg/OiBudW1iZXI7XG4gIC8qKiBTdGFnZSBuYW1lIChodW1hbi1yZWFkYWJsZSkgKi9cbiAgc3RhZ2U6IHN0cmluZztcbiAgLyoqIENocm9ub2xvZ2ljYWwgd3JpdGUgbG9nIGZvciBkZXRlcm1pbmlzdGljIHJlcGxheSAqL1xuICB0cmFjZTogVHJhY2VJdGVtW107XG4gIC8qKiBQYXRocyB0aGF0IHNob3VsZCBiZSByZWRhY3RlZCBpbiBVSSAoc2Vuc2l0aXZlIGRhdGEpICovXG4gIHJlZGFjdGVkUGF0aHM6IHN0cmluZ1tdO1xuICAvKiogSGFyZCBvdmVyd3JpdGUgcGF0Y2hlcyAqL1xuICBvdmVyd3JpdGU6IE1lbW9yeVBhdGNoO1xuICAvKiogRGVlcCBtZXJnZSBwYXRjaGVzICovXG4gIHVwZGF0ZXM6IE1lbW9yeVBhdGNoO1xufVxuXG5leHBvcnQgY2xhc3MgRXhlY3V0aW9uSGlzdG9yeSB7XG4gIC8qKiBCYXNlIHNuYXBzaG90IEJFRk9SRSB0aGUgZmlyc3Qgc3RhZ2UgbXV0YXRlcyBhbnl0aGluZyAqL1xuICBwcml2YXRlIGJhc2U6IGFueTtcbiAgLyoqIE9yZGVyZWQgbGlzdCBvZiBjb21taXQgYnVuZGxlcyAqL1xuICBwcml2YXRlIHN0ZXBzOiBDb21taXRCdW5kbGVbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKGluaXRpYWxNZW1vcnk6IGFueSkge1xuICAgIC8vIERFU0lHTjogRGVlcCBjbG9uZSB0byBlbnN1cmUgaXNvbGF0aW9uIGZyb20gZXh0ZXJuYWwgbXV0YXRpb25zXG4gICAgdGhpcy5iYXNlID0gX2Nsb25lRGVlcChpbml0aWFsTWVtb3J5KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWNvbnN0cnVjdHMgdGhlIGZ1bGwgc3RhdGUgYXQgYW55IGdpdmVuIHN0ZXAuXG4gICAqIFdIWTogRW5hYmxlcyB0aW1lLXRyYXZlbCBkZWJ1Z2dpbmcgYnkgcmVwbGF5aW5nIGNvbW1pdHMuXG4gICAqIFxuICAgKiBERVNJR046IFJlcGxheXMgY29tbWl0cyBmcm9tIHRoZSBiZWdpbm5pbmcgdXAgdG8gc3RlcElkeC5cbiAgICogVGhpcyBpcyBPKG4pIGJ1dCBrZWVwcyBtZW1vcnkgZm9vdHByaW50IGxvdyBzaW5jZSB3ZSBkb24ndFxuICAgKiBzdG9yZSBmdWxsIHNuYXBzaG90cyBhdCBlYWNoIHN0ZXAuXG4gICAqIFxuICAgKiBAcGFyYW0gc3RlcElkeCAtIFN0ZXAgaW5kZXggdG8gbWF0ZXJpYWxpc2UgdG8gKGRlZmF1bHQ6IGxhdGVzdClcbiAgICogQHJldHVybnMgVGhlIHJlY29uc3RydWN0ZWQgc3RhdGUgYXQgdGhlIHNwZWNpZmllZCBzdGVwXG4gICAqL1xuICBtYXRlcmlhbGlzZShzdGVwSWR4ID0gdGhpcy5zdGVwcy5sZW5ndGgpOiBhbnkge1xuICAgIGxldCBvdXQgPSBfY2xvbmVEZWVwKHRoaXMuYmFzZSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwSWR4OyBpKyspIHtcbiAgICAgIGNvbnN0IHsgb3ZlcndyaXRlLCB1cGRhdGVzLCB0cmFjZSB9ID0gdGhpcy5zdGVwc1tpXTtcbiAgICAgIG91dCA9IGFwcGx5U21hcnRNZXJnZShvdXQsIHVwZGF0ZXMgYXMgTWVtb3J5UGF0Y2gsIG92ZXJ3cml0ZSBhcyBNZW1vcnlQYXRjaCwgdHJhY2UpO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgLyoqXG4gICAqIFBlcnNpc3RzIGEgY29tbWl0IGJ1bmRsZSBmb3IgYSBmaW5pc2hlZCBzdGFnZS5cbiAgICogV0hZOiBCdWlsZHMgdGhlIGV4ZWN1dGlvbiBoaXN0b3J5IGZvciBkZWJ1Z2dpbmcgYW5kIHZpc3VhbGl6YXRpb24uXG4gICAqIFxuICAgKiBAcGFyYW0gYnVuZGxlIC0gVGhlIGNvbW1pdCBidW5kbGUgZnJvbSBhIGNvbXBsZXRlZCBzdGFnZVxuICAgKi9cbiAgcmVjb3JkKGJ1bmRsZTogQ29tbWl0QnVuZGxlKTogdm9pZCB7XG4gICAgLy8gQXV0by1pbmNyZW1lbnQgaWR4IHNvIFVJIGNhbiBhZGRyZXNzIHN0ZXBzIGJ5IGluZGV4XG4gICAgYnVuZGxlLmlkeCA9IHRoaXMuc3RlcHMubGVuZ3RoO1xuICAgIHRoaXMuc3RlcHMucHVzaChidW5kbGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgYWxsIHJlY29yZGVkIGNvbW1pdCBidW5kbGVzLlxuICAgKiBXSFk6IEVuYWJsZXMgVUkgdG8gZGlzcGxheSBleGVjdXRpb24gdGltZWxpbmUuXG4gICAqL1xuICBsaXN0KCk6IENvbW1pdEJ1bmRsZVtdIHtcbiAgICByZXR1cm4gdGhpcy5zdGVwcztcbiAgfVxuXG4gIC8qKlxuICAgKiBXaXBlcyBoaXN0b3J5LlxuICAgKiBXSFk6IFVzZWQgYnkgaW50ZWdyYXRpb24gdGVzdHMgdG8gcmVzZXQgc3RhdGUgYmV0d2VlbiB0ZXN0cy5cbiAgICovXG4gIGNsZWFyKCk6IHZvaWQge1xuICAgIHRoaXMuc3RlcHMgPSBbXTtcbiAgfVxufVxuXG4vLyBMZWdhY3kgYWxpYXMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgZHVyaW5nIG1pZ3JhdGlvblxuZXhwb3J0IHsgRXhlY3V0aW9uSGlzdG9yeSBhcyBNZW1vcnlIaXN0b3J5IH07XG4iXX0=