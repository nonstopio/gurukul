import { ApiException, certificateSchema, courseCode, credentialId } from '@gurukul/schema';
import { requireAdmin } from './errors.js';
import type { Caller } from './errors.js';
import { buildRevokedEmail } from './mail.js';
import type { Mailer } from './mail.js';
import { log } from './logging/log.js';
import { badField } from './validation.js';

/** What the progress trigger hands the store when a learner has finished a certificate course. */
export interface CertificateGrant {
  uid: string;
  courseId: string;
  courseTitle: string;
  courseVersion: number;
  signatoryName: string;
  signatoryRole: string;
}

/** The certificate document, minus the server timestamp the adapter stamps as `issuedAt`. */
export interface CertificateDraft {
  id: string;
  uid: string;
  learnerName: string;
  courseId: string;
  courseTitle: string;
  courseVersion: number;
  signatoryName: string;
  signatoryRole: string;
  revoked: false;
  revokedAt: null;
}

/** India time, as the changelog: a certificate issued late on 31 December UTC is next year's. */
const IST_OFFSET_MS = 19_800_000;

/** The name printed on the certificate: the profile's display name, else the email's local part. */
export function learnerName(
  user: { displayName?: unknown; email?: unknown } | undefined,
  uid: string,
): string {
  const name = typeof user?.displayName === 'string' ? user.displayName.trim() : '';
  if (name !== '') return name;
  const email = typeof user?.email === 'string' ? user.email.split('@')[0]?.trim() : '';
  return email ? email : uid;
}

/**
 * Plans one certificate: bumps this year's sequence in the counter document and builds the
 * credential id (`NSG-GIT-26-0001`). `counter` is `counters/certificates`, `{ '2026': 41 }`.
 */
export function planCertificate(
  grant: CertificateGrant,
  user: { displayName?: unknown; email?: unknown } | undefined,
  counter: Record<string, unknown> | undefined,
  now: Date,
): { year: string; sequence: number; certificate: CertificateDraft } {
  const year = new Date(now.getTime() + IST_OFFSET_MS).getUTCFullYear();
  const last = counter?.[String(year)];
  const sequence = (typeof last === 'number' ? last : 0) + 1;
  return {
    year: String(year),
    sequence,
    certificate: {
      id: credentialId(courseCode(grant.courseId), year, sequence),
      uid: grant.uid,
      learnerName: learnerName(user, grant.uid).slice(0, 120),
      courseId: grant.courseId,
      courseTitle: grant.courseTitle,
      courseVersion: grant.courseVersion,
      signatoryName: grant.signatoryName,
      signatoryRole: grant.signatoryRole,
      revoked: false,
      revokedAt: null,
    },
  };
}

/** What `setRevoked` reports about the certificate it touched. */
export interface RevokedCertificate {
  uid: string;
  courseTitle: string;
  /** False when the certificate already had the requested state. */
  changed: boolean;
}

/** The Admin SDK calls `revokeCertificate` needs. */
export interface CertificateAdmin {
  /**
   * Sets `revoked` and stamps `revokedAt` (null on restore). Null when there is no such
   * certificate; otherwise who it belongs to and whether the flag actually changed.
   */
  setRevoked(id: string, revoked: boolean): Promise<RevokedCertificate | null>;
  /** The email address on a learner's profile, or null when they have none. */
  emailOf(uid: string): Promise<string | null>;
  audit(entry: {
    action: 'certificate.revoke' | 'certificate.restore';
    by: string;
    target: string;
    detail: { revoked: boolean };
  }): Promise<void>;
}

/** Revokes (or restores) a certificate. Only an Admin on a NonStop account may; it stays verifiable as revoked. */
export async function revokeCertificate(
  deps: { admin: CertificateAdmin; mailer: Mailer },
  caller: Caller,
  data: { id?: unknown; revoked?: unknown },
): Promise<{ id: string; revoked: boolean }> {
  const { admin } = deps;
  requireAdmin(caller, 'revokeCertificate');
  const id = certificateSchema.shape.id.safeParse(data.id);
  if (!id.success) throw badField('id', data.id, 'must be a certificate id like NSG-GIT-26-0001');
  const revoked = data.revoked ?? true;
  if (typeof revoked !== 'boolean') throw badField('revoked', revoked, 'must be true or false');
  const cert = await admin.setRevoked(id.data, revoked);
  if (!cert) throw new ApiException('CRT_2001', [id.data]);
  await admin.audit({
    action: revoked ? 'certificate.revoke' : 'certificate.restore',
    by: caller.uid,
    target: id.data,
    detail: { revoked },
  });
  if (revoked && cert.changed) await tellLearner(deps, cert);
  return { id: id.data, revoked };
}

/**
 * Emails the learner that their certificate was revoked. The revocation is already recorded, so
 * a missing address or a failed send is logged and never undoes or fails it.
 */
async function tellLearner(
  deps: { admin: CertificateAdmin; mailer: Mailer },
  cert: RevokedCertificate,
): Promise<void> {
  try {
    const to = await deps.admin.emailOf(cert.uid);
    if (to === null) {
      log.warn('Revocation email skipped', { reason: 'learner has no email' });
      return;
    }
    await deps.mailer.send(buildRevokedEmail(to, cert.courseTitle));
  } catch (error) {
    log.warn('Revocation email failed', { error: error instanceof Error ? error.name : 'unknown' });
  }
}
