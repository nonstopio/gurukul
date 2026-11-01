import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
import { CONSENT_DENIED, CONSENT_GRANTED } from '../src/analytics/core/types';
import type { AnalyticsProvider } from '../src/analytics/core/types';

const sdk = vi.hoisted(() => ({
  initializeAnalytics: vi.fn(() => ({ fake: 'analytics' })),
  isSupported: vi.fn(() => Promise.resolve(true)),
  logEvent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
  setConsent: vi.fn(),
  setUserId: vi.fn(),
  setUserProperties: vi.fn(),
}));
vi.mock('firebase/analytics', () => sdk);
const debug = vi.hoisted(() => vi.fn());
vi.mock('../src/log', () => ({ log: { debug, warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { ConsoleAnalyticsProvider } from '../src/analytics/core/consoleProvider';
import { FirebaseAnalyticsProvider } from '../src/analytics/core/firebaseProvider';
import { lazyProvider } from '../src/analytics/core/lazyProvider';
import { NoopAnalyticsProvider } from '../src/analytics/core/noopProvider';
import { analytics, configureAnalytics, providersFor } from '../src/analytics';

const app = (measurementId?: string) => ({ options: { measurementId } }) as unknown as FirebaseApp;

beforeEach(() => vi.clearAllMocks());

describe('FirebaseAnalyticsProvider', () => {
  it('does nothing without a measurement id', async () => {
    const p = new FirebaseAnalyticsProvider(app());
    await p.init();
    p.track('x', {});
    p.pageView({});
    p.identify('u');
    p.setUserProperties({ a: 1 });
    p.setConsent(CONSENT_GRANTED);
    p.setEnabled(false);
    p.reset();
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
    expect(sdk.setUserId).not.toHaveBeenCalled();
  });
  it('does nothing in a browser that cannot run analytics', async () => {
    sdk.isSupported.mockResolvedValueOnce(false);
    await new FirebaseAnalyticsProvider(app('G-1')).init();
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
  });
  it('turns off the automatic page_view and initialises once', async () => {
    const p = new FirebaseAnalyticsProvider(app('G-1'));
    await p.init();
    await p.init();
    expect(sdk.initializeAnalytics).toHaveBeenCalledTimes(1);
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith(expect.anything(), {
      config: { send_page_view: false },
    });
  });
  it('adds debug_mode for DebugView when asked', async () => {
    await new FirebaseAnalyticsProvider(app('G-1'), true).init();
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith(expect.anything(), {
      config: { send_page_view: false, debug_mode: true },
    });
  });
  it('maps each call onto the SDK', async () => {
    const p = new FirebaseAnalyticsProvider(app('G-1'));
    await p.init();
    p.track('course_start', { course_id: 'a' });
    p.pageView({ page_path: '/' });
    p.identify('u');
    p.setUserProperties({ role: 'admin' });
    p.setConsent(CONSENT_DENIED);
    p.setEnabled(false);
    expect(sdk.logEvent).toHaveBeenCalledWith({ fake: 'analytics' }, 'course_start', {
      course_id: 'a',
    });
    expect(sdk.logEvent).toHaveBeenCalledWith({ fake: 'analytics' }, 'page_view', {
      page_path: '/',
    });
    expect(sdk.setUserId).toHaveBeenCalledWith({ fake: 'analytics' }, 'u');
    expect(sdk.setConsent).toHaveBeenCalledWith(CONSENT_DENIED);
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenCalledWith({ fake: 'analytics' }, false);
  });
  it('reset clears the user id and every user property it set', async () => {
    const p = new FirebaseAnalyticsProvider(app('G-1'));
    await p.init();
    p.reset();
    expect(sdk.setUserId).toHaveBeenLastCalledWith({ fake: 'analytics' }, null);
    expect(sdk.setUserProperties).not.toHaveBeenCalled();
    p.setUserProperties({ role: 'admin', team: 'x' });
    p.reset();
    expect(sdk.setUserProperties).toHaveBeenLastCalledWith(
      { fake: 'analytics' },
      { role: null, team: null },
    );
    p.reset();
    expect(sdk.setUserProperties).toHaveBeenCalledTimes(2);
  });
});

describe('ConsoleAnalyticsProvider and NoopAnalyticsProvider', () => {
  it('writes every call through the logger', async () => {
    const p = new ConsoleAnalyticsProvider();
    await p.init();
    p.track('e', { a: 1 });
    p.pageView({ page_path: '/' });
    p.identify('u');
    p.setUserProperties({ r: 'x' });
    p.setConsent(CONSENT_GRANTED);
    p.setEnabled(true);
    p.reset();
    expect(debug).toHaveBeenCalledTimes(8);
    expect(debug).toHaveBeenCalledWith('Analytics event', { event: 'e', params: { a: 1 } });
  });
  it('the no-op does nothing', async () => {
    const p = new NoopAnalyticsProvider();
    await p.init();
    p.track();
    p.pageView();
    p.identify();
    p.setUserProperties();
    p.setConsent();
    p.setEnabled();
    p.reset();
  });
});

describe('lazyProvider', () => {
  it('drops calls until loaded, then delegates every one', async () => {
    const inner: AnalyticsProvider = {
      init: vi.fn(() => Promise.resolve()),
      track: vi.fn(),
      pageView: vi.fn(),
      identify: vi.fn(),
      setUserProperties: vi.fn(),
      setConsent: vi.fn(),
      setEnabled: vi.fn(),
      reset: vi.fn(),
    };
    const load = vi.fn(() => Promise.resolve(inner));
    const p = lazyProvider(load);
    p.track('early', {});
    expect(load).not.toHaveBeenCalled();
    await p.init();
    p.track('e', {});
    p.pageView({});
    p.identify('u');
    p.setUserProperties({});
    p.setConsent(CONSENT_GRANTED);
    p.setEnabled(true);
    p.reset();
    expect(inner.init).toHaveBeenCalled();
    expect(inner.track).toHaveBeenCalledTimes(1);
    expect(inner.reset).toHaveBeenCalled();
  });
});

describe('provider selection', () => {
  const kinds = (env: Parameters<typeof providersFor>[0]) =>
    providersFor(env, app('G-1')).map((p) => p.constructor.name);
  it('uses the no-op in tests and when the kill switch is off', () => {
    expect(kinds({ MODE: 'test' })).toEqual(['NoopAnalyticsProvider']);
    expect(kinds({ MODE: 'production', VITE_ANALYTICS_ENABLED: 'false' })).toEqual([
      'NoopAnalyticsProvider',
    ]);
  });
  it('uses only the console against the emulators', () => {
    expect(kinds({ MODE: 'production', VITE_USE_EMULATORS: 'true' })).toEqual([
      'ConsoleAnalyticsProvider',
    ]);
  });
  it('uses GA4 in production', () => {
    expect(kinds({ MODE: 'production' })).toHaveLength(1);
    expect(kinds({ MODE: 'production' })[0]).not.toMatch(/Console|Noop/);
  });
  it('uses the console in development, plus GA4 when opted in', () => {
    expect(kinds({ MODE: 'development' })).toEqual(['ConsoleAnalyticsProvider']);
    expect(kinds({ MODE: 'development', VITE_ANALYTICS_DEBUG: 'true' })).toHaveLength(2);
  });
  it('loads the Firebase adapter on init, with debug_mode outside production', async () => {
    const dev = providersFor({ MODE: 'development', VITE_ANALYTICS_DEBUG: 'true' }, app('G-1'))[1];
    await dev?.init();
    expect(sdk.initializeAnalytics).toHaveBeenLastCalledWith(expect.anything(), {
      config: { send_page_view: false, debug_mode: true },
    });
    const prod = providersFor({ MODE: 'production' }, app('G-1'))[0];
    await prod?.init();
    expect(sdk.initializeAnalytics).toHaveBeenLastCalledWith(expect.anything(), {
      config: { send_page_view: false },
    });
  });
});

describe('configureAnalytics', () => {
  it('sets consent denied, with the default parameters and a logging warn', async () => {
    configureAnalytics({ MODE: 'development', DEV: true, VITE_APP_VERSION: '1.2.3' }, app('G-1'));
    expect(analytics.getConsent().analytics_storage).toBe('denied');
    analytics.setConsent(CONSENT_GRANTED);
    analytics.init();
    await new Promise((r) => setTimeout(r, 0));
    (analytics.track as (e: string) => void)('Bad Name');
    analytics.track('logout');
    expect(debug).toHaveBeenCalledWith(
      'Analytics event',
      expect.objectContaining({
        event: 'logout',
        params: { app_version: '1.2.3', environment: 'development', platform: 'web' },
      }),
    );
    configureAnalytics({}, app());
    analytics.configure({ providers: [new NoopAnalyticsProvider()] });
  });
});
