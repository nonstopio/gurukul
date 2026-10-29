import { Outlet } from 'react-router';
import { LabelChoicePage } from '../labels/LabelChoice';
import { useSession } from './AuthProvider';
import { SignInPage } from './SignInPage';

/**
 * Everything inside needs a signed-in NonStop account: loading, then sign-in, then (once, until
 * they pick) which names to use, then the page.
 */
export function RequireSession() {
  const { status, labels } = useSession();
  if (status === 'loading') {
    return (
      <main className="notfound" aria-busy="true">
        <p role="status">Loading Gurukul…</p>
      </main>
    );
  }
  if (status !== 'ready') return <SignInPage />;
  return labels ? <Outlet /> : <LabelChoicePage />;
}
