import { ApiException } from '@gurukul/schema';
import { requireAdmin } from './errors.js';
import type { AuditEntry, Caller } from './errors.js';
import { log } from './logging/log.js';
import { idField } from './validation.js';

/** The Admin SDK calls `resetCooldown` needs. */
export interface CooldownAdmin {
  /** Sets `lastAttemptAt` of that Quiz to epoch 0; false when the progress or the entry is missing. */
  resetCooldown(uid: string, courseId: string, quizId: string): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
}

/** `resetCooldown`: opens a retake for one learner by clearing the Quiz's last-attempt time. */
export async function resetCooldown(
  admin: CooldownAdmin,
  caller: Caller,
  data: { uid?: unknown; courseId?: unknown; quizId?: unknown },
): Promise<{ ok: true }> {
  requireAdmin(caller, 'resetCooldown');
  const uid = idField('uid', data.uid);
  const courseId = idField('courseId', data.courseId);
  const quizId = idField('quizId', data.quizId);
  log.debug('Resetting cooldown', { uid, courseId, quizId });
  if (!(await admin.resetCooldown(uid, courseId, quizId))) {
    throw new ApiException('PRK_2001', [quizId, courseId]);
  }
  await admin.audit({
    action: 'cooldown.reset',
    by: caller.uid,
    target: uid,
    detail: { courseId, quizId },
  });
  return { ok: true };
}
