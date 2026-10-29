import { migrateCourse, progressPercent, progressSchema } from '@gurukul/schema';
import type { Progress } from '@gurukul/schema';
import { emptyDelta, isEmptyDelta, planProgressStats } from './analytics.js';
import type { ProgressStatsDelta } from './analytics.js';
import type { CertificateGrant } from './certificates.js';
import { log } from './logging/log.js';

/** Where progress triggers read courses and write derived fields. `stores.ts` adapts Firestore. */
export interface ProgressStore {
  /** The published course object, or undefined when it does not exist. */
  course(courseId: string): Promise<unknown | undefined>;
  /** Writes the derived fields; `completed` stamps `completedAt` with the server time. */
  writeDerived(progressId: string, derived: { percent: number; completed: boolean }): Promise<void>;
  /** Adds the delta to the `stats/org` and `stats/course_{id}` counters Sanjaya reads. */
  bumpStats(courseId: string, delta: ProgressStatsDelta): Promise<void>;
  /**
   * Moves this learner's assignments for the course to `status`; returns how many actually
   * changed (one already at `status` is left alone and not counted).
   */
  setAssignmentStatus(
    uid: string,
    courseId: string,
    status: 'started' | 'completed',
  ): Promise<number>;
  /** Who signs certificates issued now: `config/org.signatory`, else the default. */
  signatory(): Promise<{ name: string; role: string }>;
  /**
   * Records who started the course (`courses/{id}/learners/{uid}` with their display name) so the
   * course's Acharya can see names without reading profiles. Idempotent.
   */
  recordLearner(uid: string, courseId: string): Promise<void>;
  /**
   * Issues the learner's certificate in ONE transaction: re-reads the progress document, does
   * nothing if `certificateId` is already set, else takes the next sequence number, writes
   * `certificates/{id}` and sets `progress.certificateId`. Returns the new id, or null if one existed.
   */
  issueCertificate(progressId: string, grant: CertificateGrant): Promise<string | null>;
}

/**
 * Reacts to a write on `progress/{id}`: computes the percent from the CURRENT published course
 * (the client never writes it), stamps `completedAt` at 100%, and keeps the stats counters and the
 * assignment status in step (see `analytics.ts` for what a write counts). It writes only when something derived changed, so its own write
 * re-triggers it exactly once and then stops.
 */
export async function handleProgressWrite(
  store: ProgressStore,
  progressId: string,
  beforeRaw: unknown,
  afterRaw: unknown,
  at: Date,
): Promise<'ignored' | 'unchanged' | 'updated'> {
  if (afterRaw === undefined) return 'ignored';
  const after = progressSchema.safeParse(afterRaw);
  if (!after.success) return 'ignored';
  const before = beforeRaw === undefined ? undefined : progressSchema.safeParse(beforeRaw);
  const was: Progress | undefined = before?.success ? before.data : undefined;
  const now = after.data;

  const raw = await store.course(now.courseId);
  if (raw === undefined) return 'ignored';
  const course = migrateCourse(raw);

  log.debug('Progress changed', { uid: now.uid, courseId: now.courseId, percent: now.percent });
  const delta = planProgressStats(course, was, now, at);
  if (delta.started === 1) await store.recordLearner(now.uid, now.courseId);
  if (delta.started === 1 || delta.completed === 1) {
    const moved = await store.setAssignmentStatus(
      now.uid,
      now.courseId,
      delta.completed === 1 ? 'completed' : 'started',
    );
    if (delta.completed === 1) delta.assignmentsCompleted = moved;
  }
  if (!isEmptyDelta(delta)) await store.bumpStats(now.courseId, delta);

  const percent = progressPercent(course, now);
  const completed = percent === 100 && now.completedAt === null;
  let updated = false;
  if (percent !== now.percent || completed) {
    await store.writeDerived(progressId, { percent, completed });
    updated = true;
  }
  if (percent === 100 && course.rules.certificate && now.certificateId === null) {
    const signatory = await store.signatory();
    const issued = await store.issueCertificate(progressId, {
      uid: now.uid,
      courseId: now.courseId,
      courseTitle: course.title,
      courseVersion: course.version,
      signatoryName: signatory.name,
      signatoryRole: signatory.role,
    });
    if (issued !== null) {
      log.info('Certificate issued', {
        credentialId: issued,
        courseId: now.courseId,
        uid: now.uid,
      });
      await store.bumpStats(now.courseId, { ...emptyDelta(delta.week), certified: 1 });
      updated = true;
    }
  }
  return updated ? 'updated' : 'unchanged';
}
