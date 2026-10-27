import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authCb: undefined as undefined | ((u: unknown) => void),
  snapCb: undefined as undefined | ((s: unknown) => void),
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
  signOut: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_d, c, id) => `${c}/${id}`),
  onSnapshot: vi.fn((_r, cb) => {
    state.snapCb = cb;
    return () => {};
  }),
}));

import { signInWithPopup, signOut } from 'firebase/auth';
import { firebaseAuthService } from '../src/auth/service';

const auth = { currentUser: { getIdTokenResult: vi.fn() } };
const svc = () => firebaseAuthService({ auth: auth as never, db: {} as never });

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
    await svc().signOut();
    expect(signOut).toHaveBeenCalled();
  });

  it('reads claims from the token, optionally forcing a refresh', async () => {
    auth.currentUser.getIdTokenResult.mockResolvedValueOnce({ claims: { kulapati: true } });
    expect(await svc().claims({} as never, true)).toEqual({ kulapati: true });
    expect(auth.currentUser.getIdTokenResult).toHaveBeenCalledWith(true);
    auth.currentUser.getIdTokenResult.mockResolvedValueOnce(undefined);
    expect(await svc().claims({} as never, false)).toEqual({});
  });

  it('has no claims when nobody is signed in', async () => {
    const out = firebaseAuthService({ auth: { currentUser: null } as never, db: {} as never });
    expect(await out.claims({} as never, false)).toEqual({});
  });

  it('watches the profile, reporting a missing document as null', () => {
    const cb = vi.fn();
    svc().watchProfile('u', cb);
    state.snapCb?.({ exists: () => false });
    state.snapCb?.({ exists: () => true, data: () => ({ roles: ['shishya'] }) });
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb).toHaveBeenNthCalledWith(2, { roles: ['shishya'] });
  });
});
