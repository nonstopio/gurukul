import { Outlet } from 'react-router';
import { useSession } from './AuthProvider';
import { SignInPage } from './SignInPage';

/** Everything inside needs a signed-in NonStop account: loading, then sign-in, then the page. */
export function RequireSession() {
  const { status } = useSession();
  if (status === 'loading') {
    return (
      <main className="notfound" aria-busy="true">
        <p role="status">Loading Gurukul…</p>
      </main>
    );
  }
  return status === 'ready' ? <Outlet /> : <SignInPage />;
}
