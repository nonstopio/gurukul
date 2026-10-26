import { useEffect } from 'react';
import { AREAS } from './navigation';
import { GlobalSearchProvider, SearchTrigger } from './navigation/GlobalSearch';
import type { AreaNavigation } from './navigation/types';
import { NotFoundPage } from './NotFoundPage';
import { normalizePath, screenFor } from './routes';

export interface AppProps {
  /** The current path. Defaults to the address bar; tests pass their own. */
  path?: string;
  /** How to go somewhere. Defaults to a full page load until React Router arrives in M1. */
  navigate?: (path: string) => void;
}

/** A full page load: the honest navigation until React Router arrives in M1. */
export function goTo(path: string): void {
  window.location.assign(path);
}

/** "Changelog · Gurukul": the page's label from its area's navigation, so the two never drift. */
export function titleFor(path: string, areas: readonly AreaNavigation[] = AREAS): string {
  const target = normalizePath(path);
  const page = areas.flatMap((a) => a.pages).find((p) => p.path === target);
  if (!screenFor(path)) return 'Page not found · Gurukul';
  return page && page.path !== '/' ? `${page.label} · Gurukul` : 'Gurukul · NonStop Academy';
}

export function App({ path = window.location.pathname, navigate = goTo }: AppProps) {
  const page = screenFor(path) ?? <NotFoundPage />;
  useEffect(() => {
    document.title = titleFor(path);
  }, [path]);
  return (
    <GlobalSearchProvider navigate={navigate}>
      <header className="app-bar">
        <SearchTrigger />
      </header>
      {page}
    </GlobalSearchProvider>
  );
}
