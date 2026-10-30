import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-COURSE-TILES',
  title: 'Choosing courses to assign or grant shows the same course tiles as the catalogue',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Courses were a plain checkbox and a title here, so an Admin could not tell courses apart the way a ' +
    'learner can in the catalogue, and picking one gave no feedback.',
  detail: [
    'Click anywhere on a tile to pick it: it gets a green ring and the tick pops in.',
    'The same tiles appear when granting a person courses they may edit.',
  ],
} satisfies ChangelogEntry;
