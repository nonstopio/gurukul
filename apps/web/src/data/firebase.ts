import { progressId, readCourse } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
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
    pariksha: Object.fromEntries(
      Object.entries(
        (data.pariksha as Record<string, Record<string, unknown>> | undefined) ?? {},
      ).map(([id, r]) => [
        id,
        {
          best: (r.best as number | undefined) ?? 0,
          passed: r.passed === true,
          attempts: (r.attempts as number | undefined) ?? 0,
          lastAttemptAt: date(r.lastAttemptAt as Ts),
        },
      ]),
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

/** A course this app can show, or `null` (logged) for one it cannot read, so the rest still load. */
function readable(courseId: string, raw: unknown): Course | null {
  const course = readCourse(raw);
  if (course === null) log.warn('Unreadable course skipped', { courseId });
  return course;
}

export function firebaseLearnerData(db: Firestore): LearnerData {
  return {
    async listCourses() {
      const snap = await getDocs(
        query(
          collection(db, 'courses'),
          where('status', 'in', ['published', 'archived']),
          orderBy('publishedAt', 'desc'),
          limit(COURSE_LIMIT),
        ),
      );
      return snap.docs.flatMap((d) => readable(d.id, d.data()) ?? []);
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
    async latestAttempt(uid, courseId, parikshaId) {
      // The uid filter is what lets the rules allow the query; the path already scopes it.
      const snap = await getDocs(
        query(
          collection(db, 'progress', progressId(uid, courseId), 'attempts'),
          where('uid', '==', uid),
          where('parikshaId', '==', parikshaId),
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
        pariksha: {},
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
  };
}
