import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-19',
  id: 'GH-171',
  title: 'Gurukul Studio, the desktop app, signs you in through your own browser',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Google does not allow its sign-in page inside another app’s window, so "Sign in with Google" ' +
    'could not work in the desktop app the way it does on the website.',
  detail: [
    'In the desktop app, "Sign in with Google" opens Google in your usual browser. Pick your @nonstopio.com account there, then come back: the app is signed in.',
    'Nothing changes on the website.',
  ],
} satisfies ChangelogEntry;
