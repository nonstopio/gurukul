import type { EventName, PageViewParams, TrackArgs } from '../events';
import { NoopAnalyticsProvider } from './noopProvider';
import { CONSENT_DENIED } from './types';
import type { AnalyticsProvider, ConsentState, Params } from './types';
import { checkEventName, checkUserId, cleanParams, cleanUserProperties } from './validate';

type Warn = (message: string, fields: Record<string, unknown>) => void;

export interface AnalyticsOptions {
  providers?: AnalyticsProvider[];
  /** The `ANALYTICS_ENABLED` kill switch. Off: nothing is queued, loaded or sent. */
  enabled?: boolean;
  /** Developer builds warn about every dropped or shortened value; production stays silent. */
  dev?: boolean;
  /** Attached to every event (`app_version`, `environment`, `platform`). */
  defaults?: Params;
  consent?: ConsentState;
  warn?: Warn;
}

/** The facade the app uses. Every method is safe to call at any time and never throws. */
export interface Analytics {
  /** Called once at the app root. Loads the providers as soon as consent allows. */
  init(): void;
  track<E extends EventName>(event: E, ...params: TrackArgs<E>): void;
  pageView(params: PageViewParams): void;
  /** Internal opaque user id only, never an email. `null` clears it. */
  identify(userId: string | null): void;
  /** Stable segments (role, team); never personal data. */
  setUserProperties(props: Params): void;
  /** Merge into the default parameters attached to every later event (`user_role`). */
  setContext(context: Params): void;
  setConsent(state: Partial<ConsentState>): void;
  getConsent(): ConsentState;
  /** Hears every consent change (`useConsent` is built on it). Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  setEnabled(enabled: boolean): void;
  /** Sign-out: forget the user id and user properties. */
  reset(): void;
  /** Swap providers, defaults and switches; the app does this once, before `init()`. */
  configure(options: AnalyticsOptions): void;
}

/** Calls made before a provider is ready wait here, up to this many; the oldest are dropped. */
const MAX_QUEUE = 100;

type Send = (provider: AnalyticsProvider) => void;

export function createAnalytics(initial: AnalyticsOptions = {}): Analytics {
  let providers: AnalyticsProvider[] = [new NoopAnalyticsProvider()];
  let enabled = true;
  let dev = false;
  let defaults: Params = {};
  let consent: ConsentState = CONSENT_DENIED;
  let warn: Warn = () => {};
  let context: Params = {};
  let started = false;
  let booting = false;
  let ready = false;
  let userId: string | null = null;
  let userProps: Params = {};
  let queue: Send[] = [];
  const listeners = new Set<() => void>();

  const complain = (message: string, fields: Record<string, unknown>) => {
    if (dev) warn(message, fields);
  };
  /** Runs `fn`, and swallows what it throws or rejects with: analytics never reaches the app. */
  const attempt = async (fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      complain('Analytics failed', { error: String(e) });
    }
  };
  const each = (send: Send) => providers.forEach((p) => void attempt(() => send(p)));
  const allowed = () => enabled && consent.analytics_storage === 'granted';

  function boot() {
    if (booting || !started || !allowed()) return;
    booting = true;
    const loading = providers.map((p) => attempt(() => p.init()));
    void Promise.all(loading).then(() => {
      ready = true;
      each((p) => p.setConsent(consent));
      if (userId !== null) each((p) => p.identify(userId));
      if (Object.keys(userProps).length) each((p) => p.setUserProperties(userProps));
      const waiting = queue;
      queue = [];
      waiting.forEach(each);
    });
  }

  /** Sends now when ready, waits for init otherwise, and drops while consent is not given. */
  function emit(send: Send) {
    if (!allowed()) return;
    if (ready) return each(send);
    queue.push(send);
    if (queue.length > MAX_QUEUE) queue.shift();
  }

  const api: Analytics = {
    init() {
      started = true;
      boot();
    },
    track(event, ...rest) {
      const name = checkEventName(event);
      if (!name.ok) return complain(name.reason, { event });
      const { value, problems } = cleanParams({
        ...defaults,
        ...context,
        ...(rest[0] as Record<string, unknown> | undefined),
      });
      if (problems.length) complain('Analytics parameters adjusted', { event, problems });
      emit((p) => p.track(name.value, value));
    },
    pageView(params) {
      const { value, problems } = cleanParams({ ...defaults, ...context, ...params });
      if (problems.length)
        complain('Analytics parameters adjusted', { event: 'page_view', problems });
      emit((p) => p.pageView(value));
    },
    identify(id) {
      if (id === null) {
        userId = null;
        if (ready) each((p) => p.identify(null));
        return;
      }
      const checked = checkUserId(id);
      if (!checked.ok) return complain(checked.reason, {});
      userId = checked.value;
      if (ready && allowed()) each((p) => p.identify(checked.value));
    },
    setUserProperties(props) {
      const { value, problems } = cleanUserProperties(props);
      if (problems.length) complain('Analytics user properties adjusted', { problems });
      userProps = { ...userProps, ...value };
      if (ready && allowed()) each((p) => p.setUserProperties(value));
    },
    setContext(next) {
      context = { ...context, ...next };
    },
    setConsent(state) {
      consent = { ...consent, ...state };
      if (consent.analytics_storage !== 'granted') queue = [];
      if (ready) each((p) => p.setConsent(consent));
      listeners.forEach((l) => l());
      boot();
    },
    getConsent: () => consent,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled(next) {
      enabled = next;
      if (!next) queue = [];
      if (ready) each((p) => p.setEnabled(next));
      boot();
    },
    reset() {
      userId = null;
      userProps = {};
      context = {};
      if (ready) each((p) => p.reset());
    },
    configure(options) {
      providers = options.providers ?? providers;
      enabled = options.enabled ?? enabled;
      dev = options.dev ?? dev;
      defaults = options.defaults ?? defaults;
      consent = options.consent ?? consent;
      warn = options.warn ?? warn;
      started = booting = ready = false;
      queue = [];
    },
  };
  api.configure(initial);
  return api;
}
