import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'LEARN-COMPLETE-FIRST-OPEN',
  title: 'Finishing a lesson saves even when the course had only just started',
  area: 'LEARN',
  kind: 'fix',
  why:
    'Completing the first lesson right after opening a course could fail with "Could not save your ' +
    'progress", because the course was not yet recorded as started.',
} satisfies ChangelogEntry;
