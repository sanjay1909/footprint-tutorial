/**
 * Core Builder Module - Barrel Export
 *
 * WHY: This barrel export provides a single entry point for all builder-related
 * exports. Consumers can import everything they need from 'core/builder' instead
 * of importing from individual files.
 *
 * EXPORTS:
 * - FlowChartBuilder: Main builder class for constructing flowcharts
 * - DeciderList, SelectorList: Helper classes for branching
 * - flowChart: Factory function for creating builders
 * - specToStageNode: Utility for converting specs to stage nodes
 * - Various types for flowchart construction
 */
export { FlowChartBuilder, DeciderList, SelectorList, } from './FlowChartBuilder';
export { flowChart } from './FlowChartBuilder';
export { specToStageNode } from './FlowChartBuilder';
export type { FlowChartSpec, BuildTimeNodeMetadata, BuildTimeExtractor, SimplifiedParallelSpec, SerializedPipelineStructure, FlowChart, ExecOptions, } from './FlowChartBuilder';
export type { BuiltFlow, StageFn, ParallelSpec, BranchBody, BranchSpec, SubflowRef, } from './FlowChartBuilder';
export type { StreamHandlers, StreamTokenHandler, StreamLifecycleHandler, Selector, SubflowMountOptions, } from './FlowChartBuilder';
