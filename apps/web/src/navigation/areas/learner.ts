import type { AreaNavigation } from '../types';

/** What every signed-in Learner opens: Home, the catalogue, a course and its lessons, certificates. */
export const navigation = {
  slug: 'learner',
  name: 'Learning',
  keywords: ['learn', 'learner'],
  pages: [
    {
      id: 'home',
      path: '/',
      label: 'Home',
      description: 'Your courses, what is due and where you left off',
      keywords: ['start', 'gurukul', 'academy', 'dashboard', 'continue'],
    },
    {
      id: 'catalogue',
      path: '/courses',
      label: 'Catalogue',
      description: 'Every published course, open to you',
      keywords: ['courses', 'browse', 'git'],
    },
    {
      id: 'certificates',
      path: '/certificates',
      label: 'Certificates',
      description: 'Certificates you have earned',
      keywords: ['credential', 'diploma', 'completion', 'download'],
    },
    {
      id: 'profile',
      path: '/profile',
      label: 'Profile',
      description: 'Your account, roles, team and which names Gurukul uses',
      keywords: ['account', 'me', 'team', 'labels', 'names', 'sign out', 'settings'],
    },
  ],
  unlisted: {
    '/courses/:courseId': { context: 'needs a course id; reached from the catalogue or Home' },
    '/courses/:courseId/learn/:itemId': {
      context: 'needs a course and a lesson id; reached from the outline',
    },
    '/courses/:courseId/quiz/:quizId': {
      context: 'needs a course and a Quiz id; reached from the outline',
    },
    '/courses/:courseId/quiz/:quizId/result': {
      context: 'needs the attempt just made; reached after a Quiz',
    },
    '/courses/:courseId/complete': { context: 'needs a course id; reached after the last item' },
    '/certificates/:id': { context: 'needs a credential id; reached from Certificates' },
  },
} satisfies AreaNavigation;
