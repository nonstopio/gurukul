# Working on `firebase/`

| Path                     | Owns                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| `firestore.rules`        | The access gate for every collection                                              |
| `firestore.indexes.json` | Composite indexes, deployed with rules                                            |
| `rules/`                 | Rules tests (`@firebase/rules-unit-testing`) run inside `firebase emulators:exec` |
| `functions/`             | Cloud Functions, 2nd gen, Node 22, ESM, region `asia-south1`                      |

Read `.claude/rules/firestore-rules.md` and `.claude/rules/firebase-cost.md`; for anything under
`functions/src/` also `.claude/rules/api-responses.md` and `.claude/rules/logging.md`.

- **`functions/src/api/`** is the only place that imports `onCall` or `HttpsError`. Every callable is
  `export const x = apiCallable((request) => handleX(request, ...))` in `index.ts`: the wrapper
  makes the `traceId` (`trace.ts`, AsyncLocalStorage), returns `apiOk(data)`, and on any throw builds
  the `apiFail` envelope, logs it once and throws `HttpsError(code, message, envelope)`. Handlers
  return plain data and throw `ApiException('CODE', [params], { details })`; they never return
  failures, build envelopes or log-and-rethrow. Request checks use `src/validation.ts`. A new
  failure reuses a code in `packages/schema/src/api.ts`; a new code needs a test in `api.test.ts`.
- **`functions/src/logging/`** holds `log` (`debug`/`info`/`warn`/`error(event, err, fields)`), the
  only way to log, and `runLogged` for triggers and schedules (summary with `durationMs`, one error
  line, rethrow). Event phrases are constants; values go in fields; masking is by field name. Tests
  mock `firebase-functions/logger` for every file (`test/setup.ts`). ESLint bans the raw logger,
  `console` and the https imports outside these two folders (`scripts/test/lint-rules.test.mjs`).

- `functions/emulator-test/` runs the real trigger exports against the Firestore emulator
  (`npm run test:triggers`, Java 21): each is called with `.run(event)`, which firebase-functions gives
  every v2 function, and the assertions read Firestore. `firebase-functions-test` is not used: it does not
  support firebase-admin 14. The unit suite's coverage gate does not count these files.
- Tests use the `demo-gurukul` project id, so the emulator never touches the
  real project.
- Functions: `onUserCreated` (profile + claim invites) and the `setRoles` callable (all callables return the `ApiResponse` envelope). Bootstrap the
  first Admin once with `npm run grant-admin -- you@nonstopio.com` (admin credential, never CI).
- Functions keep business logic in pure modules (`src/*.ts`) with unit tests;
  the trigger wrapper only wires inputs to them. 100% coverage applies.
- Never list an `@gurukul/*` workspace package in `functions/package.json` (any field): Cloud Build installs that
  file from the public npm registry, gets a 404 and every function fails to build. The esbuild bundle carries
  that code; `scripts/test/functions-package.test.mjs` guards it.
- Functions are bundled with esbuild (`npm run build -w @gurukul/functions` → `lib/index.js`, `@gurukul/schema`
  and zod inlined, firebase-* external) and deployed by `deploy.yml` with Hosting and rules.
  A dependency that uses `require` (like `google-auth-library`) must be `--external` in that build script and listed in
  `functions/package.json`: bundled into the ESM output it fails with "Dynamic require ... is not supported", the
  Functions emulator loads no function at all, and every e2e sign-in hangs. `npm run e2e` is what catches it.
- `onProgressWritten` computes `percent`/`completedAt`, stats counters and assignment status, and
  issues the certificate (`certificates/{NSG-COURSE-YY-NNNN}`, sequence from `counters/certificates`)
  in one transaction at 100% when `rules.certificate` is on, stamping `config/org.signatory` on it; it never issues
  twice. A learner's first start also writes `courses/{id}/learners/{uid}` (display name; Admin or that course's
  Educator read, no client writes) for the Studio Analytics learners table.
- Quiz callables: `checkAnswer` (one question, only when `revealAnswers` is `each`, records
  nothing) and `gradeAttempt` (scores against `courses/{id}/private/answers`, enforces the cooldown,
  writes `progress/{id}/attempts/{aid}` and `progress.quiz[id]` in one transaction). Both refuse a
  Quiz the learner's `itemStates` shows as locked (`PRK_1003`), and a retired (archived) course with `CRS_1004`. Decisions
  live in `grading.ts`; the answer key never leaves the server. `revokeCertificate` is Admin-only
  and writes an `audit` entry; a new revocation emails the learner through the mailer. Certificates are publicly `get`-able (verification); `counters/**` is closed.

- Admin console callables (all Admin-only, each writes an `audit` entry): `assignCourses`
  (1-20 published courses x 1-1000 emails; ids `{courseId}__{hmac-sha256(email)}`, created never overwritten, bumps
  `stats/*.assigned` and `stats/org.assignmentsTotal`; a failed batch does not abort the call: `AssignResult.failed`
  lists the course/email pairs that were not written, and only written pairs are counted, audited and emailed;
  each assignment stores `assignedByName`), `resetCooldown` (sets `lastAttemptAt` to epoch 0),
  `remindLearners` (max 200 people, one email each listing their unfinished courses, nobody reminded in the last
  20 hours via `lastRemindedAt`), and
  `setRoles` with optional `grantedCourseIds` (syncs `courses/{id}.educatorIds` and the profile's display name
  into `educatorNames` on every granted course, existing courses only).
- Studio callables (decisions in `courses.ts`, adapter `firestoreCourseStore`): `createCourse`
  (Educator or Admin; transaction creates `courses/{slug}` blank plus `drafts/current` rev 1, or copies a
  source draft with its answers; the creator's Google name goes into `educatorNames`; `CRS_1002` on a taken slug), `publishCourse` and `rollbackCourse` (course
  Educator or Admin; one transaction writes the live doc, `private/answers` and `versions/{n}`; the live doc's
  `educatorIds` and `educatorNames` always win; both run `upgradeCourse` on the stored course first; publish is gated by
  `validateForPublish` and fails `CRS_1003` with `details.issues`; rollback republishes a snapshot as a new
  version and resets the draft), `archiveCourse` (Admin-only).
  Each writes an `audit` entry. Rules: `drafts/current` is author-updatable with a `rev + 1` check, `versions/**`
  is read-only, `questionBank/**` is for educator/admin claims; clients never create or delete drafts.
- Email goes out through the Gmail API (`gmail.ts`, sender `gurukul@nonstopio.com`) behind the `Mailer` and
  `GmailPort` ports; `createMailer` reads `GMAIL_CREDENTIALS` (service-account key JSON, a Secret Manager secret that
  `index.ts` declares as `MAIL` on every function that sends email; a new one needs it too, or it sends nothing) and,
  without a usable key, sends nothing and logs a `warn`. Links in emails use `SITE_URL` (`mail.ts`; unset falls back to the default site).
  The `mail` queue is retired; setup is in `docs/operations.md`.
- Analytics counters: `onProgressWritten` keeps `stats/course_{id}` and `stats/org` (chapter completions, weekly
  lessons, finish days and the `finishDaysHistogram` behind the median, certified) by comparing before/after; `onAttemptCreated` adds score sums and
  first-try question counts from the attempt's stored `results` to the course, and score sums and
  first-try passes (`quiz*`) to `stats/org`. Schedules (daily, UTC, asia-south1):
  `dailyRollup` 03:00 recounts users, active learners and assignments with count() queries, and
  rebuilds every `stats/course_{id}` counter and the org's `started`, `completed` and `quiz*` from
  the course, progress and attempt documents (`recountFromSource`, paged reads of 500; `weekly` cannot
  be rebuilt and is left alone), and merges missing or renamed entries into `courses/{id}/learners` from
  the profiles (`planRoster`);
  `dailyReminders` 04:00 sends weekly/before-due reminders for mandatory assignments when
  `config/org.reminders.enabled`: one email per person listing everything due, none to anyone reminded in the
  last 20 hours (`remind.ts`; 20, not 24, so a run a few seconds early still counts yesterday's as a day old).
  Never schedule more often than daily. `weeklyBackup` (Sunday 02:00 UTC, `backup.ts`) starts a Firestore
  export to `gs://$BACKUP_BUCKET/backups/YYYY-MM-DD` through the `BackupPort` (`firestoreBackupPort`, the
  Firestore Admin client) and warns, without throwing, when `BACKUP_BUCKET` is unset. It never deletes:
  four-week retention is a lifecycle rule on the bucket (`docs/operations.md`). It needs
  `roles/datastore.importExportAdmin` and write access to the bucket.

```bash
npm run test:rules                      # from the repo root, needs Java 21
npm run coverage -w @gurukul/functions
```
