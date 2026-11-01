import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'ROLES-PAGES',
  title: 'Roles and access lists Educators and Admins 25 at a time',
  area: 'ADMIN',
  kind: 'feature',
  why: 'As more people are granted roles, two ever-longer lists made the page slow to scan and to load. Each list now shows one page at a time.',
  detail: [
    'Under Educators and under Admins, Previous and Next move through 25 people at a time.',
    'The pager only appears when a list has more than 25 people.',
  ],
} satisfies ChangelogEntry;
