import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import { RequireRole } from './auth/RequireRole';
import { RequireSession } from './auth/RequireSession';
import { CertificatePage, CertificatesPage, CompletePage, VerifyPage } from './certificates/pages';
import { ChangelogPage } from './changelog/ChangelogPage';
import { ConsolePage, StudioPage } from './ConsolePage';
import { CoursePage } from './CoursePage';
import { CoursesPage } from './CoursesPage';
import { HomePage } from './HomePage';
import { LessonPage } from './LessonPage';
import { ParikshaPage } from './pariksha/ParikshaPage';
import { ResultPage } from './pariksha/ResultPage';
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
  '/courses/:courseId/pariksha/:parikshaId': <ParikshaPage />,
  '/courses/:courseId/pariksha/:parikshaId/result': <ResultPage />,
  '/courses/:courseId/complete': <CompletePage />,
  '/certificates': <CertificatesPage />,
  '/certificates/:id': <CertificatePage />,
  '/verify/:id': <VerifyPage />,
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

/** Pages anyone can open, signed in or not: certificate verification, which employers use. */
const PUBLIC: readonly RoutePath[] = ['/verify/:id'];

/**
 * The data-router route objects: public pages, then everything behind sign-in inside the shell,
 * plus the not-found fallback.
 */
export function appRoutes(): RouteObject[] {
  const entries = Object.entries(ROUTES) as [RoutePath, ReactElement][];
  const route = ([path, element]: [RoutePath, ReactElement]) => ({ path, element });
  return [
    ...entries.filter(([path]) => PUBLIC.includes(path)).map(route),
    {
      element: <RequireSession />,
      children: [
        {
          element: <Shell />,
          children: [
            ...entries.filter(([path]) => !PUBLIC.includes(path)).map(route),
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ];
}
