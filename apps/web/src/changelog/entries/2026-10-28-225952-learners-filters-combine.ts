import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'LEARNERS-FILTERS-COMBINE',
  title: 'Learners filters work together, and "All" includes pending invites',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'Asking "who in QA is overdue on Git?" used to quietly answer a different question: only the ' +
    'last filter you touched applied, and "All" counted pending invites without listing them. ' +
    'Now every filter and the tab narrow the same list, so what you see is what you asked for.',
  detail: [
    'Search, team, course, role and the tab all apply at once, and the tab counts follow the filters.',
    '"All" lists pending invites after everyone who has signed in.',
    'People on a course or the Overdue tab show their name, team and role, not just their email.',
    'Search waits until you pause typing before it looks people up.',
  ],
} satisfies ChangelogEntry;
