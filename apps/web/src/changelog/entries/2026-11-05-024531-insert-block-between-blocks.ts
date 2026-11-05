import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'INSERT-BLOCK',
  title: 'Add a block anywhere in a lesson, not only at the end',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A block could only be added at the bottom of a lesson and then dragged up into place, ' +
    'which is slow in a long lesson and awkward from the keyboard.',
  detail: [
    'A small plus above each block opens the block types; the one you choose goes in right ' +
      'there and takes the focus.',
    'The plus is quiet until you point at it, and every one can be reached with Tab.',
  ],
} satisfies ChangelogEntry;
