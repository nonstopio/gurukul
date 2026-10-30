import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'LEARN-CATALOGUE',
  title: 'The catalogue has search, filter chips, sorting and a result count',
  area: 'LEARN',
  kind: 'feature',
  why:
    'One level dropdown and a switch was not enough to find a course once there were more than a ' +
    'handful, and it was unclear why a list was short.',
  detail: [
    'Search by title or summary; show All, Assigned to me, In progress or Completed; pick a level; sort by newest, title or length.',
    'The result count says how many of the courses you can open are shown, and "Clear all filters" brings the rest back.',
    'Each card says who can open the course. The filters stay in the address, so Back and reload keep them.',
  ],
} satisfies ChangelogEntry;
