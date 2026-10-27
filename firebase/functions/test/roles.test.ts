import { describe, expect, it, vi } from 'vitest';
import { RoleError, isAllowedEmail, planRoleChange, rolesFromClaims } from '../src/roles.js';

describe('rolesFromClaims', () => {
  it('makes everyone a shishya and adds granted roles', () => {
    expect(rolesFromClaims(undefined)).toEqual(['shishya']);
    expect(rolesFromClaims({ acharya: true })).toEqual(['shishya', 'acharya']);
    expect(rolesFromClaims({ acharya: true, kulapati: true })).toEqual([
      'shishya',
      'acharya',
      'kulapati',
    ]);
    expect(rolesFromClaims({ kulapati: false })).toEqual(['shishya']);
  });
});

describe('isAllowedEmail', () => {
  it('allows the NonStop domain only', () => {
    expect(isAllowedEmail('a@nonstopio.com')).toBe(true);
    expect(isAllowedEmail('A@NonStopIO.com')).toBe(true);
    expect(isAllowedEmail('a@gmail.com')).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail('a@example.com', 'example.com')).toBe(true);
  });
});

const kulapati = { uid: 'k', email: 'k@nonstopio.com', claims: { kulapati: true } };

describe('planRoleChange', () => {
  it('merges the change into the current claims', () => {
    expect(planRoleChange(kulapati, 'u', undefined, { acharya: true })).toEqual({
      claims: { acharya: true, kulapati: false },
      roles: ['shishya', 'acharya'],
    });
    expect(planRoleChange(kulapati, 'u', { acharya: true }, { kulapati: true })).toEqual({
      claims: { acharya: true, kulapati: true },
      roles: ['shishya', 'acharya', 'kulapati'],
    });
    expect(
      planRoleChange(kulapati, 'u', { acharya: true, kulapati: true }, { acharya: false }).claims,
    ).toEqual({
      acharya: false,
      kulapati: true,
    });
  });

  it('refuses a caller who is not a NonStop Kulapati', () => {
    const denied = (caller: Parameters<typeof planRoleChange>[0]) => () =>
      planRoleChange(caller, 'u', undefined, { acharya: true });
    expect(denied({ uid: 'a', email: 'a@nonstopio.com', claims: { acharya: true } })).toThrow(
      RoleError,
    );
    expect(denied({ uid: 'a', email: 'a@nonstopio.com', claims: undefined })).toThrow(
      /Only a Kulapati/,
    );
    expect(denied({ uid: 'a', email: 'a@gmail.com', claims: { kulapati: true } })).toThrow(
      /Only a Kulapati/,
    );
    expect(denied({ uid: 'a', claims: { kulapati: true } })).toThrow(/Only a Kulapati/);
  });

  it('refuses an empty or non-boolean change', () => {
    const plan = (c: object) => () => planRoleChange(kulapati, 'u', undefined, c);
    expect(plan({})).toThrow(/true or false/);
    expect(plan({ acharya: 'yes' })).toThrow(/true or false/);
    expect(plan({ kulapati: 1 })).toThrow(/true or false/);
  });

  it('refuses removing your own Kulapati role, but not your own Acharya role', () => {
    expect(() => planRoleChange(kulapati, 'k', kulapati.claims, { kulapati: false })).toThrow(
      /own Kulapati role/,
    );
    expect(planRoleChange(kulapati, 'k', kulapati.claims, { acharya: true }).claims.kulapati).toBe(
      true,
    );
  });

  it('carries the error code', () => {
    try {
      planRoleChange(kulapati, 'k', kulapati.claims, { kulapati: false });
    } catch (e) {
      expect((e as RoleError).code).toBe('failed-precondition');
    }
    expect(vi.isMockFunction(planRoleChange)).toBe(false);
  });
});
