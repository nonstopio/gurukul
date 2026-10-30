import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'CODE-HEADER',
  title: 'A command and what it prints back look different in lessons',
  area: 'DESIGN',
  kind: 'fix',
  why:
    'A command and its reply sat one above the other in the same dark frame, both labelled terminal, ' +
    'so you could not tell what to type from what you should see.',
  detail: [
    'Replies are labelled output, have no $ prompt and sit on a lighter ground.',
    'Commands keep the terminal frame and the Copy button.',
  ],
} satisfies ChangelogEntry;
