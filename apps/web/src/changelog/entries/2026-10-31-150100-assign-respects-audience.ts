import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'ADMIN-ASSIGN-AUDIENCE',
  title: 'Assigning a team-only or staff-only course skips people it would not open for',
  area: 'ADMIN',
  kind: 'fix',
  why: 'Those people got an email with a link that did not open and a permanent Not started row; they now appear in the "could not be saved" list instead.',
} satisfies ChangelogEntry;
