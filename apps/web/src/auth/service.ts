import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import type { LabelSet } from '@gurukul/schema';
import type { Firebase } from '../firebase';

/** A signed-in Firebase user, reduced to what the app reads. */
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
}

/** The profile mirror (`users/{uid}`) the app waits for before showing Home. */
export interface ProfileMirror {
  roles: string[];
  displayName: string;
  team: string | null;
  /** Unset until the person picks which names the app shows them. */
  labels?: LabelSet | undefined;
}

export interface SignInOptions {
  chooseAccount?: boolean;
}

/**
 * iPhone and iPad (every iOS browser is Safari underneath) block or lose the sign-in popup, so they
 * sign in by redirect. iPadOS reports itself as a Mac; touch points tell them apart.
 */
export function prefersRedirect(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>): boolean {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}

/** The person closed or replaced the popup: nothing went wrong, so nothing is shown. */
const CANCELLED = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

const codeOf = (e: unknown) => (e as { code?: unknown } | null)?.code;

/**
 * Everything the session needs from Firebase, as a port: the provider takes one, so tests pass a
 * fake and the real app passes `firebaseAuthService`.
 */
export interface AuthService {
  onUser(cb: (user: AuthUser | null) => void): () => void;
  /**
   * Starts Google sign-in. Resolves quietly when the person closes the popup; `chooseAccount`
   * makes Google show its account picker instead of reusing the account it remembers.
   */
  signIn(options?: SignInOptions): Promise<void>;
  /** Finishes a redirect sign-in begun on the previous page load; resolves when there was none. */
  finishRedirect(): Promise<void>;
  signOut(): Promise<void>;
  /** Role claims from the ID token; `refresh` forces a new token so fresh claims apply. */
  claims(user: AuthUser, refresh: boolean): Promise<{ educator?: boolean; admin?: boolean }>;
  watchProfile(uid: string, cb: (p: ProfileMirror | null) => void): () => void;
}

export function firebaseAuthService(
  { auth }: Pick<Firebase, 'auth'>,
  watchProfile: AuthService['watchProfile'],
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator,
): AuthService {
  return {
    onUser: (cb) =>
      onAuthStateChanged(auth, (u) =>
        cb(
          u && {
            uid: u.uid,
            email: u.email,
            emailVerified: u.emailVerified,
            displayName: u.displayName,
            photoURL: u.photoURL,
          },
        ),
      ),
    async signIn(options = {}) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        hd: 'nonstopio.com',
        ...(options.chooseAccount ? { prompt: 'select_account' } : {}),
      });
      if (prefersRedirect(nav)) return signInWithRedirect(auth, provider);
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (CANCELLED.has(codeOf(e) as string)) return;
        // A blocked popup still gets the person signed in, by leaving the page and coming back.
        if (codeOf(e) === 'auth/popup-blocked') return signInWithRedirect(auth, provider);
        throw e;
      }
    },
    async finishRedirect() {
      await getRedirectResult(auth);
    },
    signOut: () => signOut(auth),
    async claims(_user, refresh) {
      const token = await auth.currentUser?.getIdTokenResult(refresh);
      return (token?.claims ?? {}) as { educator?: boolean; admin?: boolean };
    },
    watchProfile,
  };
}
