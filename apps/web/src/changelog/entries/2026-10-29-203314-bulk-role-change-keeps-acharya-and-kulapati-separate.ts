import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'BULK-ROLE-INDEPENDENT',
  title: 'Change Acharya and Kulapati separately for several learners',
  area: 'KULAPATI',
  kind: 'fix',
  why:
    'The bulk dialog made Shishya, Acharya and Kulapati exclusive, so making someone an Acharya ' +
    'silently removed their Kulapati role, unlike the Roles screen where the two are independent.',
  detail: [
    'Change role now has one choice each for Acharya and Kulapati: leave as it is, add, or remove.',
    'Removing Acharya clears the courses that person was granted; adding it keeps them.',
  ],
} satisfies ChangelogEntry;
