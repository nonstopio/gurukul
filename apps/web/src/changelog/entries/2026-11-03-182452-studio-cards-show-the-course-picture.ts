import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'STUDIO-CARD-PICTURE',
  title: "Studio's course cards show the course's first picture",
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Learners already saw the first image in a course on its tile, but Studio still showed only the ' +
    'cover letter, so an Educator could not see what learners see.',
  detail: [
    "A course card in Studio shows the first image in the course's lessons, from the draft you are editing.",
    'A course with no image, or one whose image fails to load, still shows its letter on its colour.',
  ],
} satisfies ChangelogEntry;
