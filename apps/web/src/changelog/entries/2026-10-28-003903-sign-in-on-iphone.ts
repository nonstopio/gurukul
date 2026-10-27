import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'SIGN-IN-ON-IPHONE',
  title: 'Sign-in works on iPhone and iPad, and a wrong account can switch',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'Safari on iPhone and iPad blocks or loses the Google sign-in popup, so many people could ' +
    'not get in from their phones at all. And someone signed in to a personal Google account ' +
    'was refused with no way to pick their NonStop one.',
  detail: [
    'On iPhone and iPad, and in any browser that blocks the popup, sign-in now goes to Google and comes back.',
    'Closing the Google popup no longer shows an error.',
    'When the wrong account is used, the message names it and "Try another account" opens Google’s account picker.',
  ],
} satisfies ChangelogEntry;
