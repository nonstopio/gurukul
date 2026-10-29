import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'STUDIO-LEARNER-COUNTS',
  title: 'Studio shows how many learners a change affects',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Removing a lesson is only safe to judge if you know who already finished it, and the publish ' +
    'dialog used to ask you to decide blind; a course card also never said whether anyone was taking it.',
  detail: [
    'The publish dialog lists each removed lesson with how many learners completed it.',
    'Course cards you can edit show how many learners have started the course.',
  ],
} satisfies ChangelogEntry;
