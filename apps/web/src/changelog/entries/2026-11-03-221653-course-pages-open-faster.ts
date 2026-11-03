import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'COURSE-PAGES-OPEN-FASTER',
  title: 'Moving through a course no longer waits on every page',
  area: 'LEARN',
  kind: 'fix',
  why:
    'Each step from the course outline to a lesson, a Quiz, its result and the completion screen ' +
    'downloaded the whole course again and showed a loader while it did.',
  detail: [
    'A course is loaded once and reused for a few minutes, so the next page opens straight away.',
    'A course an Educator has just published reaches learners within five minutes; Studio always shows the latest.',
  ],
} satisfies ChangelogEntry;
