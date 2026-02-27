import type { DebuggerLessonConfig } from '../debugger/types';
import { scopeAndMemory } from './01-scope-and-memory';
import { recorderDebugger } from './02-recorder-debugger';
import { metricsLesson } from './03-metrics';
import { narrativeConstruction } from './04-narrative-construction';

export const debuggerLessons: DebuggerLessonConfig[] = [
  scopeAndMemory,
  recorderDebugger,
  metricsLesson,
  narrativeConstruction,
];
