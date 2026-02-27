import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDebuggerTutorial } from '../debugger/useDebuggerTutorial';
import { Header } from '../layout/Header';
import { TripleLayout } from '../layout/TripleLayout';
import { StepControls } from '../layout/StepControls';
import { CodePanel } from '../panels/CodePanel';
import { FlowchartPanel } from '../panels/FlowchartPanel';
import { NarrativePanel } from '../panels/NarrativePanel';
import { MemoryInspectorPanel } from '../panels/MemoryInspectorPanel';
import { useFlowLayout } from '../panels/useFlowLayout';

export function DebuggerPage() {
  const tutorial = useDebuggerTutorial();

  const {
    lessons,
    lessonIndex,
    selectLesson,
    stepIndex,
    totalSteps,
    phase,
    canGoNext,
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
  } = tutorial;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && canGoNext) nextStep();
      if (e.key === 'ArrowLeft' && canGoPrev) prevStep();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canGoNext, canGoPrev, nextStep, prevStep]);

  const { nodes, edges } = useFlowLayout(
    flowNodes,
    flowEdges,
    newNodeIds,
    activeNodeId,
    activeEdgeIds,
    phase === 'execute',
  );

  // Build a minimal currentStep-like object for StepControls
  const currentStep = phase === 'build'
    ? tutorial.lesson.buildSteps[stepIndex]
    : {
        id: currentSnapshot?.stageName ?? '',
        label: `Executing: ${currentSnapshot?.stageName ?? ''}`,
        explanation: `Step ${stepIndex + 1} — inspect the Memory Inspector panel →`,
      };

  return (
    <div className="h-full flex flex-col bg-bg text-gray-100">
      <Header
        lessons={lessons as any}
        lessonIndex={lessonIndex}
        selectLesson={selectLesson}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        phase={phase}
        navLink={<Link to="/" className="text-xs text-accent hover:text-accent/80 transition-colors">← Tutorial</Link>}
      />

      <TripleLayout
        left={
          <CodePanel
            code={code}
            highlightLines={highlightLines}
            concept={concept}
          />
        }
        center={
          <div className="flex flex-col h-full">
            <FlowchartPanel nodes={nodes} edges={edges} />
            {phase === 'execute' && narrativeLines.length > 0 && (
              <NarrativePanel
                lines={narrativeLines}
                stageOutput={currentSnapshot?.stageOutput ? JSON.stringify(currentSnapshot.stageOutput) : undefined}
              />
            )}
          </div>
        }
        right={
          <MemoryInspectorPanel
            currentSnapshot={currentSnapshot}
            previousSnapshot={previousSnapshot}
            narrativeLines={narrativeLines}
            phase={phase}
          />
        }
      />

      <StepControls
        currentStep={currentStep as any}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        canGoNext={canGoNext}
        canGoPrev={canGoPrev}
        nextStep={nextStep}
        prevStep={prevStep}
        goToStep={goToStep}
        phase={phase}
      />

      {isRunning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface2 rounded-lg px-6 py-4 border border-border">
            <p className="text-sm text-accent animate-pulse">Running pipeline...</p>
          </div>
        </div>
      )}
    </div>
  );
}
