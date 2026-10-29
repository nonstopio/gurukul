import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'STUDIO-LESSON-EXTRAS',
  title: 'Studio previews videos, opens the block palette on "/" and shows first-try scores',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Acharyas had to leave the editor to check a video link, reached for the mouse to add every ' +
    'block, and could only see that a question was hard, not how hard.',
  detail: [
    'A video block shows a 16:9 preview as soon as its link is recognised.',
    'Press "/" outside a text field, or in an empty one, to jump to the block palette.',
    'The question list shows the first-try percentage beside each question.',
  ],
} satisfies ChangelogEntry;
