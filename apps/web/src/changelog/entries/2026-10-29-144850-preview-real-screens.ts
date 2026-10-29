import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'PREVIEW-REAL-SCREENS',
  title: 'Preview shows a question exactly as a learner sees it',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Preview used its own copy of the question screen, so what an Acharya checked could differ ' +
    'from what learners get. A question with more than four answers also repeated the badge ' +
    'letters A to D, in preview and for learners.',
  detail: [
    'Preview and the learner Pariksha now share one question screen.',
    'Answers are lettered A to H, and a wrong answer in preview names the right letters.',
  ],
} satisfies ChangelogEntry;
