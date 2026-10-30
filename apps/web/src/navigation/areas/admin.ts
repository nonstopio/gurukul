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
      id: 'admin-teams',
      path: '/admin/teams',
      label: 'Teams',
      description: 'Groups of people, with their members, to assign courses to together',
      keywords: ['team', 'members', 'group', 'people'],
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
      id: 'admin-design-system',
      path: '/admin/design-system',
      label: 'Design system',
      description: 'The live tokens and components the app is built from',
      keywords: ['design system', 'tokens', 'components', 'colours', 'theme', 'ui'],
    },
    {
      id: 'admin-settings',
      path: '/admin/settings',
      label: 'Org settings',
      description: 'Daily reminders and who signs certificates',
      keywords: [
        'settings',
        'reminders',
        'email',
        'organisation',
        'config',
        'signatory',
        'certificate',
      ],
    },
  ],
  unlisted: {
    '/admin/courses/:courseId': { context: 'needs a course id; reached from the overview' },
  },
} satisfies AreaNavigation;
