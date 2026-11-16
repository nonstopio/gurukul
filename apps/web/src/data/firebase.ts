import {
  courseSummarySchema,
  progressId,
  readCourse,
  summariseCourse,
  uploadLimitsSchema,
} from '@gurukul/schema';
import type { Audience, Course, CourseListing } from '@gurukul/schema';
import {
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Firestore, QueryConstraint } from 'firebase/firestore';
import { log } from '../log';
import { SUMMARY_LIMIT } from './limits';
import type { AssignmentRow, AttemptRow, CertificateRow, LearnerData, ProgressRow } from './types';

type Ts = { toDate(): Date } | null | undefined;
const date = (t: Ts): Date | null => t?.toDate() ?? null;

/** Whole courses the fallback reads when summaries are missing: the limit lists had before summaries. */
export const COURSE_LIMIT = 100;
const ASSIGNMENT_LIMIT = 100;

export function toProgress(data: Record<string, unknown>): ProgressRow {
  return {
    courseId: data.courseId as string,
    courseVersion: (data.courseVersion as number | undefined) ?? 0,
    lastItemId: (data.lastItemId as string | null | undefined) ?? null,
    lastActiveAt: date(data.lastActiveAt as Ts),
    completedItemIds: (data.completedItemIds as string[] | undefined) ?? [],
    quiz: Object.fromEntries(
      Object.entries((data.quiz as Record<string, Record<string, unknown>> | undefined) ?? {}).map(
        ([id, r]) => [
          id,
          {
            best: (r.best as number | undefined) ?? 0,
            passed: r.passed === true,
            attempts: (r.attempts as number | undefined) ?? 0,
            lastAttemptAt: date(r.lastAttemptAt as Ts),
          },
        ],
      ),
    ),
    percent: (data.percent as number | undefined) ?? 0,
    completedAt: date(data.completedAt as Ts),
    certificateId: (data.certificateId as string | null | undefined) ?? null,
  };
}

const CERTIFICATE_LIMIT = 50;

export function toCertificate(id: string, d: Record<string, unknown>): CertificateRow {
  return {
    id,
    uid: d.uid as string,
    learnerName: d.learnerName as string,
    courseId: d.courseId as string,
    courseTitle: d.courseTitle as string,
    courseVersion: (d.courseVersion as number | undefined) ?? 0,
    issuedAt: date(d.issuedAt as Ts) ?? new Date(0),
    signatoryName: (d.signatoryName as string | undefined) ?? '',
    signatoryRole: (d.signatoryRole as string | undefined) ?? '',
    revoked: d.revoked === true,
    revokedAt: d.revoked === true ? date(d.revokedAt as Ts) : null,
  };
}

export function toAttempt(id: string, d: Record<string, unknown>): AttemptRow {
  return {
    id,
    score: (d.score as number | undefined) ?? 0,
    correctCount: (d.correctCount as number | undefined) ?? 0,
    total: (d.total as number | undefined) ?? 0,
    passed: d.passed === true,
    questionIds: (d.questionIds as string[] | undefined) ?? [],
    answers: (d.answers as Record<string, string[]> | undefined) ?? {},
    results: (d.results as AttemptRow['results'] | undefined) ?? [],
  };
}

/**
 * Teams one catalogue query can name: Firestore allows 30 combinations of `in` and
 * `array-contains-any`, and the status filter uses two of them. A person is on a handful.
 */
export const TEAM_QUERY_LIMIT = 15;

/** A course this app can show, or `null` (logged) for one it cannot read, so the rest still load. */
function readable(courseId: string, raw: unknown): Course | null {
  const course = readCourse(raw);
  if (course === null) log.warn('Unreadable course skipped', { courseId });
  return course;
}

const millis = (c: CourseListing) => c.publishedAt?.toMillis() ?? 0;

/**
 * The summaries of the courses each of `shapes` (one list of filters per query) asks for, newest
 * first. Lists read `courseSummaries`, never whole courses; the same filters are counted on
 * `courses`, and when that finds more courses than summaries came back (a deploy before the
 * nightly backfill, or a summary its function failed to write) or the summaries cannot be read,
 * the whole courses are read as lists did before summaries, and summarised here. So a missing
 * summary costs a slow list, logged, never a missing course.
 * ponytail: the count is one or two reads a list. A course document nothing can read counts too
 * and makes every list fall back; drop the count once summaries have proven themselves, or allow
 * for the gap, if that ever happens.
 */
export async function listSummaries(
  db: Firestore,
  shapes: readonly QueryConstraint[][],
  order: readonly QueryConstraint[] = [],
): Promise<CourseListing[]> {
  const read = (name: string, max: number) =>
    Promise.all(
      shapes.map((shape) => getDocs(query(collection(db, name), ...shape, ...order, limit(max)))),
    ).then((snaps) => snaps.flatMap((snap) => snap.docs));
  const [summaries, expected] = await Promise.all([
    read('courseSummaries', SUMMARY_LIMIT).then(
      (docs) =>
        docs.flatMap((d) => {
          const parsed = courseSummarySchema.safeParse(d.data());
          if (!parsed.success) log.warn('Unreadable course summary skipped', { courseId: d.id });
          return parsed.success ? [parsed.data] : [];
        }),
      () => null,
    ),
    Promise.all(
      shapes.map((shape) => getCountFromServer(query(collection(db, 'courses'), ...shape))),
    ).then(
      (counts) => counts.reduce((sum, c) => sum + c.data().count, 0),
      // Offline, a count has no cached answer: the summaries the cache holds are then trusted.
      () => null,
    ),
  ]);
  const newestFirst = (rows: CourseListing[]) => rows.sort((a, b) => millis(b) - millis(a));
  if (summaries && (expected === null || summaries.length >= Math.min(expected, SUMMARY_LIMIT))) {
    return newestFirst(summaries);
  }
  log.warn('Course summaries incomplete, whole courses read', {
    count: summaries?.length ?? null,
    expected,
  });
  const whole = (await read('courses', COURSE_LIMIT)).flatMap((d) => {
    const summary = summariseCourse(d.data());
    if (summary === null) log.warn('Unreadable course skipped', { courseId: d.id });
    return summary ?? [];
  });
  const fresh = new Set(whole.map((c) => c.id));
  return newestFirst([...whole, ...(summaries ?? []).filter((c) => !fresh.has(c.id))]);
}

// ponytail: a course read, and a course listing, is reused for 5 minutes in this tab, so a new
// publish reaches a learner within 5 minutes; Studio passes `fresh`, which also drops the listings.
// Listen to the documents if that ever matters.
export const COURSE_TTL_MS = 5 * 60 * 1000;

type Kept<T> = Map<string, { at: number; promise: Promise<T> }>;

/** The read kept under `key` while it is younger than the TTL, else `load()`, kept for the next ask. */
function reused<T>(kept: Kept<T>, key: string, fresh: boolean, load: () => Promise<T>): Promise<T> {
  const hit = kept.get(key);
  if (!fresh && hit && Date.now() - hit.at < COURSE_TTL_MS) return hit.promise;
  const promise = load();
  kept.set(key, { at: Date.now(), promise });
  // A failed read is not kept, so the next page (or Retry) asks again.
  promise.catch(() => kept.delete(key));
  return promise;
}

/**
 * `who` names the signed-in person: a course is cached per person, so after a sign-out the next
 * person on the tab is never served a course the rules would refuse them.
 */
export function firebaseLearnerData(
  db: Firestore,
  who: () => string | undefined = () => undefined,
): LearnerData {
  // The course is the biggest document and every learner page asks for it: one read per hop, not one per page.
  const courses: Kept<Course | null> = new Map();
  // Home, the catalogue, the console and search all draw from the same listing: one read, shared.
  const listings: Kept<CourseListing[]> = new Map();
  const list = (audience: Audience | undefined) => {
    const live = where('status', 'in', ['published', 'archived']);
    // Educators and Admins open every course, so one plain query. Everyone else asks for the
    // public courses and for the courses of their own teams: the rules only answer a listing
    // that says so, which is how a course outside their reach never leaves the database.
    if (audience?.staff) return listSummaries(db, [[live]], [orderBy('publishedAt', 'desc')]);
    return listSummaries(db, [
      [live, where('visibility', '==', 'public')],
      ...(audience?.teamIds.length
        ? [
            [
              live,
              where('visibility', '==', 'teams'),
              where(
                'visibleTeamIds',
                'array-contains-any',
                audience.teamIds.slice(0, TEAM_QUERY_LIMIT),
              ),
            ],
          ]
        : []),
    ]);
  };
  return {
    listCourses(audience) {
      // Keyed by person and by what the queries ask for, so nobody is served another's listing.
      const key = JSON.stringify([who(), audience?.staff === true, audience?.teamIds ?? []]);
      return reused(listings, key, false, () => list(audience));
    },
    getCourse(courseId, { fresh = false } = {}) {
      // Studio asks for a fresh course when it opens or publishes one: the listings are stale too.
      if (fresh) listings.clear();
      const key = `${who() ?? ''}/${courseId}`;
      return reused(courses, key, fresh, () =>
        getDoc(doc(db, 'courses', courseId)).then(
          (snap) => (snap.exists() ? readable(snap.id, snap.data()) : null),
          (e: unknown) => {
            // The rules refuse a draft, a course for other teams and a missing one alike: to the
            // person all three are "not available". Not kept, so a course that opens later shows.
            if ((e as { code?: string }).code !== 'permission-denied') throw e;
            courses.delete(key);
            return null;
          },
        ),
      );
    },
    async myAssignments(uid) {
      const snap = await getDocs(
        query(collection(db, 'assignments'), where('uid', '==', uid), limit(ASSIGNMENT_LIMIT)),
      );
      return snap.docs.map((d): AssignmentRow => {
        const a = d.data();
        return {
          id: d.id,
          courseId: a.courseId as string,
          dueAt: date(a.dueAt as Ts),
          mandatory: a.mandatory === true,
          status: a.status as AssignmentRow['status'],
          assignedByName: typeof a.assignedByName === 'string' ? a.assignedByName : null,
        };
      });
    },
    async myProgress(uid) {
      const snap = await getDocs(
        query(collection(db, 'progress'), where('uid', '==', uid), limit(ASSIGNMENT_LIMIT)),
      );
      return snap.docs.map((d) => toProgress(d.data()));
    },
    watchProgress(uid, courseId, cb, onError) {
      return onSnapshot(
        doc(db, 'progress', progressId(uid, courseId)),
        (snap) => cb(snap.exists() ? toProgress(snap.data()) : null),
        onError,
      );
    },
    async latestAttempt(uid, courseId, quizId) {
      // The uid filter is what lets the rules allow the query; the path already scopes it.
      const snap = await getDocs(
        query(
          collection(db, 'progress', progressId(uid, courseId), 'attempts'),
          where('uid', '==', uid),
          where('quizId', '==', quizId),
          orderBy('createdAt', 'desc'),
          limit(1),
        ),
      );
      const first = snap.docs[0];
      return first ? toAttempt(first.id, first.data()) : null;
    },
    async getCertificate(id) {
      const snap = await getDoc(doc(db, 'certificates', id));
      return snap.exists() ? toCertificate(snap.id, snap.data()) : null;
    },
    async myCertificates(uid) {
      const snap = await getDocs(
        query(
          collection(db, 'certificates'),
          where('uid', '==', uid),
          orderBy('issuedAt', 'desc'),
          limit(CERTIFICATE_LIMIT),
        ),
      );
      return snap.docs.map((d) => toCertificate(d.id, d.data()));
    },
    async startCourse(uid, course) {
      const ref = doc(db, 'progress', progressId(uid, course.id));
      if ((await getDoc(ref)).exists()) return;
      // Two opens at once both see "missing"; the second create is then an update the rules
      // refuse. The course is started either way, so that is not a failure.
      const fresh = {
        uid,
        courseId: course.id,
        courseVersion: course.version,
        startedAt: serverTimestamp(),
        lastItemId: null,
        lastActiveAt: serverTimestamp(),
        completedItemIds: [],
        quiz: {},
        percent: 0,
        completedAt: null,
        certificateId: null,
      };
      try {
        await setDoc(ref, fresh);
      } catch (e) {
        const denied = (e as { code?: string }).code === 'permission-denied';
        if (!denied || !(await getDoc(ref)).exists()) throw e;
      }
    },
    async completeItem(uid, courseId, itemId) {
      await updateDoc(doc(db, 'progress', progressId(uid, courseId)), {
        completedItemIds: arrayUnion(itemId),
        lastItemId: itemId,
        lastActiveAt: serverTimestamp(),
      });
    },
    async setLastItem(uid, courseId, itemId) {
      await updateDoc(doc(db, 'progress', progressId(uid, courseId)), {
        lastItemId: itemId,
        lastActiveAt: serverTimestamp(),
      });
    },
    async orgTeams() {
      const snap = await getDoc(doc(db, 'config', 'org'));
      return snap.exists() ? ((snap.data().teams as string[] | undefined) ?? []) : [];
    },
    async uploadLimits() {
      const snap = await getDoc(doc(db, 'config', 'org'));
      const parsed = uploadLimitsSchema.safeParse(snap.data()?.uploads);
      return parsed.success ? parsed.data : undefined;
    },
    async setLabels(uid, labels) {
      await updateDoc(doc(db, 'users', uid), { labels });
    },
  };
}
