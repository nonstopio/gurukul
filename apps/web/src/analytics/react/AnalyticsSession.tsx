import { useEffect, useRef } from 'react';
import type { Role } from '@gurukul/schema';
import { useSession } from '../../auth/AuthProvider';
import { usePolicyAccepted } from '../../privacy/policy';
import { CONSENT_DENIED, CONSENT_GRANTED } from '../core/types';
import { useAnalytics } from './context';

const PENDING = 'gurukul.analytics.signin';

/** Called when the person starts Google sign-in: the next session that opens is a `login`. */
export function markSignInStarted(): void {
  try {
    sessionStorage.setItem(PENDING, '1');
  } catch {
    // Without storage the login event is skipped; nothing else depends on it.
  }
}

function takeSignInMark(): boolean {
  try {
    const marked = sessionStorage.getItem(PENDING) === '1';
    sessionStorage.removeItem(PENDING);
    return marked;
  } catch {
    return false;
  }
}

/** The most privileged role, as one stable segment. */
export function topRole(roles: readonly Role[]): Role {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('educator')) return 'educator';
  return roles.includes('manager') ? 'manager' : 'learner';
}

/**
 * Ties analytics to the sign-in session, rendered inside the sign-in provider. Consent is
 * granted while someone who accepted the policy is signed in and denied otherwise; the person is
 * identified by their opaque Firebase uid (never their email) with their role as a stable segment;
 * a fresh sign-in sends `login` (and `sign_up` the first time); signing out resets everything.
 */
export function AnalyticsSession() {
  const analytics = useAnalytics();
  const { status, user, roles } = useSession();
  const accepted = usePolicyAccepted();
  const uid = user?.uid ?? null;
  const live = status === 'ready' && uid !== null && accepted;
  const role = topRole(roles);
  const wasLive = useRef(false);

  useEffect(() => {
    analytics.setConsent(live ? CONSENT_GRANTED : CONSENT_DENIED);
    if (!live && wasLive.current) analytics.reset();
    wasLive.current = live;
  }, [analytics, live]);

  useEffect(() => {
    if (!live) return;
    analytics.identify(uid);
    analytics.setContext({ user_role: role });
    analytics.setUserProperties({ role });
  }, [analytics, live, uid, role]);

  const firstSignIn = user?.firstSignIn === true;
  useEffect(() => {
    if (!live || !takeSignInMark()) return;
    analytics.track('login', { method: 'google' });
    if (firstSignIn) analytics.track('sign_up', { method: 'google' });
  }, [analytics, live, firstSignIn]);

  return null;
}
