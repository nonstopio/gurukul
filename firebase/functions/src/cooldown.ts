import { ApiException } from '@gurukul/schema';
import { requireKulapati } from './errors.js';
import type { AuditEntry, Caller } from './errors.js';
import { log } from './logging/log.js';
import { idField } from './validation.js';

/** The Admin SDK calls `resetCooldown` needs. */
export interface CooldownAdmin {
  /** Sets `lastAttemptAt` of that Pariksha to epoch 0; false when the progress or the entry is missing. */
  resetCooldown(uid: string, courseId: string, parikshaId: string): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
}

/** `resetCooldown`: opens a retake for one learner by clearing the Pariksha's last-attempt time. */
export async function resetCooldown(
  admin: CooldownAdmin,
  caller: Caller,
  data: { uid?: unknown; courseId?: unknown; parikshaId?: unknown },
): Promise<{ ok: true }> {
  requireKulapati(caller, 'resetCooldown');
  const uid = idField('uid', data.uid);
  const courseId = idField('courseId', data.courseId);
  const parikshaId = idField('parikshaId', data.parikshaId);
  log.debug('Resetting cooldown', { uid, courseId, parikshaId });
  if (!(await admin.resetCooldown(uid, courseId, parikshaId))) {
    throw new ApiException('PRK_2001', [parikshaId, courseId]);
  }
  await admin.audit({
    action: 'cooldown.reset',
    by: caller.uid,
    target: uid,
    detail: { courseId, parikshaId },
  });
  return { ok: true };
}
