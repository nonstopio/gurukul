import type { FirebaseApp } from 'firebase/app';
// The only file in the repository allowed to import this (ESLint: no-restricted-imports).
import {
  initializeAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
  setConsent,
  setUserId,
  setUserProperties,
} from 'firebase/analytics';
import type { Analytics } from 'firebase/analytics';
import type { AnalyticsProvider, ConsentState, Params } from './types';

/**
 * Google Analytics 4 through the Firebase SDK, on the app `initFirebase` already created. It sends
 * nothing when the browser cannot run analytics or the web app has no `measurementId`.
 * `debug_mode` shows events in GA4 DebugView.
 */
export class FirebaseAnalyticsProvider implements AnalyticsProvider {
  private analytics: Analytics | undefined;
  /** GA4 cannot list user properties, so remember the names set in order to clear them. */
  private readonly propNames = new Set<string>();

  constructor(
    private readonly app: FirebaseApp,
    private readonly debugMode = false,
  ) {}

  async init() {
    if (this.analytics || !this.app.options.measurementId || !(await isSupported())) return;
    // Firebase would otherwise log its own page_view on load; the router sends exactly one per
    // navigation instead.
    this.analytics = initializeAnalytics(this.app, {
      config: { send_page_view: false, ...(this.debugMode ? { debug_mode: true } : {}) },
    });
  }
  track(event: string, params: Params) {
    if (this.analytics) logEvent(this.analytics, event, params);
  }
  pageView(params: Params) {
    this.track('page_view', params);
  }
  identify(userId: string | null) {
    if (this.analytics) setUserId(this.analytics, userId);
  }
  setUserProperties(props: Params) {
    if (!this.analytics) return;
    Object.keys(props).forEach((name) => this.propNames.add(name));
    setUserProperties(this.analytics, props);
  }
  setConsent(state: ConsentState) {
    if (this.analytics) setConsent({ ...state });
  }
  setEnabled(enabled: boolean) {
    if (this.analytics) setAnalyticsCollectionEnabled(this.analytics, enabled);
  }
  reset() {
    this.identify(null);
    if (this.analytics && this.propNames.size) {
      setUserProperties(
        this.analytics,
        Object.fromEntries([...this.propNames].map((n) => [n, null])),
      );
      this.propNames.clear();
    }
  }
}
