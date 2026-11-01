import { describe, expect, it, vi } from 'vitest';
import { createAnalytics } from '../src/analytics/core/analytics';
import { CONSENT_GRANTED } from '../src/analytics/core/types';
import type { AnalyticsProvider } from '../src/analytics/core/types';

function fakeProvider(overrides: Partial<AnalyticsProvider> = {}) {
  const calls: string[] = [];
  const base = {
    init: vi.fn(() => Promise.resolve()),
    track: vi.fn<AnalyticsProvider['track']>((e) => void calls.push(`track:${e}`)),
    pageView: vi.fn(() => void calls.push('pageView')),
    identify: vi.fn((id: string | null) => void calls.push(`identify:${id}`)),
    setUserProperties: vi.fn(() => void calls.push('props')),
    setConsent: vi.fn(),
    setEnabled: vi.fn(),
    reset: vi.fn(),
  };
  // Typed as the mocks so tests can read `.mock`; an override replaces the mock itself.
  const p = { ...base, ...overrides } as typeof base;
  return { p, calls };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

function started(overrides: Partial<AnalyticsProvider> = {}, dev = true) {
  const { p, calls } = fakeProvider(overrides);
  const warn = vi.fn();
  const a = createAnalytics({
    providers: [p],
    dev,
    warn,
    consent: CONSENT_GRANTED,
    defaults: { platform: 'web' },
  });
  return { a, p, calls, warn };
}

describe('before init finishes', () => {
  it('buffers events and flushes them in order, identify first', async () => {
    const { a, p, calls } = started();
    a.track('logout');
    a.identify('uid-1');
    a.setUserProperties({ role: 'learner' });
    a.pageView({ page_path: '/', page_title: 't', page_location: 'http://x/' });
    a.init();
    a.track('logout');
    expect(p.track).not.toHaveBeenCalled();
    await settle();
    expect(calls).toEqual(['identify:uid-1', 'props', 'track:logout', 'pageView', 'track:logout']);
    expect(p.init).toHaveBeenCalledTimes(1);
    expect(p.setConsent).toHaveBeenCalledWith(CONSENT_GRANTED);
  });
  it('keeps at most 100 buffered calls, dropping the oldest', async () => {
    const { a, p } = started();
    for (let i = 0; i < 105; i++) a.track('course_start', { course_id: String(i) });
    a.init();
    await settle();
    expect(p.track).toHaveBeenCalledTimes(100);
    expect(p.track.mock.calls[0]?.[1]).toMatchObject({ course_id: '5' });
  });
});

describe('after init', () => {
  it('sends straight away, with the default and context parameters', async () => {
    const { a, p } = started();
    a.init();
    await settle();
    a.setContext({ user_role: 'admin' });
    a.track('course_start', { course_id: 'git' });
    expect(p.track).toHaveBeenCalledWith('course_start', {
      platform: 'web',
      user_role: 'admin',
      course_id: 'git',
    });
  });
  it('lets event parameters override defaults', async () => {
    const { a, p } = started();
    a.init();
    await settle();
    a.track('course_start', { course_id: 'x' });
    a.setContext({ course_id: 'ctx' });
    a.track('course_start', { course_id: 'x' });
    expect(p.track.mock.calls[1]?.[1]).toMatchObject({ course_id: 'x' });
  });
  it('identifies, sets properties and resets', async () => {
    const { a, p } = started();
    a.init();
    await settle();
    a.identify('uid-1');
    a.setUserProperties({ role: 'admin' });
    a.identify(null);
    a.reset();
    expect(p.identify).toHaveBeenCalledWith('uid-1');
    expect(p.identify).toHaveBeenCalledWith(null);
    expect(p.setUserProperties).toHaveBeenCalledWith({ role: 'admin' });
    expect(p.reset).toHaveBeenCalledTimes(1);
  });
  it('fans out to every provider', async () => {
    const one = fakeProvider();
    const two = fakeProvider();
    const a = createAnalytics({ providers: [one.p, two.p], consent: CONSENT_GRANTED });
    a.init();
    await settle();
    a.track('logout');
    expect(one.p.track).toHaveBeenCalledTimes(1);
    expect(two.p.track).toHaveBeenCalledTimes(1);
  });
  it('forgets identity on reset before init, and sends nothing', () => {
    const { a, p } = started();
    a.identify('uid-1');
    a.reset();
    a.identify(null);
    expect(p.identify).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('drops an invalid event name and warns in development', async () => {
    const { a, p, warn } = started();
    a.init();
    await settle();
    (a.track as (e: string) => void)('Bad Name');
    expect(p.track).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('snake_case'), { event: 'Bad Name' });
  });
  it('strips personal data, truncates and warns in development', async () => {
    const { a, p, warn } = started();
    a.init();
    await settle();
    (a.track as (e: string, p: object) => void)('course_start', {
      course_id: 'ada@example.com',
      other: 'x'.repeat(200),
    });
    expect(p.track.mock.calls[0]?.[1]).toEqual({ platform: 'web', other: 'x'.repeat(100) });
    expect(warn).toHaveBeenCalledWith(
      'Analytics parameters adjusted',
      expect.objectContaining({ event: 'course_start' }),
    );
  });
  it('stays silent in production', async () => {
    const { a, p, warn } = started({}, false);
    a.init();
    await settle();
    (a.track as (e: string) => void)('Bad Name');
    (a.track as (e: string, p: object) => void)('course_start', { course_id: 'a@b.co' });
    a.pageView({ page_path: 'a@b.co', page_title: '', page_location: '' });
    a.setUserProperties({ email: 'a@b.co' });
    a.identify('a@b.co');
    expect(warn).not.toHaveBeenCalled();
    expect(p.track).toHaveBeenCalledTimes(1);
    expect(p.identify).not.toHaveBeenCalled();
  });
  it('warns when an email is used as the user id', async () => {
    const { a, p, warn } = started();
    a.init();
    await settle();
    a.identify('ada@example.com');
    expect(p.identify).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
  it('warns about adjusted page views and user properties', async () => {
    const { a, warn } = started();
    a.init();
    await settle();
    a.pageView({ page_path: 'a@b.co', page_title: 't', page_location: 'l' });
    a.setUserProperties({ email: 'a@b.co' });
    expect(warn).toHaveBeenCalledWith('Analytics parameters adjusted', expect.anything());
    expect(warn).toHaveBeenCalledWith('Analytics user properties adjusted', expect.anything());
  });
});

describe('consent and the kill switch', () => {
  it('collects nothing, and loads nothing, until consent is granted', async () => {
    const { p } = fakeProvider();
    const a = createAnalytics({ providers: [p] });
    a.init();
    a.track('logout');
    await settle();
    expect(p.init).not.toHaveBeenCalled();
    expect(p.track).not.toHaveBeenCalled();
    a.setConsent(CONSENT_GRANTED);
    await settle();
    expect(p.init).toHaveBeenCalledTimes(1);
    a.track('logout');
    expect(p.track).toHaveBeenCalledTimes(1);
    expect(a.getConsent().analytics_storage).toBe('granted');
    expect(a.getConsent().ad_storage).toBe('denied');
  });
  it('forwards a consent change to providers and drops buffered events on denial', async () => {
    const { p } = fakeProvider({ init: () => new Promise(() => {}) });
    const a = createAnalytics({ providers: [p], consent: CONSENT_GRANTED });
    a.init();
    a.track('logout');
    a.setConsent({ analytics_storage: 'denied' });
    a.setConsent({ analytics_storage: 'granted' });
    expect(p.track).not.toHaveBeenCalled();
    const ready = fakeProvider();
    const b = createAnalytics({ providers: [ready.p], consent: CONSENT_GRANTED });
    b.init();
    await settle();
    b.setConsent({ analytics_storage: 'denied' });
    expect(ready.p.setConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({ analytics_storage: 'denied' }),
    );
    b.track('logout');
    b.identify('uid');
    b.setUserProperties({ role: 'x' });
    expect(ready.p.track).not.toHaveBeenCalled();
    expect(ready.p.identify).not.toHaveBeenCalled();
    expect(ready.p.setUserProperties).not.toHaveBeenCalled();
  });
  it('does nothing while disabled, and resumes when enabled', async () => {
    const { p } = fakeProvider();
    const a = createAnalytics({ providers: [p], consent: CONSENT_GRANTED, enabled: false });
    a.init();
    a.track('logout');
    await settle();
    expect(p.init).not.toHaveBeenCalled();
    a.setEnabled(true);
    await settle();
    expect(p.init).toHaveBeenCalled();
    a.setEnabled(false);
    expect(p.setEnabled).toHaveBeenCalledWith(false);
    a.track('logout');
    expect(p.track).not.toHaveBeenCalled();
  });
  it('tells subscribers when consent changes', () => {
    const a = createAnalytics();
    const listener = vi.fn();
    const stop = a.subscribe(listener);
    a.setConsent(CONSENT_GRANTED);
    stop();
    a.setConsent({ analytics_storage: 'denied' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('failures never reach the app', () => {
  it('swallows a provider that throws on every call', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const { a, warn } = started({
      track: boom,
      pageView: boom,
      identify: boom,
      setUserProperties: boom,
      reset: boom,
    });
    a.init();
    await settle();
    expect(() => {
      a.track('logout');
      a.pageView({ page_path: '/', page_title: '', page_location: '' });
      a.identify('uid');
      a.setUserProperties({ role: 'x' });
      a.reset();
    }).not.toThrow();
    expect(warn).toHaveBeenCalledWith('Analytics failed', expect.anything());
  });
  it('survives init rejecting or throwing, and still flushes the others', async () => {
    const good = fakeProvider();
    const bad = fakeProvider({ init: () => Promise.reject(new Error('blocked')) });
    const worse = fakeProvider({
      init: () => {
        throw new Error('sync');
      },
    });
    const a = createAnalytics({
      providers: [bad.p, worse.p, good.p],
      consent: CONSENT_GRANTED,
      dev: true,
      warn: () => {},
    });
    a.track('logout');
    a.init();
    await settle();
    expect(good.p.track).toHaveBeenCalledTimes(1);
  });
  it('is quiet about failures when not in development', async () => {
    const { p } = fakeProvider({
      track: () => {
        throw new Error('x');
      },
    });
    const warn = vi.fn();
    const a = createAnalytics({ providers: [p], consent: CONSENT_GRANTED, warn });
    a.init();
    await settle();
    a.track('logout');
    expect(warn).not.toHaveBeenCalled();
  });
});

it('needs no warn function to survive a failing provider in development', async () => {
  const boom = () => {
    throw new Error('x');
  };
  const { p } = fakeProvider({ track: boom });
  const a = createAnalytics({ providers: [p], dev: true, consent: CONSENT_GRANTED });
  a.init();
  await settle();
  expect(() => a.track('logout')).not.toThrow();
});

it('is a harmless no-op until configured', async () => {
  const a = createAnalytics();
  a.init();
  a.track('logout');
  a.setEnabled(true);
  a.reset();
  expect(a.getConsent().analytics_storage).toBe('denied');
});
