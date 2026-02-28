import type { PhaseModal, ExecutionResult } from '../wizard/types';

interface WizardModalProps {
  config: PhaseModal;
  slideIndex: number;
  onNextSlide: () => void;
  onPrevSlide: () => void;
  onAction: () => void;
  execution?: ExecutionResult;
}

export function WizardModal({
  config,
  slideIndex,
  onNextSlide,
  onPrevSlide,
  onAction,
  execution,
}: WizardModalProps) {
  const slide = config.slides[slideIndex];
  const isLastSlide = slideIndex === config.slides.length - 1;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-[fadeIn_200ms_ease-out]">
      <div className="bg-surface2 rounded-xl border border-border shadow-2xl max-w-lg w-full mx-4 animate-[scaleIn_300ms_ease-out]">
        {/* Slide content */}
        <div className="p-6" key={slideIndex}>
          <h2 className="text-lg font-bold text-gray-100 mb-3">{slide.title}</h2>
          <p className="text-sm text-gray-300 leading-relaxed">{slide.body}</p>

          {slide.bullets && (
            <ul className="mt-3 space-y-1.5">
              {slide.bullets.map((bullet, i) => (
                <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                  <span className="text-accent mt-0.5 shrink-0">&#x2022;</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          {slide.jsonPreview && execution && (
            <div className="mt-4 rounded-lg border border-border bg-bg/50 p-3 max-h-48 overflow-auto">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-2 font-semibold">Traversal JSON</p>
              <pre className="text-[11px] text-cyan/80 font-mono leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(
                  execution.stageSnapshots.map(s => ({
                    stage: s.stageName,
                    step: s.stepNumber,
                    scopeKeys: Object.keys(extractPipelineState(s.scopeState)),
                    output: s.stageOutput,
                  })),
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Footer: dots + navigation */}
        <div className="px-6 pb-5 flex items-center justify-between">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {config.slides.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  i === slideIndex ? 'bg-accent w-4' : 'bg-border'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            {slideIndex > 0 && (
              <button
                onClick={onPrevSlide}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Back
              </button>
            )}
            {isLastSlide ? (
              <button
                onClick={onAction}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-green/20 text-green border border-green/40 hover:bg-green/30 transition-colors"
              >
                {config.actionLabel}
              </button>
            ) : (
              <button
                onClick={onNextSlide}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function extractPipelineState(scopeState: Record<string, unknown>): Record<string, unknown> {
  const state = scopeState as any;
  if (state?.pipelines) {
    const keys = Object.keys(state.pipelines);
    if (keys.length === 1) {
      const ps = state.pipelines[keys[0]];
      return ps?.pipeline ?? ps ?? {};
    }
    return state.pipelines;
  }
  return state;
}
