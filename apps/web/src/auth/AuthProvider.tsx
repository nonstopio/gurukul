import { isAllowedEmail, rolesFromClaims } from '@gurukul/schema';
import type { LabelSet, Role } from '@gurukul/schema';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthService, AuthUser, SignInOptions } from './service';
import { log } from '../log';

export type SessionStatus = 'loading' | 'signedOut' | 'denied' | 'ready';

export interface Session {
  status: SessionStatus;
  user: AuthUser | null;
  roles: Role[];
  /** The team on the profile (`users/{uid}.team`); `null` until the person picks one. */
  team: string | null;
  /** Which names the app shows (`users/{uid}.labels`); `null` until the person picks. */
  labels: LabelSet | null;
  /** Why sign-in failed, or why a non-NonStop account was signed back out. */
  error: string | null;
  /** The last account Google returned was not a NonStop io one: offer to choose another. */
  wrongAccount: boolean;
  signIn(options?: SignInOptions): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

/** The current session. Throws outside `AuthProvider`: a missing provider is a bug, not a state. */
export function useSession(): Session {
  const session = useContext(Ctx);
  if (!session) throw new Error('useSession must be used inside <AuthProvider>');
  return session;
}

/**
 * The label set to render with. Outside a session (the public verify page, a component rendered
 * on its own in a test) and before the person picks, the generic names.
 */
export function useLabelSet(): LabelSet {
  return useContext(Ctx)?.labels ?? 'generic';
}

/** The signed-in person. Only used inside `RequireSession`, so a missing user is a bug, not a state. */
export function useUser(): AuthUser {
  const { user } = useSession();
  if (!user) throw new Error('useUser needs a signed-in user');
  return user;
}

const ACCOUNT_HINT =
  'Gurukul is for NonStop io accounts: choose your @nonstopio.com Google account.';

/** Names the account Google returned, so someone signed in to several can see which one it used. */
export function deniedMessage(email: string | null): string {
  return email ? `You signed in as ${email}. ${ACCOUNT_HINT}` : ACCOUNT_HINT;
}

export const RETRY_MESSAGE = 'Sign-in did not finish. Try again.';

/**
 * Owns sign-in state. A non-NonStop account is signed straight back out with a message (the rules
 * would deny it everything anyway). A NonStop account is "ready" only once its profile document
 * exists, so assignments claimed at first sign-in are there when Home renders. When the profile's
 * `roles` mirror disagrees with the token's claims the token is refreshed once.
 */
export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<Role[]>(['learner']);
  const [team, setTeam] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);
  const stopProfile = useRef<() => void>(() => {});

  useEffect(() => {
    service.finishRedirect().catch((e: unknown) => {
      log.error('Sign-in redirect failed', e);
      setError(RETRY_MESSAGE);
    });
  }, [service]);

  useEffect(() => {
    const stop = service.onUser((u) => {
      stopProfile.current();
      stopProfile.current = () => {};
      if (!u) {
        setUser(null);
        setRoles(['learner']);
        setTeam(null);
        setLabels(null);
        setStatus('signedOut');
        return;
      }
      if (!u.emailVerified || !isAllowedEmail(u.email)) {
        setUser(null);
        setError(deniedMessage(u.email));
        setWrongAccount(true);
        setStatus('denied');
        void service.signOut();
        return;
      }
      setError(null);
      setWrongAccount(false);
      setUser(u);
      // Signed in to Google but not yet to Gurukul: show progress, not the sign-in button again.
      setStatus('loading');
      let current = rolesFromClaims({});
      void service.claims(u, false).then((c) => {
        current = rolesFromClaims(c);
        setRoles(current);
      });
      stopProfile.current = service.watchProfile(
        u.uid,
        (profile) => {
          if (!profile) return;
          const mirror = [...profile.roles].sort().join();
          if (mirror !== [...current].sort().join()) {
            void service.claims(u, true).then((c) => {
              current = rolesFromClaims(c);
              setRoles(current);
            });
          }
          setTeam(profile.team ?? null);
          setLabels(profile.labels ?? null);
          setStatus('ready');
        },
        (e) => {
          // A silent failure here left people on the sign-in page with nothing happening.
          log.error('Profile watch failed', e);
          setError(RETRY_MESSAGE);
          setStatus('signedOut');
          // Firebase does not announce the same account signing in twice: sign out so a retry does.
          void service.signOut();
        },
      );
    });
    return () => {
      stop();
      stopProfile.current();
    };
  }, [service]);

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      roles,
      team,
      labels,
      error,
      wrongAccount,
      signIn: async (options) => {
        setError(null);
        try {
          await service.signIn(options);
        } catch (e) {
          log.error('Sign-in failed', e);
          setError(RETRY_MESSAGE);
        }
      },
      signOut: () => service.signOut(),
    }),
    [status, user, roles, team, labels, error, wrongAccount, service],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
