import { describe, expect, it, vi } from 'vitest';
import { handleSetRoles } from '../src/handlers.js';
import { applyRoleChange, grantKulapati } from '../src/set-roles.js';
import type { RoleAdmin } from '../src/set-roles.js';

const admin = (
  claims: { acharya?: boolean; kulapati?: boolean } | undefined = undefined,
): RoleAdmin => ({
  getClaims: vi.fn().mockResolvedValue(claims),
  setClaims: vi.fn().mockResolvedValue(undefined),
  revokeTokens: vi.fn().mockResolvedValue(undefined),
  getGrantedCourseIds: vi.fn().mockResolvedValue([]),
  applyCourseGrants: vi.fn().mockResolvedValue(undefined),
  mirrorRoles: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
});
const kulapati = { uid: 'k', email: 'k@nonstopio.com', claims: { kulapati: true } };

describe('applyRoleChange', () => {
  it('sets claims, mirrors roles, revokes tokens and audits', async () => {
    const a = admin();
    const plan = await applyRoleChange(a, kulapati, 'u', { acharya: true });
    expect(plan.roles).toEqual(['shishya', 'acharya']);
    expect(a.setClaims).toHaveBeenCalledWith('u', { acharya: true, kulapati: false });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u', plan);
    expect(a.revokeTokens).toHaveBeenCalledWith('u');
    expect(a.audit).toHaveBeenCalledWith({
      action: 'roles.set',
      by: 'k',
      target: 'u',
      detail: { acharya: true, kulapati: false },
    });
  });

  it('syncs Acharya course grants: profile list, acharyaIds of added and removed courses', async () => {
    const a = admin();
    a.getGrantedCourseIds = vi.fn().mockResolvedValue(['git', 'sql']);
    a.applyCourseGrants = vi.fn().mockResolvedValue(undefined);
    await applyRoleChange(a, kulapati, 'u', { grantedCourseIds: ['sql', 'go'] });
    expect(a.applyCourseGrants).toHaveBeenCalledWith('u', ['sql', 'go'], {
      added: ['go'],
      removed: ['git'],
    });
    expect(a.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { acharya: false, kulapati: false, grantedCourseIds: ['sql', 'go'] },
      }),
    );
  });

  it('does not touch grants when the change does not carry them', async () => {
    const a = admin();
    a.getGrantedCourseIds = vi.fn();
    a.applyCourseGrants = vi.fn();
    await applyRoleChange(a, kulapati, 'u', { acharya: true });
    expect(a.getGrantedCourseIds).not.toHaveBeenCalled();
    expect(a.applyCourseGrants).not.toHaveBeenCalled();
  });

  it('writes nothing when the change is refused', async () => {
    const a = admin();
    await expect(
      applyRoleChange(a, { uid: 'x', email: 'x@nonstopio.com', claims: undefined }, 'u', {
        acharya: true,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    expect(a.setClaims).not.toHaveBeenCalled();
    expect(a.audit).not.toHaveBeenCalled();
  });
});

describe('grantKulapati', () => {
  it('makes the person a Kulapati, keeping an existing Acharya claim', async () => {
    const a = admin({ acharya: true });
    const uid = await grantKulapati(
      { uidForEmail: async () => 'u1', admin: a },
      ' You@NonStopIO.com ',
    );
    expect(uid).toBe('u1');
    expect(a.setClaims).toHaveBeenCalledWith('u1', { acharya: true, kulapati: true });
    expect(a.mirrorRoles).toHaveBeenCalledWith('u1', {
      claims: { acharya: true, kulapati: true },
      roles: ['shishya', 'acharya', 'kulapati'],
    });
    expect(a.revokeTokens).toHaveBeenCalledWith('u1');
    expect(a.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'roles.bootstrap', by: 'script' }),
    );
  });

  it('works for a person with no claims yet', async () => {
    const a = admin();
    await grantKulapati({ uidForEmail: async () => 'u2', admin: a }, 'a@nonstopio.com');
    expect(a.setClaims).toHaveBeenCalledWith('u2', { acharya: false, kulapati: true });
  });

  it.each([undefined, '', 'a@gmail.com'])('prints usage for %j', async (email) => {
    await expect(grantKulapati({ uidForEmail: vi.fn(), admin: admin() }, email)).rejects.toThrow(
      /Usage/,
    );
  });
});

describe('handleSetRoles', () => {
  const request = (over: object = {}) => ({
    auth: { uid: 'k', token: { email: 'k@nonstopio.com', kulapati: true } },
    data: { uid: 'u', acharya: true },
    ...over,
  });

  it('applies the change and returns the new roles', async () => {
    expect(await handleSetRoles(request(), admin())).toEqual({ roles: ['shishya', 'acharya'] });
  });

  it('refuses signed-out callers and a missing uid, including a missing body', async () => {
    await expect(handleSetRoles(request({ auth: undefined }), admin())).rejects.toMatchObject({
      code: 'AUTH_1001',
    });
    await expect(
      handleSetRoles(request({ data: { acharya: true } }), admin()),
    ).rejects.toMatchObject({ code: 'VAL_1001', details: { field: 'uid' } });
    await expect(handleSetRoles(request({ data: { uid: '' } }), admin())).rejects.toMatchObject({
      code: 'VAL_1002',
    });
    await expect(handleSetRoles(request({ data: undefined }), admin())).rejects.toMatchObject({
      code: 'VAL_1001',
    });
  });

  it('lets a refused change surface as its ApiException and rethrows anything else', async () => {
    const notKulapati = request({ auth: { uid: 'x', token: { email: 'x@nonstopio.com' } } });
    await expect(handleSetRoles(notKulapati, admin())).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    const broken = admin();
    broken.getClaims = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(handleSetRoles(request(), broken)).rejects.toThrow('boom');
  });
});
