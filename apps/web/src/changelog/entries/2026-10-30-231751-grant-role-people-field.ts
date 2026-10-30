import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-GRANT-PEOPLE-FIELD',
  title: 'Granting a role uses the same people search, and course visibility picks teams as cards',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Granting a role still used an older search box that listed plain names as buttons, and ' +
    'choosing the teams that can see a course was a column of switches.',
  detail: [
    'Grant a role: click the field to see people with their photos, or type to narrow, then pick one.',
    'Who can open this course: the teams are cards you tick, like when assigning.',
  ],
} satisfies ChangelogEntry;
