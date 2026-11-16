import { Button, Callout, GlobalLoader, Page } from '@gurukul/ui';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { hideBootLoader } from '../boot';
import { LabelChoicePage } from '../labels/LabelChoice';
import { AcceptPolicyPage } from '../privacy/AcceptPolicyPage';
import { usePolicyAccepted } from '../privacy/policy';
import { useSession } from './AuthProvider';
import { SignInPage } from './SignInPage';

/** How long a signed-in person waits for their profile before being told and offered a way out. */
export const SETUP_SLOW_MS = 10_000;

/**
 * Signed in to Google, waiting for `users/{uid}`. The first sign-in has a short gap while a function
 * writes it; past that, say so instead of loading for ever. The profile watch stays attached, so a
 * late profile still lets the person in with no click.
 */
function SettingUp() {
  const { signOut } = useSession();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SETUP_SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  // The boot loader covers the page until the session settles; this message must show over it.
  useEffect(() => {
    if (slow) hideBootLoader();
  }, [slow]);
  if (!slow) return <GlobalLoader label="Loading Gurukul" />;
  return (
    <Page width="reading">
      <Callout title="Still setting up your account" role="status">
        <p>
          This usually takes a few seconds. You will go in as soon as it is ready; if nothing
          changes, try again or sign out.
        </p>
        <div className="load-actions">
          <Button onClick={() => window.location.reload()}>Retry</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Callout>
    </Page>
  );
}

/**
 * Everything inside needs a signed-in NonStop account: loading, then sign-in, then (until they
 * accept the current privacy policy) the policy, then (once, until they pick) which labels to use,
 * then the page.
 */
export function RequireSession() {
  const { status, labels, user } = useSession();
  const accepted = usePolicyAccepted();
  if (status === 'loading') {
    return (
      <main id="content">{user ? <SettingUp /> : <GlobalLoader label="Loading Gurukul" />}</main>
    );
  }
  if (status !== 'ready') return <SignInPage />;
  if (!accepted) return <AcceptPolicyPage />;
  return labels ? <Outlet /> : <LabelChoicePage />;
}
