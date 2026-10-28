import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'PARIKSHA-RESUME',
  title: 'A Pariksha carries on where you left it after a reload',
  area: 'PARIKSHA',
  kind: 'fix',
  why:
    'The Pariksha said progress was saved after every answer, but a reload or a closed tab ' +
    'threw every answer away and drew new questions. Now each answer is kept as you check it or ' +
    'move on, so an accident costs nothing.',
  detail: [
    'Answers, verdicts already shown and the questions drawn are kept in this browser until you finish. On another device the Pariksha starts afresh.',
    'Exit Pariksha asks first when the answer on screen is not saved yet.',
    'Enter checks your answer, then moves to the next question.',
    'Options are locked while an answer is being checked.',
    'A wrong answer now names the right one: "Not quite — the answer is B."',
  ],
} satisfies ChangelogEntry;
