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
      label: 'Console',
      description: 'Learners, assignments and roles',
      keywords: ['admin', 'learners', 'assign', 'roles'],
    },
  ],
} satisfies AreaNavigation;
