import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-129',
  title: 'A sign-in that cannot finish says so and lets you sign out',
  area: 'PLATFORM',
  kind: 'fix',
  why: 'When your account record was slow to appear or missing, Gurukul showed its loading screen for ever, with no explanation and no way to sign out and try another account.',
  detail: [
    'After 10 seconds you see "Still setting up your account", with Retry (reloads the page) and Sign out.',
    'If the account finishes setting up while the message shows, you go straight in without clicking.',
  ],
} satisfies ChangelogEntry;
