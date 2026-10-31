import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'LEARN-TEAM-COURSES-HOME',
  title: 'Courses open to your team now show on Home when assigned to you',
  area: 'LEARN',
  kind: 'fix',
  why: 'Home, the completion page and the Admin pickers asked only for public courses, so a team-only course you were assigned never appeared there.',
} satisfies ChangelogEntry;
