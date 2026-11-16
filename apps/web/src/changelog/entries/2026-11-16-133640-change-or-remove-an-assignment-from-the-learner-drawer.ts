import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-124',
  title: 'Admins can change the due date of an assignment, or remove it, from the learner drawer',
  area: 'ADMIN',
  kind: 'feature',
  why: 'An Admin who assigned the wrong person, the wrong course or a wrong date had no way to undo it: assigning again said "already assigned" and changed nothing, the course stayed on the person’s Home as due, and a mandatory one kept emailing them every day. Only someone on a team could be corrected, from that team’s report.',
  detail: [
    'Admin → Learners → open a person: each assigned course has Change due date and Remove.',
    'Remove asks first. The person keeps their progress and any certificate, gets no more reminders about the course, and can be assigned it again later.',
    'A new due date sends no email by itself; the usual reminders before and after it follow the new date.',
    'Removing a finished assignment takes it off the completed count on the Analytics overview at once, not only after the nightly recount.',
  ],
} satisfies ChangelogEntry;
