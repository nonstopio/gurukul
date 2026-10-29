import type { AreaNavigation } from '../types';

/** Vyasa Studio, where Acharyas build courses, questions and media. */
export const navigation = {
  slug: 'studio',
  name: 'Vyasa Studio',
  roles: ['acharya', 'kulapati'],
  keywords: ['author', 'educator', 'build'],
  pages: [
    {
      id: 'studio-courses',
      path: '/studio',
      label: 'Studio',
      description: 'Build and publish courses',
      keywords: ['courses', 'author', 'edit', 'create', 'vyasa'],
    },
    {
      id: 'studio-bank',
      path: '/studio/bank',
      label: 'Question bank',
      description: 'Reusable Pariksha questions',
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
    '/studio/courses/:courseId/pariksha/:parikshaId': {
      context: 'needs a course and a Pariksha id; reached from the course editor',
    },
    '/studio/courses/:courseId/preview/:itemId': {
      context: 'needs a course and an item id; reached from the editors',
    },
  },
} satisfies AreaNavigation;
