import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'HOME-STATUS-ACTIVITY',
  title: 'Home tells you where you stand and what you did lately',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Home showed a bare title and a bar, so you had to open a course to remember how far along ' +
    'you were or what came next, and a long assigned list pushed everything else out of view.',
  detail: [
    'A line under your name says how far through the course you are and what is left in the chapter.',
    'The continue card shows its cover, level, due date and the lesson that comes up next.',
    'Assigned courses carry a cover tile, the first ten show with a Show all button, and a recent activity list sits below.',
  ],
} satisfies ChangelogEntry;
