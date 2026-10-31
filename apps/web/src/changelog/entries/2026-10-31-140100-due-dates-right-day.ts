import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'LEARN-DUE-DAY',
  title: 'Due dates count calendar days, and finished courses stop showing Overdue',
  area: 'LEARN',
  kind: 'fix',
  why: 'A deadline of the 5th read "Due in 1 day" on the 5th and only turned Overdue a day late; a course finished on time could still read Overdue.',
} satisfies ChangelogEntry;
