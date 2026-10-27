// Cloud Functions entry point. Each export is a thin wrapper: the decisions live in pure modules
// (profile.ts, roles.ts, set-roles.ts) with unit tests; stores.ts adapts them to the Admin SDK.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as v1 from 'firebase-functions/v1';
import { CallError, handleSetRoles } from './handlers.js';
import { handleUserCreated } from './profile.js';
import { firebaseRoleAdmin, firestoreUserStore } from './stores.js';

setGlobalOptions({ region: 'asia-south1', maxInstances: 5 });
initializeApp();

/** First sign-in: profile + claim invites. (v1 API: 2nd gen has no plain Auth `onCreate`.) */
export const onUserCreated = v1
  .region('asia-south1')
  .auth.user()
  .onCreate(async (user) => {
    await handleUserCreated(firestoreUserStore(getFirestore()), user);
  });

/** Kulapati-only: grant or revoke `acharya` / `kulapati` for one person. */
export const setRoles = onCall(async (request) => {
  try {
    return await handleSetRoles(request, firebaseRoleAdmin(getAuth(), getFirestore()));
  } catch (e) {
    if (e instanceof CallError) throw new HttpsError(e.code, e.message);
    throw e;
  }
});

export { isAllowedEmail, rolesFromClaims } from './roles.js';
export type { Role, RoleClaims } from './roles.js';
