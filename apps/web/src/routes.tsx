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
import { FocusedShell, Frame, Shell } from './Shell';

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
const AuditPage = lazyPage(() => import('./console/AuditPage'), 'AuditPage');
const CourseAnalyticsPage = lazyPage(
  () => import('./console/CourseAnalyticsPage'),
  'CourseAnalyticsPage',
);
const LearnersPage = lazyPage(() => import('./console/LearnersPage'), 'LearnersPage');
const OverviewPage = lazyPage(() => import('./console/OverviewPage'), 'OverviewPage');
const RolesPage = lazyPage(() => import('./console/RolesPage'), 'RolesPage');
const TeamsPage = lazyPage(() => import('./console/TeamsPage'), 'TeamsPage');
const SettingsPage = lazyPage(() => import('./console/SettingsPage'), 'SettingsPage');
const CourseEditorPage = lazyPage(() => import('./studio/CourseEditorPage'), 'CourseEditorPage');
const LessonEditorPage = lazyPage(() => import('./studio/LessonEditorPage'), 'LessonEditorPage');
const MediaPage = lazyPage(() => import('./studio/MediaPage'), 'MediaPage');
const QuizBuilderPage = lazyPage(() => import('./studio/QuizBuilderPage'), 'QuizBuilderPage');
const PreviewPage = lazyPage(() => import('./studio/PreviewPage'), 'PreviewPage');
const QuestionBankPage = lazyPage(() => import('./studio/QuestionBankPage'), 'QuestionBankPage');
const StudioCoursesPage = lazyPage(() => import('./studio/StudioCoursesPage'), 'StudioCoursesPage');
const ProfilePage = lazyPage(() => import('./ProfilePage'), 'ProfilePage');
const LessonPage = lazyPage(() => import('./LessonPage'), 'LessonPage');
const QuizPage = lazyPage(() => import('./quiz/QuizPage'), 'QuizPage');
const ResultPage = lazyPage(() => import('./quiz/ResultPage'), 'ResultPage');

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
  '/profile': <ProfilePage />,
  '/courses/:courseId': <CoursePage />,
  '/courses/:courseId/learn/:itemId': <LessonPage />,
  '/courses/:courseId/quiz/:quizId': <QuizPage />,
  '/courses/:courseId/quiz/:quizId/result': <ResultPage />,
  '/courses/:courseId/complete': <CompletePage />,
  '/certificates': <CertificatesPage />,
  '/certificates/:id': <CertificatePage />,
  '/verify/:id': <VerifyPage />,
  '/admin': (
    <RequireRole any={['admin']}>
      <OverviewPage />
    </RequireRole>
  ),
  '/admin/learners': (
    <RequireRole any={['admin']}>
      <LearnersPage />
    </RequireRole>
  ),
  '/admin/assign': (
    <RequireRole any={['admin']}>
      <AssignPage />
    </RequireRole>
  ),
  '/admin/teams': (
    <RequireRole any={['admin']}>
      <TeamsPage />
    </RequireRole>
  ),
  '/admin/roles': (
    <RequireRole any={['admin']}>
      <RolesPage />
    </RequireRole>
  ),
  '/admin/audit': (
    <RequireRole any={['admin']}>
      <AuditPage />
    </RequireRole>
  ),
  '/admin/settings': (
    <RequireRole any={['admin']}>
      <SettingsPage />
    </RequireRole>
  ),
  '/admin/courses/:courseId': (
    <RequireRole any={['admin']}>
      <CourseAnalyticsPage />
    </RequireRole>
  ),
  '/studio': (
    <RequireRole any={['educator', 'admin']}>
      <StudioCoursesPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId': (
    <RequireRole any={['educator', 'admin']}>
      <CourseEditorPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId/lessons/:lessonId': (
    <RequireRole any={['educator', 'admin']}>
      <LessonEditorPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId/quiz/:quizId': (
    <RequireRole any={['educator', 'admin']}>
      <QuizBuilderPage />
    </RequireRole>
  ),
  '/studio/courses/:courseId/preview/:itemId': (
    <RequireRole any={['educator', 'admin']}>
      <PreviewPage />
    </RequireRole>
  ),
  '/studio/bank': (
    <RequireRole any={['educator', 'admin']}>
      <QuestionBankPage />
    </RequireRole>
  ),
  '/studio/media': (
    <RequireRole any={['educator', 'admin']}>
      <MediaPage />
    </RequireRole>
  ),
};

/** Pages anyone can open, signed in or not: certificate verification, which employers use. */
const PUBLIC: readonly RoutePath[] = ['/verify/:id'];

/**
 * Pages that leave the sidebar for the focused layout: the page's own sticky top bar (back link,
 * title, progress or save state) is the chrome. The player, the Quiz, and every Studio editor.
 */
export const FOCUSED: readonly RoutePath[] = [
  '/courses/:courseId/learn/:itemId',
  '/courses/:courseId/quiz/:quizId',
  '/courses/:courseId/quiz/:quizId/result',
  '/studio/courses/:courseId',
  '/studio/courses/:courseId/lessons/:lessonId',
  '/studio/courses/:courseId/quiz/:quizId',
  '/studio/courses/:courseId/preview/:itemId',
];

/**
 * The data-router route objects: public pages, then everything behind sign-in inside the frame —
 * the focused pages in the top-bar layout, the rest (and the not-found fallback) in the sidebar one.
 */
export function appRoutes(): RouteObject[] {
  const entries = Object.entries(ROUTES) as [RoutePath, ReactElement][];
  const signedIn = entries.filter(([path]) => !PUBLIC.includes(path));
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
          element: <Frame />,
          children: [
            {
              element: <FocusedShell />,
              children: signedIn.filter(([path]) => FOCUSED.includes(path)).map(route),
            },
            {
              element: <Shell />,
              children: [
                ...signedIn.filter(([path]) => !FOCUSED.includes(path)).map(route),
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ];
}
