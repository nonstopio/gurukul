import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'OLD-TABS-RELOAD-AFTER-DEPLOY',
  title: 'A tab left open across an update reloads instead of showing an error',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'Each update replaces the files a page loads on first open, so a tab opened before it showed ' +
    '"Something went wrong" at the next new page, such as the course completion screen.',
  detail: [
    'The page reloads once by itself and opens on the new version.',
    'If the page still cannot load straight after that, the error screen stays, so it never reloads in a loop.',
  ],
} satisfies ChangelogEntry;
