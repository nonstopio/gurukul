import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'LRN-21',
  title: 'Small tips point out what each page can do',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Search, the theme switch and the name choice were easy to miss, and nobody should have to ' +
    'hunt for what Gurukul can do. A dot on the feature, with one sentence, teaches it where you are.',
  detail: [
    'The first tip on a page opens by itself once; the others wait as dots you can click.',
    '"Got it", or using the feature, dismisses a tip for good. Close or Escape keeps the dot.',
    'Turn tips off, or on again to see them all, under Preferences on your Profile.',
  ],
} satisfies ChangelogEntry;
