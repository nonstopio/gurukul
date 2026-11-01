import { createContext, useContext, useSyncExternalStore } from 'react';
import { analytics as singleton } from '../index';
import type { Analytics } from '../index';

/** Tests provide a mock here; the app leaves it on the real instance. */
export const AnalyticsContext = createContext<Analytics>(singleton);

/** The typed `track`, `identify`, `setUserProperties`, ... for the current app. */
export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}

/** Whether analytics may collect right now; re-renders when consent changes. */
export function useConsent(): 'granted' | 'denied' {
  const analytics = useAnalytics();
  return useSyncExternalStore(analytics.subscribe, () => analytics.getConsent().analytics_storage);
}
