import {
  attemptSchema,
  finishDaysBucket,
  isItemDone,
  isoWeek,
  migrateCourse,
  progressSchema,
} from '@gurukul/schema';
import type { Course, CourseStats, Progress, ProgressState } from '@gurukul/schema';
import { log } from './logging/log.js';

const DAY_MS = 86_400_000;

/** What one progress write adds to `stats/course_{id}` and `stats/org`. All counts are increments. */
export interface ProgressStatsDelta {
  started: number;
  completed: number;
  certified: number;
  /** Days from start to completion, added when the course completes. */
  finishDays: number;
  /** The histogram bucket (`finishDaysBucket`) of that finish time; null unless the course completes. */
  finishBucket: string | null;
  /** Positions of the chapters that became fully done in this write. */
  chaptersDone: number[];
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
  finishBucket: null,
  chaptersDone: [],
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
  d.chaptersDone.length === 0 &&
  d.lessons === 0 &&
  d.assignmentsCompleted === 0;

const NOTHING_DONE: ProgressState = { completedItemIds: [], quiz: {} };

/**
 * Compares the learner's state before and after one write against the CURRENT course: which chapters
 * became fully done, how many lessons were newly completed, whether this is the start or the
 * completion. Comparing before/after (never "is done now") is what makes a repeated trigger
 * count nothing twice.
 */
export function planProgressStats(
  course: Pick<Course, 'chapters'>,
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
    delta.finishBucket = finishDaysBucket(delta.finishDays);
  }
  course.chapters.forEach((chapter, index) => {
    const wasDone = chapter.items.every((i) => isItemDone(i, before));
    if (!wasDone && chapter.items.every((i) => isItemDone(i, now))) delta.chaptersDone.push(index);
    delta.lessons += chapter.items.filter(
      (i) => i.type === 'lesson' && isItemDone(i, now) && !isItemDone(i, before),
    ).length;
  });
  return delta;
}

/** `chapterCompletions` with `indices` incremented, padded with zeros up to the highest one. */
export function addChapterCompletions(
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

/** What one graded attempt adds to `stats/course_{id}` and the `quiz*` counters of `stats/org`. */
export interface AttemptStatsDelta {
  scoreSum: number;
  scoreCount: number;
  /** Only for a learner's first attempt of a Quiz. */
  questionFirstTry: Record<string, { correct: number; total: number }>;
  /** 1 for a learner's first attempt of a Quiz, else 0. */
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
 * first attempt of the Quiz (progress says `attempts === 1`) the per-question first-try counts
 * and the org's first-try pass count. Attempts stored before `results` existed add no question counts.
 */
export async function handleAttemptCreated(
  store: AttemptStatsStore,
  attemptRaw: unknown,
): Promise<'ignored' | 'counted'> {
  const attempt = attemptSchema.safeParse(attemptRaw);
  if (!attempt.success) return 'ignored';
  const { uid, courseId, quizId, score, passed, results } = attempt.data;
  const progress = progressSchema.safeParse(await store.progress(uid, courseId));
  const first = progress.success && progress.data.quiz[quizId]?.attempts === 1;
  const questionFirstTry: AttemptStatsDelta['questionFirstTry'] = {};
  if (first) {
    for (const r of results)
      questionFirstTry[r.questionId] = { correct: r.correct ? 1 : 0, total: 1 };
  }
  log.debug('Counting an attempt', {
    courseId,
    quizId,
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

/** The `stats/course_{id}` counters the roll-up rebuilds from the course's progress documents. */
export type CourseRecount = Pick<
  CourseStats,
  | 'started'
  | 'completed'
  | 'certified'
  | 'chapterCompletions'
  | 'finishDaysSum'
  | 'finishDaysHistogram'
>;

/**
 * Rebuilds the counters the progress trigger keeps for one course, from that course's progress
 * documents, the way the trigger counts them: a chapter counts once every item in it is done in the
 * CURRENT course (an empty chapter never counts). The attempt counters (scores, first tries) are
 * not rebuilt: the attempt trigger alone keeps them.
 */
export function recountCourse(
  course: Pick<Course, 'chapters'>,
  progressDocs: readonly unknown[],
): CourseRecount {
  const c: CourseRecount = {
    started: 0,
    completed: 0,
    certified: 0,
    chapterCompletions: course.chapters.map(() => 0),
    finishDaysSum: 0,
    finishDaysHistogram: {},
  };
  for (const raw of progressDocs) {
    const parsed = progressSchema.safeParse(raw);
    if (!parsed.success) continue;
    const p = parsed.data;
    c.started += 1;
    if (p.completedAt !== null) {
      c.completed += 1;
      const days = Math.max(0, (p.completedAt.toMillis() - p.startedAt.toMillis()) / DAY_MS);
      c.finishDaysSum += days;
      const bucket = finishDaysBucket(days);
      c.finishDaysHistogram[bucket] = (c.finishDaysHistogram[bucket] ?? 0) + 1;
    }
    if (p.certificateId !== null) c.certified += 1;
    course.chapters.forEach((chapter, i) => {
      if (chapter.items.length > 0 && chapter.items.every((item) => isItemDone(item, p))) {
        c.chapterCompletions[i] = (c.chapterCompletions[i] as number) + 1;
      }
    });
  }
  return c;
}

/** One `courses/{id}/learners/{uid}` entry the roll-up writes (merged): missing, or with an old name. */
export interface RosterWrite {
  courseId: string;
  uid: string;
  displayName: string;
  startedAt: Progress['startedAt'];
}

/**
 * The roster entries that are missing (a learner who started before the roster was kept) or carry
 * a name the learner has since changed on their profile. A learner without a profile keeps the
 * name already stored, or gets an empty one. Progress of a course that does not exist is ignored.
 */
export function planRoster(
  courses: ReadonlyMap<string, unknown>,
  progressDocs: readonly unknown[],
  names: ReadonlyMap<string, string>,
  rosters: ReadonlyMap<string, ReadonlyMap<string, string>>,
): RosterWrite[] {
  const writes: RosterWrite[] = [];
  for (const raw of progressDocs) {
    const parsed = progressSchema.safeParse(raw);
    if (!parsed.success || !courses.has(parsed.data.courseId)) continue;
    const { uid, courseId, startedAt } = parsed.data;
    const stored = rosters.get(courseId)?.get(uid);
    const name = names.get(uid);
    if (stored !== undefined && (name === undefined || name === stored)) continue;
    writes.push({ courseId, uid, displayName: name ?? '', startedAt });
  }
  return writes;
}

/** The org counts the daily roll-up takes from count() aggregations. */
export interface RollupCounts {
  usersTotal: number;
  activeLearners30d: number;
  assignmentsTotal: number;
  assignmentsCompleted: number;
}

/** When the last finished run started (null before the first) and the courses it could not write. */
export interface RollupRun {
  ranAt: number | null;
  retry: string[];
}

/** What the roll-up needs of a stored `stats/course_{id}` before it recounts the course. */
export interface StoredCourseStats {
  started: number;
  completed: number;
  /** Identifies this state of the document (its update time); null when it does not exist. */
  version: string | null;
}

export interface RollupStore {
  countUsers(): Promise<number>;
  /** Progress documents with `lastActiveAt` at or after `sinceMs`. */
  countActiveSince(sinceMs: number): Promise<number>;
  countAssignments(): Promise<number>;
  countCompletedAssignments(): Promise<number>;
  /** Assignments of one course. */
  countCourseAssignments(courseId: string): Promise<number>;
  lastRun(): Promise<RollupRun>;
  /** Records a finished run, so the next one looks only at what happened since it started. */
  finishRun(run: { ranAt: number; retry: string[] }): Promise<void>;
  /** Every course document, as stored, with when it was last published (0 when never). */
  courses(): Promise<{ id: string; publishedAtMs: number; data: unknown }[]>;
  /** The progress documents with `lastActiveAt` at or after `sinceMs`, as stored. */
  progressActiveSince(sinceMs: number): Promise<unknown[]>;
  /** Every progress document of one course, as stored. */
  courseProgress(courseId: string): Promise<unknown[]>;
  /** Every progress document of one learner, as stored. */
  learnerProgress(uid: string): Promise<unknown[]>;
  courseStats(courseId: string): Promise<StoredCourseStats>;
  /** These profiles' display names, by uid. */
  userNames(uids: readonly string[]): Promise<Map<string, string>>;
  /** These learners' roster entries: display name by uid, by course. A missing entry is left out. */
  rosters(
    entries: readonly { courseId: string; uid: string }[],
  ): Promise<Map<string, Map<string, string>>>;
  /** Merges these entries into the course rosters. */
  writeRoster(writes: readonly RosterWrite[]): Promise<void>;
  /** Overwrites these counters on `stats/org`; everything else on it is left alone. */
  writeOrgCounts(counts: RollupCounts): Promise<void>;
  /** Overwrites `assigned` on `stats/course_{id}`, leaving every other counter alone. */
  writeAssigned(courseId: string, assigned: number): Promise<void>;
  /**
   * Overwrites the recounted counters on `stats/course_{id}` and adds `org` to the same counters on
   * `stats/org`, in one transaction, only when the document is still at `version`. False, with
   * nothing written, when a trigger changed it since it was read.
   */
  writeCourseCounts(
    courseId: string,
    counts: CourseRecount & { assigned: number },
    guard: { version: string | null; org: { started: number; completed: number } },
  ): Promise<boolean>;
}

/** What `dailyRollup` logs: the org counts and how much it read and wrote. */
export interface RollupSummary extends RollupCounts {
  courses: number;
  /** Courses whose counters were rebuilt from their progress documents. */
  recounted: number;
  /** Courses a trigger wrote to during the recount: left as they were, recounted by the next run. */
  skipped: number;
  /** Progress documents read: the active ones, and every one of each recounted course. */
  progressDocs: number;
  rosterWrites: number;
}

/** The start of the "active in the last 30 days" window. */
export const activeWindowStart = (now: number): number => now - 30 * DAY_MS;

/**
 * How far before the last run's start "since the last run" reaches, so a write stamped by a clock
 * a little behind this one is not missed.
 */
const OVERLAP_MS = 5 * 60_000;

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
 * The roster entries owed by the learners active since the last run: a missing one, or a renamed
 * one, and then every other course of a renamed learner too. A rename therefore reaches the
 * rosters the night after the learner is next active in any course.
 */
async function rosterWritesFor(
  store: RollupStore,
  courses: ReadonlyMap<string, unknown>,
  active: readonly Progress[],
): Promise<RosterWrite[]> {
  const entries = active.filter((p) => courses.has(p.courseId));
  if (entries.length === 0) return [];
  const [names, rosters] = await Promise.all([
    store.userNames([...new Set(entries.map((p) => p.uid))]),
    store.rosters(entries),
  ]);
  const owed = planRoster(courses, entries, names, rosters);
  const renamed = new Set(
    owed.filter((w) => rosters.get(w.courseId)?.has(w.uid)).map((w) => w.uid),
  );
  const writes = owed.filter((w) => !renamed.has(w.uid));
  for (const uid of renamed) {
    writes.push(...planRoster(courses, await store.learnerProgress(uid), names, new Map()));
  }
  return writes;
}

/**
 * `dailyRollup`: the org totals come from count() aggregations and are written at once. A course
 * is recounted from its progress documents (`recountCourse`) only when it is due: a learner was
 * active in it or it was published since the last run started, or the last run had to skip it.
 * The first run has no last run, so every course is due. The recount is written only if no trigger
 * touched the course's counters meanwhile (`writeCourseCounts`), and the org's `started` and
 * `completed` move by what the recount changed, so no increment is overwritten. `weekly` (no lesson
 * stores when it was completed) and the attempt counters are kept by the triggers alone. It also
 * brings the roster entries of the learners active since the last run up to date.
 */
export async function runDailyRollup(store: RollupStore, now: number): Promise<RollupSummary> {
  const [usersTotal, activeLearners30d, assignmentsTotal, assignmentsCompleted, last, courseDocs] =
    await Promise.all([
      store.countUsers(),
      store.countActiveSince(activeWindowStart(now)),
      store.countAssignments(),
      store.countCompletedAssignments(),
      store.lastRun(),
      store.courses(),
    ]);
  const counts: RollupCounts = {
    usersTotal,
    activeLearners30d,
    assignmentsTotal,
    assignmentsCompleted,
  };
  await store.writeOrgCounts(counts);

  const since = last.ranAt === null ? 0 : last.ranAt - OVERLAP_MS;
  const courses = readableCourses(courseDocs);
  const active: Progress[] = [];
  for (const raw of await store.progressActiveSince(since)) {
    const parsed = progressSchema.safeParse(raw);
    if (parsed.success) active.push(parsed.data);
  }
  const due = new Set([
    ...last.retry,
    ...active.map((p) => p.courseId),
    ...courseDocs.filter((c) => c.publishedAtMs >= since).map((c) => c.id),
  ]);

  let progressDocs = active.length;
  let recounted = 0;
  const skipped: string[] = [];
  for (const [courseId, course] of courses) {
    const assigned = await store.countCourseAssignments(courseId);
    if (!due.has(courseId)) {
      await store.writeAssigned(courseId, assigned);
      continue;
    }
    // Read before the progress documents: a trigger that counts after this changes the version.
    const stored = await store.courseStats(courseId);
    const docs = await store.courseProgress(courseId);
    progressDocs += docs.length;
    const recount = recountCourse(course, docs);
    const written = await store.writeCourseCounts(
      courseId,
      { assigned, ...recount },
      {
        version: stored.version,
        org: {
          started: recount.started - stored.started,
          completed: recount.completed - stored.completed,
        },
      },
    );
    if (written) recounted += 1;
    else skipped.push(courseId);
  }

  const rosterWrites = await rosterWritesFor(store, courses, active);
  if (rosterWrites.length > 0) await store.writeRoster(rosterWrites);
  await store.finishRun({ ranAt: now, retry: skipped });
  return {
    ...counts,
    courses: courses.size,
    recounted,
    skipped: skipped.length,
    progressDocs,
    rosterWrites: rosterWrites.length,
  };
}
