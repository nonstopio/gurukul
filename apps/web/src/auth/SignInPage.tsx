import { BookIcon, Button, Callout, CheckIcon, StarIcon } from '@gurukul/ui';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './AuthProvider';

/** Google's four-colour "G", as their sign-in branding guidelines ask for on a Google button. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

const BENEFITS = [
  { Icon: BookIcon, text: 'Courses built by NonStopians, for NonStopians' },
  { Icon: CheckIcon, text: 'Parikshas that show what you have learned' },
  { Icon: StarIcon, text: 'Certificates you can share and verify' },
] as const;

/**
 * Shown to anyone not signed in, and to a non-NonStop account that was just signed back out. The
 * refusal takes focus so a screen reader announces it, and offers Google's account picker, since
 * someone signed in to several accounts would otherwise get the same one again.
 */
export function SignInPage() {
  const { signIn, error, wrongAccount } = useSession();
  const alert = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const start = (options?: { chooseAccount: boolean }) => {
    setPending(true);
    void signIn(options).finally(() => setPending(false));
  };
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
          <figure className="signin__quote">
            <blockquote lang="sa">विद्या ददाति विनयम्</blockquote>
            <figcaption>Knowledge gives humility.</figcaption>
          </figure>
          <ul className="signin__benefits">
            {BENEFITS.map((b) => (
              <li key={b.text}>
                <b.Icon size={20} />
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
          <Button
            variant="chrome"
            icon={<GoogleMark />}
            disabled={pending}
            aria-busy={pending}
            onClick={() => start({ chooseAccount: true })}
          >
            {pending ? 'Signing in…' : 'Try another account'}
          </Button>
        ) : (
          <Button
            variant="chrome"
            icon={<GoogleMark />}
            disabled={pending}
            aria-busy={pending}
            onClick={() => start()}
          >
            {pending ? 'Signing in…' : 'Sign in with Google'}
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
