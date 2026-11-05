import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'SPACING-POLISH',
  title: 'Tidier spacing in toasts, the course page and the Studio visibility picker',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'A one-line toast sat its text above the icon and close button, the pass mark line crowded the ' +
    'counts above it, and the visibility picker ran its controls together, so each looked unfinished.',
  detail: [
    'A one-line toast centres its icon, text and close button on one line.',
    'The pass mark line on a course page has room above it.',
    'In Studio, the visibility picker spaces its choice, hint and teams evenly.',
  ],
} satisfies ChangelogEntry;
