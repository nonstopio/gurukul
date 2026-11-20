import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth';
import type { LabelSet } from '@gurukul/schema';
import { bridgeFailure, desktopBridge, type GurukulDesktop } from '../desktop/bridge';
import type { Firebase } from '../firebase';

/** A signed-in Firebase user, reduced to what the app reads. */
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  /** This sign-in created the account (`sign_up` in analytics). */
  firstSignIn?: boolean;
}

/** The profile mirror (`users/{uid}`) the app waits for before showing Home. */
export interface ProfileMirror {
  roles: string[];
  displayName: string;
  team: string | null;
  /** `teamId` of each team the person is on (`users/{uid}.teamIds`, set by functions); unset means none. */
  teamIds?: string[] | undefined;
  /** Unset until the person picks which labels the app shows them. */
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
 * A sign-in that did not finish for a reason the person can act on: its message is shown as it is,
 * where any other failure shows "Sign-in did not finish. Try again." `reason` is for the log.
 */
export class SignInProblem extends Error {
  override name = 'SignInProblem';
  constructor(
    readonly reason: 'timeout' | 'not_configured' | 'update_app',
    message: string,
  ) {
    super(message);
  }
}

export const DESKTOP_SIGN_IN_MESSAGES = {
  timeout: 'The browser did not finish signing in. Try again.',
  not_configured:
    'This copy of Gurukul Studio was built without Google sign-in. Install a released version.',
  update_app: 'Update Gurukul Studio to sign in: this version cannot open Google sign-in.',
} as const satisfies Record<SignInProblem['reason'], string>;

const problem = (reason: SignInProblem['reason']) =>
  new SignInProblem(reason, DESKTOP_SIGN_IN_MESSAGES[reason]);

/**
 * Sign-in inside the Gurukul Studio desktop app, where Google refuses embedded windows: the app runs
 * Google's sign-in in the system browser and hands back an ID token, and Firebase signs in with it.
 * Closing or cancelling in the browser resolves quietly, like closing the popup. The
 * `@nonstopio.com` check stays where it is for every sign-in: `AuthProvider` and the security rules.
 */
async function signInThroughDesktop(auth: Auth, desktop: GurukulDesktop): Promise<void> {
  let result;
  try {
    result = await desktop.auth.googleSignIn();
  } catch (e) {
    if (bridgeFailure(e) === 'not_available') throw problem('update_app');
    throw e;
  }
  if (result.ok) {
    await signInWithCredential(auth, GoogleAuthProvider.credential(result.idToken));
    return;
  }
  if (result.reason === 'cancelled') return;
  if (result.reason === 'failed') throw new Error('Desktop Google sign-in failed');
  throw problem(result.reason);
}

/**
 * Everything the session needs from Firebase, as a port: the provider takes one, so tests pass a
 * fake and the real app passes `firebaseAuthService`.
 */
export interface AuthService {
  onUser(cb: (user: AuthUser | null) => void): () => void;
  /**
   * Starts Google sign-in. Resolves quietly when the person closes the popup; `chooseAccount`
   * makes Google show its account picker instead of reusing the account it remembers. In the
   * desktop app the system browser signs in instead, and always shows the picker.
   */
  signIn(options?: SignInOptions): Promise<void>;
  /** Finishes a redirect sign-in begun on the previous page load; resolves when there was none. */
  finishRedirect(): Promise<void>;
  signOut(): Promise<void>;
  /** Role claims from the ID token; `refresh` forces a new token so fresh claims apply. */
  claims(user: AuthUser, refresh: boolean): Promise<{ educator?: boolean; admin?: boolean }>;
  /** Watches `users/{uid}`; `onError` hears why the watch stopped (it is not restarted). */
  watchProfile(
    uid: string,
    cb: (p: ProfileMirror | null) => void,
    onError: (error: unknown) => void,
  ): () => void;
}

export function firebaseAuthService(
  { auth }: Pick<Firebase, 'auth'>,
  watchProfile: AuthService['watchProfile'],
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator,
  desktop: () => GurukulDesktop | null = desktopBridge,
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
            firstSignIn: u.metadata.creationTime === u.metadata.lastSignInTime,
          },
        ),
      ),
    async signIn(options = {}) {
      const app = desktop();
      if (app !== null) return signInThroughDesktop(auth, app);
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
