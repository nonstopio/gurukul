import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'COURSE-HERO',
  title: 'A course opens with a hero band that shows when it is due',
  area: 'LEARN',
  kind: 'feature',
  why:
    'The two things you come to a course for, the button that starts or resumes it and the date ' +
    'it is due, used to sit among the description and outline. Now they are the first thing you see.',
  detail: [
    'The course title, summary and the Start or Resume button sit on a full-width dark band.',
    'If the course is assigned to you with a due date, it shows as "Due in 3 days" or "Overdue by 2 days" beside the date.',
  ],
} satisfies ChangelogEntry;
