import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'SIGN-IN-STATES',
  title: "The sign-in button shows Google's mark and says when it is working",
  area: 'LEARN',
  kind: 'feature',
  why:
    "Google's popup can take a moment to open, and a button that looks idle invites a second click. " +
    'The button now shows it is busy, and carries the Google mark so it reads as a Google sign-in.',
  detail: [
    'While sign-in is in progress the button is disabled and reads "Signing in…".',
    'The sign-in page carries a short line of Sanskrit with its meaning.',
  ],
} satisfies ChangelogEntry;
