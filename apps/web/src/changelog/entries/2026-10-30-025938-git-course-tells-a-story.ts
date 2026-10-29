import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'GIT-STORY',
  title: 'The Git course follows one story, in plain English, with diagrams',
  area: 'LEARN',
  kind: 'feature',
  why:
    'The first course read like a list of commands, which lost people who had never used a ' +
    'terminal. It now follows Meera, a new joiner looking after the tea counter menu, so every ' +
    'command has a reason and every idea has a picture.',
  detail: [
    'Ten diagrams: save points, the staging box, branches, merges, conflicts, GitHub, undo.',
    'Each hands-on step shows what Git prints back and says what it means.',
    'Chapter 4 now walks through putting the project on GitHub and signing in.',
  ],
} satisfies ChangelogEntry;
