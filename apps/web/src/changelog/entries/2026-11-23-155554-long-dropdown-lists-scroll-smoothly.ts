import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-23',
  id: 'SELECT-SCROLL',
  title: 'Long dropdown lists scroll smoothly',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'Scrolling a long dropdown, such as the Lesson or Quiz picker in an AI session, kept jumping ' +
    'back to the highlighted option, so the options further down were hard to reach.',
  detail: [
    'The list now stays where you scroll it; the arrow keys still bring the highlighted option into view.',
  ],
} satisfies ChangelogEntry;
