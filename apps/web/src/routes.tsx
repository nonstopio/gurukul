import type { ReactElement } from 'react';
import { ChangelogPage } from './changelog/ChangelogPage';
import { HomePage } from './HomePage';
import type { RoutePath } from './route-paths';

/**
 * The route table: one screen per path in `route-paths.ts`. Every path must also be classified in
 * an area's navigation (`navigation/areas/*.ts`), as a page search offers or as unlisted with a
 * reason — `npm run validate:navigation` fails otherwise. React Router replaces this map in M1.
 */
export const ROUTES: Readonly<Record<RoutePath, ReactElement>> = {
  '/': <HomePage />,
  '/changelog': <ChangelogPage />,
};

/** `/changelog/` and `/changelog` are the same page. */
export function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/** The screen for a path, or undefined when nothing serves it. */
export function screenFor(path: string): ReactElement | undefined {
  return (ROUTES as Record<string, ReactElement>)[normalizePath(path)];
}
