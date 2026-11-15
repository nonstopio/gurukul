import { accessOf, progressId, readCourse, uploadLimitsSchema } from '@gurukul/schema';
import type { Audience, Course, CourseListing } from '@gurukul/schema';
import {
  arrayUnion,
  collection,
  doc,
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
import type { Firestore } from 'firebase/firestore';
import { log } from '../log';
import type { AssignmentRow, AttemptRow, CertificateRow, LearnerData, ProgressRow } from './types';

type Ts = { toDate(): Date } | null | undefined;
const date = (t: Ts): Date | null => t?.toDate() ?? null;

/** Courses the catalogue shows at once. 200 users and a handful of courses: plenty of headroom. */
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

/**
 * A catalogue entry: the course plus who may open it. Only listings carry it. A single course
 * stays the bare course object, because Studio compares it with the draft and the access fields
 * are not part of what an Educator edits.
 */
function listed(courseId: string, raw: unknown): CourseListing | null {
  const course = readable(courseId, raw);
  return course && { ...course, ...accessOf(raw) };
}

// ponytail: a course read, and a course listing, is reused for 5 minutes in this tab, so a new
// publish reaches a learner within 5 minutes; Studio passes `fresh`, which also drops the listings.
// Listen to the documents if that ever matters; a small summary document per course (a plan change
// in .plan/02-data-model.md) is what makes the listing itself light.
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
  const list = async (audience: Audience | undefined) => {
    const live = where('status', 'in', ['published', 'archived']);
    // Educators and Admins open every course, so one plain query. Everyone else asks for the
    // public courses and for the courses of their own teams: the rules only answer a listing
    // that says so, which is how a course outside their reach never leaves the database.
    const queries = audience?.staff
      ? [
          query(
            collection(db, 'courses'),
            live,
            orderBy('publishedAt', 'desc'),
            limit(COURSE_LIMIT),
          ),
        ]
      : [
          query(
            collection(db, 'courses'),
            live,
            where('visibility', '==', 'public'),
            limit(COURSE_LIMIT),
          ),
          ...(audience?.teamIds.length
            ? [
                query(
                  collection(db, 'courses'),
                  live,
                  where('visibility', '==', 'teams'),
                  where(
                    'visibleTeamIds',
                    'array-contains-any',
                    audience.teamIds.slice(0, TEAM_QUERY_LIMIT),
                  ),
                  limit(COURSE_LIMIT),
                ),
              ]
            : []),
        ];
    const snaps = await Promise.all(queries.map((q) => getDocs(q)));
    const found = snaps.flatMap((snap) => snap.docs.flatMap((d) => listed(d.id, d.data()) ?? []));
    const millis = (c: CourseListing) => c.publishedAt?.toMillis() ?? 0;
    return found.sort((a, b) => millis(b) - millis(a));
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
      return reused(courses, `${who() ?? ''}/${courseId}`, fresh, () =>
        getDoc(doc(db, 'courses', courseId)).then((snap) =>
          snap.exists() ? readable(snap.id, snap.data()) : null,
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
    watchProgress(uid, courseId, cb) {
      return onSnapshot(doc(db, 'progress', progressId(uid, courseId)), (snap) =>
        cb(snap.exists() ? toProgress(snap.data()) : null),
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
