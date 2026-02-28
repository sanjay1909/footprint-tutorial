import { useState, useEffect, useRef } from 'react';
import type { BuildStep, ExecuteStep, Phase } from '../tutorial/types';

interface StepControlsProps {
  currentStep: BuildStep | ExecuteStep;
  stepIndex: number;
  totalSteps: number;
  canGoNext: boolean;
  canGoPrev: boolean;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (i: number) => void;
  phase: Phase;
}

const PLAY_INTERVAL_MS = 2000;

export function StepControls({
  currentStep,
  stepIndex,
  totalSteps,
  canGoNext,
  canGoPrev,
  nextStep,
  prevStep,
  goToStep,
  phase,
}: StepControlsProps) {
  const explanation = 'explanation' in currentStep ? currentStep.explanation : currentStep.label;

  const [isPlaying, setIsPlaying] = useState(false);
  const nextStepRef = useRef(nextStep);
  const canGoNextRef = useRef(canGoNext);
  nextStepRef.current = nextStep;
  canGoNextRef.current = canGoNext;

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      if (canGoNextRef.current) {
        nextStepRef.current();
      } else {
        setIsPlaying(false);
      }
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying]);

  // Stop playing when lesson/phase changes
  useEffect(() => {
    setIsPlaying(false);
  }, [phase]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else if (canGoNext) {
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface border-t border-border shrink-0">
      <button
        onClick={prevStep}
        disabled={!canGoPrev || isPlaying}
        className="px-3 py-1.5 bg-surface2 text-gray-300 rounded border border-border hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
      >
        Prev
      </button>

      <button
        onClick={togglePlay}
        disabled={!canGoNext && !isPlaying}
        className={`px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          isPlaying
            ? 'bg-orange/20 text-orange border-orange/40 hover:bg-orange/30'
            : 'bg-accent/20 text-accent border-accent/40 hover:bg-accent/30'
        }`}
        title={isPlaying ? 'Pause auto-play' : 'Auto-play through steps'}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <input
        type="range"
        min={0}
        max={totalSteps - 1}
        value={stepIndex}
        onChange={e => { setIsPlaying(false); goToStep(Number(e.target.value)); }}
        className="flex-1 h-1 accent-accent cursor-pointer"
      />

      <button
        onClick={nextStep}
        disabled={!canGoNext || isPlaying}
        className="px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-surface2 text-gray-300 border-border hover:border-accent"
      >
        Next
      </button>

      <div className="h-4 w-px bg-border" />

      <p className="text-sm text-gray-400 flex-1 truncate">
        {explanation}
      </p>
    </div>
  );
}
