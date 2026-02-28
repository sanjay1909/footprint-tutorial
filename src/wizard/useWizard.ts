import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type {
  WizardChapter, WizardStep, RunPhase, PhaseModal,
  ExecutionResult, CapturedStageState,
  FlowNode, FlowEdge,
} from './types';
import { executeWizardPipeline } from './useWizardExecution';

interface WizardState {
  chapterIndex: number;
  phaseIndex: number;
  stepIndex: number;
  isRunning: boolean;
  execution: ExecutionResult | null;
  /** Derived steps for run/traverse phases (generated from execution) */
  derivedSteps: WizardStep[] | null;
  transitionDirection: 'none' | 'slide-left' | 'fade';
  isTransitioning: boolean;
  /** Modal checkpoint state */
  modalVisible: boolean;
  modalSlideIndex: number;
}

export function useWizard(chapters: WizardChapter[]) {
  const [state, setState] = useState<WizardState>({
    chapterIndex: 0,
    phaseIndex: 0,
    stepIndex: 0,
    isRunning: false,
    execution: null,
    derivedSteps: null,
    transitionDirection: 'none',
    isTransitioning: false,
    modalVisible: false,
    modalSlideIndex: 0,
  });

  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ─── Derived Values ─────────────────────────────────────────
  const chapter = chapters[state.chapterIndex];
  const phase = chapter.phases[state.phaseIndex];

  // Steps: use derived steps for run and traverse phases that have been executed
  const steps = ((phase.kind === 'run' || phase.kind === 'traverse') && state.derivedSteps)
    ? state.derivedSteps
    : phase.steps;
  const currentStep = steps[state.stepIndex] as WizardStep | undefined;
  const totalSteps = steps.length;

  // ─── Transition Helper ──────────────────────────────────────
  const triggerTransition = useCallback((
    direction: 'slide-left' | 'fade',
    callback: () => void,
  ) => {
    setState(s => ({ ...s, transitionDirection: direction, isTransitioning: true }));
    transitionTimeoutRef.current = setTimeout(() => {
      callback();
      setTimeout(() => {
        setState(s => ({ ...s, isTransitioning: false, transitionDirection: 'none' }));
      }, 50);
    }, 500);
  }, []);

  // ─── Run Pipeline ───────────────────────────────────────────
  const runAndTransition = useCallback(async (
    runPhase: RunPhase,
    nextPhaseIndex: number,
  ) => {
    setState(s => ({ ...s, isRunning: true }));
    try {
      const result = await executeWizardPipeline(runPhase);

      // Generate steps from execution results — one per stage
      const derived: WizardStep[] = result.stageSnapshots.map((snap, i) => ({
        id: `exec-${snap.stageName}`,
        label: `Executing: ${snap.stageName}`,
        explanation: `Stage ${i + 1} — memory entries appear as WriteBuffer commits after each stage`,
        nodes: result.flowNodes,
        edges: result.flowEdges,
        activeNodeId: snap.stageName,
        activeEdgeIds: i > 0
          ? [`e-${result.stageSnapshots[i - 1].stageName}-${snap.stageName}`]
          : [],
      }));

      // Transition to the run phase's layout
      const nextPhase = chapters[state.chapterIndex].phases[nextPhaseIndex];
      const dir = nextPhase?.transition === 'fade' ? 'fade' : 'slide-left';

      triggerTransition(dir, () => {
        setState(s => ({
          ...s,
          isRunning: false,
          execution: result,
          derivedSteps: derived,
          phaseIndex: nextPhaseIndex,
          stepIndex: 0,
        }));
      });
    } catch (err) {
      console.error('Wizard pipeline execution failed:', err);
      setState(s => ({ ...s, isRunning: false }));
    }
  }, [state.chapterIndex, chapters, triggerTransition]);

  // ─── Derive Traverse Steps ────────────────────────────────────
  const deriveTraverseSteps = useCallback((
    execution: ExecutionResult,
  ): WizardStep[] => {
    return execution.stageSnapshots.map((snap, i) => ({
      id: `traverse-${snap.stageName}`,
      label: `Traversing: ${snap.stageName}`,
      explanation: `Stage ${i + 1} of ${execution.stageSnapshots.length} — examining scope state and output`,
      nodes: execution.flowNodes,
      edges: execution.flowEdges,
      activeNodeId: snap.stageName,
      activeEdgeIds: i > 0
        ? [`e-${execution.stageSnapshots[i - 1].stageName}-${snap.stageName}`]
        : [],
    }));
  }, []);

  // ─── Phase Transition (called by dismissModal or nextStep) ────
  const transitionToPhase = useCallback((nextPhaseIdx: number) => {
    const nextPhase = chapter.phases[nextPhaseIdx];

    if (nextPhase.kind === 'run') {
      runAndTransition(nextPhase, nextPhaseIdx);
      return;
    }

    if (nextPhase.kind === 'traverse' && state.execution) {
      const derived = deriveTraverseSteps(state.execution);
      const dir = nextPhase.transition === 'fade' ? 'fade' : 'slide-left';
      triggerTransition(dir, () => {
        setState(s => ({
          ...s,
          phaseIndex: nextPhaseIdx,
          stepIndex: 0,
          derivedSteps: derived,
        }));
      });
      return;
    }

    // Static phase: animate transition — PRESERVE execution within chapter
    const dir = nextPhase.transition === 'fade' ? 'fade' : 'slide-left';
    triggerTransition(dir, () => {
      setState(s => ({
        ...s,
        phaseIndex: nextPhaseIdx,
        stepIndex: 0,
        // execution & derivedSteps preserved for observe phase
      }));
    });
  }, [chapter, state.execution, runAndTransition, deriveTraverseSteps, triggerTransition]);

  // ─── Modal Navigation ──────────────────────────────────────
  const nextModalSlide = useCallback(() => {
    setState(s => {
      const modal = chapter.phases[s.phaseIndex].exitModal;
      if (!modal || s.modalSlideIndex >= modal.slides.length - 1) return s;
      return { ...s, modalSlideIndex: s.modalSlideIndex + 1 };
    });
  }, [chapter]);

  const prevModalSlide = useCallback(() => {
    setState(s => ({
      ...s,
      modalSlideIndex: Math.max(0, s.modalSlideIndex - 1),
    }));
  }, []);

  const dismissModal = useCallback(() => {
    const nextPhaseIdx = state.phaseIndex + 1;
    setState(s => ({ ...s, modalVisible: false, modalSlideIndex: 0 }));
    transitionToPhase(nextPhaseIdx);
  }, [state.phaseIndex, transitionToPhase]);

  // ─── Navigation ─────────────────────────────────────────────
  const canGoNext = useMemo(() => {
    if (state.isRunning || state.isTransitioning || state.modalVisible) return false;
    if (state.stepIndex < totalSteps - 1) return true;
    if (state.phaseIndex < chapter.phases.length - 1) return true;
    if (state.chapterIndex < chapters.length - 1) return true;
    return false;
  }, [state, totalSteps, chapter, chapters]);

  const canGoPrev = useMemo(() => {
    if (state.isRunning || state.isTransitioning || state.modalVisible) return false;
    return state.stepIndex > 0 || state.phaseIndex > 0 || state.chapterIndex > 0;
  }, [state]);

  const nextStep = useCallback(() => {
    if (state.isRunning || state.isTransitioning || state.modalVisible) return;

    if (state.stepIndex < totalSteps - 1) {
      setState(s => ({ ...s, stepIndex: s.stepIndex + 1 }));
    } else if (state.phaseIndex < chapter.phases.length - 1) {
      // End of phase — show exit modal if configured
      if (phase.exitModal) {
        setState(s => ({ ...s, modalVisible: true, modalSlideIndex: 0 }));
        return;
      }
      // No modal — transition directly
      transitionToPhase(state.phaseIndex + 1);
    } else if (state.chapterIndex < chapters.length - 1) {
      // Advance to next chapter — reset everything
      const nextChapterIdx = state.chapterIndex + 1;
      const firstPhase = chapters[nextChapterIdx].phases[0];
      const dir = firstPhase.transition === 'fade' ? 'fade' : 'slide-left';

      triggerTransition(dir, () => {
        setState(s => ({
          ...s,
          chapterIndex: nextChapterIdx,
          phaseIndex: 0,
          stepIndex: 0,
          derivedSteps: null,
          execution: null,
        }));
      });
    }
  }, [state, totalSteps, chapter, chapters, phase, transitionToPhase, triggerTransition]);

  const prevStep = useCallback(() => {
    if (state.isRunning || state.isTransitioning || state.modalVisible) return;

    if (state.stepIndex > 0) {
      setState(s => ({ ...s, stepIndex: s.stepIndex - 1 }));
    } else if (state.phaseIndex > 0) {
      const prevPhaseIdx = state.phaseIndex - 1;
      const prevPhase = chapter.phases[prevPhaseIdx];

      // Calculate correct last step for the previous phase
      const prevPhaseSteps = ((prevPhase.kind === 'run' || prevPhase.kind === 'traverse') && state.derivedSteps)
        ? state.derivedSteps
        : prevPhase.steps;

      triggerTransition('slide-left', () => {
        setState(s => ({
          ...s,
          phaseIndex: prevPhaseIdx,
          stepIndex: prevPhaseSteps.length - 1,
          // execution & derivedSteps preserved within chapter
        }));
      });
    } else if (state.chapterIndex > 0) {
      const prevChapterIdx = state.chapterIndex - 1;
      const prevChapter = chapters[prevChapterIdx];
      const lastPhase = prevChapter.phases[prevChapter.phases.length - 1];

      triggerTransition('fade', () => {
        setState(s => ({
          ...s,
          chapterIndex: prevChapterIdx,
          phaseIndex: prevChapter.phases.length - 1,
          stepIndex: lastPhase.steps.length - 1,
          derivedSteps: null,
          execution: null,
        }));
      });
    }
  }, [state, chapter, chapters, triggerTransition]);

  const goToStep = useCallback((index: number) => {
    setState(s => ({ ...s, stepIndex: Math.max(0, Math.min(index, totalSteps - 1)) }));
  }, [totalSteps]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    };
  }, []);

  // ─── Panel Data ─────────────────────────────────────────────
  const flowNodes: FlowNode[] = currentStep?.nodes ?? [];
  const flowEdges: FlowEdge[] = currentStep?.edges ?? [];
  const activeNodeId = currentStep?.activeNodeId;
  const activeEdgeIds = currentStep?.activeEdgeIds ?? [];
  const newNodeIds = currentStep?.newNodeIds ?? [];

  const isObservePhase = phase.right === 'observe';

  // Snapshot: in observe phase show the last (complete) snapshot
  const currentSnapshot: CapturedStageState | undefined = useMemo(() => {
    if (!state.execution) return undefined;
    const snapshots = state.execution.stageSnapshots;
    if (isObservePhase && snapshots.length > 0) {
      return snapshots[snapshots.length - 1];
    }
    return snapshots[state.stepIndex];
  }, [state.execution, state.stepIndex, isObservePhase]);

  const previousSnapshot: CapturedStageState | undefined = useMemo(() => {
    if (!state.execution) return undefined;
    const snapshots = state.execution.stageSnapshots;
    if (isObservePhase) {
      return snapshots.length > 1 ? snapshots[snapshots.length - 2] : undefined;
    }
    if (state.stepIndex === 0) return undefined;
    return snapshots[state.stepIndex - 1];
  }, [state.execution, state.stepIndex, isObservePhase]);

  // Narrative: in observe phase show all lines
  const narrativeLines = useMemo(() => {
    if (!state.execution) return [];
    if (isObservePhase) return state.execution.narrativeSentences;
    return state.execution.narrativeSentences.slice(0, state.stepIndex + 1);
  }, [state.execution, state.stepIndex, isObservePhase]);

  const code = currentStep?.code ?? '';
  const highlightLines = currentStep?.highlightLines;
  const concept = currentStep?.concept;

  // Modal config for current phase
  const modalConfig: PhaseModal | undefined = state.modalVisible
    ? phase.exitModal
    : undefined;

  return {
    chapter,
    chapters,
    phase,
    currentStep,
    stepIndex: state.stepIndex,
    totalSteps,
    chapterIndex: state.chapterIndex,
    phaseIndex: state.phaseIndex,

    transitionDirection: state.transitionDirection,
    isTransitioning: state.isTransitioning,

    canGoNext: canGoNext && !state.isRunning,
    canGoPrev,
    nextStep,
    prevStep,
    goToStep,

    // Modal
    modalVisible: state.modalVisible,
    modalSlideIndex: state.modalSlideIndex,
    modalConfig,
    nextModalSlide,
    prevModalSlide,
    dismissModal,

    isRunning: state.isRunning,
    execution: state.execution,

    code,
    highlightLines,
    concept,
    flowNodes,
    flowEdges,
    activeNodeId,
    activeEdgeIds,
    newNodeIds,
    currentSnapshot,
    previousSnapshot,
    narrativeLines,
  };
}
