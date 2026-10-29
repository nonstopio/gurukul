import { describe, expect, it } from 'vitest';
import { diffGrants, isAllowedEmail, planRoleChange, rolesFromClaims } from '../src/roles.js';

describe('rolesFromClaims', () => {
  it('makes everyone a learner and adds granted roles', () => {
    expect(rolesFromClaims(undefined)).toEqual(['learner']);
    expect(rolesFromClaims({ educator: true })).toEqual(['learner', 'educator']);
    expect(rolesFromClaims({ educator: true, admin: true })).toEqual([
      'learner',
      'educator',
      'admin',
    ]);
    expect(rolesFromClaims({ admin: false })).toEqual(['learner']);
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

const admin = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };

describe('planRoleChange', () => {
  it('merges the change into the current claims', () => {
    expect(planRoleChange(admin, 'u', undefined, { educator: true })).toEqual({
      claims: { educator: true, admin: false },
      roles: ['learner', 'educator'],
    });
    expect(planRoleChange(admin, 'u', { educator: true }, { admin: true })).toEqual({
      claims: { educator: true, admin: true },
      roles: ['learner', 'educator', 'admin'],
    });
    expect(
      planRoleChange(admin, 'u', { educator: true, admin: true }, { educator: false }).claims,
    ).toEqual({
      educator: false,
      admin: true,
    });
  });

  it('refuses a caller who is not a NonStop Admin', () => {
    const denied = (caller: Parameters<typeof planRoleChange>[0]) => () =>
      planRoleChange(caller, 'u', undefined, { educator: true });
    const refused = expect.objectContaining({ code: 'AUTH_2001', params: ['setRoles'] });
    expect(denied({ uid: 'a', email: 'a@nonstopio.com', claims: { educator: true } })).toThrowError(
      refused,
    );
    expect(denied({ uid: 'a', email: 'a@nonstopio.com', claims: undefined })).toThrowError(refused);
    expect(denied({ uid: 'a', email: 'a@gmail.com', claims: { admin: true } })).toThrowError(
      refused,
    );
    expect(denied({ uid: 'a', claims: { admin: true } })).toThrowError(refused);
  });

  it('refuses an empty or non-boolean change', () => {
    const plan = (c: object) => () => planRoleChange(admin, 'u', undefined, c);
    expect(plan({})).toThrowError(expect.objectContaining({ code: 'VAL_1001' }));
    expect(plan({ educator: 'yes' })).toThrowError(
      expect.objectContaining({ code: 'VAL_1002', details: { field: 'educator' } }),
    );
    expect(plan({ admin: 1 })).toThrowError(
      expect.objectContaining({ code: 'VAL_1002', details: { field: 'admin' } }),
    );
  });

  it('refuses removing your own Admin role, but not your own Educator role', () => {
    expect(() => planRoleChange(admin, 'k', admin.claims, { admin: false })).toThrowError(
      expect.objectContaining({ code: 'USR_1001' }),
    );
    expect(planRoleChange(admin, 'k', admin.claims, { educator: true }).claims.admin).toBe(true);
  });
});

describe('planRoleChange course grants', () => {
  it('carries a de-duplicated grant list, alone or with a role', () => {
    expect(
      planRoleChange(admin, 'u', undefined, { grantedCourseIds: ['git', 'sql', 'git'] }),
    ).toEqual({
      claims: { educator: false, admin: false },
      roles: ['learner'],
      grantedCourseIds: ['git', 'sql'],
    });
    expect(
      planRoleChange(admin, 'u', undefined, { educator: true, grantedCourseIds: [] }),
    ).toMatchObject({ roles: ['learner', 'educator'], grantedCourseIds: [] });
  });

  it('leaves the plan without grants when none were given', () => {
    expect(planRoleChange(admin, 'u', undefined, { educator: true })).not.toHaveProperty(
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
      planRoleChange(admin, 'u', undefined, { grantedCourseIds: ids as never }),
    ).toThrowError(
      expect.objectContaining({ code: 'VAL_1002', details: { field: 'grantedCourseIds' } }),
    );
  });

  it('accepts exactly 50 grants', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(
      planRoleChange(admin, 'u', undefined, { grantedCourseIds: ids }).grantedCourseIds,
    ).toHaveLength(50);
  });
});

describe('diffGrants', () => {
  it('names what was added and what was taken away', () => {
    expect(diffGrants(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
    expect(diffGrants([], [])).toEqual({ added: [], removed: [] });
  });
});
