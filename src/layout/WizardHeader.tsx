import type { ReactNode } from 'react';
import type { WizardChapter } from '../wizard/types';

interface WizardHeaderProps {
  chapters: WizardChapter[];
  chapterIndex: number;
  phaseIndex: number;
  stepIndex: number;
  totalSteps: number;
  navLink?: ReactNode;
}

const phaseColors: Record<string, { active: string; done: string }> = {
  build: { active: 'bg-accent/20 text-accent border-accent/40', done: 'bg-green/20 text-green border-green/40' },
  run: { active: 'bg-green/20 text-green border-green/40', done: 'bg-green/20 text-green border-green/40' },
  traverse: { active: 'bg-cyan/20 text-cyan border-cyan/40', done: 'bg-green/20 text-green border-green/40' },
  observe: { active: 'bg-orange/20 text-orange border-orange/40', done: 'bg-green/20 text-green border-green/40' },
};

function getPhaseColorKey(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('build')) return 'build';
  if (t.includes('run')) return 'run';
  if (t.includes('traverse')) return 'traverse';
  if (t.includes('observe')) return 'observe';
  return 'build';
}

export function WizardHeader({
  chapters,
  chapterIndex,
  phaseIndex,
  stepIndex,
  totalSteps,
  navLink,
}: WizardHeaderProps) {
  const chapter = chapters[chapterIndex];

  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-surface border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-accent tracking-tight">FootPrint</span>
        <span className="text-sm text-muted">Story</span>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Phase progress: BUILD → RUN → OBSERVE */}
      <div className="flex items-center gap-1">
        {chapter.phases.map((p, i) => {
          const colorKey = getPhaseColorKey(p.title);
          const colors = phaseColors[colorKey] ?? phaseColors.build;
          const isActive = i === phaseIndex;
          const isDone = i < phaseIndex;

          return (
            <div key={p.id} className="flex items-center gap-1">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border transition-all duration-300 ${
                  isActive
                    ? colors.active
                    : isDone
                      ? colors.done
                      : 'bg-surface2 text-muted border-border'
                }`}
              >
                {isDone ? '\u2713 ' : ''}{p.title}
              </span>
              {i < chapter.phases.length - 1 && (
                <span className={`text-[10px] ${isDone ? 'text-green/50' : 'text-muted/30'}`}>
                  {'\u2192'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      {navLink}

      <span className="text-xs text-muted">
        Step {stepIndex + 1} / {totalSteps}
      </span>
    </header>
  );
}
