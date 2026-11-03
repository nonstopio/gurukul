import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'STUDIO-CARD-PICTURE',
  title: "Studio's courses are tiles with the course's picture, like everywhere else",
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Learners saw the first image in a course on its tile, but Studio drew its own card with only the ' +
    'cover letter, so an Educator could not see what learners see.',
  detail: [
    'A course in Studio shows the first image in its lessons, from the draft you are editing, or its name on its colour when it has none.',
    'Status, unpublished edits, learners and when it was last edited sit on the tile, as before.',
    'A course tile reached with the keyboard shows its focus ring, here and on Home and the catalogue.',
  ],
} satisfies ChangelogEntry;
