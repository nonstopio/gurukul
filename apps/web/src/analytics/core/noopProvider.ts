import type { AnalyticsProvider } from './types';

/** Does nothing: tests, a disabled build, anywhere nothing should be sent. */
export class NoopAnalyticsProvider implements AnalyticsProvider {
  init() {
    return Promise.resolve();
  }
  track() {}
  pageView() {}
  identify() {}
  setUserProperties() {}
  setConsent() {}
  setEnabled() {}
  reset() {}
}
