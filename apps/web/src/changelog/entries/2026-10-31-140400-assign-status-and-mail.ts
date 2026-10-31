import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'ADMIN-ASSIGN-STATUS-MAIL',
  title:
    'Assigning a started or finished course is not overdue, and a mail hiccup no longer repeats reminders',
  area: 'ADMIN',
  kind: 'fix',
  why: 'A course someone had already finished stayed "assigned" and turned overdue, and one failed email aborted an assignment or re-sent reminders to people already emailed.',
} satisfies ChangelogEntry;
