import type { AreaNavigation } from '../types';

/** The Kulapati (admin) console. Pages land with milestone M4. */
export const navigation = {
  slug: 'kulapati',
  name: 'Kulapati console',
  roles: ['kulapati'],
  keywords: ['admin', 'console', 'manage'],
  pages: [
    {
      id: 'kulapati-overview',
      path: '/kulapati',
      label: 'Overview',
      description: 'Sanjaya: activity, completion and the course funnel',
      keywords: ['admin', 'console', 'analytics', 'sanjaya', 'dashboard'],
    },
    {
      id: 'kulapati-learners',
      path: '/kulapati/learners',
      label: 'Learners',
      description: 'Everyone who signed in, plus pending invites',
      keywords: ['people', 'invites', 'overdue', 'reminder', 'progress'],
    },
    {
      id: 'kulapati-assign',
      path: '/kulapati/assign',
      label: 'Assign courses',
      description: 'Give courses to people, teams or a pasted list of emails',
      keywords: ['assign', 'invite', 'csv', 'deadline', 'due date'],
    },
    {
      id: 'kulapati-roles',
      path: '/kulapati/roles',
      label: 'Roles & access',
      description: 'Who is an Acharya or a Kulapati',
      keywords: ['permissions', 'grant', 'acharya', 'admin'],
    },
    {
      id: 'kulapati-audit',
      path: '/kulapati/audit',
      label: 'Audit log',
      description: 'Who assigned, granted, revoked or published what, and when',
      keywords: ['history', 'trail', 'log', 'activity', 'changes'],
    },
    {
      id: 'kulapati-settings',
      path: '/kulapati/settings',
      label: 'Org settings',
      description: 'The teams learners pick from and whether daily reminders are sent',
      keywords: ['settings', 'teams', 'reminders', 'email', 'organisation', 'config'],
    },
  ],
  unlisted: {
    '/kulapati/courses/:courseId': { context: 'needs a course id; reached from the overview' },
  },
} satisfies AreaNavigation;
