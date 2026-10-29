import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'GURUKUL-GLOBAL-SEARCH',
  title: 'Press Ctrl K (⌘K on a Mac) to search for any page',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'As Gurukul grows into a learner app, an Admin console and Studio, finding a page by ' +
    'clicking through menus gets slower for everyone. One search box that knows every page you are ' +
    'allowed to open is faster than any menu.',
  detail: [
    'Open it with Ctrl K, ⌘K on a Mac, or the Search button in the top corner of every page.',
    'Arrow keys move, Enter opens, Escape closes; it searches page names, areas and other words people use for them.',
    'It only ever shows pages you can open, and only pages that exist today.',
  ],
} satisfies ChangelogEntry;
