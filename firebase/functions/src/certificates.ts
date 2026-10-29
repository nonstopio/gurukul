import { ApiException, certificateSchema, courseCode, credentialId } from '@gurukul/schema';
import { requireKulapati } from './errors.js';
import type { Caller } from './errors.js';
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

/** The Admin SDK calls `revokeCertificate` needs. */
export interface CertificateAdmin {
  /** Sets `revoked` and stamps `revokedAt` (null on restore); false when there is no such certificate. */
  setRevoked(id: string, revoked: boolean): Promise<boolean>;
  audit(entry: {
    action: 'certificate.revoke' | 'certificate.restore';
    by: string;
    target: string;
    detail: { revoked: boolean };
  }): Promise<void>;
}

/** Revokes (or restores) a certificate. Only a Kulapati on a NonStop account may; it stays verifiable as revoked. */
export async function revokeCertificate(
  admin: CertificateAdmin,
  caller: Caller,
  data: { id?: unknown; revoked?: unknown },
): Promise<{ id: string; revoked: boolean }> {
  requireKulapati(caller, 'revokeCertificate');
  const id = certificateSchema.shape.id.safeParse(data.id);
  if (!id.success) throw badField('id', data.id, 'must be a certificate id like NSG-GIT-26-0001');
  const revoked = data.revoked ?? true;
  if (typeof revoked !== 'boolean') throw badField('revoked', revoked, 'must be true or false');
  if (!(await admin.setRevoked(id.data, revoked))) throw new ApiException('CRT_2001', [id.data]);
  await admin.audit({
    action: revoked ? 'certificate.revoke' : 'certificate.restore',
    by: caller.uid,
    target: id.data,
    detail: { revoked },
  });
  return { id: id.data, revoked };
}
