import type { AreaNavigation } from '../types';

/** Studio, where Educators build courses, questions and media. */
export const navigation = {
  slug: 'studio',
  name: 'Studio',
  roles: ['educator', 'admin'],
  keywords: ['author', 'educator', 'build'],
  pages: [
    {
      id: 'studio-courses',
      path: '/studio',
      label: 'Studio',
      description: 'Build and publish courses',
      keywords: ['courses', 'author', 'edit', 'create', 'studio'],
    },
    {
      id: 'studio-teams',
      path: '/studio/teams',
      label: 'Teams',
      description: 'Groups of people, with their members, to assign courses to together',
      keywords: ['team', 'members', 'group', 'people'],
    },
    {
      id: 'studio-bank',
      path: '/studio/bank',
      label: 'Question bank',
      description: 'Reusable Quiz questions',
      keywords: ['questions', 'quiz', 'import'],
    },
    {
      id: 'studio-media',
      path: '/studio/media',
      label: 'Media library',
      description: 'Videos and images used across courses',
      keywords: ['video', 'image', 'links'],
    },
  ],
  unlisted: {
    '/studio/courses/:courseId': { context: 'needs a course id; reached from the course list' },
    '/studio/courses/:courseId/lessons/:lessonId': {
      context: 'needs a course and a lesson id; reached from the course editor',
    },
    '/studio/courses/:courseId/quiz/:quizId': {
      context: 'needs a course and a Quiz id; reached from the course editor',
    },
    '/studio/courses/:courseId/preview/:itemId': {
      context: 'needs a course and an item id; reached from the editors',
    },
  },
} satisfies AreaNavigation;
