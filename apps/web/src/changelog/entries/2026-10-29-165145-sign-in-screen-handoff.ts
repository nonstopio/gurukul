import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'SIGN-IN-HANDOFF',
  title: 'A sign-in screen that says what Gurukul is for',
  area: 'LEARN',
  kind: 'feature',
  why:
    'The old screen was a logo and a button, so a new joiner had no idea what they were signing ' +
    'in to or why a course might already be waiting.',
  detail: [
    'Three short reasons to sign in, a note for people assigned a course before their first visit, and a reminder that only work accounts can sign in.',
    'On a phone the page stacks and the list of reasons steps aside.',
  ],
} satisfies ChangelogEntry;
