import { vi } from 'vitest';
import type { AuthService, AuthUser, ProfileMirror } from '../src/auth/service';

export const NONSTOP: AuthUser = {
  uid: 'u1',
  email: 'priya@nonstopio.com',
  emailVerified: true,
  displayName: 'Priya N',
  photoURL: null,
};

/** A controllable AuthService: tests push users and profiles in and read the calls out. */
export function fakeAuth(claims: { acharya?: boolean; kulapati?: boolean } = {}) {
  let userCb: (u: AuthUser | null) => void = () => {};
  let profileCb: (p: ProfileMirror | null) => void = () => {};
  const service: AuthService = {
    onUser: vi.fn((cb) => {
      userCb = cb;
      return vi.fn();
    }),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    claims: vi.fn().mockResolvedValue(claims),
    watchProfile: vi.fn((_uid, cb) => {
      profileCb = cb;
      return vi.fn();
    }),
  };
  return {
    service,
    emitUser: (u: AuthUser | null) => userCb(u),
    emitProfile: (p: ProfileMirror | null) => profileCb(p),
  };
}
