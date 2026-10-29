import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'ONE-REMINDER',
  title: 'Reminder emails come once a day at most, and only for mandatory courses',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'Someone with three unfinished courses could get three reminder emails on the same morning, ' +
    'and optional courses were chased like mandatory ones. Too many reminders teach people to ' +
    'ignore them, so now each person gets one email listing everything that needs their attention.',
  detail: [
    'The daily reminder only covers mandatory assignments; optional ones are never chased automatically.',
    'A person with several courses due gets one email listing them all, each with its due date.',
    'Anyone already reminded today, by the daily run or by an Admin, is left alone until tomorrow.',
    '"Reminders sent" in the Learners screen now counts people emailed, not assignments.',
  ],
} satisfies ChangelogEntry;
