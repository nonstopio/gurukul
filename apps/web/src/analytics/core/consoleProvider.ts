import { log } from '../../log';
import type { AnalyticsProvider, ConsentState, Params } from './types';

/** Writes each call to the developer console through `log` (development and emulators). */
export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  init() {
    log.debug('Analytics ready');
    return Promise.resolve();
  }
  track(event: string, params: Params) {
    log.debug('Analytics event', { event, params });
  }
  pageView(params: Params) {
    log.debug('Analytics page view', { params });
  }
  identify(userId: string | null) {
    log.debug('Analytics identify', { userId });
  }
  setUserProperties(props: Params) {
    log.debug('Analytics user properties', { props });
  }
  setConsent(state: ConsentState) {
    log.debug('Analytics consent', { ...state });
  }
  setEnabled(enabled: boolean) {
    log.debug('Analytics enabled', { enabled });
  }
  reset() {
    log.debug('Analytics reset');
  }
}
