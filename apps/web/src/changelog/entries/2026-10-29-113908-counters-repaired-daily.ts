import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'COUNTERS-REPAIRED-DAILY',
  title: 'Course and Quiz figures correct themselves every night',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'The course funnel, where learners stop, the hardest questions and the org’s Quiz score ' +
    'are kept as running totals, and a missed update stayed wrong for good. Attempts graded before ' +
    'the org Quiz figures existed were never in them either.',
  detail: [
    'Each night every course figure and the org’s started, completed, score and first-try pass rate are counted again from the learners’ progress and attempts.',
    'Earlier Quiz attempts now count in the org’s score and first-try pass rate.',
    'Lessons completed per week is not recounted: Gurukul does not store when each lesson was finished.',
  ],
} satisfies ChangelogEntry;
