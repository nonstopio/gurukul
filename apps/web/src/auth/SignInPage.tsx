import { Button } from '@gurukul/ui';
import { useEffect, useRef } from 'react';
import { useSession } from './AuthProvider';

/**
 * Shown to anyone not signed in, and to a non-NonStop account that was just signed back out. The
 * refusal takes focus so a screen reader announces it, and offers Google's account picker, since
 * someone signed in to several accounts would otherwise get the same one again.
 */
export function SignInPage() {
  const { signIn, error, wrongAccount } = useSession();
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (wrongAccount) alert.current?.focus();
  }, [wrongAccount, error]);
  return (
    <main className="shell">
      <img
        className="shell__logo"
        src="/nonstop-logo.png"
        alt="NonStop io"
        width="110"
        height="32"
      />
      <p className="shell__kicker">NonStop Academy</p>
      <h1 className="shell__title">Welcome to Gurukul.</h1>
      <p className="shell__body">Courses, Parikshas and certificates for every NonStopian.</p>
      {error ? (
        <p ref={alert} role="alert" className="shell__error" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      <div className="shell__actions">
        {wrongAccount ? (
          <Button variant="chrome" onClick={() => void signIn({ chooseAccount: true })}>
            Try another account
          </Button>
        ) : (
          <Button variant="chrome" onClick={() => void signIn()}>
            Sign in with Google
          </Button>
        )}
      </div>
    </main>
  );
}
