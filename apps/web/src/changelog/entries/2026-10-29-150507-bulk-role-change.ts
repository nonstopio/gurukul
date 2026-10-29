import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'BULK-ROLE-CHANGE',
  title: 'Change the role of several learners at once',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Making a whole cohort Educators meant opening Roles & access and granting one person at a ' +
    'time; the "Change role" button on Learners only linked there.',
  detail: [
    'Select people, choose Change role, pick Learner, Educator or Admin.',
    'Pending invites and your own account are skipped and counted, never failed.',
  ],
} satisfies ChangelogEntry;
