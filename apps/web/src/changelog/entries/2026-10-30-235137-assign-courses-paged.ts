import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-ASSIGN-PAGED',
  title: 'Assigning courses shows twelve at a time, and Next is always in view',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'With many courses the first step became one very long page, and the Next button was at the bottom ' +
    'out of sight.',
  detail: [
    'Courses come twelve to a page with how many there are in all; search finds any course, and what you picked stays picked across pages.',
    'The Back and Next buttons stay at the bottom of the window on every step.',
  ],
} satisfies ChangelogEntry;
