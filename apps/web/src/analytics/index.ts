import type { FirebaseApp } from 'firebase/app';
import { log } from '../log';
import { createAnalytics } from './core/analytics';
import { ConsoleAnalyticsProvider } from './core/consoleProvider';
import { lazyProvider } from './core/lazyProvider';
import { NoopAnalyticsProvider } from './core/noopProvider';
import { CONSENT_DENIED } from './core/types';
import type { AnalyticsProvider } from './core/types';

export { createAnalytics } from './core/analytics';
export type { Analytics, AnalyticsOptions } from './core/analytics';
export type { AnalyticsEvents, EventName } from './events';

/** The environment variables analytics reads. Documented in `docs/analytics.md`. */
export interface AnalyticsEnv {
  /** Vite's build mode: `production`, `development` or `test`. */
  MODE?: string;
  DEV?: boolean;
  /** `false` is the kill switch: nothing is loaded, queued or sent. */
  VITE_ANALYTICS_ENABLED?: string;
  /** `true` sends to GA4 from a development build, with `debug_mode` for DebugView. */
  VITE_ANALYTICS_DEBUG?: string;
  VITE_APP_VERSION?: string;
  VITE_USE_EMULATORS?: string;
}

/**
 * Which destinations a build sends to. Test: none. Emulators: the console only, so local work never
 * reaches the real property. Production: GA4. Development: the console, plus GA4 with `debug_mode`
 * when `VITE_ANALYTICS_DEBUG=true`.
 */
export function providersFor(env: AnalyticsEnv, app: FirebaseApp): AnalyticsProvider[] {
  if (env.VITE_ANALYTICS_ENABLED === 'false' || env.MODE === 'test') {
    return [new NoopAnalyticsProvider()];
  }
  if (env.VITE_USE_EMULATORS === 'true') return [new ConsoleAnalyticsProvider()];
  const production = env.MODE === 'production';
  const firebase = lazyProvider(async () => {
    const { FirebaseAnalyticsProvider } = await import('./core/firebaseProvider');
    return new FirebaseAnalyticsProvider(app, !production);
  });
  if (production) return [firebase];
  return env.VITE_ANALYTICS_DEBUG === 'true'
    ? [new ConsoleAnalyticsProvider(), firebase]
    : [new ConsoleAnalyticsProvider()];
}

/** The one instance the app uses. A no-op until `configureAnalytics` runs at boot. */
export const analytics = createAnalytics();

/**
 * Chooses providers for this build and sets the default parameters. Consent starts denied: the
 * signed-in session grants it (`AnalyticsSession`), so a visitor who is not signed in sends nothing.
 */
export function configureAnalytics(env: AnalyticsEnv, app: FirebaseApp): void {
  analytics.configure({
    providers: providersFor(env, app),
    enabled: env.VITE_ANALYTICS_ENABLED !== 'false',
    dev: env.DEV === true,
    defaults: {
      app_version: env.VITE_APP_VERSION ?? 'unknown',
      environment: env.MODE ?? 'production',
      platform: 'web',
    },
    consent: CONSENT_DENIED,
    warn: (message, fields) => log.warn(message, fields),
  });
}
