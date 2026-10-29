import { describe, expect, it, vi } from 'vitest';
import { learnerName, planCertificate, revokeCertificate } from '../src/certificates.js';
import type { CertificateAdmin } from '../src/certificates.js';

const grant = {
  uid: 'u',
  courseId: 'git-basics',
  courseTitle: 'Git basics',
  courseVersion: 3,
  signatoryName: 'Asha Rao',
  signatoryRole: 'Head of Learning',
};

describe('learnerName', () => {
  it('prefers the display name, then the email local part, then the uid', () => {
    expect(learnerName({ displayName: ' Priya N ', email: 'p@x.com' }, 'u')).toBe('Priya N');
    expect(learnerName({ displayName: '  ', email: 'priya.n@nonstopio.com' }, 'u')).toBe('priya.n');
    expect(learnerName({ email: 'priya@nonstopio.com' }, 'u')).toBe('priya');
    expect(learnerName({ email: '@nonstopio.com' }, 'u')).toBe('u');
    expect(learnerName({ displayName: 5, email: 5 }, 'u')).toBe('u');
    expect(learnerName(undefined, 'u')).toBe('u');
  });
});

describe('planCertificate', () => {
  it('starts a year at 0001 and builds the credential id from the course code', () => {
    const plan = planCertificate(
      grant,
      { displayName: 'Priya' },
      undefined,
      new Date('2026-05-01T00:00:00Z'),
    );
    expect(plan).toEqual({
      year: '2026',
      sequence: 1,
      certificate: {
        id: 'NSG-GIT-26-0001',
        uid: 'u',
        learnerName: 'Priya',
        courseId: 'git-basics',
        courseTitle: 'Git basics',
        courseVersion: 3,
        signatoryName: 'Asha Rao',
        signatoryRole: 'Head of Learning',
        revoked: false,
        revokedAt: null,
      },
    });
  });

  it('continues the per-year sequence and ignores a damaged counter value', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    expect(planCertificate(grant, undefined, { '2026': 41, '2025': 900 }, now).certificate.id).toBe(
      'NSG-GIT-26-0042',
    );
    expect(planCertificate(grant, undefined, { '2026': 'x' }, now).sequence).toBe(1);
    expect(planCertificate(grant, undefined, { '2025': 9 }, now).sequence).toBe(1);
  });

  it('uses India time for the year and caps the name at 120 characters', () => {
    const plan = planCertificate(
      grant,
      { displayName: 'N'.repeat(200) },
      undefined,
      new Date('2026-12-31T19:00:00Z'),
    );
    expect(plan.year).toBe('2027');
    expect(plan.certificate.id).toBe('NSG-GIT-27-0001');
    expect(plan.certificate.learnerName).toHaveLength(120);
  });
});

describe('revokeCertificate', () => {
  const cert = { uid: 'u', courseTitle: 'Git basics', changed: true };
  const admin = (found = true, over: Partial<CertificateAdmin> = {}): CertificateAdmin => ({
    setRevoked: vi.fn().mockResolvedValue(found ? cert : null),
    emailOf: vi.fn().mockResolvedValue('asha@example.com'),
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  });
  const mailer = () => ({ send: vi.fn().mockResolvedValue(undefined) });
  const kulapati = { uid: 'k', email: 'k@nonstopio.com', claims: { kulapati: true } };

  it('revokes, audits and returns the new state', async () => {
    const a = admin();
    expect(
      await revokeCertificate({ admin: a, mailer: mailer() }, kulapati, { id: 'NSG-GIT-26-0001' }),
    ).toEqual({
      id: 'NSG-GIT-26-0001',
      revoked: true,
    });
    expect(a.setRevoked).toHaveBeenCalledWith('NSG-GIT-26-0001', true);
    expect(a.audit).toHaveBeenCalledWith({
      action: 'certificate.revoke',
      by: 'k',
      target: 'NSG-GIT-26-0001',
      detail: { revoked: true },
    });
  });

  it('emails the learner the course name and a contact when it newly revokes', async () => {
    const m = mailer();
    await revokeCertificate({ admin: admin(), mailer: m }, kulapati, { id: 'NSG-GIT-26-0001' });
    expect(m.send).toHaveBeenCalledOnce();
    const sent = m.send.mock.calls[0]?.[0];
    expect(sent.to).toBe('asha@example.com');
    expect(sent.subject).toContain('Git basics');
    expect(sent.text).toContain('gurukul@nonstopio.com');
  });

  it('sends nothing on a restore or when it was already revoked', async () => {
    const m = mailer();
    await revokeCertificate({ admin: admin(), mailer: m }, kulapati, {
      id: 'NSG-GIT-26-0001',
      revoked: false,
    });
    const again = admin(true, {
      setRevoked: vi.fn().mockResolvedValue({ ...cert, changed: false }),
    });
    await revokeCertificate({ admin: again, mailer: m }, kulapati, { id: 'NSG-GIT-26-0001' });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('still revokes when the learner has no email or the send fails', async () => {
    const m = mailer();
    const noEmail = admin(true, { emailOf: vi.fn().mockResolvedValue(null) });
    expect(
      await revokeCertificate({ admin: noEmail, mailer: m }, kulapati, { id: 'NSG-GIT-26-0001' }),
    ).toEqual({ id: 'NSG-GIT-26-0001', revoked: true });
    expect(m.send).not.toHaveBeenCalled();
    for (const boom of [new Error('smtp down'), 'plain']) {
      const failing = { send: vi.fn().mockRejectedValue(boom) };
      expect(
        await revokeCertificate({ admin: admin(), mailer: failing }, kulapati, {
          id: 'NSG-GIT-26-0001',
        }),
      ).toEqual({ id: 'NSG-GIT-26-0001', revoked: true });
    }
  });

  it('restores when revoked is false', async () => {
    const a = admin();
    await revokeCertificate({ admin: a, mailer: mailer() }, kulapati, {
      id: 'NSG-GIT-26-0001',
      revoked: false,
    });
    expect(a.setRevoked).toHaveBeenCalledWith('NSG-GIT-26-0001', false);
    expect(a.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'certificate.restore' }),
    );
  });

  it('is for a Kulapati on a NonStop account only', async () => {
    const a = admin();
    for (const caller of [
      { uid: 'x', email: 'x@nonstopio.com', claims: { acharya: true } },
      { uid: 'x', email: 'x@nonstopio.com', claims: undefined },
      { uid: 'x', email: 'x@gmail.com', claims: { kulapati: true } },
      { uid: 'x', email: undefined, claims: { kulapati: true } },
    ]) {
      await expect(
        revokeCertificate({ admin: a, mailer: mailer() }, caller, { id: 'NSG-GIT-26-0001' }),
      ).rejects.toMatchObject({
        code: 'AUTH_2001',
      });
    }
    expect(a.setRevoked).not.toHaveBeenCalled();
  });

  it('rejects a bad id or flag, and an unknown certificate', async () => {
    await expect(
      revokeCertificate({ admin: admin(), mailer: mailer() }, kulapati, { id: 'nope' }),
    ).rejects.toMatchObject({
      code: 'VAL_1002',
      details: { field: 'id' },
    });
    await expect(
      revokeCertificate({ admin: admin(), mailer: mailer() }, kulapati, {}),
    ).rejects.toMatchObject({
      code: 'VAL_1001',
      details: { field: 'id' },
    });
    await expect(
      revokeCertificate({ admin: admin(), mailer: mailer() }, kulapati, {
        id: 'NSG-GIT-26-0001',
        revoked: 'yes',
      }),
    ).rejects.toMatchObject({ code: 'VAL_1002', details: { field: 'revoked' } });
    const a = admin(false);
    await expect(
      revokeCertificate({ admin: a, mailer: mailer() }, kulapati, { id: 'NSG-GIT-26-0001' }),
    ).rejects.toMatchObject({
      code: 'CRT_2001',
      params: ['NSG-GIT-26-0001'],
    });
    expect(a.audit).not.toHaveBeenCalled();
  });
});
