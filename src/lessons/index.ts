import type { TutorialLesson } from '../tutorial/types';
import { helloPipeline } from './01-hello-pipeline';
import { parallelForkJoin } from './02-parallel-fork-join';
import { deciderBranching } from './03-decider-branching';
import { narrativeLesson } from './04-narrative';
import { fullAgent } from './05-full-agent';

export const lessons: TutorialLesson[] = [
  helloPipeline,
  parallelForkJoin,
  deciderBranching,
  narrativeLesson,
  fullAgent,
];
