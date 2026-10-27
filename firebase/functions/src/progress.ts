import { migrateCourse, progressPercent, progressSchema } from '@gurukul/schema';
import type { Progress } from '@gurukul/schema';

/** Where progress triggers read courses and write derived fields. `stores.ts` adapts Firestore. */
export interface ProgressStore {
  /** The published course object, or undefined when it does not exist. */
  course(courseId: string): Promise<unknown | undefined>;
  /** Writes the derived fields; `completed` stamps `completedAt` with the server time. */
  writeDerived(progressId: string, derived: { percent: number; completed: boolean }): Promise<void>;
  /** Increments the `org` and `course_{id}` counters Sanjaya reads. */
  bumpStats(courseId: string, delta: { started: number; completed: number }): Promise<void>;
  /** Moves this learner's assignment (if any) for the course to `status`. */
  setAssignmentStatus(
    uid: string,
    courseId: string,
    status: 'started' | 'completed',
  ): Promise<void>;
}

/**
 * Reacts to a write on `progress/{id}`: computes the percent from the CURRENT published course
 * (the client never writes it), stamps `completedAt` at 100%, and keeps the stats counters and the
 * assignment status in step. It writes only when something derived changed, so its own write
 * re-triggers it exactly once and then stops.
 */
export async function handleProgressWrite(
  store: ProgressStore,
  progressId: string,
  beforeRaw: unknown,
  afterRaw: unknown,
): Promise<'ignored' | 'unchanged' | 'updated'> {
  if (afterRaw === undefined) return 'ignored';
  const after = progressSchema.safeParse(afterRaw);
  if (!after.success) return 'ignored';
  const before = beforeRaw === undefined ? undefined : progressSchema.safeParse(beforeRaw);
  const was: Progress | undefined = before?.success ? before.data : undefined;
  const now = after.data;

  const started = was === undefined;
  const justCompleted = now.completedAt !== null && was?.completedAt == null;
  if (started || justCompleted) {
    await store.bumpStats(now.courseId, {
      started: started ? 1 : 0,
      completed: justCompleted ? 1 : 0,
    });
    await store.setAssignmentStatus(now.uid, now.courseId, justCompleted ? 'completed' : 'started');
  }

  const raw = await store.course(now.courseId);
  if (raw === undefined) return 'ignored';
  const percent = progressPercent(migrateCourse(raw), now);
  const completed = percent === 100 && now.completedAt === null;
  if (percent === now.percent && !completed) return 'unchanged';
  await store.writeDerived(progressId, { percent, completed });
  return 'updated';
}
