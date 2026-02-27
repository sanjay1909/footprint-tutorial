import type { TutorialLesson } from '../tutorial/types';

interface HeaderProps {
  lessons: TutorialLesson[];
  lessonIndex: number;
  selectLesson: (i: number) => void;
  stepIndex: number;
  totalSteps: number;
  phase: 'build' | 'execute';
}

const difficultyColor = {
  beginner: 'text-green',
  intermediate: 'text-orange',
  advanced: 'text-red',
};

export function Header({ lessons, lessonIndex, selectLesson, stepIndex, totalSteps, phase }: HeaderProps) {
  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-surface border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-accent tracking-tight">FootPrint</span>
        <span className="text-sm text-muted">Tutorial</span>
      </div>

      <div className="h-4 w-px bg-border" />

      <select
        value={lessonIndex}
        onChange={e => selectLesson(Number(e.target.value))}
        className="bg-surface2 text-gray-200 text-sm px-3 py-1.5 rounded border border-border focus:outline-none focus:border-accent cursor-pointer"
      >
        {lessons.map((l, i) => (
          <option key={l.id} value={i}>
            {i + 1}. {l.title}
          </option>
        ))}
      </select>

      <span className={`text-xs font-medium ${difficultyColor[lessons[lessonIndex].difficulty]}`}>
        {lessons[lessonIndex].difficulty}
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-sm">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          phase === 'build'
            ? 'bg-accent/20 text-accent'
            : 'bg-green/20 text-green'
        }`}>
          {phase === 'build' ? 'BUILD' : 'EXECUTE'}
        </span>
        <span className="text-muted">
          Step {stepIndex + 1} / {totalSteps}
        </span>
      </div>
    </header>
  );
}
