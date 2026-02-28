"use strict";
/**
 * GlobalStore - The shared state container for all pipeline execution
 *
 * WHY: Pipelines need a centralized place to store and retrieve state.
 * This is the single source of truth that all stages read from and write to.
 *
 * DESIGN: Like a compiler's symbol table or runtime heap:
 * - Namespace isolation: Each pipeline has its own namespace (pipelines/{id}/)
 * - Default values: Can be initialized with defaults that are preserved
 * - Patch application: Accepts commit bundles from WriteBuffer
 *
 * RESPONSIBILITIES:
 * - Store and retrieve values by path
 * - Apply commit bundles from WriteBuffer
 * - Maintain namespace isolation between pipelines
 *
 * RELATED:
 * - {@link WriteBuffer} - Produces commit bundles
 * - {@link StageContext} - Provides stage-scoped access to GlobalStore
 *
 * @example
 * ```typescript
 * const store = new GlobalStore({ defaultConfig: {} });
 * store.setValue('pipeline-1', ['user'], 'name', 'Alice');
 * const name = store.getValue('pipeline-1', ['user'], 'name'); // 'Alice'
 * ```
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalStore = void 0;
const lodash_clonedeep_1 = __importDefault(require("lodash.clonedeep"));
const lodash_mergewith_1 = __importDefault(require("lodash.mergewith"));
const WriteBuffer_1 = require("../../internal/memory/WriteBuffer");
const utils_1 = require("../../internal/memory/utils");
class GlobalStore {
    constructor(defaultValues, initialContext) {
        this.context = {};
        this._defaultValues = defaultValues;
        // DESIGN: Merge initial context with defaults, preserving existing values
        this.context = (0, lodash_mergewith_1.default)(initialContext || {}, defaultValues || {}, (objValue, srcValue, key) => {
            return typeof objValue === 'undefined' ? srcValue : objValue;
        });
    }
    /**
     * Gets a clone of the default values.
     * WHY: Consumers may need defaults for initialization or reset.
     */
    getDefaultValues() {
        return this._defaultValues ? (0, lodash_clonedeep_1.default)(this._defaultValues) : undefined;
    }
    /**
     * Gets all pipeline namespaces.
     * WHY: Enables iteration over all pipelines for debugging/visualization.
     */
    getPipelines() {
        return this.context.pipelines;
    }
    /**
     * Updates a value using merge semantics.
     * WHY: Enables additive updates without losing existing nested data.
     */
    updateValue(pipelineId, path, key, value) {
        (0, utils_1.updateNestedValue)(this.context, pipelineId, path, key, value, this.getDefaultValues());
    }
    /**
     * Sets a value using overwrite semantics.
     * WHY: Some operations need to completely replace a value.
     */
    setValue(pipelineId, path, key, value) {
        (0, utils_1.setNestedValue)(this.context, pipelineId, path, key, value, this.getDefaultValues());
    }
    /**
     * Reads a value from the store.
     * WHY: Stages need to access shared state during execution.
     *
     * DESIGN: Looks up in pipeline namespace first, falls back to global.
     * This allows pipeline-specific overrides of global values.
     */
    getValue(pipelineId, path, key) {
        const { globalPath, pipelinePath } = (0, utils_1.getPipelineAndGlobalPaths)(pipelineId, path);
        const value = pipelinePath ? (0, utils_1.getNestedValue)(this.context, pipelinePath, key) : undefined;
        return typeof value !== 'undefined' ? value : (0, utils_1.getNestedValue)(this.context, globalPath, key);
    }
    /**
     * Gets the entire state as a JSON object.
     * WHY: Enables serialization for persistence or debugging.
     */
    getState() {
        return this.context;
    }
    /**
     * Applies a commit bundle from WriteBuffer.
     * WHY: Stages commit their mutations through WriteBuffer, which produces
     * patches that need to be applied to the global state.
     */
    applyPatch(overwrite, updates, trace) {
        this.context = (0, WriteBuffer_1.applySmartMerge)(this.context, updates, overwrite, trace);
    }
}
exports.GlobalStore = GlobalStore;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2xvYmFsU3RvcmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY29yZS9tZW1vcnkvR2xvYmFsU3RvcmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTBCRzs7Ozs7O0FBRUgsd0VBQXlDO0FBQ3pDLHdFQUF5QztBQUV6QyxtRUFBaUY7QUFDakYsdURBQTJIO0FBRTNILE1BQWEsV0FBVztJQUl0QixZQUFZLGFBQXVCLEVBQUUsY0FBd0I7UUFIckQsWUFBTyxHQUEyQixFQUFFLENBQUM7UUFJM0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxhQUFhLENBQUM7UUFDcEMsMEVBQTBFO1FBQzFFLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBQSwwQkFBUyxFQUN0QixjQUFjLElBQUksRUFBRSxFQUNwQixhQUFhLElBQUksRUFBRSxFQUNuQixDQUFDLFFBQWlCLEVBQUUsUUFBaUIsRUFBRSxHQUFXLEVBQUUsRUFBRTtZQUNwRCxPQUFPLE9BQU8sUUFBUSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDL0QsQ0FBQyxDQUNGLENBQUM7SUFDSixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsZ0JBQWdCO1FBQ2QsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFBLDBCQUFTLEVBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDMUUsQ0FBQztJQUVEOzs7T0FHRztJQUNILFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO0lBQ2hDLENBQUM7SUFFRDs7O09BR0c7SUFDSCxXQUFXLENBQUMsVUFBa0IsRUFBRSxJQUFjLEVBQUUsR0FBVyxFQUFFLEtBQWM7UUFDekUsSUFBQSx5QkFBaUIsRUFBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFFRDs7O09BR0c7SUFDSCxRQUFRLENBQUMsVUFBa0IsRUFBRSxJQUFjLEVBQUUsR0FBVyxFQUFFLEtBQWM7UUFDdEUsSUFBQSxzQkFBYyxFQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILFFBQVEsQ0FBQyxVQUFtQixFQUFFLElBQWUsRUFBRSxHQUFZO1FBQ3pELE1BQU0sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLEdBQUcsSUFBQSxpQ0FBeUIsRUFBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDakYsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFBLHNCQUFjLEVBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN6RixPQUFPLE9BQU8sS0FBSyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFBLHNCQUFjLEVBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDOUYsQ0FBQztJQUVEOzs7T0FHRztJQUNILFFBQVE7UUFDTixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxVQUFVLENBQUMsU0FBc0IsRUFBRSxPQUFvQixFQUFFLEtBQWdEO1FBQ3ZHLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBQSw2QkFBZSxFQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMxRSxDQUFDO0NBQ0Y7QUE3RUQsa0NBNkVDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBHbG9iYWxTdG9yZSAtIFRoZSBzaGFyZWQgc3RhdGUgY29udGFpbmVyIGZvciBhbGwgcGlwZWxpbmUgZXhlY3V0aW9uXG4gKiBcbiAqIFdIWTogUGlwZWxpbmVzIG5lZWQgYSBjZW50cmFsaXplZCBwbGFjZSB0byBzdG9yZSBhbmQgcmV0cmlldmUgc3RhdGUuXG4gKiBUaGlzIGlzIHRoZSBzaW5nbGUgc291cmNlIG9mIHRydXRoIHRoYXQgYWxsIHN0YWdlcyByZWFkIGZyb20gYW5kIHdyaXRlIHRvLlxuICogXG4gKiBERVNJR046IExpa2UgYSBjb21waWxlcidzIHN5bWJvbCB0YWJsZSBvciBydW50aW1lIGhlYXA6XG4gKiAtIE5hbWVzcGFjZSBpc29sYXRpb246IEVhY2ggcGlwZWxpbmUgaGFzIGl0cyBvd24gbmFtZXNwYWNlIChwaXBlbGluZXMve2lkfS8pXG4gKiAtIERlZmF1bHQgdmFsdWVzOiBDYW4gYmUgaW5pdGlhbGl6ZWQgd2l0aCBkZWZhdWx0cyB0aGF0IGFyZSBwcmVzZXJ2ZWRcbiAqIC0gUGF0Y2ggYXBwbGljYXRpb246IEFjY2VwdHMgY29tbWl0IGJ1bmRsZXMgZnJvbSBXcml0ZUJ1ZmZlclxuICogXG4gKiBSRVNQT05TSUJJTElUSUVTOlxuICogLSBTdG9yZSBhbmQgcmV0cmlldmUgdmFsdWVzIGJ5IHBhdGhcbiAqIC0gQXBwbHkgY29tbWl0IGJ1bmRsZXMgZnJvbSBXcml0ZUJ1ZmZlclxuICogLSBNYWludGFpbiBuYW1lc3BhY2UgaXNvbGF0aW9uIGJldHdlZW4gcGlwZWxpbmVzXG4gKiBcbiAqIFJFTEFURUQ6XG4gKiAtIHtAbGluayBXcml0ZUJ1ZmZlcn0gLSBQcm9kdWNlcyBjb21taXQgYnVuZGxlc1xuICogLSB7QGxpbmsgU3RhZ2VDb250ZXh0fSAtIFByb3ZpZGVzIHN0YWdlLXNjb3BlZCBhY2Nlc3MgdG8gR2xvYmFsU3RvcmVcbiAqIFxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IHN0b3JlID0gbmV3IEdsb2JhbFN0b3JlKHsgZGVmYXVsdENvbmZpZzoge30gfSk7XG4gKiBzdG9yZS5zZXRWYWx1ZSgncGlwZWxpbmUtMScsIFsndXNlciddLCAnbmFtZScsICdBbGljZScpO1xuICogY29uc3QgbmFtZSA9IHN0b3JlLmdldFZhbHVlKCdwaXBlbGluZS0xJywgWyd1c2VyJ10sICduYW1lJyk7IC8vICdBbGljZSdcbiAqIGBgYFxuICovXG5cbmltcG9ydCBjbG9uZURlZXAgZnJvbSAnbG9kYXNoLmNsb25lZGVlcCc7XG5pbXBvcnQgbWVyZ2VXaXRoIGZyb20gJ2xvZGFzaC5tZXJnZXdpdGgnO1xuXG5pbXBvcnQgeyBhcHBseVNtYXJ0TWVyZ2UsIE1lbW9yeVBhdGNoIH0gZnJvbSAnLi4vLi4vaW50ZXJuYWwvbWVtb3J5L1dyaXRlQnVmZmVyJztcbmltcG9ydCB7IGdldE5lc3RlZFZhbHVlLCBnZXRQaXBlbGluZUFuZEdsb2JhbFBhdGhzLCBzZXROZXN0ZWRWYWx1ZSwgdXBkYXRlTmVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi9pbnRlcm5hbC9tZW1vcnkvdXRpbHMnO1xuXG5leHBvcnQgY2xhc3MgR2xvYmFsU3RvcmUge1xuICBwcml2YXRlIGNvbnRleHQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgcHJpdmF0ZSBfZGVmYXVsdFZhbHVlcz86IHVua25vd247XG5cbiAgY29uc3RydWN0b3IoZGVmYXVsdFZhbHVlcz86IHVua25vd24sIGluaXRpYWxDb250ZXh0PzogdW5rbm93bikge1xuICAgIHRoaXMuX2RlZmF1bHRWYWx1ZXMgPSBkZWZhdWx0VmFsdWVzO1xuICAgIC8vIERFU0lHTjogTWVyZ2UgaW5pdGlhbCBjb250ZXh0IHdpdGggZGVmYXVsdHMsIHByZXNlcnZpbmcgZXhpc3RpbmcgdmFsdWVzXG4gICAgdGhpcy5jb250ZXh0ID0gbWVyZ2VXaXRoKFxuICAgICAgaW5pdGlhbENvbnRleHQgfHwge30sXG4gICAgICBkZWZhdWx0VmFsdWVzIHx8IHt9LFxuICAgICAgKG9ialZhbHVlOiB1bmtub3duLCBzcmNWYWx1ZTogdW5rbm93biwga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBvYmpWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcgPyBzcmNWYWx1ZSA6IG9ialZhbHVlO1xuICAgICAgfSxcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgYSBjbG9uZSBvZiB0aGUgZGVmYXVsdCB2YWx1ZXMuXG4gICAqIFdIWTogQ29uc3VtZXJzIG1heSBuZWVkIGRlZmF1bHRzIGZvciBpbml0aWFsaXphdGlvbiBvciByZXNldC5cbiAgICovXG4gIGdldERlZmF1bHRWYWx1ZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2RlZmF1bHRWYWx1ZXMgPyBjbG9uZURlZXAodGhpcy5fZGVmYXVsdFZhbHVlcykgOiB1bmRlZmluZWQ7XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgcGlwZWxpbmUgbmFtZXNwYWNlcy5cbiAgICogV0hZOiBFbmFibGVzIGl0ZXJhdGlvbiBvdmVyIGFsbCBwaXBlbGluZXMgZm9yIGRlYnVnZ2luZy92aXN1YWxpemF0aW9uLlxuICAgKi9cbiAgZ2V0UGlwZWxpbmVzKCkge1xuICAgIHJldHVybiB0aGlzLmNvbnRleHQucGlwZWxpbmVzO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgYSB2YWx1ZSB1c2luZyBtZXJnZSBzZW1hbnRpY3MuXG4gICAqIFdIWTogRW5hYmxlcyBhZGRpdGl2ZSB1cGRhdGVzIHdpdGhvdXQgbG9zaW5nIGV4aXN0aW5nIG5lc3RlZCBkYXRhLlxuICAgKi9cbiAgdXBkYXRlVmFsdWUocGlwZWxpbmVJZDogc3RyaW5nLCBwYXRoOiBzdHJpbmdbXSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG4gICAgdXBkYXRlTmVzdGVkVmFsdWUodGhpcy5jb250ZXh0LCBwaXBlbGluZUlkLCBwYXRoLCBrZXksIHZhbHVlLCB0aGlzLmdldERlZmF1bHRWYWx1ZXMoKSk7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyBhIHZhbHVlIHVzaW5nIG92ZXJ3cml0ZSBzZW1hbnRpY3MuXG4gICAqIFdIWTogU29tZSBvcGVyYXRpb25zIG5lZWQgdG8gY29tcGxldGVseSByZXBsYWNlIGEgdmFsdWUuXG4gICAqL1xuICBzZXRWYWx1ZShwaXBlbGluZUlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZ1tdLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICBzZXROZXN0ZWRWYWx1ZSh0aGlzLmNvbnRleHQsIHBpcGVsaW5lSWQsIHBhdGgsIGtleSwgdmFsdWUsIHRoaXMuZ2V0RGVmYXVsdFZhbHVlcygpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkcyBhIHZhbHVlIGZyb20gdGhlIHN0b3JlLlxuICAgKiBXSFk6IFN0YWdlcyBuZWVkIHRvIGFjY2VzcyBzaGFyZWQgc3RhdGUgZHVyaW5nIGV4ZWN1dGlvbi5cbiAgICogXG4gICAqIERFU0lHTjogTG9va3MgdXAgaW4gcGlwZWxpbmUgbmFtZXNwYWNlIGZpcnN0LCBmYWxscyBiYWNrIHRvIGdsb2JhbC5cbiAgICogVGhpcyBhbGxvd3MgcGlwZWxpbmUtc3BlY2lmaWMgb3ZlcnJpZGVzIG9mIGdsb2JhbCB2YWx1ZXMuXG4gICAqL1xuICBnZXRWYWx1ZShwaXBlbGluZUlkPzogc3RyaW5nLCBwYXRoPzogc3RyaW5nW10sIGtleT86IHN0cmluZyk6IGFueSB7XG4gICAgY29uc3QgeyBnbG9iYWxQYXRoLCBwaXBlbGluZVBhdGggfSA9IGdldFBpcGVsaW5lQW5kR2xvYmFsUGF0aHMocGlwZWxpbmVJZCwgcGF0aCk7XG4gICAgY29uc3QgdmFsdWUgPSBwaXBlbGluZVBhdGggPyBnZXROZXN0ZWRWYWx1ZSh0aGlzLmNvbnRleHQsIHBpcGVsaW5lUGF0aCwga2V5KSA6IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJyA/IHZhbHVlIDogZ2V0TmVzdGVkVmFsdWUodGhpcy5jb250ZXh0LCBnbG9iYWxQYXRoLCBrZXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgdGhlIGVudGlyZSBzdGF0ZSBhcyBhIEpTT04gb2JqZWN0LlxuICAgKiBXSFk6IEVuYWJsZXMgc2VyaWFsaXphdGlvbiBmb3IgcGVyc2lzdGVuY2Ugb3IgZGVidWdnaW5nLlxuICAgKi9cbiAgZ2V0U3RhdGUoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICAgIHJldHVybiB0aGlzLmNvbnRleHQ7XG4gIH1cblxuICAvKipcbiAgICogQXBwbGllcyBhIGNvbW1pdCBidW5kbGUgZnJvbSBXcml0ZUJ1ZmZlci5cbiAgICogV0hZOiBTdGFnZXMgY29tbWl0IHRoZWlyIG11dGF0aW9ucyB0aHJvdWdoIFdyaXRlQnVmZmVyLCB3aGljaCBwcm9kdWNlc1xuICAgKiBwYXRjaGVzIHRoYXQgbmVlZCB0byBiZSBhcHBsaWVkIHRvIHRoZSBnbG9iYWwgc3RhdGUuXG4gICAqL1xuICBhcHBseVBhdGNoKG92ZXJ3cml0ZTogTWVtb3J5UGF0Y2gsIHVwZGF0ZXM6IE1lbW9yeVBhdGNoLCB0cmFjZTogeyBwYXRoOiBzdHJpbmc7IHZlcmI6ICdzZXQnIHwgJ21lcmdlJyB9W10pOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRleHQgPSBhcHBseVNtYXJ0TWVyZ2UodGhpcy5jb250ZXh0LCB1cGRhdGVzLCBvdmVyd3JpdGUsIHRyYWNlKTtcbiAgfVxufVxuIl19