import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-04',
  id: 'FINISHED-COURSES',
  title: 'A finished course says so, in the catalogue and on its page',
  area: 'LEARN',
  kind: 'fix',
  why:
    'A course at 100% still offered "Resume", as if something were left, and the catalogue ' +
    'gave no sign of which courses you had already finished.',
  detail: [
    'Catalogue cards carry a Completed badge once you finish a course.',
    'A finished course offers "Review course" from the first lesson, and your certificate comes first.',
  ],
} satisfies ChangelogEntry;
