import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'SIGNIN-CALM',
  title: 'The sign-in page is calmer and shows what you are signing in to',
  area: 'PLATFORM',
  kind: 'feature',
  why: 'The first screen anyone sees should say what Gurukul is and ask for one thing, in light or dark.',
  detail: [
    'One sign-in button with a quiet note about work accounts, a drawn course card with progress and a certificate seal, and the same look in both themes.',
  ],
} satisfies ChangelogEntry;
