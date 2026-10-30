import { nameKey } from '@gurukul/schema';
import type { FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  updateDoc,
} from 'firebase/firestore';
import type { ProfileMirror } from './auth/service';
import { firebaseConsoleData } from './console/firebase';
import { firebaseLearnerData } from './data/firebase';
import { log } from './log';
import { firebaseStudioData } from './studio/firebase';

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
    learner: firebaseLearnerData(db),
    studio: firebaseStudioData(db),
    console: firebaseConsoleData(db),
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
