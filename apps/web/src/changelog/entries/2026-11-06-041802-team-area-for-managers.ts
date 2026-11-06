import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-06',
  id: 'MANAGER-ROLE',
  title: 'Managers keep their own teams, assign them courses and see who is behind',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'A team lead who wanted their people on a course had to ask an Admin to assign it and then ' +
    'ask again to find out who had finished; now they can do both themselves, without being ' +
    'given the keys to everything else.',
  detail: [
    'A new Manager role, granted on Roles & access beside Educator and Admin.',
    'Managers get a Team area: My teams, a report per team with each person’s courses, status, due date and progress (overdue first), and Assign for their own teams.',
    'From the report a Manager changes a due date, takes a course off someone’s list, or reminds the whole team.',
    'On Teams, Admins name each team’s Managers; a team with none is marked "No manager". Educators now see teams without editing them.',
  ],
} satisfies ChangelogEntry;
