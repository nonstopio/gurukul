import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'QUIZ-LOCK-LABEL',
  title: 'The Quiz lock switch says what it really locks',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'The switch read "Learners must pass to open the next chapter", but it only ever locked the ' +
    'rest of its own chapter, so Educators expected a lock they did not get.',
  detail: [
    'It now reads "Learners must pass to open the rest of this chapter".',
    'A line under it says that keeping later chapters locked is the course rule "Learners go in order".',
    'Nothing changes for learners or existing courses.',
  ],
} satisfies ChangelogEntry;
