import {
  DEFAULT_ORG_CONFIG,
  readCourse,
  courseStatsSchema,
  orgConfigSchema,
  orgStatsSchema,
  progressId,
  teamId,
  teamSchema,
} from '@gurukul/schema';
import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  startAfter,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { toCertificate, toProgress } from '../data/firebase';
import type { AssignmentFull, AttemptSummary, AuditRow, ConsoleData, UserRow } from './types';

type Ts = { toDate(): Date } | null | undefined;
const date = (t: Ts): Date | null => t?.toDate() ?? null;

/** Firestore allows at most 30 values in an `in` filter. */
const IN_LIMIT = 30;
const ASSIGNMENT_LIMIT = 500;
/** Pending and overdue assignments are few next to all of them; this only bounds a runaway. */
const OPEN_LIMIT = 2000;
/** Failed-twice detection looks only at the most recently active learners. */
const RECENT_PROGRESS_LIMIT = 100;
/** Audit actions whose `target` is a person's uid, shown as a name. */
const USER_TARGETS = new Set(['roles.set', 'roles.bootstrap', 'cooldown.reset']);
const SEARCH_LIMIT = 8;
const COURSE_LIMIT = 100;
/** The rules cap `config/org.teams` at 100, so there are never more team documents than this. */
const TEAM_LIMIT = 100;

/**
 * `config/org` (the defaults when it does not exist yet) with `leaving` taken out of its team
 * names and `joining` put in, matching names without regard to case.
 */
function withTeams(
  org: Record<string, unknown> | undefined,
  joining: string | null,
  leaving: string | null,
) {
  const current = (org?.teams as string[] | undefined) ?? [];
  const gone = new Set([leaving, joining].map((n) => n?.toLowerCase()));
  const teams = current.filter((n) => !gone.has(n.toLowerCase()));
  if (joining !== null) teams.push(joining);
  return orgConfigSchema.parse({ ...DEFAULT_ORG_CONFIG, ...org, teams });
}
const PERSON_ASSIGNMENT_LIMIT = 50;
const ATTEMPT_LIMIT = 10;
const COURSE_LEARNER_LIMIT = 100;

const chunks = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );

function toUser(uid: string, d: Record<string, unknown>): UserRow {
  return {
    uid,
    email: (d.email as string | undefined) ?? '',
    displayName: (d.displayName as string | undefined) ?? '',
    photoURL: (d.photoURL as string | null | undefined) ?? null,
    team: (d.team as string | null | undefined) ?? null,
    roles: (d.roles as string[] | undefined) ?? ['learner'],
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

/** Assignments not completed whose due date is before `now`; uses the `status`+`dueAt` index. */
const overdueAt = (now: Date) =>
  [where('status', 'in', ['assigned', 'started']), where('dueAt', '<', now)] as const;

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
    async courseLearners(courseId) {
      const [names, progress] = await Promise.all([
        getDocs(
          query(collection(db, 'courses', courseId, 'learners'), limit(COURSE_LEARNER_LIMIT)),
        ),
        getDocs(
          query(
            collection(db, 'progress'),
            where('courseId', '==', courseId),
            limit(COURSE_LEARNER_LIMIT),
          ),
        ),
      ]);
      const nameOf = new Map(
        names.docs.map((d) => [d.id, (d.data().displayName as string | undefined) ?? '']),
      );
      return progress.docs
        .map((d) => {
          const row = toProgress(d.data());
          const uid = d.data().uid as string;
          return {
            uid,
            displayName: nameOf.get(uid) ?? '',
            percent: row.percent,
            lastActiveAt: row.lastActiveAt,
          };
        })
        .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));
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
    async openAssignments(now) {
      const base = collection(db, 'assignments');
      const [pending, overdue] = await Promise.all([
        getDocs(query(base, where('uid', '==', null), limit(OPEN_LIMIT))),
        getDocs(query(base, ...overdueAt(now), limit(OPEN_LIMIT))),
      ]);
      const byId = new Map([...pending.docs, ...overdue.docs].map((d) => [d.id, d]));
      return [...byId.values()].map((d) => toAssignment(d.id, d.data()));
    },
    async overdueCount(now) {
      return (
        await getCountFromServer(query(collection(db, 'assignments'), ...overdueAt(now)))
      ).data().count;
    },
    async recentProgress() {
      const snap = await getDocs(
        query(
          collection(db, 'progress'),
          orderBy('lastActiveAt', 'desc'),
          limit(RECENT_PROGRESS_LIMIT),
        ),
      );
      return snap.docs.map((d) => ({ ...toProgress(d.data()), uid: d.data().uid as string }));
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
    async assignmentsFor(email) {
      const snap = await getDocs(
        query(
          collection(db, 'assignments'),
          where('email', '==', email),
          limit(PERSON_ASSIGNMENT_LIMIT),
        ),
      );
      return snap.docs.map((d) => toAssignment(d.id, d.data()));
    },
    async attemptsFor(uid, courseId, quizId) {
      // Same shape as the learner's own latest-attempt query, so it uses the same index.
      const snap = await getDocs(
        query(
          collection(db, 'progress', progressId(uid, courseId), 'attempts'),
          where('uid', '==', uid),
          where('quizId', '==', quizId),
          orderBy('createdAt', 'desc'),
          limit(ATTEMPT_LIMIT),
        ),
      );
      return snap.docs.map((d): AttemptSummary => {
        const a = d.data();
        return {
          id: d.id,
          quizId: a.quizId as string,
          score: (a.score as number | undefined) ?? 0,
          passed: a.passed === true,
          at: date(a.createdAt as Ts),
        };
      });
    },
    async searchUsers(prefix) {
      const p = prefix.trim().toLowerCase();
      const by = (field: 'email' | 'nameLower') =>
        getDocs(
          query(
            collection(db, 'users'),
            orderBy(field),
            where(field, '>=', p),
            where(field, '<=', `${p}\uf8ff`),
            limit(SEARCH_LIMIT),
          ),
        );
      const [byEmail, byName] = await Promise.all([by('email'), by('nameLower')]);
      const found = new Map<string, UserRow>();
      for (const d of [...byEmail.docs, ...byName.docs]) found.set(d.id, toUser(d.id, d.data()));
      return [...found.values()].slice(0, SEARCH_LIMIT);
    },
    async usersInTeam(team) {
      const snap = await getDocs(
        query(collection(db, 'users'), where('team', '==', team), limit(500)),
      );
      return snap.docs.map((d) => toUser(d.id, d.data()));
    },
    async usersByUid(uids) {
      const out = await Promise.all(
        chunks(uids, IN_LIMIT).map((part) =>
          getDocs(query(collection(db, 'users'), where(documentId(), 'in', part))),
        ),
      );
      return out.flatMap((snap) => snap.docs.map((d) => toUser(d.id, d.data())));
    },
    async usersWithRole(role) {
      const snap = await getDocs(
        query(collection(db, 'users'), where('roles', 'array-contains', role), limit(200)),
      );
      return snap.docs.map((d) => toUser(d.id, d.data()));
    },
    async allCourses() {
      const snap = await getDocs(query(collection(db, 'courses'), limit(COURSE_LIMIT)));
      return snap.docs.flatMap((d) => readCourse(d.data()) ?? []);
    },
    async knownEmails(emails, courseIds) {
      const signedIn = new Set<string>();
      const counts = new Map<string, number>();
      const byCourse: Record<string, Set<string>> = Object.fromEntries(
        courseIds.map((id) => [id, new Set<string>()]),
      );
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
            (byCourse[courseId] as Set<string>).add(email);
          });
        }
      }
      const assigned = new Set(
        [...counts].filter(([, n]) => n === courseIds.length).map(([email]) => email),
      );
      return { signedIn, assigned, byCourse };
    },
    async teams() {
      const snap = await getDoc(doc(db, 'config', 'org'));
      return snap.exists() ? ((snap.data().teams as string[] | undefined) ?? []) : [];
    },
    async orgSettings() {
      const snap = await getDoc(doc(db, 'config', 'org'));
      return orgConfigSchema.parse({
        ...DEFAULT_ORG_CONFIG,
        ...(snap.exists() ? snap.data() : {}),
      });
    },
    async saveOrgSettings(settings) {
      // Merged and without `teams`: the Teams page owns that list, so a stale settings form can
      // never put back a team someone has since removed.
      const { domain, reminders, signatory } = orgConfigSchema.parse(settings);
      await setDoc(doc(db, 'config', 'org'), { domain, reminders, signatory }, { merge: true });
    },
    async teamList() {
      const [snap, org] = await Promise.all([
        getDocs(query(collection(db, 'teams'), limit(TEAM_LIMIT))),
        getDoc(doc(db, 'config', 'org')),
      ]);
      const stored = snap.docs.map((d) => ({ id: d.id, ...teamSchema.parse(d.data()) }));
      const named = new Set(stored.map((t) => t.name.toLowerCase()));
      // A name with no document (made before teams had members) is a team with nobody on it.
      const bare = ((org.data()?.teams as string[] | undefined) ?? [])
        .filter((name) => !named.has(name.toLowerCase()))
        .map((name) => ({ id: teamId(name), name, memberEmails: [], createdAt: 0 }));
      return [...stored, ...bare].sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveTeam(team, previousName) {
      const orgRef = doc(db, 'config', 'org');
      const teamRef = doc(db, 'teams', team.id);
      await runTransaction(db, async (tx) => {
        const [org, existing] = await Promise.all([tx.get(orgRef), tx.get(teamRef)]);
        if (previousName === null && existing.exists()) throw new Error('Team already exists');
        const { name, memberEmails, createdAt } = team;
        tx.set(teamRef, teamSchema.parse({ name, memberEmails, createdAt }));
        tx.set(orgRef, withTeams(org.data(), team.name, previousName));
      });
    },
    async deleteTeam(team) {
      const orgRef = doc(db, 'config', 'org');
      await runTransaction(db, async (tx) => {
        const org = await tx.get(orgRef);
        tx.delete(doc(db, 'teams', team.id));
        tx.set(orgRef, withTeams(org.data(), null, team.name));
      });
    },
    async auditPage(after, pageSize) {
      const base = [collection(db, 'audit'), orderBy('at', 'desc')] as const;
      const snap = await getDocs(
        after === null
          ? query(...base, limit(pageSize + 1))
          : query(...base, startAfter(after.at, after.id), limit(pageSize + 1)),
      );
      const shown = snap.docs.slice(0, pageSize);
      const uids = [
        ...new Set(
          shown.flatMap((d) => {
            const a = d.data();
            return [a.by, ...(USER_TARGETS.has(a.action as string) ? [a.target] : [])].filter(
              (v) => typeof v === 'string',
            );
          }),
        ),
      ] as string[];
      const names = new Map(
        await Promise.all(
          uids.map(async (uid) => {
            const user = await getDoc(doc(db, 'users', uid));
            const u = user.data();
            return [uid, u ? (u.displayName as string) || (u.email as string) : uid] as const;
          }),
        ),
      );
      const rows = shown.map((d): AuditRow => {
        const a = d.data();
        const target = (a.target as string | undefined) ?? null;
        return {
          id: d.id,
          action: a.action as string,
          by: names.get(a.by as string) as string,
          target:
            target !== null && USER_TARGETS.has(a.action as string)
              ? (names.get(target) as string)
              : target,
          detail: (a.detail as Record<string, unknown> | undefined) ?? {},
          at: date(a.at as Ts),
        };
      });
      const last = rows[rows.length - 1];
      return {
        rows,
        nextCursor: snap.docs.length > pageSize && last?.at ? { at: last.at, id: last.id } : null,
      };
    },
  };
}
