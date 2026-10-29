import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'COURSES-AND-LESSONS-IN-SEARCH',
  title: 'Search finds courses and lessons, not only pages',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Getting back to one lesson meant opening the catalogue, the course and its outline in turn; ' +
    'now typing a few words of its title in search (Ctrl K or ⌘K) opens it directly.',
  detail: [
    'Every published course and each of its lessons, shown with its course and chapter.',
    'Retired courses say so. Quizzes still open from the course outline, in order.',
  ],
} satisfies ChangelogEntry;
