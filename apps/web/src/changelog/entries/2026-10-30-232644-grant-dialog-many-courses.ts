import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-GRANT-MANY-COURSES',
  title: 'Choosing courses an Educator may edit stays short with many courses',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'The grant dialog listed every course as a large tile, so with dozens of courses it became a very ' +
    'long scroll with no way to find one.',
  detail: [
    'Search courses, see the first six and how many there are, and press Show more for the rest.',
  ],
} satisfies ChangelogEntry;
