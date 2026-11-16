import { summariseCourse } from '@gurukul/schema';
import type { CourseSummary } from '@gurukul/schema';
import { log } from './logging/log.js';

export type SyncOutcome = 'written' | 'deleted' | 'unchanged';

/** Where course summaries are kept (`courseSummaries/{courseId}`). `stores.ts` adapts the Admin SDK. */
export interface SummaryStore {
  /**
   * In one transaction: reads the course as it is **now** and makes its summary match. Writes the
   * summary, deletes it when the course is gone or unreadable, and does neither when the stored one
   * was already derived from this very state of the course. State-based, so running it twice, late
   * or out of order changes nothing.
   */
  sync(courseId: string): Promise<SyncOutcome>;
  /**
   * Ids to sync: courses whose summary is missing, was derived from an older state of the course
   * or at another `COURSE_SUMMARY_VERSION`, and summaries whose course is gone.
   */
  stale(): Promise<string[]>;
}

/** What the summary says, as one comparable string; `null` for a missing or unreadable course. */
function derived(raw: unknown): string {
  const summary: CourseSummary | null = raw === undefined ? null : summariseCourse(raw);
  return JSON.stringify(
    summary && { ...summary, publishedAt: summary.publishedAt?.toMillis() ?? null },
  );
}

/**
 * `courses/{id}` was written: keeps `courseSummaries/{id}` in step. This is the only writer of
 * summaries, so publish, rollback, access changes, archiving, role grants and the seed are all
 * covered without any of them knowing. A write that changes nothing the summary holds (an
 * Educator's name, the description, a lesson's text) returns before reading anything. Otherwise the
 * event's own data decides nothing more: triggers deliver at least once and not in order, so the
 * store reads the course as it is now.
 */
export async function handleCourseWrite(
  store: SummaryStore,
  courseId: string,
  before: unknown,
  after: unknown,
): Promise<SyncOutcome | 'skipped'> {
  if (derived(before) === derived(after)) return 'skipped';
  const outcome = await store.sync(courseId);
  log.debug('Course summary synced', { courseId, status: outcome });
  return outcome;
}

const SYNC_CONCURRENCY = 20;

/**
 * Brings every summary in line with its course: the backfill for courses older than the trigger, the
 * repair for an event that failed, and the rewrite after a `COURSE_SUMMARY_VERSION` bump. Runs with
 * the daily roll-up and from `npm run backfill-summaries`. Normally finds nothing and writes nothing.
 */
export async function reconcileSummaries(
  store: SummaryStore,
): Promise<{ count: number; changed: number }> {
  const ids = await store.stale();
  let changed = 0;
  // ponytail: fixed chunks, a chunk waits for its slowest member; a pool if that ever shows.
  for (let i = 0; i < ids.length; i += SYNC_CONCURRENCY) {
    const outcomes = await Promise.all(
      ids.slice(i, i + SYNC_CONCURRENCY).map((id) => store.sync(id)),
    );
    changed += outcomes.filter((o) => o !== 'unchanged').length;
  }
  return { count: ids.length, changed };
}
