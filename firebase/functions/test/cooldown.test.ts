import { describe, expect, it, vi } from 'vitest';
import { resetCooldown } from '../src/cooldown.js';
import type { CooldownAdmin } from '../src/cooldown.js';

const kulapati = { uid: 'k', email: 'k@nonstopio.com', claims: { kulapati: true } };
const admin = (found = true): CooldownAdmin => ({
  resetCooldown: vi.fn().mockResolvedValue(found),
  audit: vi.fn().mockResolvedValue(undefined),
});
const data = { uid: 'u', courseId: 'git', parikshaId: 'pk' };

describe('resetCooldown', () => {
  it('opens the retake and audits it', async () => {
    const a = admin();
    expect(await resetCooldown(a, kulapati, data)).toEqual({ ok: true });
    expect(a.resetCooldown).toHaveBeenCalledWith('u', 'git', 'pk');
    expect(a.audit).toHaveBeenCalledWith({
      action: 'cooldown.reset',
      by: 'k',
      target: 'u',
      detail: { courseId: 'git', parikshaId: 'pk' },
    });
  });

  it('refuses anyone but a Kulapati', async () => {
    const a = admin();
    await expect(
      resetCooldown(a, { uid: 'x', email: 'x@nonstopio.com', claims: { acharya: true } }, data),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    expect(a.resetCooldown).not.toHaveBeenCalled();
  });

  it.each([
    [{ courseId: 'git', parikshaId: 'pk' }, 'VAL_1001', 'uid'],
    [{ ...data, courseId: '' }, 'VAL_1002', 'courseId'],
    [{ ...data, parikshaId: 'a/b' }, 'VAL_1002', 'parikshaId'],
    [{ ...data, uid: 3 }, 'VAL_1002', 'uid'],
  ])('rejects a malformed request %j', async (bad, code, field) => {
    await expect(resetCooldown(admin(), kulapati, bad)).rejects.toMatchObject({
      code,
      details: { field },
    });
  });

  it('says PRK_2001, and audits nothing, when there is no such attempt', async () => {
    const a = admin(false);
    await expect(resetCooldown(a, kulapati, data)).rejects.toMatchObject({
      code: 'PRK_2001',
      params: ['pk', 'git'],
    });
    expect(a.audit).not.toHaveBeenCalled();
  });
});
