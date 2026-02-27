import { useMemo, useCallback, useEffect } from 'react';
import { useTutorial } from './tutorial/useTutorial';
import { Header } from './layout/Header';
import { SplitLayout } from './layout/SplitLayout';
import { StepControls } from './layout/StepControls';
import { CodePanel } from './panels/CodePanel';
import { FlowchartPanel } from './panels/FlowchartPanel';
import { NarrativePanel } from './panels/NarrativePanel';
import { useFlowLayout } from './panels/useFlowLayout';
import type { BuildStep, ExecuteStep } from './tutorial/types';
import './App.css';

function App() {
  const {
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
  } = useTutorial();

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && canGoNext) nextStep();
      if (e.key === 'ArrowLeft' && canGoPrev) prevStep();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canGoNext, canGoPrev, nextStep, prevStep]);

  const isBuild = phase === 'build';
  const buildStep = isBuild ? (currentStep as BuildStep) : undefined;
  const execStep = !isBuild ? (currentStep as ExecuteStep) : undefined;

  const activeNodeId = execStep?.activeNodeId;
  const activeEdgeIds = execStep?.activeEdgeIds ?? [];
  const newNodeIds = buildStep?.newNodeIds ?? [];

  const { nodes, edges } = useFlowLayout(
    allBuildNodes,
    allBuildEdges,
    newNodeIds,
    activeNodeId,
    activeEdgeIds,
    phase === 'execute',
  );

  const code = isBuild
    ? buildStep?.code ?? ''
    : `// Executing: ${execStep?.label ?? ''}\n// Watch the flowchart to see each stage light up.`;

  const highlightLines = buildStep?.highlightLines;
  const concept = buildStep?.concept;
  const stageOutput = execStep?.stageOutput;

  return (
    <div className="h-full flex flex-col bg-bg text-gray-100">
      <Header
        lessons={lessons}
        lessonIndex={lessonIndex}
        selectLesson={selectLesson}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        phase={phase}
      />

      <SplitLayout
        left={
          <CodePanel
            code={code}
            highlightLines={highlightLines}
            concept={concept}
          />
        }
        right={
          <div className="flex flex-col h-full">
            <FlowchartPanel nodes={nodes} edges={edges} />
            {phase === 'execute' && (
              <NarrativePanel lines={narrativeLines} stageOutput={stageOutput} />
            )}
          </div>
        }
      />

      <StepControls
        currentStep={currentStep}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        canGoNext={canGoNext}
        canGoPrev={canGoPrev}
        nextStep={nextStep}
        prevStep={prevStep}
        goToStep={goToStep}
        phase={phase}
      />
    </div>
  );
}

export default App;
