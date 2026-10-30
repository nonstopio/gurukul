import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-TEAMS-OR-PEOPLE',
  title: 'Assigning a course is to teams or to people, picked from clear lists',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'The audience step mixed a pasted email list, an existing team, a person search and a hidden ' +
    '"new team" tab, so it was hard to tell who would actually get the course.',
  detail: [
    'Switch between Teams and People. A course goes to one or the other, and switching asks first if you already picked.',
    'Teams: search, pick as many as you like, or make a new team on the spot. People: search or browse, pick as many as you like.',
    'Each list shows the first ten and how many there are in all.',
  ],
} satisfies ChangelogEntry;
