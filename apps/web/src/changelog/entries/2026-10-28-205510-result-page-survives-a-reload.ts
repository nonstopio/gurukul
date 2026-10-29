import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'RESULT-RELOAD',
  title: 'Your Quiz result stays put after a reload',
  area: 'QUIZ',
  kind: 'fix',
  why:
    'Opening a result again, from a bookmark, a new tab or another device, showed only your best ' +
    'score: the question-by-question review and the links back to the lessons were gone. Now ' +
    'the page reads your latest attempt, so the review is there whenever you come back to it.',
  detail: [
    'The review lists each question with your answer and, where the Quiz reveals them, the explanation. The correct option is named only right after you finish.',
    'Each question you missed links to the lesson that teaches it: "Revisit lesson: Branching basics".',
    'After a pass, the button names where you are going next: "Continue to Chapter 3".',
    'The retake countdown ticks down each second and turns into a Retake button when it opens.',
  ],
} satisfies ChangelogEntry;
