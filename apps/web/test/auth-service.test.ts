import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authCb: undefined as undefined | ((u: unknown) => void),
  params: undefined as unknown,
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    setCustomParameters(p: unknown) {
      state.params = p;
    }
  },
  onAuthStateChanged: vi.fn((_a, cb) => {
    state.authCb = cb;
    return () => {};
  }),
  signInWithPopup: vi.fn().mockResolvedValue(undefined),
  signInWithRedirect: vi.fn().mockResolvedValue(undefined),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

import { getRedirectResult, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { firebaseAuthService, prefersRedirect } from '../src/auth/service';

const DESKTOP = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130',
  maxTouchPoints: 0,
};
const IPHONE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
};
const IPAD = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
  maxTouchPoints: 5,
};
const MAC = { ...IPAD, maxTouchPoints: 0 };

const watchProfile = vi.fn(() => () => {});
const auth = { currentUser: { getIdTokenResult: vi.fn() } };
const svc = (nav = DESKTOP) => firebaseAuthService({ auth: auth as never }, watchProfile, nav);
const failWith = (code: string) =>
  vi.mocked(signInWithPopup).mockRejectedValueOnce(Object.assign(new Error(code), { code }));

beforeEach(() => vi.clearAllMocks());

describe('firebaseAuthService', () => {
  it('maps a Firebase user and passes null through', () => {
    const cb = vi.fn();
    svc().onUser(cb);
    state.authCb?.(null);
    state.authCb?.({
      uid: 'u',
      email: 'a@nonstopio.com',
      emailVerified: true,
      displayName: 'A',
      photoURL: null,
      extra: 1,
    });
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb).toHaveBeenNthCalledWith(2, {
      uid: 'u',
      email: 'a@nonstopio.com',
      emailVerified: true,
      displayName: 'A',
      photoURL: null,
    });
  });

  it('signs in with Google, hinting the NonStop domain, and signs out', async () => {
    await svc().signIn();
    expect(signInWithPopup).toHaveBeenCalled();
    expect(state.params).toEqual({ hd: 'nonstopio.com' });
    expect(signInWithRedirect).not.toHaveBeenCalled();
    await svc().signOut();
    expect(signOut).toHaveBeenCalled();
  });

  it('asks Google for its account picker when choosing another account', async () => {
    await svc().signIn({ chooseAccount: true });
    expect(state.params).toEqual({ hd: 'nonstopio.com', prompt: 'select_account' });
  });

  it('signs in by redirect on an iPhone or iPad', async () => {
    await svc(IPHONE).signIn();
    expect(signInWithRedirect).toHaveBeenCalled();
    expect(signInWithPopup).not.toHaveBeenCalled();
  });

  it.each([IPHONE, IPAD])('prefers the redirect on iOS: %j', (nav) => {
    expect(prefersRedirect(nav)).toBe(true);
  });

  it.each([DESKTOP, MAC])('keeps the popup elsewhere: %j', (nav) => {
    expect(prefersRedirect(nav)).toBe(false);
  });

  it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'])(
    'treats %s as the person changing their mind, not a failure',
    async (code) => {
      failWith(code);
      await expect(svc().signIn()).resolves.toBeUndefined();
      expect(signInWithRedirect).not.toHaveBeenCalled();
    },
  );

  it('falls back to the redirect when the browser blocks the popup', async () => {
    failWith('auth/popup-blocked');
    await svc().signIn();
    expect(signInWithRedirect).toHaveBeenCalled();
  });

  it('passes any other failure on', async () => {
    failWith('auth/network-request-failed');
    await expect(svc().signIn()).rejects.toThrow('auth/network-request-failed');
    vi.mocked(signInWithPopup).mockRejectedValueOnce(null);
    await expect(svc().signIn()).rejects.toBeNull();
  });

  it('finishes a redirect sign-in', async () => {
    await svc().finishRedirect();
    expect(getRedirectResult).toHaveBeenCalledWith(auth);
  });

  it('reads the real navigator by default', () => {
    expect(firebaseAuthService({ auth: auth as never }, watchProfile).signIn).toBeTypeOf(
      'function',
    );
  });

  it('reads claims from the token, optionally forcing a refresh', async () => {
    auth.currentUser.getIdTokenResult.mockResolvedValueOnce({ claims: { admin: true } });
    expect(await svc().claims({} as never, true)).toEqual({ admin: true });
    expect(auth.currentUser.getIdTokenResult).toHaveBeenCalledWith(true);
    auth.currentUser.getIdTokenResult.mockResolvedValueOnce(undefined);
    expect(await svc().claims({} as never, false)).toEqual({});
  });

  it('has no claims when nobody is signed in', async () => {
    const out = firebaseAuthService({ auth: { currentUser: null } as never }, watchProfile);
    expect(await out.claims({} as never, false)).toEqual({});
  });

  it('hands profile watching to the lazily loaded Firestore', () => {
    expect(svc().watchProfile).toBe(watchProfile);
  });
});
