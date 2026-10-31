import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'QUIZ-FIRST-OPEN',
  title: 'A Quiz opened first can be submitted',
  area: 'QUIZ',
  kind: 'fix',
  why: 'Opening a Quiz before any lesson, or from a link, never started the course, so every submit failed with "Try again".',
} satisfies ChangelogEntry;
