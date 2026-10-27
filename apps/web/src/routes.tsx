import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import { RequireRole } from './auth/RequireRole';
import { ChangelogPage } from './changelog/ChangelogPage';
import { ConsolePage, StudioPage } from './ConsolePage';
import { CoursePage } from './CoursePage';
import { CoursesPage } from './CoursesPage';
import { HomePage } from './HomePage';
import { LessonPage } from './LessonPage';
import { NotFoundPage } from './NotFoundPage';
import type { RoutePath } from './route-paths';
import { Shell } from './Shell';

/**
 * The route table: one screen per path in `route-paths.ts`. Every path must also be classified in
 * an area's navigation (`navigation/areas/*.ts`), as a page search offers or as unlisted with a
 * reason — `npm run validate:navigation` fails otherwise. Role gating here is convenience; rules
 * are the enforcement.
 */
export const ROUTES: Readonly<Record<RoutePath, ReactElement>> = {
  '/': <HomePage />,
  '/changelog': <ChangelogPage />,
  '/courses': <CoursesPage />,
  '/courses/:courseId': <CoursePage />,
  '/courses/:courseId/learn/:itemId': <LessonPage />,
  '/kulapati': (
    <RequireRole any={['kulapati']}>
      <ConsolePage />
    </RequireRole>
  ),
  '/studio': (
    <RequireRole any={['acharya', 'kulapati']}>
      <StudioPage />
    </RequireRole>
  ),
};

/** The data-router route objects: the shell around every screen, plus the not-found fallback. */
export function appRoutes(): RouteObject[] {
  return [
    {
      element: <Shell />,
      children: [
        ...Object.entries(ROUTES).map(([path, element]) => ({ path, element })),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
