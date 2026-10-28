import type { FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import type { ProfileMirror } from './auth/service';
import { firebaseConsoleData } from './console/firebase';
import { firebaseLearnerData } from './data/firebase';
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
    watchProfile: (uid: string, cb: (p: ProfileMirror | null) => void) =>
      onSnapshot(doc(db, 'users', uid), (snap) =>
        cb(snap.exists() ? (snap.data() as ProfileMirror) : null),
      ),
  };
}

export type Firestores = ReturnType<typeof openFirestore>;
