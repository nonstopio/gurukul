import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-06',
  id: 'DEADLINE-EMAIL',
  title:
    'An email when a course is due in 5 days, and when it is overdue, copying the team’s manager',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A due date passed in silence unless the course was mandatory with the right reminder; now ' +
    'people hear once before and once after, and the manager who assigned it through their team ' +
    'knows without chasing anyone.',
  detail: [
    'Sent by the daily reminder run, once 5 days or less before the due date and once when it has passed, for any unfinished course with a due date whose reminder is not off.',
    'Still one email a day per person: the deadline email lists the late and nearly due courses first, then anything else due a reminder.',
    'When the course was assigned through a team, that team’s Managers are copied.',
    'Admins can send themselves a test of it from the emails page.',
  ],
} satisfies ChangelogEntry;
