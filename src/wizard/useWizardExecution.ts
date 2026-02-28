import { FlowChartBuilder, FlowChartExecutor, BaseState } from 'footprint';
import type { RunPhase, CapturedStageState, ExecutionResult, FlowNode, FlowEdge } from './types';

const scopeFactory = (ctx: any, stageName: string, readOnly?: unknown) => {
  return new BaseState(ctx, stageName, readOnly);
};

export async function executeWizardPipeline(config: RunPhase): Promise<ExecutionResult> {
  const builder = new FlowChartBuilder();
  const stages = config.stages;

  builder.start(stages[0].name, stages[0].fn, undefined, undefined, stages[0].description);
  for (let i = 1; i < stages.length; i++) {
    builder.addFunction(stages[i].name, stages[i].fn, undefined, undefined, stages[i].description);
  }

  builder.addTraversalExtractor((snapshot: any) => ({
    stageName: snapshot.node?.name ?? 'unknown',
    stepNumber: snapshot.stepNumber ?? 0,
    scopeState: snapshot.scopeState ? { ...snapshot.scopeState } : {},
    stageOutput: snapshot.stageOutput ?? snapshot.output ?? null,
    historyIndex: snapshot.historyIndex ?? 0,
  } as CapturedStageState));

  const chart = builder.build();
  const executor = new FlowChartExecutor(
    chart,
    scopeFactory,
    undefined, // defaultValuesForContext
    undefined, // initialContext
    undefined, // readOnlyContext
    undefined, // throttlingErrorChecker
    undefined, // streamHandlers
    undefined, // scopeProtectionMode
    true,      // enrichSnapshots
  );

  if (config.enableNarrative) {
    executor.enableNarrative();
  }

  await executor.run();

  const extractedResults = executor.getEnrichedResults<CapturedStageState>();
  const stageSnapshots: CapturedStageState[] = [];
  if (extractedResults) {
    extractedResults.forEach((value: any) => {
      if (value) stageSnapshots.push(value);
    });
  }

  const narrativeSentences = config.enableNarrative ? executor.getNarrative() : [];

  const flowNodes: FlowNode[] = stages.map(s => ({
    id: s.name,
    label: s.name,
    type: 'stage' as const,
    description: s.description,
  }));

  const flowEdges: FlowEdge[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    flowEdges.push({
      id: `e-${stages[i].name}-${stages[i + 1].name}`,
      source: stages[i].name,
      target: stages[i + 1].name,
    });
  }

  return { stageSnapshots, narrativeSentences, flowNodes, flowEdges };
}
