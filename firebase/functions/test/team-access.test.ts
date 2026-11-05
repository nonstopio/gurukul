import { describe, expect, it } from 'vitest';
import { EDUCATOR_TEAM_ID, isAdmin, managesTeam, requireAdminOrManager } from '../src/errors.js';

const sales = { id: 'sales', managerEmails: ['mona@nonstopio.com'] };
const mona = { uid: 'm', email: 'Mona@nonstopio.com', claims: { manager: true } };

describe('team access', () => {
  it('lets an Admin act for every team and a Manager for the teams that list them', () => {
    const admin = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };
    expect(isAdmin(admin)).toBe(true);
    expect(managesTeam(admin, { id: 'other', managerEmails: [] })).toBe(true);
    expect(managesTeam(admin, { id: EDUCATOR_TEAM_ID, managerEmails: [] })).toBe(true);
    expect(managesTeam(mona, sales)).toBe(true);
    expect(managesTeam(mona, { id: 'other', managerEmails: [] })).toBe(false);
  });

  it('keeps the Educator course team Admin-only, and needs the claim and a NonStop account', () => {
    expect(managesTeam(mona, { ...sales, id: EDUCATOR_TEAM_ID })).toBe(false);
    expect(managesTeam({ ...mona, claims: { educator: true } }, sales)).toBe(false);
    expect(managesTeam({ ...mona, email: 'mona@gmail.com' }, sales)).toBe(false);
    expect(isAdmin({ uid: 'k', email: 'k@gmail.com', claims: { admin: true } })).toBe(false);
  });

  it('opens the door to Admins and Managers only', () => {
    expect(() => requireAdminOrManager(mona, 'teamReport')).not.toThrow();
    expect(() => requireAdminOrManager({ ...mona, claims: undefined }, 'teamReport')).toThrow(
      expect.objectContaining({ code: 'AUTH_2001', params: ['teamReport'] }),
    );
    expect(() => requireAdminOrManager({ ...mona, email: undefined }, 'teamReport')).toThrow(
      expect.objectContaining({ code: 'AUTH_2001' }),
    );
  });
});
