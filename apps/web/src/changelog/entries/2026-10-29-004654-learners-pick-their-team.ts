import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'PICK-TEAM',
  title: 'Learners pick their team on Home',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A Kulapati could list teams, but nobody could join one, so assigning a course to a whole ' +
    'team or filtering Learners by team still found no one.',
  detail: [
    'Home asks once, while you have no team and the Kulapati has listed some.',
    'Only a team from the Org settings list can be saved.',
  ],
} satisfies ChangelogEntry;
