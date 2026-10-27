import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { progressId as progressDocId } from '@gurukul/schema';
import { planCertificate } from './certificates.js';
import type { CertificateAdmin } from './certificates.js';
import type { GradingStore } from './grading.js';
import type { UserStore } from './profile.js';
import type { ProgressStore } from './progress.js';
import type { RoleClaims } from './roles.js';
import type { RoleAdmin } from './set-roles.js';

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
    async audit(entry) {
      await db.collection('audit').add({ ...entry, at: FieldValue.serverTimestamp() });
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
    async bumpStats(courseId, { started, completed }) {
      const counters = {
        started: FieldValue.increment(started),
        completed: FieldValue.increment(completed),
      };
      const batch = db.batch();
      batch.set(db.doc('stats/org'), counters, { merge: true });
      batch.set(db.doc(`stats/course_${courseId}`), counters, { merge: true });
      await batch.commit();
    },
    async setAssignmentStatus(uid, courseId, status) {
      const snap = await db
        .collection('assignments')
        .where('uid', '==', uid)
        .where('courseId', '==', courseId)
        .get();
      if (snap.empty) return;
      const batch = db.batch();
      for (const d of snap.docs) batch.update(d.ref, { status });
      await batch.commit();
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
      await db.collection('audit').add({ ...entry, at: FieldValue.serverTimestamp() });
    },
  };
}
