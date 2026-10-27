import { attemptSchema, isItemDone, isoWeek, progressSchema } from '@gurukul/schema';
import type { Course, Progress, ProgressState } from '@gurukul/schema';
import { log } from './logging/log.js';

const DAY_MS = 86_400_000;

/** What one progress write adds to `stats/course_{id}` and `stats/org`. All counts are increments. */
export interface ProgressStatsDelta {
  started: number;
  completed: number;
  certified: number;
  /** Days from start to completion, added when the course completes. */
  finishDays: number;
  /** Positions of the parvas that became fully done in this write. */
  parvasDone: number[];
  /** Lessons that became complete in this write, counted into `weekly[week]`. */
  lessons: number;
  week: string;
  /** Assignments moved to `completed`. */
  assignmentsCompleted: number;
}

export const emptyDelta = (week: string): ProgressStatsDelta => ({
  started: 0,
  completed: 0,
  certified: 0,
  finishDays: 0,
  parvasDone: [],
  lessons: 0,
  week,
  assignmentsCompleted: 0,
});

/** True when the delta changes nothing. */
export const isEmptyDelta = (d: ProgressStatsDelta): boolean =>
  d.started === 0 &&
  d.completed === 0 &&
  d.certified === 0 &&
  d.finishDays === 0 &&
  d.parvasDone.length === 0 &&
  d.lessons === 0 &&
  d.assignmentsCompleted === 0;

const NOTHING_DONE: ProgressState = { completedItemIds: [], pariksha: {} };

/**
 * Compares the learner's state before and after one write against the CURRENT course: which parvas
 * became fully done, how many lessons were newly completed, whether this is the start or the
 * completion. Comparing before/after (never "is done now") is what makes a repeated trigger
 * count nothing twice.
 */
export function planProgressStats(
  course: Pick<Course, 'parvas'>,
  was: Progress | undefined,
  now: Progress,
  at: Date,
): ProgressStatsDelta {
  const delta = emptyDelta(isoWeek(at));
  const before: ProgressState = was ?? NOTHING_DONE;
  delta.started = was === undefined ? 1 : 0;
  if (now.completedAt !== null && was?.completedAt == null) {
    delta.completed = 1;
    delta.finishDays = Math.max(
      0,
      (now.completedAt.toMillis() - now.startedAt.toMillis()) / DAY_MS,
    );
  }
  course.parvas.forEach((parva, index) => {
    const wasDone = parva.items.every((i) => isItemDone(i, before));
    if (!wasDone && parva.items.every((i) => isItemDone(i, now))) delta.parvasDone.push(index);
    delta.lessons += parva.items.filter(
      (i) => i.type === 'lesson' && isItemDone(i, now) && !isItemDone(i, before),
    ).length;
  });
  return delta;
}

/** `parvaCompletions` with `indices` incremented, padded with zeros up to the highest one. */
export function addParvaCompletions(
  current: readonly number[],
  indices: readonly number[],
): number[] {
  const next = [...current];
  for (const i of indices) {
    while (next.length <= i) next.push(0);
    next[i] = (next[i] as number) + 1;
  }
  return next;
}

/** What one graded attempt adds to `stats/course_{id}`. */
export interface AttemptStatsDelta {
  scoreSum: number;
  scoreCount: number;
  /** Only for a learner's first attempt of a Pariksha. */
  questionFirstTry: Record<string, { correct: number; total: number }>;
}

/** Where the attempt trigger reads the learner's progress and writes the counters. */
export interface AttemptStatsStore {
  progress(uid: string, courseId: string): Promise<unknown | undefined>;
  bumpAttemptStats(courseId: string, delta: AttemptStatsDelta): Promise<void>;
}

/**
 * Reacts to a new `progress/{id}/attempts/{aid}`: adds the score, and when this was the learner's
 * first attempt of the Pariksha (progress says `attempts === 1`) the per-question first-try counts.
 * Attempts stored before `results` existed add the score only.
 */
export async function handleAttemptCreated(
  store: AttemptStatsStore,
  attemptRaw: unknown,
): Promise<'ignored' | 'counted'> {
  const attempt = attemptSchema.safeParse(attemptRaw);
  if (!attempt.success) return 'ignored';
  const { uid, courseId, parikshaId, score, results } = attempt.data;
  const progress = progressSchema.safeParse(await store.progress(uid, courseId));
  const first = progress.success && progress.data.pariksha[parikshaId]?.attempts === 1;
  const questionFirstTry: AttemptStatsDelta['questionFirstTry'] = {};
  if (first) {
    for (const r of results)
      questionFirstTry[r.questionId] = { correct: r.correct ? 1 : 0, total: 1 };
  }
  log.debug('Counting an attempt', {
    courseId,
    parikshaId,
    firstTry: first,
    count: results.length,
  });
  await store.bumpAttemptStats(courseId, { scoreSum: score, scoreCount: 1, questionFirstTry });
  return 'counted';
}

/** The counts the daily roll-up recomputes from the source collections. */
export interface RollupCounts {
  usersTotal: number;
  activeLearners30d: number;
  assignmentsTotal: number;
  assignmentsCompleted: number;
}

export interface RollupStore {
  countUsers(): Promise<number>;
  /** Progress documents with `lastActiveAt` at or after `sinceMs`. */
  countActiveSince(sinceMs: number): Promise<number>;
  countAssignments(): Promise<number>;
  countCompletedAssignments(): Promise<number>;
  /** Overwrites these counters on `stats/org`. */
  writeOrgCounts(counts: RollupCounts): Promise<void>;
}

/** The start of the "active in the last 30 days" window. */
export const activeWindowStart = (now: number): number => now - 30 * DAY_MS;

/** `dailyRollup`: recomputes the org counters with count() aggregations, fixing any drift. */
export async function runDailyRollup(store: RollupStore, now: number): Promise<RollupCounts> {
  const [usersTotal, activeLearners30d, assignmentsTotal, assignmentsCompleted] = await Promise.all(
    [
      store.countUsers(),
      store.countActiveSince(activeWindowStart(now)),
      store.countAssignments(),
      store.countCompletedAssignments(),
    ],
  );
  const counts = { usersTotal, activeLearners30d, assignmentsTotal, assignmentsCompleted };
  await store.writeOrgCounts(counts);
  return counts;
}
