import { courseStatsSchema, orgStatsSchema } from '@gurukul/schema';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { toCertificate, toProgress } from '../data/firebase';
import type { AssignmentFull, AuditRow, ConsoleData, UserRow } from './types';

type Ts = { toDate(): Date } | null | undefined;
const date = (t: Ts): Date | null => t?.toDate() ?? null;

/** Firestore allows at most 30 values in an `in` filter. */
const IN_LIMIT = 30;
const ASSIGNMENT_LIMIT = 500;
const AUDIT_LIMIT = 100;

const chunks = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );

function toUser(uid: string, d: Record<string, unknown>): UserRow {
  return {
    uid,
    email: (d.email as string | undefined) ?? '',
    displayName: (d.displayName as string | undefined) ?? '',
    team: (d.team as string | null | undefined) ?? null,
    roles: (d.roles as string[] | undefined) ?? ['shishya'],
    grantedCourseIds: (d.grantedCourseIds as string[] | undefined) ?? [],
    createdAt: date(d.createdAt as Ts),
  };
}

function toAssignment(id: string, a: Record<string, unknown>): AssignmentFull {
  return {
    id,
    email: a.email as string,
    uid: (a.uid as string | null | undefined) ?? null,
    courseId: a.courseId as string,
    dueAt: date(a.dueAt as Ts),
    assignedAt: date(a.assignedAt as Ts),
    mandatory: a.mandatory === true,
    status: a.status as AssignmentFull['status'],
  };
}

export function firebaseConsoleData(db: Firestore): ConsoleData {
  return {
    async orgStats() {
      const snap = await getDoc(doc(db, 'stats', 'org'));
      return orgStatsSchema.parse(snap.exists() ? snap.data() : {});
    },
    async courseStats(courseId) {
      const snap = await getDoc(doc(db, 'stats', `course_${courseId}`));
      return courseStatsSchema.parse(snap.exists() ? snap.data() : {});
    },
    async assignments(filter) {
      const base = collection(db, 'assignments');
      const snap = await getDocs(
        filter?.courseId
          ? query(base, where('courseId', '==', filter.courseId), limit(ASSIGNMENT_LIMIT))
          : query(base, orderBy('assignedAt', 'desc'), limit(ASSIGNMENT_LIMIT)),
      );
      return snap.docs.map((d) => toAssignment(d.id, d.data()));
    },
    async usersPage(after, pageSize) {
      const base = [collection(db, 'users'), orderBy('email')] as const;
      const snap = await getDocs(
        after === null
          ? query(...base, limit(pageSize + 1))
          : query(...base, startAfter(after), limit(pageSize + 1)),
      );
      const rows = snap.docs.slice(0, pageSize).map((d) => toUser(d.id, d.data()));
      return {
        rows,
        nextCursor: snap.docs.length > pageSize ? (rows[rows.length - 1] as UserRow).email : null,
      };
    },
    async userCount() {
      return (await getCountFromServer(collection(db, 'users'))).data().count;
    },
    async progressFor(uids) {
      const out = await Promise.all(
        chunks(uids, IN_LIMIT).map((part) =>
          getDocs(query(collection(db, 'progress'), where('uid', 'in', part))),
        ),
      );
      return out.flatMap((snap) =>
        snap.docs.map((d) => ({ ...toProgress(d.data()), uid: d.data().uid as string })),
      );
    },
    async certificatesFor(uid) {
      const snap = await getDocs(
        query(collection(db, 'certificates'), where('uid', '==', uid), limit(50)),
      );
      return snap.docs.map((d) => toCertificate(d.id, d.data()));
    },
    async searchUsers(prefix) {
      const p = prefix.trim().toLowerCase();
      const snap = await getDocs(
        query(
          collection(db, 'users'),
          orderBy('email'),
          where('email', '>=', p),
          where('email', '<=', `${p}`),
          limit(8),
        ),
      );
      return snap.docs.map((d) => toUser(d.id, d.data()));
    },
    async usersInTeam(team) {
      const snap = await getDocs(
        query(collection(db, 'users'), where('team', '==', team), limit(500)),
      );
      return snap.docs.map((d) => toUser(d.id, d.data()));
    },
    async usersWithRole(role) {
      const snap = await getDocs(
        query(collection(db, 'users'), where('roles', 'array-contains', role), limit(200)),
      );
      return snap.docs.map((d) => toUser(d.id, d.data()));
    },
    async knownEmails(emails, courseIds) {
      const signedIn = new Set<string>();
      const counts = new Map<string, number>();
      for (const part of chunks(emails, IN_LIMIT)) {
        const users = await getDocs(query(collection(db, 'users'), where('email', 'in', part)));
        users.docs.forEach((d) => signedIn.add(d.data().email as string));
        for (const courseId of courseIds) {
          const assigned = await getDocs(
            query(
              collection(db, 'assignments'),
              where('courseId', '==', courseId),
              where('email', 'in', part),
            ),
          );
          assigned.docs.forEach((d) => {
            const email = d.data().email as string;
            counts.set(email, (counts.get(email) ?? 0) + 1);
          });
        }
      }
      const assigned = new Set(
        [...counts].filter(([, n]) => n === courseIds.length).map(([email]) => email),
      );
      return { signedIn, assigned };
    },
    async teams() {
      const snap = await getDoc(doc(db, 'config', 'org'));
      return snap.exists() ? ((snap.data().teams as string[] | undefined) ?? []) : [];
    },
    async auditLog() {
      const snap = await getDocs(
        query(collection(db, 'audit'), orderBy('at', 'desc'), limit(AUDIT_LIMIT)),
      );
      const uids = [...new Set(snap.docs.map((d) => d.data().by as string))];
      const emails = new Map(
        await Promise.all(
          uids.map(async (uid) => {
            const user = await getDoc(doc(db, 'users', uid));
            return [uid, user.exists() ? (user.data().email as string) : uid] as const;
          }),
        ),
      );
      return snap.docs.map((d): AuditRow => {
        const a = d.data();
        return {
          id: d.id,
          action: a.action as string,
          by: emails.get(a.by as string) as string,
          target: (a.target as string | undefined) ?? null,
          at: date(a.at as Ts),
        };
      });
    },
  };
}
