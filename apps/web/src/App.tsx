import { ToastProvider } from '@gurukul/ui';
import { RouterProvider } from 'react-router';
import type { DataRouter } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import type { AuthService } from './auth/service';
import { DataProvider } from './data/DataProvider';
import type { LearnerData } from './data/types';
import { ParikshaProvider } from './pariksha/ParikshaProvider';
import type { ParikshaService } from './pariksha/service';

export interface AppProps {
  /** Firebase Auth + the profile watch; tests pass a fake. */
  service: AuthService;
  /** Firestore reads and writes for the learner screens; tests pass a fake. */
  data: LearnerData;
  /** Server-side grading (callable functions); tests pass a fake. */
  pariksha: ParikshaService;
  /** The data router: `createBrowserRouter(appRoutes())` in production, a memory router in tests. */
  router: DataRouter;
}

/**
 * Providers around the router. Sign-in is enforced inside the route tree (`RequireSession`), so a
 * few pages — certificate verification — can stay public.
 */
export function App({ service, data, pariksha, router }: AppProps) {
  return (
    <AuthProvider service={service}>
      <DataProvider data={data}>
        <ParikshaProvider service={pariksha}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ParikshaProvider>
      </DataProvider>
    </AuthProvider>
  );
}
