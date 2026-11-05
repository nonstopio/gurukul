import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'PROGRESS-IN-STEPS',
  title: 'The lesson top bar shows your progress one step per lesson and Quiz',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A thin bar and "4% · 1 / 26" said little about where you were in the course; a step for ' +
    'every lesson and Quiz shows what is done, where you are and how much is left at a glance.',
  detail: [
    'Each lesson and Quiz is its own segment: filled when done, ringed for the one you are on.',
    'The count reads "1 of 26 done". Courses with more than 40 items keep one continuous bar.',
  ],
} satisfies ChangelogEntry;
