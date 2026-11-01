/** A value GA4 accepts for an event parameter or a user property. */
export type ParamValue = string | number | boolean;
export type Params = Record<string, ParamValue>;

export type ConsentValue = 'granted' | 'denied';

/** Google Consent Mode v2: the four signals GA4 reads. */
export interface ConsentState {
  analytics_storage: ConsentValue;
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
}

/** Nothing is collected until the person accepts the privacy policy at sign-in. */
export const CONSENT_DENIED: ConsentState = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};

/** Gurukul measures usage only: it runs no ads, so the three advertising signals stay denied. */
export const CONSENT_GRANTED: ConsentState = { ...CONSENT_DENIED, analytics_storage: 'granted' };

/**
 * One analytics destination. Features never call a provider: they call the `analytics` facade,
 * which validates, strips personal data, gates on consent and fans out to every provider. Adding a
 * destination (Mixpanel, PostHog) means writing one class that implements this.
 */
export interface AnalyticsProvider {
  /** Loads the SDK. Called once, and only after consent. May reject: the facade swallows it. */
  init(): Promise<void>;
  track(event: string, params: Params): void;
  pageView(params: Params): void;
  /** An internal opaque user id, or `null` on sign-out. */
  identify(userId: string | null): void;
  setUserProperties(props: Params): void;
  setConsent(state: ConsentState): void;
  setEnabled(enabled: boolean): void;
  /** Forget the user id and user properties (sign-out). */
  reset(): void;
}
