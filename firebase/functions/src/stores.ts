import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { UserStore } from './profile.js';
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
