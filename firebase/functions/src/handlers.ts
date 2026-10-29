import { ApiException } from '@gurukul/schema';
import { revokeCertificate } from './certificates.js';
import type { CertificateAdmin } from './certificates.js';
import { assignCourses } from './assign.js';
import type { AssignResult, AssignStore } from './assign.js';
import { resetCooldown } from './cooldown.js';
import { archiveCourse, createCourse, publishCourse, rollbackCourse } from './courses.js';
import type { CourseStore } from './courses.js';
import type { CooldownAdmin } from './cooldown.js';
import type { Caller } from './errors.js';
import type { Mailer } from './mail.js';
import { remindLearners } from './remind.js';
import type { ReminderStore } from './remind.js';
import { checkAnswer, gradeAttempt } from './grading.js';
import type { AttemptResult, GradingStore } from './grading.js';
import { isAllowedEmail } from './roles.js';
import type { RoleChange, RoleClaims } from './roles.js';
import { applyRoleChange } from './set-roles.js';
import type { RoleAdmin } from './set-roles.js';
import { badField } from './validation.js';

/** The slice of a callable request the Pariksha and certificate callables read. */
export interface AuthedRequest {
  auth?:
    | {
        uid: string;
        token: RoleClaims & {
          email?: string | undefined;
          name?: string | undefined;
          email_verified?: boolean | undefined;
          firebase?: { sign_in_provider?: string | undefined } | undefined;
        };
      }
    | undefined;
  data?: unknown;
}

const asObject = (data: unknown): Record<string, unknown> =>
  typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

/** `setRoles`: Kulapati-only; validates the request, then applies the change. */
export async function handleSetRoles(
  request: AuthedRequest,
  admin: RoleAdmin,
): Promise<{ roles: string[] }> {
  if (!request.auth) throw new ApiException('AUTH_1001');
  const { uid, ...change } = asObject(request.data);
  if (typeof uid !== 'string' || uid === '') throw badField('uid', uid, 'must be a person’s uid');
  const { token } = request.auth;
  const plan = await applyRoleChange(
    admin,
    { uid: request.auth.uid, email: token.email, claims: token },
    uid,
    change as RoleChange,
  );
  return { roles: plan.roles };
}

/** The caller of a Studio or learner callable: a verified NonStop account signed in with Google. */
function requireVerified(request: AuthedRequest): Caller {
  if (!request.auth) throw new ApiException('AUTH_1001');
  const { uid, token } = request.auth;
  if (
    !isAllowedEmail(token.email) ||
    token.email_verified !== true ||
    token.firebase?.sign_in_provider !== 'google.com'
  ) {
    throw new ApiException('AUTH_1002');
  }
  return { uid, email: token.email, name: token.name, claims: token };
}

const requireLearner = (request: AuthedRequest): string => requireVerified(request).uid;

/** `checkAnswer`: right or wrong for one question of a Pariksha that reveals after each answer. */
export async function handleCheckAnswer(
  request: AuthedRequest,
  store: GradingStore,
): Promise<{ correct: boolean; correctOptionIds: string[]; explanation: string }> {
  const uid = requireLearner(request);
  return checkAnswer(store, uid, asObject(request.data));
}

/** `gradeAttempt`: scores and records one Pariksha attempt. */
export async function handleGradeAttempt(
  request: AuthedRequest,
  store: GradingStore,
  now: () => number,
): Promise<AttemptResult> {
  const uid = requireLearner(request);
  return gradeAttempt(store, uid, asObject(request.data), now());
}

/** `revokeCertificate`: Kulapati-only; revokes (or restores) a certificate and audits it. */
export async function handleRevokeCertificate(
  request: AuthedRequest,
  admin: CertificateAdmin,
): Promise<{ id: string; revoked: boolean }> {
  if (!request.auth) throw new ApiException('AUTH_1001');
  const { token } = request.auth;
  return revokeCertificate(
    admin,
    { uid: request.auth.uid, email: token.email, claims: token },
    asObject(request.data),
  );
}

/** The caller of a console callable; whether they are a Kulapati is decided by the operation. */
function requireCaller(request: AuthedRequest): Caller {
  if (!request.auth) throw new ApiException('AUTH_1001');
  return { uid: request.auth.uid, email: request.auth.token.email, claims: request.auth.token };
}

/** `assignCourses`: Kulapati-only; assigns courses to people by email, optionally emailing them. */
export async function handleAssignCourses(
  request: AuthedRequest,
  deps: { store: AssignStore; mailer: Mailer },
): Promise<AssignResult> {
  const caller = requireCaller(request);
  return assignCourses(deps, caller, asObject(request.data));
}

/** `resetCooldown`: Kulapati-only; opens a retake for one learner. */
export async function handleResetCooldown(
  request: AuthedRequest,
  admin: CooldownAdmin,
): Promise<{ ok: true }> {
  const caller = requireCaller(request);
  return resetCooldown(admin, caller, asObject(request.data));
}

/** `remindLearners`: Kulapati-only; queues reminders for unfinished assignments. */
export async function handleRemindLearners(
  request: AuthedRequest,
  deps: { store: ReminderStore; mailer: Mailer },
  now: () => number,
): Promise<{ sent: number; skipped: number }> {
  const caller = requireCaller(request);
  return remindLearners(deps, caller, asObject(request.data), now());
}

/** `createCourse`: an Acharya or Kulapati starts a course, blank or copied from another draft. */
export async function handleCreateCourse(
  request: AuthedRequest,
  store: CourseStore,
): Promise<{ courseId: string }> {
  return createCourse(store, requireVerified(request), asObject(request.data));
}

/** `publishCourse`: validates the draft and makes it the live version. */
export async function handlePublishCourse(
  request: AuthedRequest,
  store: CourseStore,
): Promise<{ version: number }> {
  return publishCourse(store, requireVerified(request), asObject(request.data));
}

/** `rollbackCourse`: republishes an old version as a new one. */
export async function handleRollbackCourse(
  request: AuthedRequest,
  store: CourseStore,
): Promise<{ version: number }> {
  return rollbackCourse(store, requireVerified(request), asObject(request.data));
}

/** `archiveCourse`: Kulapati-only; retires or restores a course. */
export async function handleArchiveCourse(
  request: AuthedRequest,
  store: CourseStore,
): Promise<{ status: 'published' | 'archived' }> {
  return archiveCourse(store, requireVerified(request), asObject(request.data));
}
