import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'SIGN-IN-HELP-ADDRESS',
  title: 'The sign-in page says where to write when sign-in fails',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Someone who could not sign in had no way to reach anyone from the page they were stuck on, ' +
    'so they had to guess who runs Gurukul.',
  detail: ['A line under the sign-in button links to gurukul@nonstopio.com.'],
} satisfies ChangelogEntry;
