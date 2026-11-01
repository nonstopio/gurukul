import type { Params, ParamValue } from './types';

/** GA4's limits (https://support.google.com/analytics/answer/9267744). */
export const LIMITS = {
  eventName: 40,
  paramName: 40,
  paramValue: 100,
  params: 25,
  propName: 24,
  propValue: 36,
  userId: 256,
} as const;

/** These parameters carry longer values in GA4 than the general 100-character cap. */
const LONG_VALUES: Readonly<Record<string, number>> = {
  page_location: 1000,
  page_referrer: 420,
  page_title: 300,
};

const NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED_PREFIXES = ['firebase_', 'google_', 'ga_'];
/** Names GA4 collects itself or reserves (`page_view` is allowed: the router sends it). */
const RESERVED_EVENTS = new Set([
  'ad_activeview',
  'ad_click',
  'ad_exposure',
  'ad_impression',
  'ad_query',
  'ad_reward',
  'adunit_exposure',
  'app_background',
  'app_clear_data',
  'app_exception',
  'app_remove',
  'app_store_refund',
  'app_store_subscription_cancel',
  'app_store_subscription_convert',
  'app_store_subscription_renew',
  'app_update',
  'app_upgrade',
  'dynamic_link_app_open',
  'dynamic_link_app_update',
  'dynamic_link_first_open',
  'error',
  'first_open',
  'first_visit',
  'in_app_purchase',
  'notification_dismiss',
  'notification_foreground',
  'notification_open',
  'notification_receive',
  'os_update',
  'session_start',
  'user_engagement',
]);

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Eight or more digits, with the usual separators: a phone number, not an id. */
const PHONE = /\+?\d[\d\s().-]{7,}\d/;
/** A key that names personal or secret data, whatever its value looks like. */
const PII_KEY = /(^|_)(e?mail|phone|mobile|password|passwd|token|secret|ssn|address)(_|$)/i;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const bad = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Why a name cannot be used, or `null` when it can (shape, reserved prefix). */
function nameProblem(name: string, max: number): string | null {
  if (!NAME.test(name)) return 'name must be snake_case and start with a letter';
  if (name.length > max) return `name is longer than ${max} characters`;
  if (RESERVED_PREFIXES.some((p) => name.startsWith(p))) return 'name uses a reserved prefix';
  return null;
}

/** Does a string look like an email address or a phone number? */
export function looksLikePii(value: string): boolean {
  return EMAIL.test(value) || PHONE.test(value);
}

/** The event name, or why it must be dropped. */
export function checkEventName(name: string): Verdict<string> {
  const problem = nameProblem(name, LIMITS.eventName);
  if (problem) return bad(`event ${problem}`);
  if (RESERVED_EVENTS.has(name)) return bad('event name is reserved by GA4');
  return { ok: true, value: name };
}

interface Cleaned {
  value: Params;
  /** One line per parameter dropped or shortened, for the developer warning. */
  problems: string[];
}

/**
 * Applies the limits to a set of named values. A name that breaks the rules, a value that is not a
 * string, number or boolean, personal data, and anything past `maxCount` are dropped; a string
 * longer than its limit is cut. Never throws.
 */
function clean(
  input: Record<string, unknown>,
  limits: { name: number; value: number; count: number },
): Cleaned {
  const value: Params = {};
  const problems: string[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const problem = nameProblem(key, limits.name);
    if (problem) {
      problems.push(`${key}: ${problem}`);
    } else if (PII_KEY.test(key)) {
      problems.push(`${key}: name looks like personal data`);
    } else if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      problems.push(`${key}: value must be a string, number or boolean`);
    } else if (typeof raw === 'string' && looksLikePii(raw)) {
      problems.push(`${key}: value looks like an email or phone number`);
    } else if (Object.keys(value).length >= limits.count) {
      problems.push(`${key}: more than ${limits.count} parameters`);
    } else {
      const max = LONG_VALUES[key] ?? limits.value;
      if (typeof raw === 'string' && raw.length > max) {
        problems.push(`${key}: value cut to ${max} characters`);
      }
      value[key] = typeof raw === 'string' ? raw.slice(0, max) : (raw as ParamValue);
    }
  }
  return { value, problems };
}

export const cleanParams = (params: Record<string, unknown>): Cleaned =>
  clean(params, { name: LIMITS.paramName, value: LIMITS.paramValue, count: LIMITS.params });

export const cleanUserProperties = (props: Record<string, unknown>): Cleaned =>
  clean(props, { name: LIMITS.propName, value: LIMITS.propValue, count: 25 });

/** A user id must be opaque: no email, no phone number, within GA4's length. */
export function checkUserId(id: string): Verdict<string> {
  if (id === '' || id.length > LIMITS.userId) return bad('user id must be 1-256 characters');
  if (looksLikePii(id)) return bad('user id looks like an email or phone number; use an opaque id');
  return { ok: true, value: id };
}
