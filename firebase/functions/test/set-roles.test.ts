import { describe, expect, it, vi } from 'vitest';
import { handleSetRoles } from '../src/handlers.js';
import { applyRoleChange, grantAdmin, grantEducatorByCourse } from '../src/set-roles.js';
import type { RoleAdmin } from '../src/set-roles.js';

const admin = (
  claims: { educator?: boolean; manager?: boolean; adminCaller?: boolean } | undefined = undefined,
): RoleAdmin => ({
  getClaims: vi.fn().mockResolvedValue(claims),
  setClaims: vi.fn().mockResolvedValue(undefined),
  revokeTokens: vi.fn().mockResolvedValue(undefined),
  getGrantedCourseIds: vi.fn().mockResolvedValue([]),
  applyCourseGrants: vi.fn().mockResolvedValue(undefined),
  mirrorRoles: vi.fn().mockResolvedValue(undefined),
  releaseManagedTeams: vi.fn().mockResolvedValue(0),
  audit: vi.fn().mockResolvedValue(undefined),
});
const adminCaller = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };

describe('applyRoleChange', () => {
  it('sets claims, mirrors roles, revokes tokens and audits', async () => {
    const a = admin();
    const plan = await applyRoleChange(a, adminCaller, 'u', { educator: true });
    expect(plan.roles).toEqual(['learner', 'educator']);
    expect(a.setClaims).toHaveBeenCalledWith('u', { educator: true, manager: false, admin: false });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u', plan);
    expect(a.revokeTokens).toHaveBeenCalledWith('u');
    expect(a.audit).toHaveBeenCalledWith({
      action: 'roles.set',
      by: 'k',
      target: 'u',
      detail: { educator: true, manager: false, admin: false },
    });
  });

  it('syncs Educator course grants: profile list, educatorIds of added and removed courses', async () => {
    const a = admin();
    a.getGrantedCourseIds = vi.fn().mockResolvedValue(['git', 'sql']);
    a.applyCourseGrants = vi.fn().mockResolvedValue(undefined);
    await applyRoleChange(a, adminCaller, 'u', { grantedCourseIds: ['sql', 'go'] });
    expect(a.applyCourseGrants).toHaveBeenCalledWith('u', ['sql', 'go'], {
      added: ['go'],
      removed: ['git'],
    });
    expect(a.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { educator: false, manager: false, admin: false, grantedCourseIds: ['sql', 'go'] },
      }),
    );
  });

  it('does not touch grants when the change does not carry them', async () => {
    const a = admin();
    a.getGrantedCourseIds = vi.fn();
    a.applyCourseGrants = vi.fn();
    await applyRoleChange(a, adminCaller, 'u', { educator: true });
    expect(a.getGrantedCourseIds).not.toHaveBeenCalled();
    expect(a.applyCourseGrants).not.toHaveBeenCalled();
  });

  it('grants Manager without touching any team', async () => {
    const a = admin();
    const plan = await applyRoleChange(a, adminCaller, 'u', { manager: true });
    expect(plan.roles).toEqual(['learner', 'manager']);
    expect(a.releaseManagedTeams).not.toHaveBeenCalled();
  });

  it('hands a removed Manager’s teams back to Admins in the same call, and audits how many', async () => {
    const a = admin({ manager: true });
    a.releaseManagedTeams = vi.fn().mockResolvedValue(2);
    await applyRoleChange(a, adminCaller, 'u', { manager: false });
    expect(a.releaseManagedTeams).toHaveBeenCalledWith('u');
    expect(a.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { educator: false, manager: false, admin: false, teamsReleased: 2 },
      }),
    );
    const none = admin();
    await applyRoleChange(none, adminCaller, 'u', { manager: false });
    expect(none.releaseManagedTeams).toHaveBeenCalledWith('u');
    expect(none.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { educator: false, manager: false, admin: false } }),
    );
  });

  it('writes nothing when the change is refused', async () => {
    const a = admin();
    await expect(
      applyRoleChange(a, { uid: 'x', email: 'x@nonstopio.com', claims: undefined }, 'u', {
        educator: true,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    expect(a.setClaims).not.toHaveBeenCalled();
    expect(a.audit).not.toHaveBeenCalled();
  });
});

describe('grantEducatorByCourse', () => {
  it('adds Educator, keeps Admin, audits, and does not sign the learner out', async () => {
    const a = admin({ admin: true } as never);
    expect(await grantEducatorByCourse(a, 'u1')).toBe(true);
    expect(a.setClaims).toHaveBeenCalledWith('u1', { educator: true, manager: false, admin: true });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u1', {
      claims: { educator: true, manager: false, admin: true },
      roles: ['learner', 'educator', 'admin'],
    });
    expect(a.revokeTokens).not.toHaveBeenCalled();
    expect(a.audit).toHaveBeenCalledWith({
      action: 'roles.course',
      by: 'system',
      target: 'u1',
      detail: { educator: true, manager: false, admin: true },
    });
  });

  it('makes a Learner an Educator only', async () => {
    const a = admin();
    expect(await grantEducatorByCourse(a, 'u1')).toBe(true);
    expect(a.setClaims).toHaveBeenCalledWith('u1', {
      educator: true,
      manager: false,
      admin: false,
    });
  });

  it('keeps a Manager claim', async () => {
    const a = admin({ manager: true });
    await grantEducatorByCourse(a, 'u1');
    expect(a.setClaims).toHaveBeenCalledWith('u1', { educator: true, manager: true, admin: false });
  });

  it('does nothing for an existing Educator', async () => {
    const a = admin({ educator: true });
    expect(await grantEducatorByCourse(a, 'u1')).toBe(false);
    expect(a.setClaims).not.toHaveBeenCalled();
    expect(a.audit).not.toHaveBeenCalled();
  });
});

describe('grantAdmin', () => {
  it('makes the person an Admin, keeping an existing Educator claim', async () => {
    const a = admin({ educator: true });
    const uid = await grantAdmin(
      { uidForEmail: async () => 'u1', admin: a },
      ' You@NonStopIO.com ',
    );
    expect(uid).toBe('u1');
    expect(a.setClaims).toHaveBeenCalledWith('u1', { educator: true, manager: false, admin: true });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u1', {
      claims: { educator: true, manager: false, admin: true },
      roles: ['learner', 'educator', 'admin'],
    });
    expect(a.revokeTokens).toHaveBeenCalledWith('u1');
    expect(a.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'roles.bootstrap', by: 'script' }),
    );
  });

  it('works for a person with no claims yet', async () => {
    const a = admin();
    await grantAdmin({ uidForEmail: async () => 'u2', admin: a }, 'a@nonstopio.com');
    expect(a.setClaims).toHaveBeenCalledWith('u2', {
      educator: false,
      manager: false,
      admin: true,
    });
  });

  it('keeps an existing Manager claim', async () => {
    const a = admin({ manager: true });
    await grantAdmin({ uidForEmail: async () => 'u3', admin: a }, 'a@nonstopio.com');
    expect(a.setClaims).toHaveBeenCalledWith('u3', { educator: false, manager: true, admin: true });
  });

  it.each([undefined, '', 'a@gmail.com'])('prints usage for %j', async (email) => {
    await expect(grantAdmin({ uidForEmail: vi.fn(), admin: admin() }, email)).rejects.toThrow(
      /Usage/,
    );
  });
});

describe('handleSetRoles', () => {
  const request = (over: object = {}) => ({
    auth: { uid: 'k', token: { email: 'k@nonstopio.com', admin: true } },
    data: { uid: 'u', educator: true },
    ...over,
  });

  it('applies the change and returns the new roles', async () => {
    expect(await handleSetRoles(request(), admin())).toEqual({ roles: ['learner', 'educator'] });
  });

  it('refuses signed-out callers and a missing uid, including a missing body', async () => {
    await expect(handleSetRoles(request({ auth: undefined }), admin())).rejects.toMatchObject({
      code: 'AUTH_1001',
    });
    await expect(
      handleSetRoles(request({ data: { educator: true } }), admin()),
    ).rejects.toMatchObject({ code: 'VAL_1001', details: { field: 'uid' } });
    await expect(handleSetRoles(request({ data: { uid: '' } }), admin())).rejects.toMatchObject({
      code: 'VAL_1002',
    });
    await expect(handleSetRoles(request({ data: undefined }), admin())).rejects.toMatchObject({
      code: 'VAL_1001',
    });
  });

  it('lets a refused change surface as its ApiException and rethrows anything else', async () => {
    const notAdmin = request({ auth: { uid: 'x', token: { email: 'x@nonstopio.com' } } });
    await expect(handleSetRoles(notAdmin, admin())).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    const broken = admin();
    broken.getClaims = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(handleSetRoles(request(), broken)).rejects.toThrow('boom');
  });
});
