import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'OVERVIEW-NEEDS-ATTENTION',
  title: 'The Overview shows who needs a nudge',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'The numbers said how many people were late or stuck but not who, so finding them meant ' +
    'opening Learners and hunting.',
  detail: [
    'Needs attention lists the five longest overdue, the learners who failed a Quiz twice, and pending invites.',
    'Nudge and Resend email the person; Reset opens a retake.',
    'Filter by date range and team; failed twice looks at the 100 most recently active learners.',
  ],
} satisfies ChangelogEntry;
