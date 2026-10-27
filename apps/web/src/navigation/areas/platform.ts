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
      id: 'certificates',
      path: '/certificates',
      label: 'Certificates',
      description: 'Certificates you have earned',
      keywords: ['credential', 'diploma', 'siddhi', 'download'],
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
    '/courses/:courseId/pariksha/:parikshaId': {
      context: 'needs a course and a Pariksha id; reached from the outline',
    },
    '/courses/:courseId/pariksha/:parikshaId/result': {
      context: 'needs the attempt just made; reached after a Pariksha',
    },
    '/courses/:courseId/complete': { context: 'needs a course id; reached after the last item' },
    '/certificates/:id': { context: 'needs a credential id; reached from Certificates' },
    '/verify/:id': { context: 'public page for one credential id, shared as a link' },
    '/courses/:courseId': { context: 'needs a course id; reached from the catalogue or Home' },
    '/courses/:courseId/learn/:itemId': {
      context: 'needs a course and a lesson id; reached from the outline',
    },
  },
} satisfies AreaNavigation;
