import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-128',
  title: 'The wait before a Quiz retake counts down and opens by itself',
  area: 'QUIZ',
  kind: 'fix',
  why: 'Staying on the "Retake not open yet" screen showed the same time left for ever, even after the wait was over, until you reloaded the page.',
  detail: [
    'The minutes left update while you wait.',
    'When the wait ends the questions appear without a reload.',
  ],
} satisfies ChangelogEntry;
