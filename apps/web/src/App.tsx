import { ToastProvider } from '@gurukul/ui';
import { RouterProvider } from 'react-router';
import type { DataRouter } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import type { AuthService } from './auth/service';
import { ConsoleProvider } from './console/ConsoleProvider';
import type { ConsoleData, ConsoleService } from './console/types';
import { DataProvider } from './data/DataProvider';
import type { LearnerData } from './data/types';
import { QuizProvider } from './quiz/QuizProvider';
import { StudioProvider } from './studio/StudioProvider';
import type { StudioData, StudioService } from './studio/types';
import type { QuizService } from './quiz/service';

export interface AppProps {
  /** Firebase Auth + the profile watch; tests pass a fake. */
  service: AuthService;
  /** Firestore reads and writes for the learner screens; tests pass a fake. */
  data: LearnerData;
  /** Server-side grading (callable functions); tests pass a fake. */
  quiz: QuizService;
  /** The Admin console's reads and callable functions; tests pass fakes. */
  console: { data: ConsoleData; service: ConsoleService };
  /** The Studio's reads, drafts and callable functions; tests pass fakes. */
  studio: { data: StudioData; service: StudioService };
  /** The data router: `createBrowserRouter(appRoutes())` in production, a memory router in tests. */
  router: DataRouter;
}

/**
 * Providers around the router. Sign-in is enforced inside the route tree (`RequireSession`), so a
 * few pages — certificate verification — can stay public.
 */
export function App({ service, data, quiz, console: consoleApi, studio, router }: AppProps) {
  return (
    <AuthProvider service={service}>
      <DataProvider data={data}>
        <QuizProvider service={quiz}>
          <ConsoleProvider data={consoleApi.data} service={consoleApi.service}>
            <StudioProvider data={studio.data} service={studio.service}>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </StudioProvider>
          </ConsoleProvider>
        </QuizProvider>
      </DataProvider>
    </AuthProvider>
  );
}
