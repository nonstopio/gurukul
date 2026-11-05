import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'BRAND-LOADER',
  title: 'Gurukul opens with its own G while it loads',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'The loading screen showed a spinning ring around a flame that appeared nowhere else in ' +
    'Gurukul, so the first thing people saw did not look like the product they were opening.',
  detail: [
    'While Gurukul starts, the G from the logo draws itself on its green tile, alone in the ' +
      'middle of the screen.',
    'Pages that load part of a screen show the same G.',
    'With reduced motion turned on, the G only fades gently and nothing moves.',
  ],
} satisfies ChangelogEntry;
