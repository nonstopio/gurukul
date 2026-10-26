import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'GURUKUL-CHANGELOG',
  title: 'A changelog that says why each change was made',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    '"What changed" is already in git. What nobody can recover later is why, and a reason written ' +
    'in the same commit as the change is the only kind that stays true.',
  detail: [
    'Open /changelog to see every change, newest first, grouped by the release that shipped it.',
    'Search and filter by area or kind; the search covers the reasons, not only the titles.',
    'Releases are read from git tags at build time, so an entry can never claim the wrong release.',
  ],
  notes: [
    'Entries live in the repository rather than in Firestore so that a change with no entry is ' +
      'visible in review and the text cannot be edited after it ships.',
  ],
} satisfies ChangelogEntry;
