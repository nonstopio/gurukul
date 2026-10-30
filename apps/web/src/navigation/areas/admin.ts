import type { AreaNavigation } from '../types';

/** The Admin console: everyone, assignments, roles, the audit log and org settings. */
export const navigation = {
  slug: 'admin',
  name: 'Admin console',
  roles: ['admin'],
  keywords: ['admin', 'console', 'manage'],
  pages: [
    {
      id: 'admin-overview',
      path: '/admin',
      label: 'Overview',
      description: 'Analytics: activity, completion and the course funnel',
      keywords: ['admin', 'console', 'analytics', 'dashboard'],
    },
    {
      id: 'admin-learners',
      path: '/admin/learners',
      label: 'Learners',
      description: 'Everyone who signed in, plus pending invites',
      keywords: ['people', 'invites', 'overdue', 'reminder', 'progress'],
    },
    {
      id: 'admin-assign',
      path: '/admin/assign',
      label: 'Assign courses',
      description: 'Give courses to people, teams or a pasted list of emails',
      keywords: ['assign', 'invite', 'csv', 'deadline', 'due date'],
    },
    {
      id: 'admin-roles',
      path: '/admin/roles',
      label: 'Roles & access',
      description: 'Who has Educator and Admin roles',
      keywords: ['permissions', 'grant', 'educator', 'admin'],
    },
    {
      id: 'admin-audit',
      path: '/admin/audit',
      label: 'Audit log',
      description: 'Who assigned, granted, revoked or published what, and when',
      keywords: ['history', 'trail', 'log', 'activity', 'changes'],
    },
    {
      id: 'admin-settings',
      path: '/admin/settings',
      label: 'Org settings',
      description: 'The teams learners pick from, daily reminders and who signs certificates',
      keywords: [
        'settings',
        'teams',
        'reminders',
        'email',
        'organisation',
        'config',
        'signatory',
        'certificate',
        'design system',
        'tokens',
        'components',
      ],
    },
  ],
  unlisted: {
    '/admin/courses/:courseId': { context: 'needs a course id; reached from the overview' },
  },
} satisfies AreaNavigation;
