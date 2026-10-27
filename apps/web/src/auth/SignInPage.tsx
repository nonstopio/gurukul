import { Button } from '@gurukul/ui';
import { useSession } from './AuthProvider';

/** Shown to anyone not signed in, and to a non-NonStop account that was just signed back out. */
export function SignInPage() {
  const { signIn, error } = useSession();
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
        <p role="alert" className="shell__error">
          {error}
        </p>
      ) : null}
      <div className="shell__actions">
        <Button variant="chrome" onClick={() => void signIn()}>
          Sign in with Google
        </Button>
      </div>
    </main>
  );
}
