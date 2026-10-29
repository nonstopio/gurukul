import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'MEDIAN-TIME-TO-FINISH',
  title: 'Course analytics shows the median time to finish',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'One learner who left a course open for months dragged the average far above what most people ' +
    'took, so the number could not tell you how long to plan for.',
  detail: [
    'The course analytics page now leads with the median days from start to finish, with the average beside it.',
    'Courses finished before this change show the median after the next nightly count.',
  ],
} satisfies ChangelogEntry;
