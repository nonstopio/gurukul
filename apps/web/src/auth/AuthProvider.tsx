import { isAllowedEmail, rolesFromClaims } from '@gurukul/schema';
import type { Role } from '@gurukul/schema';
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
  const [roles, setRoles] = useState<Role[]>(['shishya']);
  const [team, setTeam] = useState<string | null>(null);
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
        setRoles(['shishya']);
        setTeam(null);
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
      let current = rolesFromClaims({});
      void service.claims(u, false).then((c) => {
        current = rolesFromClaims(c);
        setRoles(current);
      });
      stopProfile.current = service.watchProfile(u.uid, (profile) => {
        if (!profile) return;
        const mirror = [...profile.roles].sort().join();
        if (mirror !== [...current].sort().join()) {
          void service.claims(u, true).then((c) => {
            current = rolesFromClaims(c);
            setRoles(current);
          });
        }
        setTeam(profile.team ?? null);
        setStatus('ready');
      });
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
    [status, user, roles, team, error, wrongAccount, service],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
