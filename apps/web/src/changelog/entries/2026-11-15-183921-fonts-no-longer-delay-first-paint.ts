import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-15',
  id: 'GH-110',
  title: 'Gurukul shows up without waiting for its fonts',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    "The page stayed blank, loading animation included, until Google's font server answered. " +
    'On a slow or office network that could be seconds of white screen before anything moved.',
  detail: [
    'The loader and the page now draw at once in a system font, and the Gurukul typefaces replace it when they arrive. On a slow connection you may see the text change face a moment after the page opens.',
  ],
} satisfies ChangelogEntry;
