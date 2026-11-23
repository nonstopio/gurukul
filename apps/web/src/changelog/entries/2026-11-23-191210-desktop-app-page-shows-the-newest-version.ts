import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-23',
  id: 'DESKTOP-LATEST',
  title: 'The Desktop app page offers the newest version as soon as it is out',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A tab opened before a new Gurukul Studio release kept offering the older version until the ' +
    'tab was closed, so Educators could download a version that was already out of date.',
  detail: [
    'The page asks for the latest version each time it opens.',
    'If that check fails, it shows the last version it found instead of only a link to all releases.',
  ],
} satisfies ChangelogEntry;
