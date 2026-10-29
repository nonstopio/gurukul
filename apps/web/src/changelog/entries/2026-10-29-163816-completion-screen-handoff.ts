import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'COMPLETION-SCREEN-HANDOFF',
  title: 'Finishing a course lands on a celebration screen with your next step ready',
  area: 'QUIZ',
  kind: 'feature',
  why:
    'The moment someone finishes a course is when they most want to share it and least know what ' +
    'to do next; the old screen was a plain page with two buttons.',
  detail: [
    'Add to LinkedIn sits beside View and download certificate and Copy verify link.',
    'The stats now include time invested, and your certificate shows as a thumbnail you can open.',
    'An "Up next in your queue" card points at your next assigned course.',
  ],
} satisfies ChangelogEntry;
