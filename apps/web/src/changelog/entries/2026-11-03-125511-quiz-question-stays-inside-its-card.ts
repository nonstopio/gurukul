import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'QUIZ-PROMPT-CARD',
  title: 'A long Quiz question stays inside its card',
  area: 'LEARN',
  kind: 'fix',
  why:
    'A question that wrapped onto more than one line sat across the top edge of its card, half ' +
    'outside it, which made it look broken and harder to read.',
  detail: ['The question now sits inside the card above its answers, however long it is.'],
} satisfies ChangelogEntry;
