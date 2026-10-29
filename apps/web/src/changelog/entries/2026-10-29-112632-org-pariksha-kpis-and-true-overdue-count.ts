import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ORG-QUIZ-KPIS',
  title:
    'Overview shows the org’s Quiz score and first-try pass rate, and every overdue assignment',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'An Admin could see who finished but not how well people were learning, and the overdue ' +
    'figure only looked at the newest 500 assignments, so an org with more than that was told ' +
    'fewer people were late than really were.',
  detail: [
    'Average Quiz score across every graded attempt, and the share of first attempts that passed.',
    'Both count attempts graded from now on; earlier attempts are not in them.',
    'Overdue assignments is counted across every assignment, not the newest 500.',
  ],
} satisfies ChangelogEntry;
