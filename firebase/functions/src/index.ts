// Cloud Functions entry point. Each export is a thin wrapper: the decisions live in pure modules
// (profile.ts, roles.ts, set-roles.ts) with unit tests; stores.ts adapts them to the Admin SDK.
import firestore from '@google-cloud/firestore';
import { createMailer } from './gmail.js';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { region } from 'firebase-functions/v1';
import { apiCallable } from './api/callable.js';
import { handleAttemptCreated, runDailyRollup } from './analytics.js';
import { runWeeklyBackup } from './backup.js';
import {
  handleArchiveCourse,
  handleAssignCourses,
  handleCheckAnswer,
  handleCreateCourse,
  handleGradeAttempt,
  handlePublishCourse,
  handleRemindLearners,
  handleResetCooldown,
  handleRevokeCertificate,
  handleRollbackCourse,
  handleSetRoles,
} from './handlers.js';
import { runLogged } from './logging/trigger.js';
import { runDailyReminders } from './remind.js';
import { handleProgressWrite } from './progress.js';
import { handleUserCreated } from './profile.js';
import {
  firebaseRoleAdmin,
  firestoreBackupPort,
  firestoreAssignStore,
  firestoreAttemptStatsStore,
  firestoreCertificateAdmin,
  firestoreCooldownAdmin,
  firestoreCourseStore,
  firestoreGradingStore,
  firestoreProgressStore,
  firestoreReminderStore,
  firestoreRollupStore,
  firestoreUserStore,
} from './stores.js';

/** The cost guard (plan 11): no function scales past this many instances. */
const MAX_INSTANCES = 5;

setGlobalOptions({ region: 'asia-south1', maxInstances: MAX_INSTANCES });
initializeApp();

/**
 * First sign-in: profile + claim invites. (v1 API: 2nd gen has no plain Auth `onCreate`.)
 * `setGlobalOptions` is v2-only, so region and the instance cap are set here as well.
 */
export const onUserCreated = region('asia-south1')
  .runWith({ maxInstances: MAX_INSTANCES })
  .auth.user()
  .onCreate(async (user) => {
    await runLogged(
      { done: 'Sign-up handled', failed: 'Sign-up failed' },
      { uid: user.uid },
      () => handleUserCreated(firestoreUserStore(getFirestore()), user),
      (r) => ({ fields: { created: r.created, count: r.claimed } }),
    );
  });

/** Derived progress fields (percent, completedAt), stats counters and assignment status. */
export const onProgressWritten = onDocumentWritten('progress/{progressId}', async (event) => {
  await runLogged(
    { done: 'Progress write handled', failed: 'Progress write failed' },
    { progressId: event.params.progressId },
    () =>
      handleProgressWrite(
        firestoreProgressStore(getFirestore()),
        event.params.progressId,
        event.data?.before.data(),
        event.data?.after.data(),
        new Date(),
      ),
    (outcome) => ({ level: outcome === 'updated' ? 'info' : 'debug', fields: { outcome } }),
  );
});

/** Score sums and first-try question counters for Sanjaya, from each graded attempt. */
export const onAttemptCreated = onDocumentCreated(
  'progress/{progressId}/attempts/{attemptId}',
  async (event) => {
    await runLogged(
      { done: 'Attempt counted', failed: 'Attempt counting failed' },
      { attemptId: event.params.attemptId },
      () => handleAttemptCreated(firestoreAttemptStatsStore(getFirestore()), event.data?.data()),
      (outcome) => ({ fields: { outcome } }),
    );
  },
);

/** 03:00 UTC daily: recompute the org counters from source, fixing any drift. */
export const dailyRollup = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Etc/UTC', region: 'asia-south1' },
  async () => {
    await runLogged(
      { done: 'Daily roll-up finished', failed: 'Daily roll-up failed' },
      {},
      () => runDailyRollup(firestoreRollupStore(getFirestore()), Date.now()),
      (counts) => ({ fields: { ...counts } }),
    );
  },
);

/** 04:00 UTC daily: weekly and before-due reminders, when `config/org.reminders.enabled`. */
export const dailyReminders = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Etc/UTC', region: 'asia-south1' },
  async () => {
    const db = getFirestore();
    await runLogged(
      { done: 'Daily reminders finished', failed: 'Daily reminders failed' },
      {},
      () =>
        runDailyReminders(
          { store: firestoreReminderStore(db), mailer: createMailer(process.env) },
          Date.now(),
        ),
      ({ sent, skipped }) => ({ fields: { count: sent, skipped } }),
    );
  },
);

/** 02:00 UTC every Sunday: starts a Firestore export to `BACKUP_BUCKET`; retention is the bucket's. */
export const weeklyBackup = onSchedule(
  { schedule: 'every sunday 02:00', timeZone: 'Etc/UTC', region: 'asia-south1' },
  async () => {
    await runLogged(
      { done: 'Weekly backup finished', failed: 'Weekly backup failed' },
      {},
      () =>
        runWeeklyBackup(
          firestoreBackupPort(new firestore.v1.FirestoreAdminClient()),
          process.env.BACKUP_BUCKET,
          new Date(),
        ),
      (outcome) => ({
        level: outcome === 'exported' ? 'info' : 'debug',
        fields: { status: outcome },
      }),
    );
  },
);

/** Kulapati-only: grant or revoke `acharya` / `kulapati` for one person. */
export const setRoles = apiCallable((request) =>
  handleSetRoles(request, firebaseRoleAdmin(getAuth(), getFirestore())),
);

/** Pariksha check-as-you-go: right or wrong for one question, when the author allows it. */
export const checkAnswer = apiCallable((request) =>
  handleCheckAnswer(request, firestoreGradingStore(getFirestore())),
);

/** Scores and records one Pariksha attempt; the answer key never leaves the server. */
export const gradeAttempt = apiCallable((request) =>
  handleGradeAttempt(request, firestoreGradingStore(getFirestore()), Date.now),
);

/** Kulapati-only: revoke (or restore) a certificate. */
export const revokeCertificate = apiCallable((request) =>
  handleRevokeCertificate(request, firestoreCertificateAdmin(getFirestore())),
);

/** Kulapati-only: assign courses to people by email (optionally emailing them). */
export const assignCourses = apiCallable((request) => {
  const db = getFirestore();
  return handleAssignCourses(request, {
    store: firestoreAssignStore(db),
    mailer: createMailer(process.env),
  });
});

/** Kulapati-only: open a Pariksha retake for one learner. */
export const resetCooldown = apiCallable((request) =>
  handleResetCooldown(request, firestoreCooldownAdmin(getFirestore())),
);

/** Kulapati-only: queue reminders for unfinished assignments. */
export const remindLearners = apiCallable((request) => {
  const db = getFirestore();
  return handleRemindLearners(
    request,
    { store: firestoreReminderStore(db), mailer: createMailer(process.env) },
    Date.now,
  );
});

/** Vyasa Studio: an Acharya or Kulapati starts a course, blank or copied from another draft. */
export const createCourse = apiCallable((request) =>
  handleCreateCourse(request, firestoreCourseStore(getFirestore())),
);

/** Vyasa Studio: validates the draft and makes it the live version. */
export const publishCourse = apiCallable((request) =>
  handlePublishCourse(request, firestoreCourseStore(getFirestore())),
);

/** Vyasa Studio: republishes an old version as a new one and resets the draft to it. */
export const rollbackCourse = apiCallable((request) =>
  handleRollbackCourse(request, firestoreCourseStore(getFirestore())),
);

/** Kulapati-only: retire a course or restore it to published. */
export const archiveCourse = apiCallable((request) =>
  handleArchiveCourse(request, firestoreCourseStore(getFirestore())),
);

export { isAllowedEmail, rolesFromClaims } from './roles.js';
export type { Role, RoleClaims } from './roles.js';
