import { z } from 'zod';

const count = z.number().int().min(0).default(0);

/**
 * `stats/org`: counters Analytics reads, kept current by triggers and the daily roll-up so a
 * dashboard view costs a handful of reads instead of one per learner.
 */
export const orgStatsSchema = z.object({
  started: count,
  completed: count,
  assignmentsTotal: count,
  assignmentsCompleted: count,
  usersTotal: count,
  activeLearners30d: count,
  /** Every graded attempt in the org: their scores (0..1) summed, and how many. */
  quizScoreSum: z.number().min(0).default(0),
  quizScoreCount: count,
  /** Each learner's first attempt at each Quiz, and how many of those passed. */
  quizFirstTryTotal: count,
  quizFirstTryPassed: count,
  /** Lessons completed per ISO week, keyed like `2026-W44`. */
  weekly: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type OrgStats = z.infer<typeof orgStatsSchema>;

export const questionFirstTrySchema = z.object({ correct: count, total: count });

/** Finish times beyond this many days share one bucket, so the histogram stays small. */
export const FINISH_DAYS_CAP = 365;

/** The histogram key for a finish time in days: whole days, never negative, capped. */
export const finishDaysBucket = (days: number): string =>
  String(Math.min(FINISH_DAYS_CAP, Math.max(0, Math.round(days))));

/** `stats/course_{id}`: the funnel, where learners stop, and the hardest questions. */
export const courseStatsSchema = z.object({
  assigned: count,
  started: count,
  completed: count,
  certified: count,
  scoreSum: z.number().min(0).default(0),
  scoreCount: count,
  /** Index = chapter position; value = learners who finished that chapter. */
  chapterCompletions: z.array(z.number().int().min(0)).default([]),
  questionFirstTry: z.record(z.string(), questionFirstTrySchema).default({}),
  /** Sum of days from start to completion: with `completed`, the average time to finish. */
  finishDaysSum: z.number().min(0).default(0),
  /** Learners who finished in N whole days (rounded, capped at `FINISH_DAYS_CAP`), keyed by N: the median. */
  finishDaysHistogram: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type CourseStats = z.infer<typeof courseStatsSchema>;

/** The week a date falls in, as `YYYY-Www` (ISO 8601, UTC). */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The last `n` ISO weeks ending at `now`, oldest first. */
export function lastWeeks(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    isoWeek(new Date(now.getTime() - (n - 1 - i) * 7 * 86_400_000)),
  );
}
