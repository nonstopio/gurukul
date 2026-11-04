import { nameKey } from '@gurukul/schema';
import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  updateDoc,
  waitForPendingWrites,
} from 'firebase/firestore';
import type { ProfileMirror } from './auth/service';
import { firebaseConsoleData } from './console/firebase';
import { firebaseLearnerData } from './data/firebase';
import { log } from './log';
import { firebaseStudioData } from './studio/firebase';

/** How long sign-out waits for queued writes to reach the server before it deletes them. */
export const SIGN_OUT_SETTLE_MS = 2000;

/**
 * Everything that needs the Firestore SDK, in one module that `main.tsx` imports dynamically, so
 * the SDK (about 140 KB gzip) is a separate chunk loaded when the app first reads data, not part
 * of the initial bundle. Firestore keeps a persistent local cache, shared across tabs, so the last
 * opened course stays readable offline and progress writes queue until the connection returns.
 */
export function openFirestore(app: FirebaseApp, emulators: boolean) {
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (emulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return {
    learner: firebaseLearnerData(db, () => getAuth(app).currentUser?.uid),
    studio: firebaseStudioData(db),
    console: firebaseConsoleData(db),
    /**
     * Signs out and forgets this browser's copy: gives queued writes a moment to reach the server,
     * runs `signOut`, shuts this instance down and deletes its local cache, queued writes
     * included. Without it a write queue jammed by an old tab survived sign-out and came back with
     * the same person, so "sign out and in again" fixed nothing. The cache cannot be deleted while
     * another tab has it open; that is logged and the next sign-out tries again. The instance is
     * shut down even when `signOut` fails, so the caller always opens a fresh one next.
     */
    leave: async (signOut: () => Promise<void>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        waitForPendingWrites(db).catch(() => undefined),
        new Promise((resolve) => (timer = setTimeout(resolve, SIGN_OUT_SETTLE_MS))),
      ]);
      clearTimeout(timer);
      try {
        await signOut();
      } finally {
        await terminate(db);
        try {
          await clearIndexedDbPersistence(db);
        } catch (e) {
          log.warn('Local cache not cleared', { code: (e as { code?: unknown }).code });
        }
      }
    },
    /**
     * Stops Firestore for good (a required update): listeners end and nothing more is sent. Writes
     * not yet acknowledged stay queued in the persistent cache, and the reloaded page sends them.
     */
    stop: () => terminate(db),
    watchProfile: (
      uid: string,
      cb: (p: ProfileMirror | null) => void,
      onError: (error: unknown) => void,
    ) => {
      let filled = false;
      return onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (!snap.exists()) return cb(null);
          const profile = snap.data() as ProfileMirror & { nameLower?: string };
          // Profiles made before people search by name lack `nameLower`: the owner's next sign-in
          // fills it in, once per watch, so a refused write cannot loop on the reverted snapshot.
          const nameLower =
            typeof profile.displayName === 'string' ? nameKey(profile.displayName) : undefined;
          if (!filled && nameLower !== undefined && profile.nameLower !== nameLower) {
            filled = true;
            updateDoc(snap.ref, { nameLower }).catch((e: unknown) =>
              log.warn('Profile name key not saved', { uid, code: (e as { code?: unknown }).code }),
            );
          }
          cb(profile);
        },
        onError,
      );
    },
  };
}

export type Firestores = ReturnType<typeof openFirestore>;
