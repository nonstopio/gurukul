import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'CODE-HEADER',
  title: 'Code and terminal blocks in a lesson have the same header height',
  area: 'DESIGN',
  kind: 'fix',
  why:
    'A command and its output sat one above the other, but the output block has no Copy button and ' +
    'its header shrank to a thin strip, so the pair looked like two different designs.',
  detail: ['Every block keeps the same header, with or without a Copy button.'],
} satisfies ChangelogEntry;
