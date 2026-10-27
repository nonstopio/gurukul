import { Suspense, lazy } from 'react';
import type { ComponentType, ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import { RequireRole } from './auth/RequireRole';
import { RequireSession } from './auth/RequireSession';
import { CoursePage } from './CoursePage';
import { CoursesPage } from './CoursesPage';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { PageLoading } from './learn/ui';
import type { RoutePath } from './route-paths';
import { Shell } from './Shell';

/**
 * Pages that are not on the first screen load on demand, so a first visit downloads only the shell,
 * sign-in and Home. `Shell` (and the public verify route) wrap them in `Suspense`.
 */
function lazyPage<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M & string,
) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const CertificatePage = lazyPage(() => import('./certificates/pages'), 'CertificatePage');
const CertificatesPage = lazyPage(() => import('./certificates/pages'), 'CertificatesPage');
const CompletePage = lazyPage(() => import('./certificates/pages'), 'CompletePage');
const VerifyPage = lazyPage(() => import('./certificates/pages'), 'VerifyPage');
const ChangelogPage = lazyPage(() => import('./changelog/ChangelogPage'), 'ChangelogPage');
const AssignPage = lazyPage(() => import('./console/AssignPage'), 'AssignPage');
const CourseAnalyticsPage = lazyPage(
  () => import('./console/CourseAnalyticsPage'),
  'CourseAnalyticsPage',
);
const LearnersPage = lazyPage(() => import('./console/LearnersPage'), 'LearnersPage');
const OverviewPage = lazyPage(() => import('./console/OverviewPage'), 'OverviewPage');
const RolesPage = lazyPage(() => import('./console/RolesPage'), 'RolesPage');
const CourseEditorPage = lazyPage(() => import('./studio/CourseEditorPage'), 'CourseEditorPage');
const LessonEditorPage = lazyPage(() => import('./studio/LessonEditorPage'), 'LessonEditorPage');
const MediaPage = lazyPage(() => import('./studio/MediaPage'), 'MediaPage');
const ParikshaBuilderPage = lazyPage(
  () => import('./studio/ParikshaBuilderPage'),
  'ParikshaBuilderPage',
);
const PreviewPage = lazyPage(() => import('./studio/PreviewPage'), 'PreviewPage');
const QuestionBankPage = lazyPage(() => import('./studio/QuestionBankPage'), 'QuestionBankPage');
const StudioCoursesPage = lazyPage(() => import('./studio/StudioCoursesPage'), 'StudioCoursesPage');
const LessonPage = lazyPage(() => import('./LessonPage'), 'LessonPage');
const ParikshaPage = lazyPage(() => import('./pariksha/ParikshaPage'), 'ParikshaPage');
const ResultPage = lazyPage(() => import('./pariksha/ResultPage'), 'ResultPage');

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
      <OverviewPage />
    </RequireRole>
  ),
  '/kulapati/learners': (
    <RequireRole any={['kulapati']}>
      <LearnersPage />
    </RequireRole>
  ),
  '/kulapati/assign': (
    <RequireRole any={['kulapati']}>
      <AssignPage />
    </RequireRole>
  ),
  '/kulapati/roles': (
    <RequireRole any={['kulapati']}>
      <RolesPage />
    </RequireRole>
  ),
  '/kulapati/courses/:courseId': (
    <RequireRole any={['kulapati']}>
      <CourseAnalyticsPage />
    </RequireRole>
  ),
  '/studio': (
    <RequireRole any={['acharya', 'kulapati']}>
      <StudioCoursesPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId': (
    <RequireRole any={['acharya', 'kulapati']}>
      <CourseEditorPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId/lessons/:lessonId': (
    <RequireRole any={['acharya', 'kulapati']}>
      <LessonEditorPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId/pariksha/:parikshaId': (
    <RequireRole any={['acharya', 'kulapati']}>
      <ParikshaBuilderPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId/preview/:itemId': (
    <RequireRole any={['acharya', 'kulapati']}>
      <PreviewPage />
    </RequireRole>
  ),
  '/studio/bank': (
    <RequireRole any={['acharya', 'kulapati']}>
      <QuestionBankPage />
    </RequireRole>
  ),
  '/studio/media': (
    <RequireRole any={['acharya', 'kulapati']}>
      <MediaPage />
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
  const publicRoute = ([path, element]: [RoutePath, ReactElement]) => ({
    path,
    element: <Suspense fallback={<PageLoading />}>{element}</Suspense>,
  });
  return [
    ...entries.filter(([path]) => PUBLIC.includes(path)).map(publicRoute),
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
