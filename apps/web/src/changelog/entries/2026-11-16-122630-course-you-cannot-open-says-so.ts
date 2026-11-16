import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-122',
  title: 'A course you cannot open now says so, instead of asking you to check your connection',
  area: 'LEARN',
  kind: 'fix',
  why: 'A link to a draft, a course limited to other teams or a course that was removed showed "This did not load" with a Retry button that could never work, so people blamed their network.',
  detail: [
    'The page now says "This course does not exist or is not open to you", with a button to the catalogue. It does not say which of the two it is.',
    'A real connection problem still shows Retry.',
  ],
} satisfies ChangelogEntry;
