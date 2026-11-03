import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'TEAM-DELETE-ADMIN',
  title: 'Educators edit only their own teams; only Admins delete a team, typing its name',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A course can be limited to one team, so deleting a team or taking people off it locks them ' +
    'out of that course, even halfway through. Any Educator could do that to any team.',
  detail: [
    'An Educator can edit the name and members of the teams they created, and no others. Admins can edit any team.',
    'Teams made before this change, and the Educator course team, can be edited by Admins only.',
    'Educators can no longer delete a team.',
    "An Admin deleting a team types the team's name before the Delete button turns on.",
    'The course visibility picker now says teams are made in Studio, under Teams, not in Admin.',
  ],
} satisfies ChangelogEntry;
