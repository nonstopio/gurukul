import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-15',
  id: 'FASTER-RETURNING-OPEN',
  title: 'Gurukul opens faster for people who are already signed in',
  area: 'PLATFORM',
  kind: 'ops',
  why: 'A returning learner waited for the page, then the sign-in check, then a 162 KB data download, one after the other, and that download also carried the Admin console and Studio code they never use.',
  detail: [
    'Someone who signed in before now starts that download while the sign-in check is still running, so their courses appear sooner.',
    'The Admin console and Studio data code is now a separate download that only Admins and Educators fetch. It was small, so this part saves a learner little.',
  ],
} satisfies ChangelogEntry;
