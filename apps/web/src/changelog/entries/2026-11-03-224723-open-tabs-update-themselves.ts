import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'OPEN-TABS-UPDATE-THEMSELVES',
  title: 'A tab left open picks up the latest version by itself',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'A tab opened before an update kept running the old version for as long as it stayed open, ' +
    'so a fix already released never reached it.',
  detail: [
    'When you come back to the tab, or every ten minutes while you look at it, it checks for a newer version and reloads.',
    'It never reloads during a Quiz, in a Studio editor or while offline; it waits until you have left the page.',
  ],
} satisfies ChangelogEntry;
