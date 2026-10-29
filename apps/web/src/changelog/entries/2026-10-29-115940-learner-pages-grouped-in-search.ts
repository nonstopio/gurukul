import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'LEARNER-PAGES-GROUPED',
  title: 'Home, Catalogue and Certificates sit together under Learning',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Your own learning pages were filed under "Gurukul" alongside the changelog, so the sidebar ' +
    'and search did not say which pages were about your courses.',
  detail: [
    'The sidebar and search results show a Learning group: Home, Catalogue and Certificates.',
    'Search finds them by "learn" too; Home now says what it shows: your courses and what is due.',
  ],
} satisfies ChangelogEntry;
