import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import '@gurukul/ui/tokens.css';
import './styles.css';
import { App } from './App';
import { firebaseAuthService } from './auth/service';
import { firebaseConsoleData } from './console/firebase';
import { firebaseConsoleService } from './console/service';
import { firebaseLearnerData } from './data/firebase';
import { initFirebase } from './firebase';
import { firebaseParikshaService } from './pariksha/service';
import { firebaseStudioData } from './studio/firebase';
import { firebaseStudioService } from './studio/service';
import type { FirebaseEnv } from './firebase';
import { appRoutes } from './routes';

/** Mount the app into `#root`. Exported so the boot path is testable. */
export function mount(element: HTMLElement | null, env = import.meta.env as FirebaseEnv): void {
  if (!element) {
    throw new Error('Gurukul: #root element is missing from index.html');
  }
  const firebase = initFirebase(env);
  const service = firebaseAuthService(firebase);
  const data = firebaseLearnerData(firebase.db);
  createRoot(element).render(
    <StrictMode>
      <App
        service={service}
        data={data}
        pariksha={firebaseParikshaService(firebase.functions)}
        studio={{
          data: firebaseStudioData(firebase.db),
          service: firebaseStudioService(firebase.functions),
        }}
        console={{
          data: firebaseConsoleData(firebase.db),
          service: firebaseConsoleService(firebase.functions),
        }}
        router={createBrowserRouter(appRoutes())}
      />
    </StrictMode>,
  );
}

mount(document.getElementById('root'));
