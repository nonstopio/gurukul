import { CertificateError, revokeCertificate } from './certificates.js';
import type { CertificateAdmin } from './certificates.js';
import { checkAnswer, gradeAttempt, GradeError } from './grading.js';
import type { AttemptResult, GradingStore } from './grading.js';
import { isAllowedEmail, RoleError } from './roles.js';
import type { RoleChange, RoleClaims } from './roles.js';
import { applyRoleChange } from './set-roles.js';
import type { RoleAdmin } from './set-roles.js';

/** The slice of a callable request `setRoles` reads. */
export interface CallableRequest {
  auth?: { uid: string; token: RoleClaims & { email?: string } } | undefined;
  data?: ({ uid?: unknown } & RoleChange) | undefined;
}

/** A failure the wrapper turns into an `HttpsError` with the same code. */
export class CallError extends Error {
  constructor(
    readonly code:
      | 'unauthenticated'
      | 'invalid-argument'
      | 'not-found'
      | 'resource-exhausted'
      | RoleError['code'],
    message: string,
    readonly details?: { nextAttemptAt: number },
  ) {
    super(message);
  }
}

/** The `setRoles` callable's body: validate the request, then apply the change. */
export async function handleSetRoles(
  request: CallableRequest,
  admin: RoleAdmin,
): Promise<{ roles: string[] }> {
  if (!request.auth) throw new CallError('unauthenticated', 'Sign in first.');
  const { uid, ...change } = request.data ?? {};
  if (typeof uid !== 'string' || uid === '') {
    throw new CallError('invalid-argument', 'uid is required.');
  }
  const { token } = request.auth;
  try {
    const plan = await applyRoleChange(
      admin,
      { uid: request.auth.uid, email: token.email, claims: token },
      uid,
      change,
    );
    return { roles: plan.roles };
  } catch (e) {
    if (e instanceof RoleError) throw new CallError(e.code, e.message);
    throw e;
  }
}

/** The slice of a callable request the Pariksha and certificate callables read. */
export interface AuthedRequest {
  auth?:
    | {
        uid: string;
        token: RoleClaims & {
          email?: string | undefined;
          email_verified?: boolean | undefined;
          firebase?: { sign_in_provider?: string | undefined } | undefined;
        };
      }
    | undefined;
  data?: unknown;
}

/** The caller of a learner callable: a verified NonStop account signed in with Google. */
function requireLearner(request: AuthedRequest): string {
  if (!request.auth) throw new CallError('unauthenticated', 'Sign in first.');
  const { uid, token } = request.auth;
  if (
    !isAllowedEmail(token.email) ||
    token.email_verified !== true ||
    token.firebase?.sign_in_provider !== 'google.com'
  ) {
    throw new CallError('permission-denied', 'Sign in with your NonStop io Google account.');
  }
  return uid;
}

/** Turns a domain error into the `CallError` the wrapper maps to an `HttpsError`. */
function asCallError(e: unknown): unknown {
  if (e instanceof GradeError) return new CallError(e.code, e.message, e.details);
  if (e instanceof CertificateError) return new CallError(e.code, e.message);
  return e;
}

const asObject = (data: unknown): Record<string, unknown> =>
  typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

/** `checkAnswer`: right or wrong for one question of a Pariksha that reveals after each answer. */
export async function handleCheckAnswer(
  request: AuthedRequest,
  store: GradingStore,
): Promise<{ correct: boolean; correctOptionIds: string[]; explanation: string }> {
  requireLearner(request);
  try {
    return await checkAnswer(store, asObject(request.data));
  } catch (e) {
    throw asCallError(e);
  }
}

/** `gradeAttempt`: scores and records one Pariksha attempt. */
export async function handleGradeAttempt(
  request: AuthedRequest,
  store: GradingStore,
  now: () => number,
): Promise<AttemptResult> {
  const uid = requireLearner(request);
  try {
    return await gradeAttempt(store, uid, asObject(request.data), now());
  } catch (e) {
    throw asCallError(e);
  }
}

/** `revokeCertificate`: Kulapati-only; revokes (or restores) a certificate and audits it. */
export async function handleRevokeCertificate(
  request: AuthedRequest,
  admin: CertificateAdmin,
): Promise<{ id: string; revoked: boolean }> {
  if (!request.auth) throw new CallError('unauthenticated', 'Sign in first.');
  const { token } = request.auth;
  try {
    return await revokeCertificate(
      admin,
      { uid: request.auth.uid, email: token.email, claims: token },
      asObject(request.data),
    );
  } catch (e) {
    throw asCallError(e);
  }
}
