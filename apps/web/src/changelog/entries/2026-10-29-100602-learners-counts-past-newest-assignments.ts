import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'LEARNERS-COUNTS-ALL-INVITES',
  title: 'Learners counts every pending invite and every overdue learner',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'The Pending invite and Overdue tabs only looked at the newest 500 assignments, so someone ' +
    'invited months ago who never signed in, or an old overdue course, dropped out of the count ' +
    'and nobody chased them.',
  detail: [
    'The tab counts and the pending list now come from every unclaimed and every overdue assignment.',
  ],
} satisfies ChangelogEntry;
