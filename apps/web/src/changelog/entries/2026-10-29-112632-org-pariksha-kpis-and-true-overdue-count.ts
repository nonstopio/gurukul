import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ORG-PARIKSHA-KPIS',
  title:
    'Overview shows the org’s Pariksha score and first-try pass rate, and every overdue assignment',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'A Kulapati could see who finished but not how well people were learning, and the overdue ' +
    'figure only looked at the newest 500 assignments, so an org with more than that was told ' +
    'fewer people were late than really were.',
  detail: [
    'Average Pariksha score across every graded attempt, and the share of first attempts that passed.',
    'Both count attempts graded from now on; earlier attempts are not in them.',
    'Overdue assignments is counted across every assignment, not the newest 500.',
  ],
} satisfies ChangelogEntry;
