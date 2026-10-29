import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'RETIRED-AND-NEW-LESSONS',
  title: 'Retired courses and new lessons are marked wherever you meet them',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A learner part-way through a retired course could read on, reach a Pariksha, answer every ' +
    'question and only then be told it could not be graded. And a course that gained lessons ' +
    'after you finished it looked finished, with nothing to say the new material was there.',
  detail: [
    'Home rows, the continue card, the course page and the lesson player say "Retired"; your progress and certificate are kept and the lessons stay open to read.',
    "A retired course's Pariksha says it is closed instead of drawing questions.",
    'A course you finished that has since grown shows "New lessons added" on Home and on its page.',
  ],
} satisfies ChangelogEntry;
