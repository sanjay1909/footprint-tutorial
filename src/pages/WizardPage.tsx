import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWizard } from '../wizard/useWizard';
import { wizardChapters } from '../wizard-chapters';
import { WizardHeader } from '../layout/WizardHeader';
import { WizardLayout } from '../layout/WizardLayout';
import { WizardModal } from '../layout/WizardModal';
import { StepControls } from '../layout/StepControls';
import { CodePanel } from '../panels/CodePanel';
import { FlowchartPanel } from '../panels/FlowchartPanel';
import { MemoryInspectorPanel } from '../panels/MemoryInspectorPanel';
import { ObservePanel } from '../panels/ObservePanel';
import { useFlowLayout } from '../panels/useFlowLayout';

export function WizardPage() {
  const w = useWizard(wizardChapters);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Modal keyboard: arrows navigate slides, Enter triggers action
      if (w.modalVisible) {
        if (e.key === 'ArrowRight') {
          if (w.modalConfig && w.modalSlideIndex < w.modalConfig.slides.length - 1) {
            w.nextModalSlide();
          }
        }
        if (e.key === 'ArrowLeft') w.prevModalSlide();
        if (e.key === 'Enter') {
          if (w.modalConfig && w.modalSlideIndex === w.modalConfig.slides.length - 1) {
            w.dismissModal();
          } else {
            w.nextModalSlide();
          }
        }
        return;
      }
      if (e.key === 'ArrowRight' && w.canGoNext) w.nextStep();
      if (e.key === 'ArrowLeft' && w.canGoPrev) w.prevStep();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [w.modalVisible, w.modalConfig, w.modalSlideIndex, w.canGoNext, w.canGoPrev, w.nextStep, w.prevStep, w.nextModalSlide, w.prevModalSlide, w.dismissModal]);

  // ReactFlow layout
  const { nodes, edges } = useFlowLayout(
    w.flowNodes as any,
    w.flowEdges as any,
    w.newNodeIds,
    w.activeNodeId,
    w.activeEdgeIds,
    !!w.activeNodeId,
  );

  // StepControls compatibility — needs { label, explanation }
  const controlStep = {
    id: w.currentStep?.id ?? '',
    label: w.currentStep?.label ?? w.phase.title,
    explanation: w.currentStep?.explanation ?? w.chapter.subtitle,
  };

  // Stable phase value: 'build' during the BUILD phase, 'execute' otherwise
  const isBuildPhase = w.phase.left === 'code' && w.phase.right === 'flowchart';
  const controlPhase = isBuildPhase ? 'build' as const : 'execute' as const;

  return (
    <div className="h-full flex flex-col bg-bg text-gray-100">
      <WizardHeader
        chapters={w.chapters}
        chapterIndex={w.chapterIndex}
        phaseIndex={w.phaseIndex}
        stepIndex={w.stepIndex}
        totalSteps={w.totalSteps}
        navLink={
          <Link to="/" className="text-xs text-accent hover:text-accent/80 transition-colors">
            ← Tutorial
          </Link>
        }
      />

      <WizardLayout
        left={w.phase.left}
        right={w.phase.right}
        isTransitioning={w.isTransitioning}
        panels={{
          code: (
            <div className="h-full overflow-auto">
              <CodePanel
                code={w.code}
                highlightLines={w.highlightLines}
                concept={w.concept}
              />
            </div>
          ),
          flowchart: (
            <div className="h-full flex flex-col">
              <FlowchartPanel nodes={nodes} edges={edges} />
            </div>
          ),
          memory: (
            <MemoryInspectorPanel
              currentSnapshot={w.currentSnapshot as any}
              previousSnapshot={w.previousSnapshot as any}
              narrativeLines={w.narrativeLines}
              phase={w.execution ? 'execute' : 'build'}
            />
          ),
          observe: (
            <ObservePanel
              execution={w.execution}
              currentSnapshot={w.currentSnapshot}
              narrativeLines={w.narrativeLines}
            />
          ),
        }}
      />

      <StepControls
        currentStep={controlStep as any}
        stepIndex={w.stepIndex}
        totalSteps={w.totalSteps}
        canGoNext={w.canGoNext}
        canGoPrev={w.canGoPrev}
        nextStep={w.nextStep}
        prevStep={w.prevStep}
        goToStep={w.goToStep}
        phase={controlPhase}
      />

      {/* Loading overlay during pipeline execution */}
      {w.isRunning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface2 rounded-lg px-6 py-4 border border-border shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-green border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-green">Running pipeline...</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal checkpoint between phases */}
      {w.modalVisible && w.modalConfig && (
        <WizardModal
          config={w.modalConfig}
          slideIndex={w.modalSlideIndex}
          onNextSlide={w.nextModalSlide}
          onPrevSlide={w.prevModalSlide}
          onAction={w.dismissModal}
          execution={w.execution ?? undefined}
        />
      )}
    </div>
  );
}
