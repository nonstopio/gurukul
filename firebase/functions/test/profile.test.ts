import { describe, expect, it, vi } from 'vitest';
import { buildProfile, handleUserCreated } from '../src/profile.js';
import type { UserStore } from '../src/profile.js';

const store = (claimed = 0): UserStore => ({
  createProfile: vi.fn().mockResolvedValue(undefined),
  claimAssignments: vi.fn().mockResolvedValue(claimed),
});

describe('buildProfile', () => {
  it('lower-cases the email and uses the display name', () => {
    expect(
      buildProfile({
        uid: 'u',
        email: 'Priya.N@NonStopIO.com',
        displayName: ' Priya N ',
        photoURL: 'p',
      }),
    ).toEqual({
      email: 'priya.n@nonstopio.com',
      displayName: 'Priya N',
      photoURL: 'p',
      team: null,
      roles: ['shishya'],
      grantedCourseIds: [],
    });
  });

  it('falls back to the email local part, and to the whole email when there is none', () => {
    expect(
      buildProfile({ uid: 'u', email: 'a@nonstopio.com', displayName: '  ' }).displayName,
    ).toBe('a');
    expect(buildProfile({ uid: 'u', email: '@x' }).displayName).toBe('@x');
    expect(buildProfile({ uid: 'u', email: 'a@nonstopio.com' }).photoURL).toBeNull();
  });
});

describe('handleUserCreated', () => {
  it('writes the profile and claims invites for a verified NonStop account', async () => {
    const s = store(2);
    const out = await handleUserCreated(s, {
      uid: 'u1',
      email: 'A@nonstopio.com',
      emailVerified: true,
    });
    expect(out).toEqual({ created: true, claimed: 2 });
    expect(s.createProfile).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ email: 'a@nonstopio.com' }),
    );
    expect(s.claimAssignments).toHaveBeenCalledWith('a@nonstopio.com', 'u1');
  });

  it.each([
    { uid: 'u', email: 'a@gmail.com', emailVerified: true },
    { uid: 'u', email: 'a@nonstopio.com', emailVerified: false },
    { uid: 'u', email: 'a@nonstopio.com' },
    { uid: 'u', email: null, emailVerified: true },
    { uid: 'u' },
  ])('does nothing for %j', async (user) => {
    const s = store();
    expect(await handleUserCreated(s, user)).toEqual({ created: false, claimed: 0 });
    expect(s.createProfile).not.toHaveBeenCalled();
    expect(s.claimAssignments).not.toHaveBeenCalled();
  });
});
