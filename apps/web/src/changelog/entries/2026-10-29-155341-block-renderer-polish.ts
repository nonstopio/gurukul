import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'BLOCK-RENDERER-POLISH',
  title: 'Lesson blocks show what the Acharya wrote for them',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Every video was called "Lesson video" and every code listing had a Copy button, even when the ' +
    'Acharya turned copying off or wrote a caption, so the lesson said less than its author meant.',
  detail: [
    'A video shows its own title and caption.',
    'A code block with copying turned off has no Copy button.',
    'Downloadable files carry a small file icon.',
  ],
} satisfies ChangelogEntry;
