import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'STUDIO-VIDEO-TITLE-CAPTION',
  title: 'Studio sets a title and caption on a video',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The player could already show a title and caption under a video, but there was nowhere in ' +
    'Studio to write them, so a video only ever showed its bare link.',
  detail: [
    'The video block has optional Title and Caption fields; leave one empty and the learner sees nothing for it.',
  ],
} satisfies ChangelogEntry;
