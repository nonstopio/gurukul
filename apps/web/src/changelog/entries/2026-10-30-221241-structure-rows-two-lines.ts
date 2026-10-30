import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-ROWS',
  title: 'Chapters and lessons in Studio are one clean line, and the whole card opens',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Collapse, Rename and Delete were the same green text link on every row, so a delete read like ' +
    'any other action, and only the title was clickable.',
  detail: [
    'Each lesson and Quiz is one line with its number; click anywhere on it to open it.',
    'Rename, move and delete are small icons with a tooltip, and delete is red.',
    'Add and Import buttons across Studio carry an icon too.',
  ],
} satisfies ChangelogEntry;
