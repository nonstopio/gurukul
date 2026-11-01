import { useSyncExternalStore } from 'react';

/**
 * The version of the privacy policy people accept to sign in. Change it whenever `PrivacyPage`
 * changes what is collected: everyone is then asked again, once, before they see a page.
 */
export const POLICY_VERSION = '2026-11-01';

const KEY = 'gurukul.privacy.accepted';
const listeners = new Set<() => void>();
/** Set when storage is blocked, so the choice still lasts until the page closes. */
let accepted = false;

/** Whether this browser accepted the current policy. A browser that blocks storage must ask each visit. */
export function hasAcceptedPolicy(): boolean {
  try {
    return localStorage.getItem(KEY) === POLICY_VERSION;
  } catch {
    return false;
  }
}

/**
 * Records acceptance on this browser. Consent for analytics itself follows the signed-in session
 * (`AnalyticsSession`), so accepting and then not finishing sign-in collects nothing.
 */
export function acceptPolicy(): void {
  try {
    localStorage.setItem(KEY, POLICY_VERSION);
  } catch {
    accepted = true;
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Re-renders when the policy is accepted. */
export function usePolicyAccepted(): boolean {
  return useSyncExternalStore(subscribe, () => accepted || hasAcceptedPolicy());
}
