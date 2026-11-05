import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'CLEARER-REASON-BEFORE-MARK-COMPLETE',
  title: 'A lesson says what is left before you can mark it complete',
  area: 'LEARN',
  kind: 'fix',
  why:
    'The reason sat in small grey text far from the button, and the button looked ready to press, ' +
    'so learners missed it and could not tell why nothing happened.',
  detail: [
    '"Mark complete" stays dimmed until the lesson is done.',
    'The reason, with a lock, sits just above the buttons in full-size text: answer the question, watch the video or read to the end.',
  ],
} satisfies ChangelogEntry;
