import { PageSkeleton } from '@gurukul/ui';
import { Outlet } from 'react-router';
import { LabelChoicePage } from '../labels/LabelChoice';
import { AcceptPolicyPage } from '../privacy/AcceptPolicyPage';
import { usePolicyAccepted } from '../privacy/policy';
import { useSession } from './AuthProvider';
import { SignInPage } from './SignInPage';

/**
 * Everything inside needs a signed-in NonStop account: loading, then sign-in, then (until they
 * accept the current privacy policy) the policy, then (once, until they pick) which names to use,
 * then the page.
 */
export function RequireSession() {
  const { status, labels } = useSession();
  const accepted = usePolicyAccepted();
  if (status === 'loading') {
    return (
      <main id="content">
        <PageSkeleton label="Loading Gurukul" />
      </main>
    );
  }
  if (status !== 'ready') return <SignInPage />;
  if (!accepted) return <AcceptPolicyPage />;
  return labels ? <Outlet /> : <LabelChoicePage />;
}
