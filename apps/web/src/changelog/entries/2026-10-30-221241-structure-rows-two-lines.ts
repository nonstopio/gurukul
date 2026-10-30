import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-ROWS',
  title: 'Chapters and lessons in Studio have clear, different actions',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Collapse, Rename and Delete all looked like the same green text link, so a delete read like any ' +
    'other action and each row laid itself out differently.',
  detail: [
    'Each row is two lines: what it is, then what you can do with it.',
    'Rename and Collapse are grey, Add is green, and Delete is red with a bin icon at the end of the row.',
    'Add and Import buttons across Studio carry an icon too.',
  ],
} satisfies ChangelogEntry;
