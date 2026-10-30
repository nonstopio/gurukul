import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'SIGNIN-FIRST-TRY',
  title: 'Signing in takes you to Home on the first try',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'After Google sign-in the sign-in page stayed put with nothing happening, so people clicked ' +
    'again, sometimes twice more, before Home opened.',
  detail: [
    'Between Google sign-in and Home you see the loading screen, not the sign-in button again.',
    'If Gurukul cannot load your profile it says so and the next try starts afresh, instead of waiting forever.',
  ],
} satisfies ChangelogEntry;
