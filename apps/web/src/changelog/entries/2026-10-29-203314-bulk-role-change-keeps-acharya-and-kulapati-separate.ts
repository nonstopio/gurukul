import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'BULK-ROLE-INDEPENDENT',
  title: 'Change Educator and Admin separately for several learners',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'The bulk dialog made Learner, Educator and Admin exclusive, so making someone an Educator ' +
    'silently removed their Admin role, unlike the Roles screen where the two are independent.',
  detail: [
    'Change role now has one choice each for Educator and Admin: leave as it is, add, or remove.',
    'Removing Educator clears the courses that person was granted; adding it keeps them.',
  ],
} satisfies ChangelogEntry;
