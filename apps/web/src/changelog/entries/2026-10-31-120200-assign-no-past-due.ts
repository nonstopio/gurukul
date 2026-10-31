import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'ADMIN-ASSIGN-NO-PAST-DUE',
  title: 'A course can no longer be assigned with a due date in the past',
  area: 'ADMIN',
  kind: 'fix',
  why: 'An assignment due before it was made was overdue on day one and triggered reminders for nothing.',
} satisfies ChangelogEntry;
