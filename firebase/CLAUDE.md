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

- Tests use the `demo-gurukul` project id, so the emulator never touches the
  real project.
- Functions: `onUserCreated` (profile + claim invites) and the `setRoles` callable (all callables return the `ApiResponse` envelope). Bootstrap the
  first Kulapati once with `npm run grant-kulapati -- you@nonstopio.com` (admin credential, never CI).
- Functions keep business logic in pure modules (`src/*.ts`) with unit tests;
  the trigger wrapper only wires inputs to them. 100% coverage applies.
- Functions are bundled with esbuild (`npm run build -w @gurukul/functions` → `lib/index.js`, `@gurukul/schema`
  and zod inlined, firebase-* external) and deployed by `deploy.yml` with Hosting and rules.
- `onProgressWritten` computes `percent`/`completedAt`, stats counters and assignment status, and
  issues the certificate (`certificates/{NSG-COURSE-YY-NNNN}`, sequence from `counters/certificates`)
  in one transaction at 100% when `rules.certificate` is on; it never issues twice.
- Pariksha callables: `checkAnswer` (one question, only when `revealAnswers` is `each`, records
  nothing) and `gradeAttempt` (scores against `courses/{id}/private/answers`, enforces the cooldown,
  writes `progress/{id}/attempts/{aid}` and `progress.pariksha[id]` in one transaction). Decisions
  live in `grading.ts`; the answer key never leaves the server. `revokeCertificate` is Kulapati-only
  and writes an `audit` entry. Certificates are publicly `get`-able (verification); `counters/**` is closed.

- Kulapati console callables (all Kulapati-only, each writes an `audit` entry): `assignCourses`
  (1-20 published courses x 1-1000 emails; ids `{courseId}__{sha1(email)}`, created never overwritten, bumps
  `stats/*.assigned` and `stats/org.assignmentsTotal`), `resetCooldown` (sets `lastAttemptAt` to epoch 0),
  `remindLearners` (max 200, at most one reminder per assignment per 24h via `lastRemindedAt`), and
  `setRoles` with optional `grantedCourseIds` (syncs `courses/{id}.acharyaIds`, existing courses only).
- Email is an outbox only: the `Mailer` port's adapter writes `mail/{autoId}` (`state: 'pending'`, clients
  cannot read it) and calls nothing external. The real sender (Gmail API, `.plan/13-open-questions.md` #4)
  needs credentials and is a later integration: it will consume `mail` and flip `state`.
- Sanjaya counters: `onProgressWritten` keeps `stats/course_{id}` and `stats/org` (parva completions, weekly
  lessons, finish days, certified) by comparing before/after; `onAttemptCreated` adds score sums and
  first-try question counts from the attempt's stored `results`. Schedules (daily, UTC, asia-south1):
  `dailyRollup` 03:00 recounts users, active learners and assignments with count() queries;
  `dailyReminders` 04:00 sends weekly/before-due reminders when `config/org.reminders.enabled`.
  Never schedule more often than daily.

```bash
npm run test:rules                      # from the repo root, needs Java 21
npm run coverage -w @gurukul/functions
```
