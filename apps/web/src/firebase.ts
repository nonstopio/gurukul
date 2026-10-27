import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { Firestore } from 'firebase/firestore';

/** The public Firebase web config. Not secret, but configuration: it comes from VITE_FIREBASE_*. */
export interface FirebaseEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_USE_EMULATORS?: string;
}

export interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

/** With the emulator switch on, the demo project id keeps every call away from production. */
export function firebaseConfig(env: FirebaseEnv) {
  const emulators = env.VITE_USE_EMULATORS === 'true';
  return {
    apiKey: env.VITE_FIREBASE_API_KEY ?? (emulators ? 'demo-key' : ''),
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: emulators ? 'demo-gurukul' : (env.VITE_FIREBASE_PROJECT_ID ?? ''),
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  };
}

/**
 * Initialises Firebase once from the environment, connecting the local emulators when asked.
 * Firestore keeps a persistent local cache, shared across tabs, so the last opened course stays
 * readable offline and progress writes queue until the connection returns.
 */
export function initFirebase(env: FirebaseEnv): Firebase {
  const app = initializeApp(firebaseConfig(env));
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const functions = getFunctions(app, 'asia-south1');
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  return { app, auth, db, functions };
}
