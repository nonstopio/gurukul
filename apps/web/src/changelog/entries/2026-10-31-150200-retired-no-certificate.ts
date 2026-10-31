import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'QUIZ-RETIRED-NO-CERT',
  title: 'A retired course no longer issues certificates',
  area: 'QUIZ',
  kind: 'fix',
  why: 'Lessons ticked after a course was retired could still complete it and issue a certificate.',
} satisfies ChangelogEntry;
