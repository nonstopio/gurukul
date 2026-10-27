import { isAllowedEmail, rolesFromClaims } from '@gurukul/schema';
import type { Role } from '@gurukul/schema';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthService, AuthUser } from './service';

export type SessionStatus = 'loading' | 'signedOut' | 'denied' | 'ready';

export interface Session {
  status: SessionStatus;
  user: AuthUser | null;
  roles: Role[];
  /** Why a non-NonStop account was signed back out. */
  error: string | null;
  signIn(): Promise<void>;
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

export const DENIED_MESSAGE =
  'Gurukul is for NonStop io accounts. Sign in with your @nonstopio.com Google account.';

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
  const [error, setError] = useState<string | null>(null);
  const stopProfile = useRef<() => void>(() => {});

  useEffect(() => {
    const stop = service.onUser((u) => {
      stopProfile.current();
      stopProfile.current = () => {};
      if (!u) {
        setUser(null);
        setRoles(['shishya']);
        setStatus('signedOut');
        return;
      }
      if (!u.emailVerified || !isAllowedEmail(u.email)) {
        setUser(null);
        setError(DENIED_MESSAGE);
        setStatus('denied');
        void service.signOut();
        return;
      }
      setError(null);
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
      error,
      signIn: async () => {
        setError(null);
        try {
          await service.signIn();
        } catch {
          setError('Sign-in did not finish. Try again.');
        }
      },
      signOut: () => service.signOut(),
    }),
    [status, user, roles, error, service],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
