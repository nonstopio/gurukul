import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import '@gurukul/ui/tokens.css';
import './styles.css';
import { App } from './App';
import { firebaseAuthService } from './auth/service';
import { initFirebase } from './firebase';
import type { FirebaseEnv } from './firebase';
import { appRoutes } from './routes';

/** Mount the app into `#root`. Exported so the boot path is testable. */
export function mount(element: HTMLElement | null, env = import.meta.env as FirebaseEnv): void {
  if (!element) {
    throw new Error('Gurukul: #root element is missing from index.html');
  }
  const service = firebaseAuthService(initFirebase(env));
  createRoot(element).render(
    <StrictMode>
      <App service={service} router={createBrowserRouter(appRoutes())} />
    </StrictMode>,
  );
}

mount(document.getElementById('root'));
