import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'LEARN-TEAMS-READ-ONLY',
  title: 'Your profile lists every team you are on; only Educators and Admins change teams',
  area: 'LEARN',
  kind: 'feature',
  why: 'A person can be on several teams, and picking your own team let anyone choose the wrong one, so teams are now kept by Educators and Admins (Teams moved to Studio) and shown to you read only.',
} satisfies ChangelogEntry;
