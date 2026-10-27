// Cloud Functions entry point. Each export is a thin wrapper: the decisions live in pure modules
// (profile.ts, roles.ts, set-roles.ts) with unit tests; stores.ts adapts them to the Admin SDK.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as v1 from 'firebase-functions/v1';
import {
  CallError,
  handleCheckAnswer,
  handleGradeAttempt,
  handleRevokeCertificate,
  handleSetRoles,
} from './handlers.js';
import { handleProgressWrite } from './progress.js';
import { handleUserCreated } from './profile.js';
import {
  firebaseRoleAdmin,
  firestoreCertificateAdmin,
  firestoreGradingStore,
  firestoreProgressStore,
  firestoreUserStore,
} from './stores.js';

setGlobalOptions({ region: 'asia-south1', maxInstances: 5 });
initializeApp();

/** First sign-in: profile + claim invites. (v1 API: 2nd gen has no plain Auth `onCreate`.) */
export const onUserCreated = v1
  .region('asia-south1')
  .auth.user()
  .onCreate(async (user) => {
    await handleUserCreated(firestoreUserStore(getFirestore()), user);
  });

/** Derived progress fields (percent, completedAt), stats counters and assignment status. */
export const onProgressWritten = onDocumentWritten('progress/{progressId}', async (event) => {
  await handleProgressWrite(
    firestoreProgressStore(getFirestore()),
    event.params.progressId,
    event.data?.before.data(),
    event.data?.after.data(),
  );
});

const toHttpsError = (e: unknown): unknown =>
  e instanceof CallError ? new HttpsError(e.code, e.message, e.details) : e;

/** Kulapati-only: grant or revoke `acharya` / `kulapati` for one person. */
export const setRoles = onCall(async (request) => {
  try {
    return await handleSetRoles(request, firebaseRoleAdmin(getAuth(), getFirestore()));
  } catch (e) {
    throw toHttpsError(e);
  }
});

/** Pariksha check-as-you-go: right or wrong for one question, when the author allows it. */
export const checkAnswer = onCall(async (request) => {
  try {
    return await handleCheckAnswer(request, firestoreGradingStore(getFirestore()));
  } catch (e) {
    throw toHttpsError(e);
  }
});

/** Scores and records one Pariksha attempt; the answer key never leaves the server. */
export const gradeAttempt = onCall(async (request) => {
  try {
    return await handleGradeAttempt(request, firestoreGradingStore(getFirestore()), Date.now);
  } catch (e) {
    throw toHttpsError(e);
  }
});

/** Kulapati-only: revoke (or restore) a certificate. */
export const revokeCertificate = onCall(async (request) => {
  try {
    return await handleRevokeCertificate(request, firestoreCertificateAdmin(getFirestore()));
  } catch (e) {
    throw toHttpsError(e);
  }
});

export { isAllowedEmail, rolesFromClaims } from './roles.js';
export type { Role, RoleClaims } from './roles.js';
