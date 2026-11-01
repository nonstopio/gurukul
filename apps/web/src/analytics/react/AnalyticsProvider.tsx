import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { DataRouter } from 'react-router';
import type { Analytics } from '../index';
import { analytics as singleton } from '../index';
import { AnalyticsContext } from './context';
import { RouteTracker } from './RouteTracker';

/**
 * Mount once at the app root, inside the sign-in provider. Starts analytics (it loads only once
 * consent is given) and, when given the router, tracks every page view.
 */
export function AnalyticsProvider({
  analytics = singleton,
  router,
  includeQuery,
  children,
}: {
  analytics?: Analytics;
  router?: DataRouter;
  includeQuery?: boolean | undefined;
  children: ReactNode;
}) {
  useEffect(() => analytics.init(), [analytics]);
  return (
    <AnalyticsContext.Provider value={analytics}>
      {router ? <RouteTracker router={router} includeQuery={includeQuery} /> : null}
      {children}
    </AnalyticsContext.Provider>
  );
}
