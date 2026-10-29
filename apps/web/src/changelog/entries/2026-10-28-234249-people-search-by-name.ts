import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'PEOPLE-SEARCH-BY-NAME',
  title: 'Find people by name, not only by email',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'You know a colleague as "Ananya", not as the exact spelling of her email address. Searching ' +
    'only by email meant guessing how an address was written before you could assign a course ' +
    'or grant a role.',
  detail: [
    'Learners, Assign and the grant-a-role dialog find people whose name or email starts with what you type.',
    'Typing quickly never leaves results for an earlier word on screen.',
    'People who signed in before this change become findable by name the next time they sign in.',
  ],
} satisfies ChangelogEntry;
