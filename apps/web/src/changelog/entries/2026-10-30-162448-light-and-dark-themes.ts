import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'THEME-LIGHT-DARK',
  title: 'Gurukul has a light and a dark theme, clearer colours and a branded loader',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'The old colours were hard to read and the sidebar was a heavy black slab. People who learn in the ' +
    'evening or on a bright screen could not choose what suits their eyes, and the page showed nothing ' +
    'while it loaded.',
  detail: [
    'Choose System, Light or Dark from the account menu or Profile. The choice is remembered on this device.',
    'Text and control edges now meet accessible contrast in both themes, and the sidebar follows the theme.',
    'A Gurukul loader shows while the site starts, instead of a blank page.',
  ],
} satisfies ChangelogEntry;
