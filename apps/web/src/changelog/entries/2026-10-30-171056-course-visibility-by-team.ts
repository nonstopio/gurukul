import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-VISIBILITY',
  title: 'A course can be public, for chosen teams, or for Educators and Admins only',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Some courses are meant for one team, or are still being tried out by staff. Until now every ' +
    'signed-in person saw every published course, so a team-only course could not stay team-only.',
  detail: [
    'The publish dialog has a Visibility choice: Public, Team only (pick teams from the list an Admin keeps) or Educators and Admins.',
    'People outside the chosen teams do not see the course in the catalogue and cannot open it or take its Quizzes, even with the link.',
    'Courses published before this stay public.',
  ],
} satisfies ChangelogEntry;
