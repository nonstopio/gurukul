import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import type { Functions } from 'firebase/functions';

/** The public Firebase web config. Not secret, but configuration: it comes from VITE_FIREBASE_*. */
export interface FirebaseEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  /** The GA4 web stream id (`G-...`). Analytics sends nothing without it. */
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  /** The project's Cloud Storage bucket for lesson uploads; left out, `<projectId>.firebasestorage.app`. */
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_USE_EMULATORS?: string;
  /** "true" only in the production build: previews, CI and local runs must not report. */
  VITE_PERFORMANCE_MONITORING?: string;
}

export interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  functions: Functions;
  /** The bucket lesson uploads go to; also what publishing expects an uploaded address to be in. */
  storageBucket: string;
}

/** With the emulator switch on, the demo project id keeps every call away from production. */
export function firebaseConfig(env: FirebaseEnv) {
  const emulators = env.VITE_USE_EMULATORS === 'true';
  const projectId = emulators ? 'demo-gurukul' : (env.VITE_FIREBASE_PROJECT_ID ?? '');
  return {
    apiKey: env.VITE_FIREBASE_API_KEY ?? (emulators ? 'demo-key' : ''),
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId,
    appId: env.VITE_FIREBASE_APP_ID ?? '',
    // Emulators never get one, so local work cannot reach the real property.
    ...(!emulators && env.VITE_FIREBASE_MEASUREMENT_ID
      ? { measurementId: env.VITE_FIREBASE_MEASUREMENT_ID }
      : {}),
    // A new project's default bucket is named after it, so a build without the variable still works.
    storageBucket:
      (emulators ? undefined : env.VITE_FIREBASE_STORAGE_BUCKET) ||
      (projectId ? `${projectId}.firebasestorage.app` : ''),
  };
}

/**
 * Initialises Firebase once from the environment, connecting the local emulators when asked.
 * Firestore is not started here: `firestore.ts` loads it on demand, so its SDK stays out of the
 * initial bundle.
 */
export function initFirebase(env: FirebaseEnv): Firebase {
  const config = firebaseConfig(env);
  const app = initializeApp(config);
  const auth = getAuth(app);
  const functions = getFunctions(app, 'asia-south1');
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  return { app, auth, functions, storageBucket: config.storageBucket };
}
