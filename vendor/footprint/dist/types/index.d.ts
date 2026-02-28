/**
 * TreeOfFunctionsLib - Public API
 *
 * WHY: This file defines the public interface for library consumers.
 * Internal implementation details are not exported.
 *
 * LAYER STRUCTURE:
 * - core/: Public API (builder, memory, executor)
 * - internal/: Library internals (not exported here)
 * - scope/: Consumer extensibility (BaseState, recorders, providers)
 * - utils/: Shared utilities (not exported here)
 *
 * Main entry points:
 * - flowChart(): D3-style factory function for building flowcharts (recommended)
 * - FlowChartBuilder: DSL class for building flow charts
 * - FlowChartExecutor: Runtime execution engine
 * - FlowChart: Type representing a compiled flowchart
 * - BaseState: Base class for custom scope implementations
 */
export { FlowChartBuilder, flowChart, DeciderList, SelectorList, specToStageNode, } from './core/builder';
export type { FlowChartSpec, StageFn, ParallelSpec, BranchBody, BranchSpec, FlowChart, BuiltFlow, ExecOptions, BuildTimeNodeMetadata, BuildTimeExtractor, SerializedPipelineStructure, } from './core/builder';
export { BaseState } from './scope/BaseState';
export type { StageContextLike, ScopeFactory, ScopeProvider, ProviderResolver, } from './scope/providers/types';
export { StageContext } from './core/memory/StageContext';
export { PipelineRuntime } from './core/memory/PipelineRuntime';
export type { RuntimeSnapshot, NarrativeEntry } from './core/memory/PipelineRuntime';
export { GlobalStore } from './core/memory/GlobalStore';
export { StageMetadata } from './core/memory/StageMetadata';
export { WriteBuffer } from './internal/memory/WriteBuffer';
export type { MemoryPatch } from './internal/memory/WriteBuffer';
export { ExecutionHistory } from './internal/history/ExecutionHistory';
export type { CommitBundle, TraceItem } from './internal/history/ExecutionHistory';
export { FlowChartExecutor, } from './core/executor/FlowChartExecutor';
export type { FlowChart as ExecutorFlowChart } from './core/builder';
export { Pipeline, isStageNodeReturn, } from './core/executor/Pipeline';
export type { Selector, Decider, StageNode, } from './core/executor/Pipeline';
export type { Selector as FlowChartSelector } from './core/executor/Pipeline';
export type { SubflowResult, SerializedPipelineNode, StageSnapshot as PipelineStageSnapshot, RuntimeStructureMetadata, TraversalExtractor, ExtractorError, PipelineStageFunction, StreamCallback, StreamTokenHandler, StreamLifecycleHandler, StreamHandlers, TreeOfFunctionsResponse, PipelineResponse, PipelineResponses, NodeResultType, FlowControlType, FlowMessage, SubflowMountOptions, } from './core/executor/types';
export type { StageSnapshot } from './core/memory/StageContext';
export { extractParentScopeValues, getInitialScopeValues, seedSubflowGlobalStore, applyOutputMapping, } from './core/executor/handlers/SubflowInputMapper';
export { createProtectedScope, createErrorMessage, } from './scope/protection';
export type { ScopeProtectionMode, ScopeProtectionOptions, } from './scope/protection';
