import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'PLATFORM-BRAND-LOGOS',
  title: 'The NonStop logo follows light and dark mode, and the tab shows the N icon',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'The old logo was a white image forced onto a green box, and the browser tab used it as its icon. ' +
    'The official logos now sit directly on the page in the right colour, and the tab, phone home screen and bookmarks get the green N.',
} satisfies ChangelogEntry;
