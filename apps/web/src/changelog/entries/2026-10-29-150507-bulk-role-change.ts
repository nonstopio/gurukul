import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'BULK-ROLE-CHANGE',
  title: 'Change the role of several learners at once',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'Making a whole cohort Acharyas meant opening Roles & access and granting one person at a ' +
    'time; the "Change role" button on Learners only linked there.',
  detail: [
    'Select people, choose Change role, pick Shishya, Acharya or Kulapati.',
    'Pending invites and your own account are skipped and counted, never failed.',
  ],
} satisfies ChangelogEntry;
