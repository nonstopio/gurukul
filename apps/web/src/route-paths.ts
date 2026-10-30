/**
 * Every path the app serves. `routes.tsx` must map each one to a screen (TypeScript enforces it),
 * and every one must be classified in an area's navigation (`npm run validate:navigation`).
 * Kept apart from `routes.tsx` so the validator can read it without loading React screens.
 */
export const ROUTE_PATHS = [
  '/',
  '/changelog',
  '/courses',
  '/courses/:courseId',
  '/courses/:courseId/learn/:itemId',
  '/courses/:courseId/quiz/:quizId',
  '/courses/:courseId/quiz/:quizId/result',
  '/courses/:courseId/complete',
  '/certificates',
  '/certificates/:id',
  '/verify/:id',
  '/profile',
  '/admin',
  '/admin/learners',
  '/admin/assign',
  '/admin/teams',
  '/admin/roles',
  '/admin/audit',
  '/admin/settings',
  '/admin/courses/:courseId',
  '/studio',
  '/studio/courses/:courseId',
  '/studio/courses/:courseId/lessons/:lessonId',
  '/studio/courses/:courseId/quiz/:quizId',
  '/studio/courses/:courseId/preview/:itemId',
  '/studio/bank',
  '/studio/media',
] as const;

export type RoutePath = (typeof ROUTE_PATHS)[number];
