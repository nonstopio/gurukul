import { ToastProvider } from '@gurukul/ui';
import { RouterProvider } from 'react-router';
import type { DataRouter } from 'react-router';
import { AuthProvider, useSession } from './auth/AuthProvider';
import { SignInPage } from './auth/SignInPage';
import type { AuthService } from './auth/service';
import { DataProvider } from './data/DataProvider';
import type { LearnerData } from './data/types';

export interface AppProps {
  /** Firebase Auth + the profile watch; tests pass a fake. */
  service: AuthService;
  /** Firestore reads and writes for the learner screens; tests pass a fake. */
  data: LearnerData;
  /** The data router: `createBrowserRouter(appRoutes())` in production, a memory router in tests. */
  router: DataRouter;
}

/** Everything behind sign-in: loading, the sign-in page, or the routed app. */
function Gate({ router }: { router: DataRouter }) {
  const { status } = useSession();
  if (status === 'loading') {
    return (
      <main className="notfound" aria-busy="true">
        <p role="status">Loading Gurukul…</p>
      </main>
    );
  }
  if (status !== 'ready') return <SignInPage />;
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

export function App({ service, data, router }: AppProps) {
  return (
    <AuthProvider service={service}>
      <DataProvider data={data}>
        <Gate router={router} />
      </DataProvider>
    </AuthProvider>
  );
}
