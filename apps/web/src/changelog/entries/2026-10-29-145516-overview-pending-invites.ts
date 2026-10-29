import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'OVERVIEW-PENDING-INVITES',
  title: 'Overview counts every pending invite, not just recent ones',
  area: 'KULAPATI',
  kind: 'fix',
  why:
    'The Pending invites card only looked at the newest 500 assignments, so once the org grew ' +
    'past that it quietly undercounted people who had been assigned but not signed in.',
  detail: ['The count now matches the Pending tab on Learners, one per email.'],
} satisfies ChangelogEntry;
