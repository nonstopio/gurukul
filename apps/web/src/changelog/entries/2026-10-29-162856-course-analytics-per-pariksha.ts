import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'COURSE-ANALYTICS-QUIZ',
  title: 'Course analytics show each Quiz and link to the fix',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'A hard question was easy to spot but the fix meant finding the course in the Studio and ' +
    'then the question in the Quiz.',
  detail: [
    'The Quizzes table shows how many answers were counted and the share right first time.',
    'Numbers turn to the warning colour only below 70%.',
    'Edit question opens that question in the Quiz builder; Edit in Studio opens the course.',
  ],
} satisfies ChangelogEntry;
