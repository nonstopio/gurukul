import type { Auth } from 'firebase-admin/auth';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { progressId as progressDocId } from '@gurukul/schema';
import { addParvaCompletions } from './analytics.js';
import type { AttemptStatsStore, RollupStore } from './analytics.js';
import type { AssignStore } from './assign.js';
import type { BackupPort } from './backup.js';
import { planCertificate } from './certificates.js';
import type { CertificateAdmin } from './certificates.js';
import type { CooldownAdmin } from './cooldown.js';
import type { CourseStore, DraftData, LiveCourse, VersionData } from './courses.js';
import type { AuditEntry } from './errors.js';
import type { GradingStore } from './grading.js';
import type { Mailer } from './mail.js';
import type { UserStore } from './profile.js';
import type { ProgressStore } from './progress.js';
import type { ReminderCandidate, ReminderStore } from './remind.js';
import type { RoleClaims } from './roles.js';
import type { RoleAdmin } from './set-roles.js';

/** Splits a list into pieces of at most `size`: Firestore caps `in` queries and batches. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const writeAudit = async (db: Firestore, entry: AuditEntry): Promise<void> => {
  await db.collection('audit').add({ ...entry, at: FieldValue.serverTimestamp() });
};

/** `UserStore` over the Admin SDK. Kept thin: the decisions live in `profile.ts`. */
export function firestoreUserStore(db: Firestore): UserStore {
  return {
    async createProfile(uid, profile) {
      await db
        .doc(`users/${uid}`)
        .set({ ...profile, createdAt: FieldValue.serverTimestamp() }, { merge: true });
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
        const nameField = new FieldPath('acharyaNames', uid);
        if (i >= grantedCourseIds.length) {
          batch.update(
            snap.ref,
            'acharyaIds',
            FieldValue.arrayRemove(uid),
            nameField,
            FieldValue.delete(),
          );
        } else if (name === undefined) {
          batch.update(snap.ref, { acharyaIds: FieldValue.arrayUnion(uid) });
        } else {
          batch.update(snap.ref, 'acharyaIds', FieldValue.arrayUnion(uid), nameField, name);
        }
      });
      await batch.commit();
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/** `ProgressStore` over the Admin SDK. */
export function firestoreProgressStore(db: Firestore): ProgressStore {
  return {
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
        const current = (await tx.get(courseRef)).get('parvaCompletions') ?? [];
        tx.set(
          courseRef,
          {
            started: FieldValue.increment(d.started),
            completed: FieldValue.increment(d.completed),
            certified: FieldValue.increment(d.certified),
            finishDaysSum: FieldValue.increment(d.finishDays),
            // An array element cannot be incremented in place, hence the read in this transaction.
            parvaCompletions: addParvaCompletions(current as number[], d.parvasDone),
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
            pariksha: {
              [attempt.parikshaId]: { ...update, lastAttemptAt: FieldValue.serverTimestamp() },
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
      if (!(await ref.get()).exists) return false;
      await ref.update({ revoked });
      return true;
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/** `AssignStore` over the Admin SDK. */
export function firestoreAssignStore(db: Firestore): AssignStore {
  return {
    async courses(ids) {
      const snaps = await db.getAll(...ids.map((id) => db.doc(`courses/${id}`)));
      return Object.fromEntries(
        snaps.map((snap, i) => [
          ids[i],
          snap.exists
            ? { status: snap.get('status'), title: String(snap.get('title')) }
            : undefined,
        ]),
      );
    },
    async signedInUsers(emails) {
      const found = new Map<string, string>();
      for (const part of chunk(emails, 30)) {
        const snap = await db.collection('users').where('email', 'in', part).get();
        for (const d of snap.docs) found.set(d.get('email'), d.id);
      }
      return found;
    },
    async existingAssignmentIds(ids) {
      const existing = new Set<string>();
      for (const part of chunk(ids, 300)) {
        const snaps = await db.getAll(...part.map((id) => db.doc(`assignments/${id}`)));
        for (const snap of snaps) if (snap.exists) existing.add(snap.id);
      }
      return existing;
    },
    async createAssignments(assignedBy, docs) {
      for (const part of chunk(docs, 400)) {
        const batch = db.batch();
        for (const d of part) {
          // `create` fails on an existing id, so a race can never overwrite an assignment.
          batch.create(db.doc(`assignments/${d.id}`), {
            email: d.email,
            uid: d.uid,
            courseId: d.courseId,
            assignedBy,
            assignedAt: FieldValue.serverTimestamp(),
            dueAt: d.dueAt === null ? null : Timestamp.fromMillis(d.dueAt),
            mandatory: d.mandatory,
            reminder: d.reminder,
            status: 'assigned',
          });
        }
        await batch.commit();
      }
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
    async resetCooldown(uid, courseId, parikshaId) {
      const ref = db.doc(`progress/${progressDocId(uid, courseId)}`);
      const snap = await ref.get();
      if (!snap.exists || snap.get(new FieldPath('pariksha', parikshaId)) === undefined) {
        return false;
      }
      await ref.update(
        new FieldPath('pariksha', parikshaId, 'lastAttemptAt'),
        Timestamp.fromMillis(0),
      );
      return true;
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}

/**
 * `Mailer` that queues `mail/{autoId}` in the shape the Firebase "Trigger Email from Firestore"
 * extension reads (`to` plus `message.subject/text`). Nothing sends until that extension (or
 * another sender) is installed: see `mail.ts`.
 */
export function firestoreMailer(db: Firestore): Mailer {
  return {
    async send({ to, subject, text }) {
      await db
        .collection('mail')
        .add({ to, message: { subject, text }, createdAt: FieldValue.serverTimestamp() });
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
  };
}

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
    async remindersEnabled() {
      return (await db.doc('config/org').get()).get('reminders')?.enabled === true;
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
      await db.doc(`stats/course_${courseId}`).set(
        {
          scoreSum: FieldValue.increment(d.scoreSum),
          scoreCount: FieldValue.increment(d.scoreCount),
          questionFirstTry,
        },
        { merge: true },
      );
    },
  };
}

/** `RollupStore` over the Admin SDK, using count() aggregations (one read per 1000 documents). */
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
    async writeOrgCounts(counts) {
      await db.doc('stats/org').set(counts, { merge: true });
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
        const { version, course, answers } = plan;
        const published = { ...course, publishedAt: now };
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
        }
        return version;
      });
    },
    async setStatus(courseId, status) {
      await db.doc(`courses/${courseId}`).update({ status });
    },
    async audit(entry) {
      await writeAudit(db, entry);
    },
  };
}
