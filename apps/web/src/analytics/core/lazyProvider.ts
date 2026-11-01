import type { AnalyticsProvider, ConsentState, Params } from './types';

/**
 * Wraps a provider whose SDK should stay out of the first bundle: `load` runs on `init()`, which
 * the facade calls only after consent. Before it loads every call is dropped, and the facade never
 * makes one before `init()` resolves.
 */
export function lazyProvider(load: () => Promise<AnalyticsProvider>): AnalyticsProvider {
  let inner: AnalyticsProvider | undefined;
  return {
    async init() {
      inner = await load();
      await inner.init();
    },
    track: (event: string, params: Params) => inner?.track(event, params),
    pageView: (params: Params) => inner?.pageView(params),
    identify: (userId: string | null) => inner?.identify(userId),
    setUserProperties: (props: Params) => inner?.setUserProperties(props),
    setConsent: (state: ConsentState) => inner?.setConsent(state),
    setEnabled: (enabled: boolean) => inner?.setEnabled(enabled),
    reset: () => inner?.reset(),
  };
}
