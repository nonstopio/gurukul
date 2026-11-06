// Cloud Functions entry point. Each export is a thin wrapper: the decisions live in pure modules
// (profile.ts, roles.ts, set-roles.ts) with unit tests; stores.ts adapts them to the Admin SDK.
import firestore from '@google-cloud/firestore';
import { createMailer } from './gmail.js';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { region } from 'firebase-functions/v1';
import { apiCallable } from './api/callable.js';
import { handleAttemptCreated, runDailyRollup } from './analytics.js';
import { runWeeklyBackup } from './backup.js';
import { runMediaCleanup } from './media.js';
import {
  handleArchiveCourse,
  handleAssignCourses,
  handleCheckAnswer,
  handleCreateCourse,
  handleListEmailTemplates,
  handleGradeAttempt,
  handlePublishCourse,
  handleRemindLearners,
  handleRemoveAssignment,
  handleResetCooldown,
  handleRevokeCertificate,
  handleRollbackCourse,
  handleSendTestEmail,
  handleSetCourseAccess,
  handleSetRoles,
  handleTeamReport,
  handleUpdateAssignment,
} from './handlers.js';
import { runLogged } from './logging/trigger.js';
import { runDailyReminders } from './remind.js';
import { handleProgressWrite } from './progress.js';
import { handleUserCreated } from './profile.js';
import { handleTeamWrite } from './teams.js';
import {
  bucketStoragePort,
  firebaseRoleAdmin,
  firestoreBackupPort,
  firestoreAssignStore,
  firestoreAttemptStatsStore,
  firestoreCertificateAdmin,
  firestoreCooldownAdmin,
  firestoreCourseStore,
  firestoreGradingStore,
  firestoreMediaStore,
  firestoreProgressStore,
  firestoreReminderStore,
  firestoreRollupStore,
  firestoreTeamReportStore,
  firestoreTeamStore,
  firestoreUserStore,
} from './stores.js';

/** The cost guard (plan 11): no function scales past this many instances. */
const MAX_INSTANCES = 5;

/**
 * The Gmail sender's service-account key (`docs/operations.md`). Secret Manager only hands a secret
 * to the functions that declare it, so every function that sends email lists it; a deploy fails
 * until the secret exists (a placeholder such as `none` sends nothing).
 */
const MAIL = { secrets: [defineSecret('GMAIL_CREDENTIALS')] };

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
        firestoreProgressStore(getFirestore(), getAuth()),
        event.params.progressId,
        event.data?.before.data(),
        event.data?.after.data(),
        new Date(),
      ),
    (outcome) => ({ level: outcome === 'updated' ? 'info' : 'debug', fields: { outcome } }),
  );
});

/** A team's members changed: keep each member's `teamIds` (what a course's team visibility reads) in step. */
export const onTeamWritten = onDocumentWritten('teams/{teamId}', async (event) => {
  await runLogged(
    { done: 'Team membership reconciled', failed: 'Team membership reconcile failed' },
    { teamId: event.params.teamId },
    () =>
      handleTeamWrite(
        firestoreTeamStore(getFirestore()),
        event.params.teamId,
        event.data?.before.data(),
        event.data?.after.data(),
      ),
    (r) => ({ fields: { count: r.count } }),
  );
});

/** Score sums and first-try question counters for Analytics, from each graded attempt. */
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

/**
 * 04:00 UTC daily: weekly and before-due reminders, and the once-only due-soon and overdue notices
 * (team Managers in CC), when `config/org.reminders.enabled`.
 */
export const dailyReminders = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Etc/UTC', region: 'asia-south1', ...MAIL },
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

/**
 * 05:00 UTC every Sunday (after the 02:00 backup, clear of the 03:00 and 04:00 daily jobs): deletes
 * lesson media that no draft, live course or version names and that is over 30 days old.
 * Needs `roles/storage.objectAdmin` on the default bucket (`docs/operations.md`).
 */
export const weeklyMediaCleanup = onSchedule(
  { schedule: 'every sunday 05:00', timeZone: 'Etc/UTC', region: 'asia-south1', maxInstances: 1 },
  async () => {
    await runLogged(
      { done: 'Weekly media clean-up finished', failed: 'Weekly media clean-up failed' },
      {},
      () =>
        runMediaCleanup(
          {
            store: firestoreMediaStore(getFirestore()),
            storage: bucketStoragePort(getStorage().bucket()),
          },
          new Date(),
        ),
      ({ deleted, courses, skipped, blocked }) => ({
        level: deleted > 0 || blocked ? 'info' : 'debug',
        fields: { count: deleted, courses, skipped, blocked },
      }),
    );
  },
);

/** Admin-only: grant or revoke `educator` / `admin` for one person. */
export const setRoles = apiCallable((request) =>
  handleSetRoles(request, firebaseRoleAdmin(getAuth(), getFirestore())),
);

/** Quiz check-as-you-go: right or wrong for one question, when the author allows it. */
export const checkAnswer = apiCallable((request) =>
  handleCheckAnswer(request, firestoreGradingStore(getFirestore())),
);

/** Scores and records one Quiz attempt; the answer key never leaves the server. */
export const gradeAttempt = apiCallable((request) =>
  handleGradeAttempt(request, firestoreGradingStore(getFirestore()), Date.now),
);

/** Admin-only: revoke (or restore) a certificate. */
export const revokeCertificate = apiCallable(
  (request) =>
    handleRevokeCertificate(request, {
      admin: firestoreCertificateAdmin(getFirestore()),
      mailer: createMailer(process.env),
    }),
  MAIL,
);

/** Admin, or a Manager for their teams: assign courses (optionally emailing the people). */
export const assignCourses = apiCallable((request) => {
  const db = getFirestore();
  return handleAssignCourses(request, {
    store: firestoreAssignStore(db),
    mailer: createMailer(process.env),
  });
}, MAIL);

/** Admin-only: open a Quiz retake for one learner. */
export const resetCooldown = apiCallable((request) =>
  handleResetCooldown(request, firestoreCooldownAdmin(getFirestore())),
);

/** Admin, or a Manager for their team: email reminders for unfinished assignments. */
export const remindLearners = apiCallable((request) => {
  const db = getFirestore();
  return handleRemindLearners(
    request,
    { store: firestoreReminderStore(db), mailer: createMailer(process.env) },
    Date.now,
  );
}, MAIL);

/** Admin, or the team's Manager: each member's assignments, status, due date and percent. */
export const teamReport = apiCallable((request) =>
  handleTeamReport(request, firestoreTeamReportStore(getFirestore())),
);

/** Admin, or a Manager for their teams' assignments: change or clear a due date. */
export const updateAssignment = apiCallable((request) =>
  handleUpdateAssignment(request, firestoreTeamReportStore(getFirestore()), Date.now),
);

/** Admin, or a Manager for their teams' assignments: remove an assignment. */
export const removeAssignment = apiCallable((request) =>
  handleRemoveAssignment(request, firestoreTeamReportStore(getFirestore())),
);

/** Admin-only: every email Gurukul sends, filled with sample data. */
export const listEmailTemplates = apiCallable((request) => handleListEmailTemplates(request));

/** Admin-only: send one email template, with sample data, to the Admin who asked. */
export const sendTestEmail = apiCallable(
  (request) => handleSendTestEmail(request, { mailer: createMailer(process.env) }),
  MAIL,
);

/** Studio: an Educator or Admin starts a course, blank or copied from another draft. */
export const createCourse = apiCallable((request) =>
  handleCreateCourse(request, firestoreCourseStore(getFirestore())),
);

/** Studio: validates the draft and makes it the live version. */
export const publishCourse = apiCallable((request) =>
  handlePublishCourse(request, firestoreCourseStore(getFirestore())),
);

/** Studio: who may open a course, applied to the live course at once without a new version. */
export const setCourseAccess = apiCallable((request) =>
  handleSetCourseAccess(request, firestoreCourseStore(getFirestore())),
);

/** Studio: republishes an old version as a new one and resets the draft to it. */
export const rollbackCourse = apiCallable((request) =>
  handleRollbackCourse(request, firestoreCourseStore(getFirestore())),
);

/** Admin-only: retire a course or restore it to published. */
export const archiveCourse = apiCallable((request) =>
  handleArchiveCourse(request, firestoreCourseStore(getFirestore())),
);

export { isAllowedEmail, rolesFromClaims } from './roles.js';
export type { Role, RoleClaims } from './roles.js';
