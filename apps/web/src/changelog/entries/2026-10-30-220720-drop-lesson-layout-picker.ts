import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-NO-LAYOUT',
  title: 'The lesson layout choice is gone from Studio',
  area: 'STUDIO',
  kind: 'chore',
  why:
    'Stacked and Split looked identical to a learner and Article only made the text a little bigger, ' +
    'so Educators were offered a choice that changed nothing they could see.',
  detail: ['Existing lessons keep their value; nothing a learner sees changes.'],
} satisfies ChangelogEntry;
