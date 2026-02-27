import { useState, useCallback, useMemo } from 'react';
import type { DebuggerLessonConfig, Phase, LessonExecution, CapturedStageState } from './types';
import { debuggerLessons } from '../debugger-lessons';
import { executePipeline } from './usePipelineExecution';

export function useDebuggerTutorial() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('build');
  const [execution, setExecution] = useState<LessonExecution | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const lesson: DebuggerLessonConfig = debuggerLessons[lessonIndex];

  // Build phase
  const buildSteps = lesson.buildSteps;
  const currentBuildStep = phase === 'build' ? buildSteps[stepIndex] : undefined;

  // Execute phase
  const stageSnapshots = execution?.stageSnapshots ?? [];
  const currentSnapshot: CapturedStageState | undefined =
    phase === 'execute' ? stageSnapshots[stepIndex] : undefined;
  const previousSnapshot: CapturedStageState | undefined =
    phase === 'execute' && stepIndex > 0 ? stageSnapshots[stepIndex - 1] : undefined;

  const totalSteps = phase === 'build' ? buildSteps.length : stageSnapshots.length;

  const canGoNext = phase === 'build'
    ? stepIndex < buildSteps.length - 1 || buildSteps.length > 0
    : stepIndex < stageSnapshots.length - 1;

  const canGoPrev = stepIndex > 0 || phase === 'execute';

  const runPipeline = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await executePipeline(lesson);
      setExecution(result);
      setPhase('execute');
      setStepIndex(0);
    } catch (err) {
      console.error('Pipeline execution failed:', err);
    } finally {
      setIsRunning(false);
    }
  }, [lesson]);

  const nextStep = useCallback(() => {
    if (phase === 'build') {
      if (stepIndex < buildSteps.length - 1) {
        setStepIndex(stepIndex + 1);
      } else {
        // Transition to execute phase — run real pipeline
        runPipeline();
      }
    } else {
      if (stepIndex < stageSnapshots.length - 1) {
        setStepIndex(stepIndex + 1);
      }
    }
  }, [phase, stepIndex, buildSteps.length, stageSnapshots.length, runPipeline]);

  const prevStep = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else if (phase === 'execute') {
      setPhase('build');
      setStepIndex(buildSteps.length - 1);
    }
  }, [stepIndex, phase, buildSteps.length]);

  const goToStep = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(index, totalSteps - 1)));
  }, [totalSteps]);

  const selectLesson = useCallback((index: number) => {
    setLessonIndex(index);
    setStepIndex(0);
    setPhase('build');
    setExecution(null);
  }, []);

  // Flow nodes/edges — from build step or execution
  const flowNodes = useMemo(() => {
    if (phase === 'build') {
      return currentBuildStep?.nodes ?? [];
    }
    return execution?.flowNodes ?? [];
  }, [phase, currentBuildStep, execution]);

  const flowEdges = useMemo(() => {
    if (phase === 'build') {
      return currentBuildStep?.edges ?? [];
    }
    return execution?.flowEdges ?? [];
  }, [phase, currentBuildStep, execution]);

  // Active node during execution
  const activeNodeId = currentSnapshot?.stageName;

  // Active edges during execution
  const activeEdgeIds = useMemo(() => {
    if (!currentSnapshot || !previousSnapshot) return [];
    const edgeId = `e-${previousSnapshot.stageName}-${currentSnapshot.stageName}`;
    return [edgeId];
  }, [currentSnapshot, previousSnapshot]);

  // New node IDs during build
  const newNodeIds = currentBuildStep?.newNodeIds ?? [];

  // Narrative lines accumulated up to current step
  const narrativeLines = useMemo(() => {
    if (phase !== 'execute' || !execution) return [];
    return execution.narrativeSentences.slice(0, stepIndex + 1);
  }, [phase, execution, stepIndex]);

  // Code for the code panel
  const code = useMemo(() => {
    if (phase === 'build') {
      return currentBuildStep?.code ?? '';
    }
    const name = currentSnapshot?.stageName ?? '';
    const stage = lesson.stages.find(s => s.name === name);
    return `// Executing: ${name}\n// ${stage?.description ?? 'Watch the Memory Inspector →'}`;
  }, [phase, currentBuildStep, currentSnapshot, lesson.stages]);

  const highlightLines = currentBuildStep?.highlightLines;
  const concept = currentBuildStep?.concept;

  return {
    lesson,
    lessons: debuggerLessons,
    lessonIndex,
    selectLesson,
    stepIndex,
    totalSteps,
    phase,
    canGoNext: canGoNext && !isRunning,
    canGoPrev,
    nextStep,
    prevStep,
    goToStep,
    isRunning,
    // Code panel
    code,
    highlightLines,
    concept,
    // Flowchart
    flowNodes,
    flowEdges,
    activeNodeId,
    activeEdgeIds,
    newNodeIds,
    // Memory Inspector
    currentSnapshot,
    previousSnapshot,
    // Narrative
    narrativeLines,
  };
}
