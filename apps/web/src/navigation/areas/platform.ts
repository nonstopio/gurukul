import type { AreaNavigation } from '../types';

/**
 * Pages that belong to no single area. The learner, Kulapati console and Vyasa Studio areas get
 * their own files as their screens ship (.plan/12-milestones.md); a page is listed here only once
 * its route exists, so search never offers something that is not built.
 */
export const navigation = {
  slug: 'platform',
  name: 'Gurukul',
  pages: [
    {
      id: 'home',
      path: '/',
      label: 'Home',
      description: 'Where Gurukul starts',
      keywords: ['start', 'gurukul', 'academy'],
    },
    {
      id: 'catalogue',
      path: '/courses',
      label: 'Catalogue',
      description: 'Every published course, open to you',
      keywords: ['courses', 'browse', 'learn', 'git'],
    },
    {
      id: 'changelog',
      path: '/changelog',
      label: 'Changelog',
      description: 'Every change, newest first, with the reason it was made',
      keywords: ['what changed', 'release notes', 'releases', 'updates', 'new'],
    },
  ],
  unlisted: {
    '/courses/:courseId': { context: 'needs a course id; reached from the catalogue or Home' },
    '/courses/:courseId/learn/:itemId': {
      context: 'needs a course and a lesson id; reached from the outline',
    },
  },
} satisfies AreaNavigation;
