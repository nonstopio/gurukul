import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-SEARCH-LAST-NAME',
  title: 'Searching for people finds them by last name too',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'Search only matched the start of a full name or email, so typing a last name such as Ali ' +
    'found nobody even though Farhan Ali had signed in.',
  detail: [
    'Any word of a name matches: "ali" finds Farhan Ali, and "farhan al" does too.',
    'The people field searches from the first letter you type.',
  ],
} satisfies ChangelogEntry;
