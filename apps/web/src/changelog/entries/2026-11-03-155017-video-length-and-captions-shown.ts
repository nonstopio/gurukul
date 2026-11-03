import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'VIDEO-META',
  title: 'A lesson video says how long it is and whether it has captions',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Educators already enter a video’s length and whether it has captions, but learners never saw ' +
    'either, so they started a video not knowing if it would take two minutes or twenty.',
  detail: [
    'A line above the video reads, for example, "≈ 7 min · Captions available".',
    'It shows only what the Educator filled in, in lessons and in the Studio preview.',
  ],
} satisfies ChangelogEntry;
