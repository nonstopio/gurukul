import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'QUIZ-RESUME',
  title: 'A Quiz carries on where you left it after a reload',
  area: 'QUIZ',
  kind: 'fix',
  why:
    'The Quiz said progress was saved after every answer, but a reload or a closed tab ' +
    'threw every answer away and drew new questions. Now each answer is kept as you check it or ' +
    'move on, so an accident costs nothing.',
  detail: [
    'Answers, verdicts already shown and the questions drawn are kept in this browser until you finish. On another device the Quiz starts afresh.',
    'Exit Quiz asks first when the answer on screen is not saved yet.',
    'Enter checks your answer, then moves to the next question.',
    'Options are locked while an answer is being checked.',
    'A wrong answer now names the right one: "Not quite — the answer is B."',
  ],
} satisfies ChangelogEntry;
