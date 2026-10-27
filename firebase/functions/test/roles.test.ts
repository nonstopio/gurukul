import { describe, expect, it } from 'vitest';
import { diffGrants, isAllowedEmail, planRoleChange, rolesFromClaims } from '../src/roles.js';

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
    const refused = expect.objectContaining({ code: 'AUTH_2001', params: ['setRoles'] });
    expect(denied({ uid: 'a', email: 'a@nonstopio.com', claims: { acharya: true } })).toThrowError(
      refused,
    );
    expect(denied({ uid: 'a', email: 'a@nonstopio.com', claims: undefined })).toThrowError(refused);
    expect(denied({ uid: 'a', email: 'a@gmail.com', claims: { kulapati: true } })).toThrowError(
      refused,
    );
    expect(denied({ uid: 'a', claims: { kulapati: true } })).toThrowError(refused);
  });

  it('refuses an empty or non-boolean change', () => {
    const plan = (c: object) => () => planRoleChange(kulapati, 'u', undefined, c);
    expect(plan({})).toThrowError(expect.objectContaining({ code: 'VAL_1001' }));
    expect(plan({ acharya: 'yes' })).toThrowError(
      expect.objectContaining({ code: 'VAL_1002', details: { field: 'acharya' } }),
    );
    expect(plan({ kulapati: 1 })).toThrowError(
      expect.objectContaining({ code: 'VAL_1002', details: { field: 'kulapati' } }),
    );
  });

  it('refuses removing your own Kulapati role, but not your own Acharya role', () => {
    expect(() => planRoleChange(kulapati, 'k', kulapati.claims, { kulapati: false })).toThrowError(
      expect.objectContaining({ code: 'USR_1001' }),
    );
    expect(planRoleChange(kulapati, 'k', kulapati.claims, { acharya: true }).claims.kulapati).toBe(
      true,
    );
  });
});

describe('planRoleChange course grants', () => {
  it('carries a de-duplicated grant list, alone or with a role', () => {
    expect(
      planRoleChange(kulapati, 'u', undefined, { grantedCourseIds: ['git', 'sql', 'git'] }),
    ).toEqual({
      claims: { acharya: false, kulapati: false },
      roles: ['shishya'],
      grantedCourseIds: ['git', 'sql'],
    });
    expect(
      planRoleChange(kulapati, 'u', undefined, { acharya: true, grantedCourseIds: [] }),
    ).toMatchObject({ roles: ['shishya', 'acharya'], grantedCourseIds: [] });
  });

  it('leaves the plan without grants when none were given', () => {
    expect(planRoleChange(kulapati, 'u', undefined, { acharya: true })).not.toHaveProperty(
      'grantedCourseIds',
    );
  });

  it.each([
    ['not a list', 'git'],
    ['an empty id', ['']],
    ['a path', ['a/b']],
    ['a number', [3]],
    ['more than 50', Array.from({ length: 51 }, (_, i) => `c${i}`)],
  ])('rejects grants that are %s', (_n, ids) => {
    expect(() =>
      planRoleChange(kulapati, 'u', undefined, { grantedCourseIds: ids as never }),
    ).toThrowError(
      expect.objectContaining({ code: 'VAL_1002', details: { field: 'grantedCourseIds' } }),
    );
  });

  it('accepts exactly 50 grants', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(
      planRoleChange(kulapati, 'u', undefined, { grantedCourseIds: ids }).grantedCourseIds,
    ).toHaveLength(50);
  });
});

describe('diffGrants', () => {
  it('names what was added and what was taken away', () => {
    expect(diffGrants(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
    expect(diffGrants([], [])).toEqual({ added: [], removed: [] });
  });
});
