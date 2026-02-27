import { useState, useCallback, useMemo } from 'react';
import type { TutorialLesson, Phase } from './types';
import { lessons } from '../lessons';

export function useTutorial() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('build');

  const lesson: TutorialLesson = lessons[lessonIndex];

  const steps = phase === 'build' ? lesson.buildSteps : lesson.executeSteps;
  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;

  const canGoNext = stepIndex < totalSteps - 1 || (phase === 'build' && lesson.executeSteps.length > 0);
  const canGoPrev = stepIndex > 0 || phase === 'execute';

  const nextStep = useCallback(() => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex(stepIndex + 1);
    } else if (phase === 'build' && lesson.executeSteps.length > 0) {
      setPhase('execute');
      setStepIndex(0);
    }
  }, [stepIndex, totalSteps, phase, lesson.executeSteps.length]);

  const prevStep = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else if (phase === 'execute') {
      setPhase('build');
      setStepIndex(lesson.buildSteps.length - 1);
    }
  }, [stepIndex, phase, lesson.buildSteps.length]);

  const goToStep = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(index, totalSteps - 1)));
  }, [totalSteps]);

  const selectLesson = useCallback((index: number) => {
    setLessonIndex(index);
    setStepIndex(0);
    setPhase('build');
  }, []);

  const allBuildNodes = useMemo(() => {
    if (phase === 'build') {
      const buildStep = currentStep as import('./types').BuildStep;
      return buildStep?.nodes ?? [];
    }
    // In execute phase, show all nodes from last build step
    const lastBuild = lesson.buildSteps[lesson.buildSteps.length - 1];
    return lastBuild?.nodes ?? [];
  }, [phase, currentStep, lesson.buildSteps]);

  const allBuildEdges = useMemo(() => {
    if (phase === 'build') {
      const buildStep = currentStep as import('./types').BuildStep;
      return buildStep?.edges ?? [];
    }
    const lastBuild = lesson.buildSteps[lesson.buildSteps.length - 1];
    return lastBuild?.edges ?? [];
  }, [phase, currentStep, lesson.buildSteps]);

  // In execute phase, accumulate narrative lines up to current step
  const narrativeLines = useMemo(() => {
    if (phase !== 'execute') return [];
    return lesson.executeSteps
      .slice(0, stepIndex + 1)
      .map(s => s.narrativeLine);
  }, [phase, lesson.executeSteps, stepIndex]);

  return {
    lesson,
    lessons,
    lessonIndex,
    selectLesson,
    stepIndex,
    totalSteps,
    currentStep,
    phase,
    canGoNext,
    canGoPrev,
    nextStep,
    prevStep,
    goToStep,
    allBuildNodes,
    allBuildEdges,
    narrativeLines,
  };
}
