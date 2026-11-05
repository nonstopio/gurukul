import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'EXPLANATIONS-LOOK-LIKE-FEEDBACK',
  title: 'The reason behind an answer stands out from the lesson',
  area: 'LEARN',
  kind: 'fix',
  why:
    'After answering a check, the explanation sat under the options as ordinary text, so learners ' +
    'could not tell it apart from the lesson around it. It now reads as feedback on their answer.',
  detail: [
    'A right answer shows a green panel headed "Correct. Here is why"; a wrong one an amber "Not quite".',
    'Quiz questions use the same panel, and each explanation in the Quiz review is headed "Why".',
  ],
} satisfies ChangelogEntry;
