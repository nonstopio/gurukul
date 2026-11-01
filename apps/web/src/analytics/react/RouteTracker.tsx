import { useEffect, useRef } from 'react';
import type { DataRouter, RouterState } from 'react-router';
import { useAnalytics, useConsent } from './context';

/**
 * Sends one `page_view` for the page the router has settled on, including the first load, and
 * never for a navigation that is still loading. Title and location are read after the page has
 * rendered, so the title is the new page's. `includeQuery` decides whether `?a=b` counts as a
 * different page and is sent.
 */
export function RouteTracker({
  router,
  includeQuery = false,
}: {
  router: DataRouter;
  includeQuery?: boolean | undefined;
}) {
  const analytics = useAnalytics();
  // Nothing is counted until consent; the page the person is on is counted the moment it is given.
  const granted = useConsent() === 'granted';
  // A ref, not a variable in the effect: StrictMode runs the effect twice and the page must not
  // be counted twice. It is set only once the view is sent, so a timer cancelled by the first
  // run is scheduled again by the second.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!granted) {
      // Signing out ends the visit: the next person's first page counts, even on the same path.
      sent.current = null;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (state: RouterState) => {
      clearTimeout(timer);
      if (!state.initialized || state.navigation.state !== 'idle') return;
      const { pathname, search } = state.location;
      const path = includeQuery ? pathname + search : pathname;
      if (path === sent.current) return;
      timer = setTimeout(() => {
        sent.current = path;
        analytics.pageView({
          page_path: path,
          page_title: document.title,
          page_location: window.location.origin + path,
        });
      }, 0);
    };
    settle(router.state);
    const stop = router.subscribe(settle);
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [analytics, router, includeQuery, granted]);
  return null;
}
