import { accessOf, progressId, readCourse } from '@gurukul/schema';
import type { Course, CourseListing } from '@gurukul/schema';
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

export function firebaseLearnerData(db: Firestore): LearnerData {
  return {
    async listCourses(audience) {
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
      const courses = snaps.flatMap((snap) =>
        snap.docs.flatMap((d) => listed(d.id, d.data()) ?? []),
      );
      const millis = (c: CourseListing) => c.publishedAt?.toMillis() ?? 0;
      return courses.sort((a, b) => millis(b) - millis(a));
    },
    async getCourse(courseId) {
      const snap = await getDoc(doc(db, 'courses', courseId));
      return snap.exists() ? readable(snap.id, snap.data()) : null;
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
      await setDoc(ref, {
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
      });
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
    async setTeam(uid, team) {
      await updateDoc(doc(db, 'users', uid), { team });
    },
    async setLabels(uid, labels) {
      await updateDoc(doc(db, 'users', uid), { labels });
    },
  };
}
