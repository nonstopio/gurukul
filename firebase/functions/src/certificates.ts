import { certificateSchema, courseCode, credentialId } from '@gurukul/schema';
import { isAllowedEmail } from './roles.js';
import type { RoleClaims } from './roles.js';

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
    },
  };
}

export class CertificateError extends Error {
  constructor(
    readonly code: 'permission-denied' | 'invalid-argument' | 'not-found',
    message: string,
  ) {
    super(message);
  }
}

/** The Admin SDK calls `revokeCertificate` needs. */
export interface CertificateAdmin {
  /** Sets `revoked` on the certificate; false when there is no such certificate. */
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
  caller: { uid: string; email?: string | undefined; claims: RoleClaims | undefined },
  data: { id?: unknown; revoked?: unknown },
): Promise<{ id: string; revoked: boolean }> {
  if (!isAllowedEmail(caller.email) || caller.claims?.kulapati !== true) {
    throw new CertificateError('permission-denied', 'Only a Kulapati can revoke certificates.');
  }
  const id = certificateSchema.shape.id.safeParse(data.id);
  const revoked = data.revoked ?? true;
  if (!id.success || typeof revoked !== 'boolean') {
    throw new CertificateError(
      'invalid-argument',
      'Give a certificate id and revoked as true or false.',
    );
  }
  if (!(await admin.setRevoked(id.data, revoked))) {
    throw new CertificateError('not-found', 'No such certificate.');
  }
  await admin.audit({
    action: revoked ? 'certificate.revoke' : 'certificate.restore',
    by: caller.uid,
    target: id.data,
    detail: { revoked },
  });
  return { id: id.data, revoked };
}
