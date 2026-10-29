import { Button, Callout } from '@gurukul/ui';
import { useEffect, useRef } from 'react';
import { useSession } from './AuthProvider';

const BENEFITS = [
  {
    icon: 'M4 5h5a2 2 0 0 1 1 .3A2 2 0 0 1 11 5h5v10h-5a2 2 0 0 0-1 .3 2 2 0 0 0-1-.3H4z',
    text: 'Courses built by NonStopians, for NonStopians',
  },
  { icon: 'M4 10.5l4 4 8-9', text: 'Parikshas that show what you have learned' },
  {
    icon: 'M10 3l2 4.5 5 .5-3.7 3.4 1 5L10 14l-4.3 2.4 1-5L3 8l5-.5z',
    text: 'Certificates you can share and verify',
  },
] as const;

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
    <main className="signin">
      <section className="signin__hero" aria-labelledby="signin-title">
        <div className="signin__brand">
          <img src="/nonstop-logo.png" alt="NonStop io" width="110" height="32" />
          <span className="signin__brand-name" aria-hidden="true">
            Gurukul
          </span>
        </div>
        <div className="signin__pitch">
          <p className="shell__kicker">NonStop Academy</p>
          <h1 id="signin-title" className="signin__title">
            Welcome to Gurukul.
          </h1>
          <p className="shell__body">Courses, Parikshas and certificates for every NonStopian.</p>
          <ul className="signin__benefits">
            {BENEFITS.map((b) => (
              <li key={b.text}>
                <svg
                  viewBox="0 0 20 20"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={b.icon} />
                </svg>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
        <svg className="signin__rings" viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="240" cy="240" r="80" />
          <circle cx="240" cy="240" r="140" />
          <circle cx="240" cy="240" r="200" />
        </svg>
      </section>
      <section className="signin__form">
        <h2 className="signin__form-title">Sign in to Gurukul</h2>
        {error ? (
          <p ref={alert} role="alert" className="shell__error" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        {wrongAccount ? (
          <Button variant="chrome" onClick={() => void signIn({ chooseAccount: true })}>
            Try another account
          </Button>
        ) : (
          <Button variant="chrome" onClick={() => void signIn()}>
            Sign in with Google
          </Button>
        )}
        <Callout tone="tip" title="Assigned a course before you joined?">
          Sign in with the same work email. Your courses are waiting for you.
        </Callout>
        <p className="signin__footnote">Only @nonstopio.com Google accounts can sign in.</p>
      </section>
    </main>
  );
}
