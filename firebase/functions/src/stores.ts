import type { Auth } from 'firebase-admin/auth';
import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  DEFAULT_ORG_CONFIG,
  accessOf,
  orgConfigSchema,
  progressId as progressDocId,
  teamId,
} from '@gurukul/schema';
import type { Audience } from '@gurukul/schema';
import { addChapterCompletions } from './analytics.js';
import type { AttemptStatsStore, RollupStore } from './analytics.js';
import type { AssignStore } from './assign.js';
import type { BackupPort } from './backup.js';
import { planCertificate } from './certificates.js';
import type { CertificateAdmin } from './certificates.js';
import type { CooldownAdmin } from './cooldown.js';
import type { CourseStore, DraftData, LiveCourse, VersionData } from './courses.js';
import type { AuditEntry, TeamRecord } from './errors.js';
import type { GradingStore } from './grading.js';
import type { MediaFile, MediaStore, StoragePort } from './media.js';
import type { UserStore } from './profile.js';
import { log } from './logging/log.js';
import type { ProgressStore } from './progress.js';
import type { Notice, ReminderCandidate, ReminderStore } from './remind.js';
import type { RoleClaims } from './roles.js';
import { grantEducatorByCourse } from './set-roles.js';
import type { RoleAdmin } from './set-roles.js';
import type { TeamStore } from './teams.js';
import type { ManagedAssignment, TeamReportStore } from './team-report.js';

/** Splits a list into pieces of at most `size`: Firestore caps `in` queries and batches. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const writeAudit = async (db: Firestore, entry: AuditEntry): Promise<void> => {
  await db.collection('audit').add({ ...entry, at: FieldValue.serverTimestamp() });
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** A `teams/{id}` snapshot as a `TeamRecord`; lists that are missing read as empty. */
function toTeam(snap: { id: string; get(field: string): unknown }): TeamRecord {
  return {
    id: snap.id,
    name: String(snap.get('name') ?? snap.id),
    memberEmails: strings(snap.get('memberEmails')),
    managerEmails: strings(snap.get('managerEmails')),
  };
}

/** The existing teams among `ids`, by id: one `getAll`. */
async function readTeams(db: Firestore, ids: string[]): Promise<Map<string, TeamRecord>> {
  const found = new Map<string, TeamRecord>();
  if (ids.length === 0) return found;
  const snaps = await db.getAll(...ids.map((id) => db.doc(`teams/${id}`)));
  for (const snap of snaps) if (snap.exists) found.set(snap.id, toTeam(snap));
  return found;
}

/** `UserStore` over the Admin SDK. Kept thin: the decisions live in `profile.ts`. */
export function firestoreUserStore(db: Firestore): UserStore {
  return {
    async createProfile(uid, profile) {
      await db
        .doc(`users/${uid}`)
        .set({ ...profile, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    },
    async reconcileTeams(email) {
      await reconcileTeamIds(db, email);
    },
    async claimAssignments(email, uid) {
      const snap = await db
        .collection('assignments')
        .where('email', '==', email)
        .where('uid', '==', null)
        .get();
      if (snap.empty) return 0;
      const batch = db.batch();
      for (const d of snap.docs) batch.update(d.ref, { uid });
      await batch.commit();
      return snap.size;
    },
  };
}

/**
 * Sets `users/{uid}.teamIds` for the profile with `email` to the teams that list it, reading them
 * inside the transaction that writes. Returns false when the email has no profile (yet).
 */
async function reconcileTeamIds(db: Firestore, email: string): Promise<boolean> {
  // More than one profile can carry an email (an Auth user deleted and made again), and each must
  // lose a revoked team, so all are updated; five is far more than ever exists.
  const found = await db.collection('users').where('email', '==', email).limit(5).get();
  if (found.docs.length === 0) return false;
  if (found.docs.length > 1) {
    log.warn('Duplicate profiles reconciled', { count: found.docs.length });
  }
  await db.runTransaction(async (tx) => {
    const teams = await tx.get(
      db.collection('teams').where('memberEmails', 'array-contains', email),
    );
    const teamIds = teams.docs.map((d) => d.id);
    for (const profile of found.docs) tx.update(profile.ref, { teamIds });
  });
  return true;
}

/** `TeamStore` over the Admin SDK. A team lists at most 500 people, so one write is at most 500 small transactions. */
export function firestoreTeamStore(db: Firestore): TeamStore {
  return {
    async reconcile(emails) {
      let count = 0;
      for (const email of emails) if (await reconcileTeamIds(db, email)) count += 1;
      return count;
    },
  };
}

/** `RoleAdmin` over the Admin SDK (Auth + Firestore). */
export function firebaseRoleAdmin(auth: Auth, db: Firestore): RoleAdmin {
  return {
    async getClaims(uid) {
      return (await auth.getUser(uid)).customClaims as RoleClaims | undefined;
    },
    async setClaims(uid, claims) {
      await auth.setCustomUserClaims(uid, claims);
    },
    async revokeTokens(uid) {
      await auth.revokeRefreshTokens(uid);
    },
    async mirrorRoles(uid, plan) {
      await db.doc(`users/${uid}`).set({ roles: plan.roles }, { merge: true });
    },
    async releaseManagedTeams(uid) {
      const email = (await auth.getUser(uid)).email?.toLowerCase();
      if (!email) return 0;
      // A person manages a handful of teams at most; 100 bounds the read.
      const snap = await db
        .collection('teams')
        .where('managerEmails', 'array-contains', email)
        .limit(100)
        .get();
      if (snap.empty) return 0;
      const batch = db.batch();
      for (const d of snap.docs)
        batch.update(d.ref, { managerEmails: FieldValue.arrayRemove(email) });
      await batch.commit();
      return snap.size;
    },
    async getGrantedCourseIds(uid) {
      return ((await db.doc(`users/${uid}`).get()).get('grantedCourseIds') ?? []) as string[];
    },
    async applyCourseGrants(uid, grantedCourseIds, { removed }) {
      // Every granted course, not only the added ones, so re-saving a grant fills in a missing name.
      const touched = [...grantedCourseIds, ...removed];
      const snaps =
        touched.length === 0
          ? []
          : await db.getAll(
              db.doc(`users/${uid}`),
              ...touched.map((id) => db.doc(`courses/${id}`)),
            );
      const [profile, ...courses] = snaps;
      const name = profile?.get('displayName') as string | undefined;
      const batch = db.batch();
      batch.set(db.doc(`users/${uid}`), { grantedCourseIds }, { merge: true });
      courses.forEach((snap, i) => {
        if (!snap.exists) return;
        const nameField = new FieldPath('educatorNames', uid);
        if (i >= grantedCourseIds.length) {
          batch.update(
            snap.ref,
            'educatorIds',
            FieldValue.arrayRemove(uid),
            nameField,
            FieldValue.delete(),
          );
        } else if (name === undefined) {
          batch.update(snap.ref, { educatorIds: FieldValue.arrayUnion(uid) });
        } else {
          batch.update(snap.ref, 'educatorIds', FieldValue.arrayUnion(uid), nameField, name);
        }
      });
      await batch.commit();
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/** `ProgressStore` over the Admin SDK (Auth only to grant the Educator course's role). */
export function firestoreProgressStore(db: Firestore, auth: Auth): ProgressStore {
  return {
    grantEducator: (uid) => grantEducatorByCourse(firebaseRoleAdmin(auth, db), uid),
    async course(courseId) {
      const snap = await db.doc(`courses/${courseId}`).get();
      return snap.exists ? snap.data() : undefined;
    },
    async writeDerived(progressId, { percent, completed }) {
      await db
        .doc(`progress/${progressId}`)
        .update({ percent, ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}) });
    },
    async bumpStats(courseId, d) {
      const courseRef = db.doc(`stats/course_${courseId}`);
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(courseRef)).get('chapterCompletions') ?? [];
        tx.set(
          courseRef,
          {
            started: FieldValue.increment(d.started),
            completed: FieldValue.increment(d.completed),
            certified: FieldValue.increment(d.certified),
            finishDaysSum: FieldValue.increment(d.finishDays),
            ...(d.finishBucket === null
              ? {}
              : { finishDaysHistogram: { [d.finishBucket]: FieldValue.increment(1) } }),
            // An array element cannot be incremented in place, hence the read in this transaction.
            chapterCompletions: addChapterCompletions(current as number[], d.chaptersDone),
          },
          { merge: true },
        );
        tx.set(
          db.doc('stats/org'),
          {
            started: FieldValue.increment(d.started),
            completed: FieldValue.increment(d.completed),
            assignmentsCompleted: FieldValue.increment(d.assignmentsCompleted),
            weekly: { [d.week]: FieldValue.increment(d.lessons) },
          },
          { merge: true },
        );
      });
    },
    async isAssigned(uid, courseId) {
      const snap = await db
        .collection('assignments')
        .where('uid', '==', uid)
        .where('courseId', '==', courseId)
        .limit(1)
        .get();
      return !snap.empty;
    },
    async setAssignmentStatus(uid, courseId, status) {
      const snap = await db
        .collection('assignments')
        .where('uid', '==', uid)
        .where('courseId', '==', courseId)
        .get();
      const changing = snap.docs.filter((d) => d.get('status') !== status);
      if (changing.length === 0) return 0;
      const batch = db.batch();
      for (const d of changing) batch.update(d.ref, { status });
      await batch.commit();
      return changing.length;
    },
    async signatory() {
      const parsed = orgConfigSchema.shape.signatory.safeParse(
        (await db.doc('config/org').get()).get('signatory'),
      );
      return parsed.success ? parsed.data : DEFAULT_ORG_CONFIG.signatory;
    },
    async recordLearner(uid, courseId) {
      const user = await db.doc(`users/${uid}`).get();
      await db.doc(`courses/${courseId}/learners/${uid}`).set({
        displayName: user.get('displayName') ?? '',
        startedAt: FieldValue.serverTimestamp(),
      });
    },
    async issueCertificate(progressId, grant) {
      return db.runTransaction(async (tx) => {
        const progressRef = db.doc(`progress/${progressId}`);
        const counterRef = db.doc('counters/certificates');
        const [progress, user, counter] = await Promise.all([
          tx.get(progressRef),
          tx.get(db.doc(`users/${grant.uid}`)),
          tx.get(counterRef),
        ]);
        if (!progress.exists || progress.get('certificateId') != null) return null;
        const plan = planCertificate(grant, user.data(), counter.data(), new Date());
        const { id } = plan.certificate;
        tx.set(counterRef, { [plan.year]: plan.sequence }, { merge: true });
        tx.set(db.doc(`certificates/${id}`), {
          ...plan.certificate,
          issuedAt: FieldValue.serverTimestamp(),
        });
        tx.update(progressRef, { certificateId: id });
        return id;
      });
    },
  };
}

/** `GradingStore` over the Admin SDK. Kept thin: the decisions live in `grading.ts`. */
export function firestoreGradingStore(db: Firestore): GradingStore {
  return {
    async getTeamIds(uid) {
      return ((await db.doc(`users/${uid}`).get()).get('teamIds') ?? []) as string[];
    },
    async getCourse(courseId) {
      return (await db.doc(`courses/${courseId}`).get()).data();
    },
    async getAnswers(courseId) {
      return (await db.doc(`courses/${courseId}/private/answers`).get()).data();
    },
    async getProgress(uid, courseId) {
      return (await db.doc(`progress/${progressDocId(uid, courseId)}`).get()).data();
    },
    async recordAttempt(attempt, decide) {
      return db.runTransaction(async (tx) => {
        const progressRef = db.doc(`progress/${progressDocId(attempt.uid, attempt.courseId)}`);
        const update = decide((await tx.get(progressRef)).data());
        const attemptRef = progressRef.collection('attempts').doc();
        tx.set(attemptRef, { ...attempt, createdAt: FieldValue.serverTimestamp() });
        tx.set(
          progressRef,
          {
            quiz: {
              [attempt.quizId]: { ...update, lastAttemptAt: FieldValue.serverTimestamp() },
            },
            lastActiveAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return { attemptId: attemptRef.id, update };
      });
    },
  };
}

/** `CertificateAdmin` over the Admin SDK. */
export function firestoreCertificateAdmin(db: Firestore): CertificateAdmin {
  return {
    async setRevoked(id, revoked) {
      const ref = db.doc(`certificates/${id}`);
      const snap = await ref.get();
      if (!snap.exists) return null;
      await ref.update({ revoked, revokedAt: revoked ? FieldValue.serverTimestamp() : null });
      return {
        uid: String(snap.get('uid')),
        courseTitle: String(snap.get('courseTitle')),
        changed: (snap.get('revoked') === true) !== revoked,
      };
    },
    async emailOf(uid) {
      const email = (await db.doc(`users/${uid}`).get()).get('email');
      return typeof email === 'string' && email !== '' ? email : null;
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/** `AssignStore` over the Admin SDK. */
export function firestoreAssignStore(db: Firestore): AssignStore {
  return {
    async profileName(uid) {
      const name: unknown = (await db.doc(`users/${uid}`).get()).get('displayName');
      return typeof name === 'string' ? name : null;
    },
    async courses(ids) {
      const snaps = await db.getAll(...ids.map((id) => db.doc(`courses/${id}`)));
      return Object.fromEntries(
        snaps.map((snap, i) => [
          ids[i],
          snap.exists
            ? {
                status: snap.get('status'),
                title: String(snap.get('title')),
                access: accessOf({
                  visibility: snap.get('visibility'),
                  visibleTeamIds: snap.get('visibleTeamIds'),
                }),
              }
            : undefined,
        ]),
      );
    },
    async teams(ids) {
      return readTeams(db, ids);
    },
    async audiences(uids) {
      const found = new Map<string, Audience>();
      for (const part of chunk(uids, 300)) {
        const snaps = await db.getAll(...part.map((uid) => db.doc(`users/${uid}`)));
        for (const snap of snaps) {
          const roles: string[] = snap.get('roles') ?? [];
          found.set(snap.id, {
            teamIds: snap.get('teamIds') ?? [],
            staff: roles.includes('educator') || roles.includes('admin'),
          });
        }
      }
      return found;
    },
    async signedInUsers(emails) {
      const found = new Map<string, string>();
      for (const part of chunk(emails, 30)) {
        const snap = await db.collection('users').where('email', 'in', part).get();
        for (const d of snap.docs) found.set(d.get('email'), d.id);
      }
      return found;
    },
    async addTeamMembers(name, emails) {
      const ref = db.doc(`teams/${teamId(name)}`);
      // ponytail: no 500-member cap check (teamSchema's limit); the org is about 200 people.
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const have: string[] = snap.get('memberEmails') ?? [];
        const memberEmails = [...new Set([...have, ...emails])];
        // An existing team keeps its name (an Admin may have renamed it) and creator: only the
        // members change. A missing one is made, with no creator, so only Admins edit it.
        if (snap.exists) tx.update(ref, { memberEmails });
        else tx.set(ref, { name, memberEmails, createdAt: Date.now() });
      });
    },
    async existingAssignmentIds(ids) {
      const existing = new Set<string>();
      for (const part of chunk(ids, 300)) {
        const snaps = await db.getAll(...part.map((id) => db.doc(`assignments/${id}`)));
        for (const snap of snaps) if (snap.exists) existing.add(snap.id);
      }
      return existing;
    },
    async createAssignments(assignedBy, assignedByName, docs) {
      const failed: string[] = [];
      for (const part of chunk(docs, 400)) {
        const batch = db.batch();
        // Someone who already started or finished the course starts out as such, not "assigned":
        // otherwise a finished course turns overdue and gets reminders.
        const refs = part
          .filter((d) => d.uid !== null)
          .map((d) => db.doc(`progress/${d.uid}_${d.courseId}`));
        const rows = new Map(
          (refs.length > 0 ? await db.getAll(...refs) : [])
            .filter((snap) => snap.exists)
            .map((snap) => [snap.id, snap.data()]),
        );
        for (const d of part) {
          const row = rows.get(`${d.uid}_${d.courseId}`);
          const status =
            row === undefined ? 'assigned' : row?.['completedAt'] ? 'completed' : 'started';
          // `create` fails on an existing id, so a race can never overwrite an assignment.
          batch.create(db.doc(`assignments/${d.id}`), {
            email: d.email,
            uid: d.uid,
            courseId: d.courseId,
            assignedBy,
            assignedByName,
            assignedAt: FieldValue.serverTimestamp(),
            dueAt: d.dueAt === null ? null : Timestamp.fromMillis(d.dueAt),
            mandatory: d.mandatory,
            reminder: d.reminder,
            status,
            teamId: d.teamId,
          });
        }
        try {
          await batch.commit();
        } catch {
          // One bad batch must not undo or hide the others; the caller reports these ids.
          log.warn('Assignment batch failed', { count: part.length });
          failed.push(...part.map((d) => d.id));
        }
      }
      return failed;
    },
    async bumpAssigned(perCourse) {
      const batch = db.batch();
      let total = 0;
      for (const [courseId, n] of Object.entries(perCourse)) {
        total += n;
        batch.set(
          db.doc(`stats/course_${courseId}`),
          { assigned: FieldValue.increment(n) },
          { merge: true },
        );
      }
      batch.set(
        db.doc('stats/org'),
        { assignmentsTotal: FieldValue.increment(total) },
        { merge: true },
      );
      await batch.commit();
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/** `CooldownAdmin` over the Admin SDK. */
export function firestoreCooldownAdmin(db: Firestore): CooldownAdmin {
  return {
    async resetCooldown(uid, courseId, quizId) {
      const ref = db.doc(`progress/${progressDocId(uid, courseId)}`);
      const snap = await ref.get();
      if (!snap.exists || snap.get(new FieldPath('quiz', quizId)) === undefined) {
        return false;
      }
      await ref.update(new FieldPath('quiz', quizId, 'lastAttemptAt'), Timestamp.fromMillis(0));
      return true;
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

const millis = (v: Millis): number | null => (v == null ? null : v.toMillis());

type Millis = { toMillis(): number } | null | undefined;
function toCandidate(d: QueryDocumentSnapshot): ReminderCandidate {
  const x = d.data() as {
    email: string;
    courseId: string;
    status: ReminderCandidate['status'];
    mandatory?: boolean;
    reminder: ReminderCandidate['reminder'];
    assignedAt: { toMillis(): number };
    dueAt?: Millis;
    lastRemindedAt?: Millis;
    teamId?: string | null;
    dueSoonSentAt?: Millis;
    overdueSentAt?: Millis;
  };
  return {
    id: d.id,
    email: x.email,
    courseId: x.courseId,
    status: x.status,
    mandatory: x.mandatory === true,
    reminder: x.reminder,
    assignedAt: x.assignedAt.toMillis(),
    dueAt: millis(x.dueAt),
    lastRemindedAt: millis(x.lastRemindedAt),
    teamId: x.teamId ?? null,
    dueSoonSentAt: millis(x.dueSoonSentAt),
    overdueSentAt: millis(x.overdueSentAt),
  };
}

const NOTICE_FIELD: Record<Notice, string> = {
  dueSoon: 'dueSoonSentAt',
  overdue: 'overdueSentAt',
};

const OPEN = ['assigned', 'started'];

/** `ReminderStore` over the Admin SDK. */
export function firestoreReminderStore(db: Firestore): ReminderStore {
  return {
    async forCourse(courseId) {
      const snap = await db
        .collection('assignments')
        .where('courseId', '==', courseId)
        .where('status', 'in', OPEN)
        .limit(1000)
        .get();
      return snap.docs.map(toCandidate);
    },
    async forEmails(emails) {
      const out: ReminderCandidate[] = [];
      for (const part of chunk(emails, 30)) {
        const snap = await db.collection('assignments').where('email', 'in', part).get();
        out.push(...snap.docs.map(toCandidate));
      }
      return out;
    },
    async scheduled() {
      const snap = await db.collection('assignments').where('status', 'in', OPEN).limit(2000).get();
      return snap.docs.map(toCandidate);
    },
    async courseTitles(ids) {
      const snaps =
        ids.length === 0 ? [] : await db.getAll(...ids.map((id) => db.doc(`courses/${id}`)));
      return Object.fromEntries(snaps.map((snap) => [snap.id, snap.get('title')]));
    },
    async markReminded(ids) {
      for (const part of chunk(ids, 400)) {
        const batch = db.batch();
        for (const id of part) {
          batch.update(db.doc(`assignments/${id}`), {
            lastRemindedAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    },
    async markNoticed(notices) {
      for (const part of chunk(Object.entries(notices), 400)) {
        const batch = db.batch();
        for (const [id, notice] of part) {
          batch.update(db.doc(`assignments/${id}`), {
            [NOTICE_FIELD[notice]]: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    },
    async teamManagers(teamIds) {
      const teams = await readTeams(db, teamIds);
      return Object.fromEntries([...teams].map(([id, team]) => [id, team.managerEmails]));
    },
    async team(id) {
      return (await readTeams(db, [id])).get(id);
    },
    async remindersEnabled() {
      return (await db.doc('config/org').get()).get('reminders')?.enabled === true;
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

function toManaged(d: { id: string; data(): unknown }): ManagedAssignment {
  const x = d.data() as {
    email: string;
    uid?: string | null;
    courseId: string;
    status: ManagedAssignment['status'];
    dueAt?: Millis;
    teamId?: string | null;
  };
  return {
    id: d.id,
    email: x.email,
    uid: x.uid ?? null,
    courseId: x.courseId,
    status: x.status,
    dueAt: millis(x.dueAt),
    teamId: x.teamId ?? null,
  };
}

/** `TeamReportStore` over the Admin SDK: reads bounded by the team's size (500 at most). */
export function firestoreTeamReportStore(db: Firestore): TeamReportStore {
  return {
    async team(id) {
      return (await readTeams(db, [id])).get(id);
    },
    async assignment(id) {
      const snap = await db.doc(`assignments/${id}`).get();
      return snap.exists ? toManaged(snap) : undefined;
    },
    async assignmentsFor(emails) {
      const out: ManagedAssignment[] = [];
      for (const part of chunk(emails, 30)) {
        const snap = await db.collection('assignments').where('email', 'in', part).get();
        out.push(...snap.docs.map(toManaged));
      }
      return out;
    },
    async profiles(emails) {
      const found = new Map<string, { uid: string; displayName: string | null }>();
      for (const part of chunk(emails, 30)) {
        const snap = await db.collection('users').where('email', 'in', part).get();
        for (const d of snap.docs) {
          const name = d.get('displayName');
          found.set(d.get('email'), {
            uid: d.id,
            displayName: typeof name === 'string' && name !== '' ? name : null,
          });
        }
      }
      return found;
    },
    async percents(pairs) {
      const found = new Map<string, number>();
      for (const part of chunk(pairs, 300)) {
        const snaps = await db.getAll(
          ...part.map((p) => db.doc(`progress/${progressDocId(p.uid, p.courseId)}`)),
        );
        for (const snap of snaps) {
          const percent = snap.exists ? snap.get('percent') : undefined;
          if (typeof percent === 'number') found.set(snap.id, percent);
        }
      }
      return found;
    },
    async courseTitles(ids) {
      const snaps = await db.getAll(...ids.map((id) => db.doc(`courses/${id}`)));
      return Object.fromEntries(snaps.map((snap) => [snap.id, snap.get('title')]));
    },
    async setDueAt(id, dueAt) {
      await db.doc(`assignments/${id}`).update({
        dueAt: dueAt === null ? null : Timestamp.fromMillis(dueAt),
        dueSoonSentAt: null,
        overdueSentAt: null,
      });
    },
    async deleteAssignment(assignment) {
      const batch = db.batch();
      batch.delete(db.doc(`assignments/${assignment.id}`));
      // The daily roll-up recounts both from the assignments; this keeps them right until then.
      batch.set(
        db.doc(`stats/course_${assignment.courseId}`),
        { assigned: FieldValue.increment(-1) },
        { merge: true },
      );
      batch.set(
        db.doc('stats/org'),
        { assignmentsTotal: FieldValue.increment(-1) },
        { merge: true },
      );
      await batch.commit();
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/** `AttemptStatsStore` over the Admin SDK. */
export function firestoreAttemptStatsStore(db: Firestore): AttemptStatsStore {
  return {
    async progress(uid, courseId) {
      return (await db.doc(`progress/${progressDocId(uid, courseId)}`).get()).data();
    },
    async bumpAttemptStats(courseId, d) {
      const questionFirstTry = Object.fromEntries(
        Object.entries(d.questionFirstTry).map(([id, q]) => [
          id,
          { correct: FieldValue.increment(q.correct), total: FieldValue.increment(q.total) },
        ]),
      );
      const batch = db.batch();
      batch.set(
        db.doc(`stats/course_${courseId}`),
        {
          scoreSum: FieldValue.increment(d.scoreSum),
          scoreCount: FieldValue.increment(d.scoreCount),
          questionFirstTry,
        },
        { merge: true },
      );
      batch.set(
        db.doc('stats/org'),
        {
          quizScoreSum: FieldValue.increment(d.scoreSum),
          quizScoreCount: FieldValue.increment(d.scoreCount),
          quizFirstTryTotal: FieldValue.increment(d.firstTryTotal),
          quizFirstTryPassed: FieldValue.increment(d.firstTryPassed),
        },
        { merge: true },
      );
      await batch.commit();
    },
  };
}

const PAGE = 500;

/** Every document a query matches, read in pages of 500 so no single read holds the whole set. */
async function readAll(query: Query): Promise<QueryDocumentSnapshot[]> {
  const ordered = query.orderBy(FieldPath.documentId()).limit(PAGE);
  const docs: QueryDocumentSnapshot[] = [];
  let page = await ordered.get();
  docs.push(...page.docs);
  while (page.size === PAGE) {
    page = await ordered.startAfter(page.docs[PAGE - 1]).get();
    docs.push(...page.docs);
  }
  return docs;
}

/**
 * `RollupStore` over the Admin SDK: count() aggregations (one read per 1000 documents) for the
 * totals, and one read per course, progress and attempt document for the rest.
 */
export function firestoreRollupStore(db: Firestore): RollupStore {
  const count = async (q: { count(): { get(): Promise<{ data(): { count: number } }> } }) =>
    (await q.count().get()).data().count;
  return {
    countUsers: () => count(db.collection('users')),
    countActiveSince: (sinceMs) =>
      count(db.collection('progress').where('lastActiveAt', '>=', Timestamp.fromMillis(sinceMs))),
    countAssignments: () => count(db.collection('assignments')),
    countCompletedAssignments: () =>
      count(db.collection('assignments').where('status', '==', 'completed')),
    countCourseAssignments: (courseId) =>
      count(db.collection('assignments').where('courseId', '==', courseId)),
    async courses() {
      return (await readAll(db.collection('courses'))).map((d) => ({ id: d.id, data: d.data() }));
    },
    async progress() {
      return (await readAll(db.collection('progress'))).map((d) => d.data());
    },
    async attempts() {
      return (await readAll(db.collectionGroup('attempts'))).map((d) => ({
        id: d.id,
        createdAtMs: millis(d.get('createdAt') as Millis) ?? 0,
        data: d.data(),
      }));
    },
    async userNames() {
      const names = new Map<string, string>();
      for (const d of await readAll(db.collection('users'))) {
        const name: unknown = d.get('displayName');
        if (typeof name === 'string') names.set(d.id, name);
      }
      return names;
    },
    async roster(courseId) {
      const docs = await readAll(db.collection(`courses/${courseId}/learners`));
      return new Map(docs.map((d) => [d.id, String(d.get('displayName') ?? '')]));
    },
    async writeRoster(writes) {
      for (let i = 0; i < writes.length; i += PAGE) {
        const batch = db.batch();
        for (const { courseId, uid, displayName, startedAt } of writes.slice(i, i + PAGE)) {
          batch.set(
            db.doc(`courses/${courseId}/learners/${uid}`),
            { displayName, startedAt },
            { merge: true },
          );
        }
        await batch.commit();
      }
    },
    async writeOrgCounts(counts) {
      await db.doc('stats/org').set(counts, { merge: true });
    },
    async writeCourseCounts(courseId, counts) {
      // mergeFields replaces each field whole, so a question no longer asked leaves questionFirstTry.
      await db.doc(`stats/course_${courseId}`).set(counts, { mergeFields: Object.keys(counts) });
    },
  };
}

/** The part of the Firestore Admin client the backup uses (a `v1.FirestoreAdminClient`). */
export interface FirestoreAdmin {
  getProjectId(): Promise<string>;
  databasePath(project: string, database: string): string;
  exportDocuments(request: {
    name: string;
    outputUriPrefix: string;
    collectionIds: string[];
  }): Promise<unknown>;
}

/**
 * `BackupPort` over the Firestore Admin API: asks for an export of every collection in the project's
 * default database. It returns once the long-running export is accepted, not when it finishes.
 */
export function firestoreBackupPort(admin: FirestoreAdmin): BackupPort {
  return {
    async exportTo(uriPrefix) {
      const projectId = await admin.getProjectId();
      await admin.exportDocuments({
        name: admin.databasePath(projectId, '(default)'),
        outputUriPrefix: uriPrefix,
        collectionIds: [],
      });
    },
  };
}

/** The slice of a Cloud Storage bucket (`firebase-admin/storage`) the media clean-up uses. */
export interface MediaBucket {
  getFiles(options: {
    prefix: string;
  }): Promise<[Array<{ name: string; metadata: { timeCreated?: string } }>, ...unknown[]]>;
  file(path: string): { delete(): Promise<unknown> };
}

/** `StoragePort` over a bucket: lists a course's media folder and deletes one object by path. */
export function bucketStoragePort(bucket: MediaBucket): StoragePort {
  return {
    async listMedia(courseId) {
      const [files] = await bucket.getFiles({ prefix: `courses/${courseId}/media/` });
      return files.map((f): MediaFile => {
        const created = new Date(f.metadata.timeCreated ?? Number.NaN);
        return { path: f.name, createdAt: Number.isNaN(created.getTime()) ? undefined : created };
      });
    },
    async deleteFile(path) {
      await bucket.file(path).delete();
    },
  };
}

/**
 * `MediaStore` over the Admin SDK: the courses that exist, and every stored copy of one course (live
 * document, draft, every version snapshot). Reads each document once, weekly.
 */
export function firestoreMediaStore(db: Firestore): MediaStore {
  return {
    async listCourseIds() {
      return (await db.collection('courses').select().get()).docs.map((d) => d.id);
    },
    async readCourseObjects(courseId) {
      const ref = db.doc(`courses/${courseId}`);
      const [live, draft, versions] = await Promise.all([
        ref.get(),
        ref.collection('drafts').doc('current').get(),
        ref.collection('versions').get(),
      ]);
      return [
        ...(live.exists ? [live.data()] : []),
        ...(draft.exists ? [draft.get('course')] : []),
        ...versions.docs.map((d) => d.get('course')),
      ];
    },
  };
}

/** `CourseStore` over the Admin SDK. Kept thin: the decisions live in `courses.ts`. */
export function firestoreCourseStore(db: Firestore): CourseStore {
  return {
    async getLive(courseId) {
      const snap = await db.doc(`courses/${courseId}`).get();
      return snap.exists ? (snap.data() as LiveCourse) : undefined;
    },
    async getDraft(courseId) {
      return (await db.doc(`courses/${courseId}/drafts/current`).get()).data() as
        DraftData | undefined;
    },
    async create({ courseId, uid, course, draft }) {
      return db.runTransaction(async (tx) => {
        const ref = db.doc(`courses/${courseId}`);
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref, course);
        tx.set(ref.collection('drafts').doc('current'), {
          rev: 1,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
          ...draft,
        });
        tx.set(
          db.doc(`users/${uid}`),
          { grantedCourseIds: FieldValue.arrayUnion(courseId) },
          { merge: true },
        );
        return true;
      });
    },
    async release(courseId, uid, loadVersion, decide) {
      return db.runTransaction(async (tx) => {
        const ref = db.doc(`courses/${courseId}`);
        const draftRef = ref.collection('drafts').doc('current');
        const [live, draft, snapshot] = await Promise.all([
          tx.get(ref),
          tx.get(draftRef),
          loadVersion === null
            ? undefined
            : tx.get(ref.collection('versions').doc(`${loadVersion}`)),
        ]);
        const plan = decide({
          live: live.exists ? (live.data() as LiveCourse) : undefined,
          draft: draft.data() as DraftData | undefined,
          snapshot: snapshot?.data() as VersionData | undefined,
        });
        const now = FieldValue.serverTimestamp();
        const { version, course, access, answers } = plan;
        // The access sits beside the course object so rules and queries can read it.
        const published = { ...course, ...access, publishedAt: now };
        tx.set(ref, published);
        tx.set(ref.collection('private').doc('answers'), answers);
        tx.set(ref.collection('versions').doc(`${version}`), {
          version,
          publishedAt: now,
          publishedBy: uid,
          course: published,
          answers,
        });
        if (plan.resetDraft) {
          tx.set(draftRef, { ...plan.resetDraft, updatedAt: now, updatedBy: uid });
        } else if (plan.clearAnswersChanged) {
          // Not a save: `rev` stays, so an editor open elsewhere is not told of a conflict.
          tx.update(draftRef, { answersChanged: FieldValue.delete() });
        }
        return version;
      });
    },
    async setStatus(courseId, status) {
      await db.doc(`courses/${courseId}`).update({ status });
    },
    async setAccess(courseId, { visibility, visibleTeamIds }) {
      await db.doc(`courses/${courseId}`).update({ visibility, visibleTeamIds });
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}
