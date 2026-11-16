import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import './fonts.css';
import '@gurukul/ui/tokens.css';
import './styles.css';
import './learn.css';
import './console.css';
import './studio.css';
import { App } from './App';
import { checkForNewBuild, reloadOnStaleBuild } from './boot';
import { firebaseAuthService } from './auth/service';
import type { AuthService } from './auth/service';
import { firebaseConsoleService } from './console/service';
import { configureAnalytics } from './analytics';
import { initFirebase } from './firebase';
import { lazyPort } from './lazy';
import { log } from './log';
import { firebaseQuizService } from './quiz/service';
import { firebaseStudioService } from './studio/service';
import type { AnalyticsEnv } from './analytics';
import { STORAGE_EMULATOR_HOST } from './studio/emulator';
import type { FirebaseEnv } from './firebase';
import type { Firestores } from './firestore';
import type { ConsoleData } from './console/types';
import type { MediaStorage, StudioData } from './studio/types';
import { appRoutes } from './routes';
import { stopApi } from './api';
import { setUpdate } from './update';
import { REQUIRED_UPDATE } from './version';

/** Set while someone is signed in on this browser, so the next visit can start Firestore early. */
const SIGNED_IN_KEY = 'gurukul.signedIn';

/** Blocked storage throws on access: that means no early start, and nothing else depends on it. */
function inStorage<T>(fn: (storage: Storage) => T): T | undefined {
  try {
    return fn(localStorage);
  } catch {
    return undefined;
  }
}

/** Mount the app into `#root`. Exported so the boot path is testable. */
export function mount(
  element: HTMLElement | null,
  env = import.meta.env as FirebaseEnv & AnalyticsEnv & { VITE_BUILD_ID?: string },
): void {
  if (!element) {
    throw new Error('Gurukul: #root element is missing from index.html');
  }
  const firebase = initFirebase(env);
  configureAnalytics(env, firebase.app);
  // The Firestore SDK is its own chunk (learner data only; Studio and console data are chunks of
  // their own). It is fetched the first time something reads data: right after sign-in (the
  // profile watch), or at once on a returning person's visit (`SIGNED_IN_KEY`, below), so the
  // download overlaps the auth restore. Never for a visitor who has not signed in.
  // A failed download is forgotten, so the next sign-in fetches the chunk again.
  // After a required update nothing opens Firestore again (`freeze`).
  let stores: Promise<Firestores> | undefined;
  let frozen = false;
  const firestores = () =>
    frozen
      ? Promise.reject(new Error('Gurukul: stopped for a required update'))
      : (stores ??= import('./firestore').then(
          (m) => m.openFirestore(firebase.app, env.VITE_USE_EMULATORS === 'true'),
          (e: unknown) => {
            stores = undefined;
            throw e;
          },
        ));
  // Not a lazyPort watcher: a chunk that fails to download must reach `onError`, or sign-in hangs.
  const auth = firebaseAuthService(firebase, (uid, cb, onError) => {
    let stop: (() => void) | undefined;
    let left = false;
    inStorage((s) => s.setItem(SIGNED_IN_KEY, '1'));
    void firestores().then(
      (s) => {
        if (!left) stop = s.watchProfile(uid, cb, onError);
      },
      (e: unknown) => {
        if (!left) onError(e);
      },
    );
    return () => {
      left = true;
      stop?.();
    };
  });
  // Signing out also deletes this browser's Firestore cache (`leave`); the next sign-in opens a
  // fresh instance. Never opened, or failed to download: there is nothing to delete.
  const service: AuthService = {
    ...auth,
    // No user (never signed in, expired session, or signed out): forget the early-start flag.
    onUser: (cb) =>
      auth.onUser((user) => {
        if (!user) inStorage((s) => s.removeItem(SIGNED_IN_KEY));
        cb(user);
      }),
    async signOut() {
      const open = await stores?.catch(() => undefined);
      if (!open) return auth.signOut();
      try {
        await open.leave(auth.signOut);
      } finally {
        stores = undefined;
      }
    },
  };
  // The Studio and console data modules load on their first use and are built once per opened
  // Firestore (the console keeps a roster cache); a new instance after sign-out gets new ones.
  const dataFor = <T extends object>(build: (db: Firestores['db']) => Promise<T>) => {
    let built: { s: Firestores; data: Promise<T> } | undefined;
    return () =>
      firestores().then((s) => {
        if (built?.s === s) return built.data;
        const data = build(s.db).catch((e: unknown) => {
          built = undefined;
          throw e;
        });
        built = { s, data };
        return data;
      });
  };
  const studioData = dataFor<StudioData>((db) =>
    import('./studio/firebase').then((m) => m.firebaseStudioData(db)),
  );
  const consoleData = dataFor<ConsoleData>((db) =>
    import('./console/firebase').then((m) => m.firebaseConsoleData(db)),
  );
  const data = lazyPort(() => firestores().then((s) => s.learner), ['watchProgress']);
  // The Cloud Storage SDK is its own chunk too, fetched by the first upload, never by a learner.
  // It is started once (connecting an emulator twice throws); a failed download is forgotten.
  const emulators = env.VITE_USE_EMULATORS === 'true';
  let media: Promise<MediaStorage> | undefined;
  const mediaStorage = () =>
    (media ??= import('./studio/storage').then(
      (m) => m.firebaseMediaStorage(firebase.app, emulators),
      (e: unknown) => {
        media = undefined;
        throw e;
      },
    ));
  // A required update stops this tab: the API refuses calls at once, and Firestore is terminated if
  // it was opened (unsent writes stay queued in its cache for the reloaded page). The dialog asking
  // the person to update shows once Firestore has stopped, so nothing is sent while it is up.
  const freeze = () => {
    frozen = true;
    stopApi();
    return Promise.resolve(stores)
      .then((s) => s?.stop())
      .catch(() => {});
  };
  // A returning person: start the download now instead of after the auth restore. A failure is
  // forgotten by `firestores`, so the profile watch tries again.
  if (inStorage((s) => s.getItem(SIGNED_IN_KEY))) firestores().catch(() => {});
  reloadOnStaleBuild();
  checkForNewBuild(env.VITE_BUILD_ID, REQUIRED_UPDATE, (update) => {
    if (update.kind === 'soft') return setUpdate(update);
    void freeze().then(() => setUpdate(update));
  });
  createRoot(element).render(
    <StrictMode>
      <App
        service={service}
        data={data}
        quiz={firebaseQuizService(firebase.functions)}
        studio={{
          data: lazyPort(studioData),
          service: firebaseStudioService(firebase.functions),
          storage: lazyPort(mediaStorage),
          checks: {
            bucket: firebase.storageBucket,
            emulatorHost: emulators ? STORAGE_EMULATOR_HOST : undefined,
          },
        }}
        console={{
          data: lazyPort(consoleData),
          service: firebaseConsoleService(firebase.functions),
        }}
        router={createBrowserRouter(appRoutes())}
      />
    </StrictMode>,
  );
  // Opt-in, set by the production deploy only: previews, Lighthouse and local runs would otherwise
  // report into production's numbers. A blocked or failed download only costs the timings.
  if (env.VITE_PERFORMANCE_MONITORING === 'true') {
    void import('./performance')
      .then((m) => m.startPerformance(firebase.app))
      .catch(() => log.warn('Performance monitoring did not start'));
  }
}

mount(document.getElementById('root'));
