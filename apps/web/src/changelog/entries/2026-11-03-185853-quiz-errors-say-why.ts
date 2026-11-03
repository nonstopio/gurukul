import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'QUIZ-ERRORS-SAY-WHY',
  title: 'A Quiz that cannot be submitted says why',
  area: 'LEARN',
  kind: 'fix',
  why:
    'Every refused submission showed "Could not submit your answers. Try again.", even when trying again ' +
    'could never work, so neither the learner nor an Admin could tell what was wrong.',
  detail: [
    'Finishing or checking a Quiz shows the reason when the server gives one, such as an earlier part of the course still to finish.',
    'A lost connection still says to try again.',
  ],
} satisfies ChangelogEntry;
