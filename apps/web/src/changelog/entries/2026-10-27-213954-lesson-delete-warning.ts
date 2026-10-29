import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'STUDIO-DELETE-WARNING',
  title: 'Deleting a published lesson tells you how many learners completed it',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Removing a lesson from a live course is easy to do by accident and its effect is invisible: ' +
    'learners who finished it keep a record of something that no longer exists. Seeing "12 learners ' +
    'have completed it" before confirming lets an Educator decide with the facts.',
  detail: [
    'The delete dialog for a lesson that is part of the published course shows how many learners have completed it. Lessons you only added to the draft show no count.',
    'If the count cannot be read, the dialog still opens and you can delete as before.',
  ],
  notes: [
    'The count is one on-demand count query when the dialog opens, rather than a counter updated on every completion, so it adds no cost for learners.',
  ],
} satisfies ChangelogEntry;
