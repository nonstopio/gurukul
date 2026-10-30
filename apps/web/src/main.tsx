import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import '@gurukul/ui/tokens.css';
import './styles.css';
import './learn.css';
import './console.css';
import './studio.css';
import { App } from './App';
import { firebaseAuthService } from './auth/service';
import { firebaseConsoleService } from './console/service';
import { initFirebase } from './firebase';
import { lazyPort } from './lazy';
import { firebaseQuizService } from './quiz/service';
import { firebaseStudioService } from './studio/service';
import type { FirebaseEnv } from './firebase';
import type { Firestores } from './firestore';
import { appRoutes } from './routes';

/** Mount the app into `#root`. Exported so the boot path is testable. */
export function mount(element: HTMLElement | null, env = import.meta.env as FirebaseEnv): void {
  if (!element) {
    throw new Error('Gurukul: #root element is missing from index.html');
  }
  const firebase = initFirebase(env);
  // The Firestore SDK is its own chunk, fetched the first time something reads data: right after
  // sign-in (the profile watch), never for a visitor who has not signed in.
  // A failed download is forgotten, so the next sign-in fetches the chunk again.
  let stores: Promise<Firestores> | undefined;
  const firestores = () =>
    (stores ??= import('./firestore').then(
      (m) => m.openFirestore(firebase.app, env.VITE_USE_EMULATORS === 'true'),
      (e: unknown) => {
        stores = undefined;
        throw e;
      },
    ));
  // Not a lazyPort watcher: a chunk that fails to download must reach `onError`, or sign-in hangs.
  const service = firebaseAuthService(firebase, (uid, cb, onError) => {
    let stop: (() => void) | undefined;
    let left = false;
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
  const data = lazyPort(() => firestores().then((s) => s.learner), ['watchProgress']);
  createRoot(element).render(
    <StrictMode>
      <App
        service={service}
        data={data}
        quiz={firebaseQuizService(firebase.functions)}
        studio={{
          data: lazyPort(() => firestores().then((s) => s.studio)),
          service: firebaseStudioService(firebase.functions),
        }}
        console={{
          data: lazyPort(() => firestores().then((s) => s.console)),
          service: firebaseConsoleService(firebase.functions),
        }}
        router={createBrowserRouter(appRoutes())}
      />
    </StrictMode>,
  );
}

mount(document.getElementById('root'));
