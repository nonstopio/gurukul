import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'LEARN-IMAGE-CAPTIONS',
  title: 'Image captions read as the picture’s label',
  area: 'LEARN',
  kind: 'fix',
  why:
    'With a rule down its left side, an image caption looked like a quote or a stray note in the ' +
    'lesson rather than a label for the picture above it.',
  detail: [
    'The caption now sits just under the image, in small quiet text, with no rule beside it.',
  ],
} satisfies ChangelogEntry;
