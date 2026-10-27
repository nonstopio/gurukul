import { ToastProvider } from '@gurukul/ui';
import { RouterProvider } from 'react-router';
import type { DataRouter } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import type { AuthService } from './auth/service';
import { ConsoleProvider } from './console/ConsoleProvider';
import type { ConsoleData, ConsoleService } from './console/types';
import { DataProvider } from './data/DataProvider';
import type { LearnerData } from './data/types';
import { ParikshaProvider } from './pariksha/ParikshaProvider';
import { StudioProvider } from './studio/StudioProvider';
import type { StudioData, StudioService } from './studio/types';
import type { ParikshaService } from './pariksha/service';

export interface AppProps {
  /** Firebase Auth + the profile watch; tests pass a fake. */
  service: AuthService;
  /** Firestore reads and writes for the learner screens; tests pass a fake. */
  data: LearnerData;
  /** Server-side grading (callable functions); tests pass a fake. */
  pariksha: ParikshaService;
  /** The Kulapati console's reads and callable functions; tests pass fakes. */
  console: { data: ConsoleData; service: ConsoleService };
  /** The Vyasa Studio's reads, drafts and callable functions; tests pass fakes. */
  studio: { data: StudioData; service: StudioService };
  /** The data router: `createBrowserRouter(appRoutes())` in production, a memory router in tests. */
  router: DataRouter;
}

/**
 * Providers around the router. Sign-in is enforced inside the route tree (`RequireSession`), so a
 * few pages — certificate verification — can stay public.
 */
export function App({ service, data, pariksha, console: consoleApi, studio, router }: AppProps) {
  return (
    <AuthProvider service={service}>
      <DataProvider data={data}>
        <ParikshaProvider service={pariksha}>
          <ConsoleProvider data={consoleApi.data} service={consoleApi.service}>
            <StudioProvider data={studio.data} service={studio.service}>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </StudioProvider>
          </ConsoleProvider>
        </ParikshaProvider>
      </DataProvider>
    </AuthProvider>
  );
}
