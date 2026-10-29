import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ASSIGN-SCREEN-FINISH',
  title: 'Assign courses shows more, and lands on the course you assigned',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Choosing courses, adding a team and uploading a list gave little to go on, and afterwards ' +
    'you had to find the people you had just assigned among everyone.',
  detail: [
    'Each course shows its lesson count; a team shows how many people it holds before you add it.',
    'Drop a CSV file onto the Upload CSV tab instead of browsing for it.',
    'Assigning one course opens Learners already filtered to that course.',
  ],
} satisfies ChangelogEntry;
