import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
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
}

/**
 * Everything the session needs from Firebase, as a port: the provider takes one, so tests pass a
 * fake and the real app passes `firebaseAuthService`.
 */
export interface AuthService {
  onUser(cb: (user: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Role claims from the ID token; `refresh` forces a new token so fresh claims apply. */
  claims(user: AuthUser, refresh: boolean): Promise<{ acharya?: boolean; kulapati?: boolean }>;
  watchProfile(uid: string, cb: (p: ProfileMirror | null) => void): () => void;
}

export function firebaseAuthService({ auth, db }: Pick<Firebase, 'auth' | 'db'>): AuthService {
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
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: 'nonstopio.com' });
      await signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
    async claims(_user, refresh) {
      const token = await auth.currentUser?.getIdTokenResult(refresh);
      return (token?.claims ?? {}) as { acharya?: boolean; kulapati?: boolean };
    },
    watchProfile: (uid, cb) =>
      onSnapshot(doc(db, 'users', uid), (snap) =>
        cb(snap.exists() ? (snap.data() as ProfileMirror) : null),
      ),
  };
}
