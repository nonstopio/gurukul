import { attemptSchema, isItemDone, isoWeek, migrateCourse, progressSchema } from '@gurukul/schema';
import type { Attempt, Course, CourseStats, Progress, ProgressState } from '@gurukul/schema';
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

/** What one graded attempt adds to `stats/course_{id}` and the `pariksha*` counters of `stats/org`. */
export interface AttemptStatsDelta {
  scoreSum: number;
  scoreCount: number;
  /** Only for a learner's first attempt of a Pariksha. */
  questionFirstTry: Record<string, { correct: number; total: number }>;
  /** 1 for a learner's first attempt of a Pariksha, else 0. */
  firstTryTotal: number;
  /** 1 when that first attempt passed, else 0. */
  firstTryPassed: number;
}

/** Where the attempt trigger reads the learner's progress and writes the counters. */
export interface AttemptStatsStore {
  progress(uid: string, courseId: string): Promise<unknown | undefined>;
  bumpAttemptStats(courseId: string, delta: AttemptStatsDelta): Promise<void>;
}

/**
 * Reacts to a new `progress/{id}/attempts/{aid}`: adds the score, and when this was the learner's
 * first attempt of the Pariksha (progress says `attempts === 1`) the per-question first-try counts
 * and the org's first-try pass count. Attempts stored before `results` existed add no question counts.
 */
export async function handleAttemptCreated(
  store: AttemptStatsStore,
  attemptRaw: unknown,
): Promise<'ignored' | 'counted'> {
  const attempt = attemptSchema.safeParse(attemptRaw);
  if (!attempt.success) return 'ignored';
  const { uid, courseId, parikshaId, score, passed, results } = attempt.data;
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
  await store.bumpAttemptStats(courseId, {
    scoreSum: score,
    scoreCount: 1,
    questionFirstTry,
    firstTryTotal: first ? 1 : 0,
    firstTryPassed: first && passed ? 1 : 0,
  });
  return 'counted';
}

/** One stored attempt as the roll-up reads it: the raw document, its id and when it was graded. */
export interface StoredAttempt {
  id: string;
  createdAtMs: number;
  data: unknown;
}

/** The `stats/course_{id}` counters the roll-up rebuilds from progress and attempts. */
export type CourseRecount = Omit<CourseStats, 'assigned'>;

/** The `stats/org` counters the roll-up rebuilds from progress and attempts. */
export interface OrgRecount {
  started: number;
  completed: number;
  parikshaScoreSum: number;
  parikshaScoreCount: number;
  parikshaFirstTryTotal: number;
  parikshaFirstTryPassed: number;
}

const emptyCourseRecount = (parvas: number): CourseRecount => ({
  started: 0,
  completed: 0,
  certified: 0,
  scoreSum: 0,
  scoreCount: 0,
  parvaCompletions: Array.from({ length: parvas }, () => 0),
  questionFirstTry: {},
  finishDaysSum: 0,
});

/**
 * Rebuilds the counters the triggers keep, from the source documents, the way the triggers count
 * them: progress and attempts of a course that does not exist are ignored (the progress trigger
 * ignores them too), a parva counts once every item in it is done in the CURRENT course (an empty
 * parva never counts), and a first try is a learner's earliest attempt at a Pariksha.
 */
export function recountFromSource(
  courses: ReadonlyMap<string, Pick<Course, 'parvas'>>,
  progressDocs: readonly unknown[],
  attempts: readonly StoredAttempt[],
): { org: OrgRecount; courses: Record<string, CourseRecount> } {
  const org: OrgRecount = {
    started: 0,
    completed: 0,
    parikshaScoreSum: 0,
    parikshaScoreCount: 0,
    parikshaFirstTryTotal: 0,
    parikshaFirstTryPassed: 0,
  };
  const out: Record<string, CourseRecount> = {};
  for (const [id, course] of courses) out[id] = emptyCourseRecount(course.parvas.length);

  for (const raw of progressDocs) {
    const parsed = progressSchema.safeParse(raw);
    if (!parsed.success) continue;
    const p = parsed.data;
    const course = courses.get(p.courseId);
    const c = out[p.courseId];
    if (course === undefined || c === undefined) continue;
    c.started += 1;
    org.started += 1;
    if (p.completedAt !== null) {
      c.completed += 1;
      org.completed += 1;
      c.finishDaysSum += Math.max(0, (p.completedAt.toMillis() - p.startedAt.toMillis()) / DAY_MS);
    }
    if (p.certificateId !== null) c.certified += 1;
    course.parvas.forEach((parva, i) => {
      if (parva.items.length > 0 && parva.items.every((item) => isItemDone(item, p))) {
        c.parvaCompletions[i] = (c.parvaCompletions[i] as number) + 1;
      }
    });
  }

  const firsts = new Map<string, { at: number; id: string; attempt: Attempt }>();
  for (const stored of attempts) {
    const parsed = attemptSchema.safeParse(stored.data);
    if (!parsed.success) continue;
    const a = parsed.data;
    const c = out[a.courseId];
    if (c === undefined) continue;
    c.scoreSum += a.score;
    c.scoreCount += 1;
    org.parikshaScoreSum += a.score;
    org.parikshaScoreCount += 1;
    const key = `${a.uid}\u0000${a.courseId}\u0000${a.parikshaId}`;
    const seen = firsts.get(key);
    const earlier =
      seen === undefined ||
      stored.createdAtMs < seen.at ||
      (stored.createdAtMs === seen.at && stored.id < seen.id);
    if (earlier) firsts.set(key, { at: stored.createdAtMs, id: stored.id, attempt: a });
  }
  for (const { attempt } of firsts.values()) {
    const c = out[attempt.courseId] as CourseRecount;
    org.parikshaFirstTryTotal += 1;
    if (attempt.passed) org.parikshaFirstTryPassed += 1;
    for (const r of attempt.results) {
      const q = (c.questionFirstTry[r.questionId] ??= { correct: 0, total: 0 });
      q.total += 1;
      if (r.correct) q.correct += 1;
    }
  }
  return { org, courses: out };
}

/** The counts the daily roll-up recomputes from the source collections. */
export interface RollupCounts extends OrgRecount {
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
  /** Assignments of one course. */
  countCourseAssignments(courseId: string): Promise<number>;
  /** Every course document, as stored. */
  courses(): Promise<{ id: string; data: unknown }[]>;
  /** Every progress document, as stored. */
  progress(): Promise<unknown[]>;
  /** Every graded attempt, across every learner. */
  attempts(): Promise<StoredAttempt[]>;
  /** Overwrites these counters on `stats/org`; `weekly` is left alone. */
  writeOrgCounts(counts: RollupCounts): Promise<void>;
  /** Overwrites every counter on `stats/course_{id}`. */
  writeCourseCounts(courseId: string, counts: CourseStats): Promise<void>;
}

/** What `dailyRollup` logs: the org counters and how much it read. */
export interface RollupSummary extends RollupCounts {
  courses: number;
  progressDocs: number;
  attempts: number;
}

/** The start of the "active in the last 30 days" window. */
export const activeWindowStart = (now: number): number => now - 30 * DAY_MS;

/** The courses whose stored document still reads as a course; anything else has no counters. */
function readableCourses(docs: { id: string; data: unknown }[]): Map<string, Course> {
  const courses = new Map<string, Course>();
  for (const { id, data } of docs) {
    try {
      courses.set(id, migrateCourse(data));
    } catch {
      log.warn('Course skipped by the roll-up', { courseId: id });
    }
  }
  return courses;
}

/**
 * `dailyRollup`: recomputes every counter the triggers keep, except `weekly` (no lesson stores when
 * it was completed, so a week cannot be rebuilt), and overwrites them, fixing any drift. Counts come
 * from count() aggregations; the rest reads each course, progress and attempt document once, a few
 * thousand reads a day at 200 people. An increment that lands between the read and the write is
 * lost until the next run.
 */
export async function runDailyRollup(store: RollupStore, now: number): Promise<RollupSummary> {
  const [usersTotal, activeLearners30d, assignmentsTotal, assignmentsCompleted] = await Promise.all(
    [
      store.countUsers(),
      store.countActiveSince(activeWindowStart(now)),
      store.countAssignments(),
      store.countCompletedAssignments(),
    ],
  );
  const [courseDocs, progressDocs, attempts] = await Promise.all([
    store.courses(),
    store.progress(),
    store.attempts(),
  ]);
  const courses = readableCourses(courseDocs);
  const recount = recountFromSource(courses, progressDocs, attempts);
  for (const [courseId, counts] of Object.entries(recount.courses)) {
    const assigned = await store.countCourseAssignments(courseId);
    await store.writeCourseCounts(courseId, { assigned, ...counts });
  }
  const counts: RollupCounts = {
    usersTotal,
    activeLearners30d,
    assignmentsTotal,
    assignmentsCompleted,
    ...recount.org,
  };
  await store.writeOrgCounts(counts);
  return {
    ...counts,
    courses: courses.size,
    progressDocs: progressDocs.length,
    attempts: attempts.length,
  };
}
