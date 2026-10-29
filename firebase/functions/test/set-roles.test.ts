import { describe, expect, it, vi } from 'vitest';
import { handleSetRoles } from '../src/handlers.js';
import { applyRoleChange, grantAdmin } from '../src/set-roles.js';
import type { RoleAdmin } from '../src/set-roles.js';

const admin = (
  claims: { educator?: boolean; adminCaller?: boolean } | undefined = undefined,
): RoleAdmin => ({
  getClaims: vi.fn().mockResolvedValue(claims),
  setClaims: vi.fn().mockResolvedValue(undefined),
  revokeTokens: vi.fn().mockResolvedValue(undefined),
  getGrantedCourseIds: vi.fn().mockResolvedValue([]),
  applyCourseGrants: vi.fn().mockResolvedValue(undefined),
  mirrorRoles: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
});
const adminCaller = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };

describe('applyRoleChange', () => {
  it('sets claims, mirrors roles, revokes tokens and audits', async () => {
    const a = admin();
    const plan = await applyRoleChange(a, adminCaller, 'u', { educator: true });
    expect(plan.roles).toEqual(['learner', 'educator']);
    expect(a.setClaims).toHaveBeenCalledWith('u', { educator: true, admin: false });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u', plan);
    expect(a.revokeTokens).toHaveBeenCalledWith('u');
    expect(a.audit).toHaveBeenCalledWith({
      action: 'roles.set',
      by: 'k',
      target: 'u',
      detail: { educator: true, admin: false },
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
        detail: { educator: false, admin: false, grantedCourseIds: ['sql', 'go'] },
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

describe('grantAdmin', () => {
  it('makes the person an Admin, keeping an existing Educator claim', async () => {
    const a = admin({ educator: true });
    const uid = await grantAdmin(
      { uidForEmail: async () => 'u1', admin: a },
      ' You@NonStopIO.com ',
    );
    expect(uid).toBe('u1');
    expect(a.setClaims).toHaveBeenCalledWith('u1', { educator: true, admin: true });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u1', {
      claims: { educator: true, admin: true },
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
    expect(a.setClaims).toHaveBeenCalledWith('u2', { educator: false, admin: true });
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
