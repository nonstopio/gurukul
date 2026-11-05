import type { AreaNavigation } from '../types';

/** The Team area, where Managers (and Admins) keep teams, assign them courses and follow them. */
export const navigation = {
  slug: 'team',
  name: 'Team',
  roles: ['manager', 'admin'],
  keywords: ['team', 'manager', 'my team', 'reports', 'direct reports'],
  pages: [
    {
      id: 'team-teams',
      path: '/team',
      label: 'My teams',
      description: 'The teams you manage, and how each is getting on',
      keywords: ['teams', 'members', 'progress', 'report', 'overdue', 'due date', 'remind'],
    },
    {
      id: 'team-assign',
      path: '/team/assign',
      label: 'Assign to my teams',
      description: 'Give your teams courses, with a due date',
      keywords: ['assign', 'courses', 'deadline', 'due date'],
    },
  ],
  unlisted: {
    '/team/:teamId': { context: 'needs a team id; reached from My teams' },
  },
} satisfies AreaNavigation;
