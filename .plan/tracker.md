# Tracker

What the plan asks for, what is built and what is left, item by item. The plan files say **what**
to build; this file says **how far along** it is. Audited against the code on 2026-10-27: a `done`
row names where it lives, a `todo` row says what "done" means.

Work it one item per pull request with the `pick-up-next` skill (`.claude/skills/pick-up-next/`).
`npm run -s tracker` prints the counts and the next item; `npm run -s tracker -- --check` (run by
`npm run test:tooling`) fails when this file is inconsistent.

**Statuses:** `todo` anyone can take it · `blocked` waits on a maintainer decision (named in Notes)
· `maintainer` an action outside the code (accounts, credentials, content) · `done`. An open pull
request whose body says `Tracker: ABC-NN` is the claim on an item; there is no "in progress".

## Summary

| Section                       | Done | Todo | Blocked | Maintainer |
| ----------------------------- | ---- | ---- | ------- | ---------- |
| Foundations | 7 | 0 | 0 | 0 |
| Sign-in, roles and shell | 12 | 0 | 1 | 0 |
| Learner experience | 18 | 0 | 1 | 0 |
| Parikshas and certificates | 10 | 0 | 0 | 0 |
| Kulapati console and Sanjaya | 32 | 0 | 0 | 0 |
| Vyasa Studio | 17 | 0 | 0 | 0 |
| Design system | 5 | 1 | 0 | 0 |
| Global search | 5 | 0 | 0 | 0 |
| Platform, CI and operations | 18 | 0 | 0 | 9 |
| First course: Git | 4 | 0 | 0 | 2 |
| Plan upkeep | 2 | 0 | 0 | 0 |
| **Total** | 130 | 1 | 2 | 11 |

## Pick order

Correctness and cost first, then what learners meet, then the console and Studio, then polish.
Two items are blocked on a maintainer answer (`LRN-20`, `AUTH-10`).

1. `LRN-20` — Preview certificate on the course overview (blocked)
2. `AUTH-10` — Sign-in: contact link and quote (blocked)
3. `DS-04` — shared icon set

## Foundations

Plan: `15-changelog-and-search.md`, `16-api-contract.md`, `17-logging.md`, `10-testing-and-ci.md`, M0 in `12-milestones.md`.

| ID       | Item                                                                         | Status | Depends | Notes                                                                                                  |
| -------- | ---------------------------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------ |
| `FND-01` | npm workspaces, tokens, `Button`, `CommandPalette`                           | done   | —       | `packages/ui/src/tokens.css`, `Button.tsx`, `CommandPalette.tsx`                                       |
| `FND-02` | CI jobs, PR title, preview, production deploy, CodeQL, Dependabot            | done   | —       | `.github/workflows/`, `.github/dependabot.yml`                                                         |
| `FND-03` | Changelog: one file per entry, releases from `release-*` tags                | done   | —       | `apps/web/src/changelog/`, `deploy.yml`                                                                |
| `FND-04` | Claude hooks, rules and skills                                               | done   | —       | `.claude/hooks/`, `.claude/rules/`, `.claude/skills/`                                                  |
| `FND-05` | Husky: pre-commit, commit-msg, pre-push                                      | done   | —       | `.husky/`, `scripts/pre-push.sh`                                                                       |
| `FND-06` | One API envelope, error catalog, `apiCallable`, browser `callApi`            | done   | —       | `packages/schema/src/api.ts`, `firebase/functions/src/api/callable.ts`, `apps/web/src/api/call.ts`     |
| `FND-07` | Structured, masked logging; `runLogged`; lint rules for both                 | done   | —       | `firebase/functions/src/logging/`, `apps/web/src/log.ts`, `packages/schema/src/logging.ts`             |

## Sign-in, roles and shell

Plan: `03-auth-and-roles.md`, `design-handoff/00-shared-patterns.md`, `design-handoff/01-learner.md` §01, M1.

| ID        | Item                                                                     | Status | Depends | Notes                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------ | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH-01` | Schema package: course, progress, assignment, certificate, user, helpers | done   | —       | `packages/schema/src/`                                                                                                                                                                        |
| `AUTH-02` | Google popup with the `hd` hint; domain lock in rules; wrong domain signed out | done | —   | `apps/web/src/auth/service.ts`, `AuthProvider.tsx`, `firebase/firestore.rules`                                                                                                               |
| `AUTH-03` | `useSession`, `RequireRole`, not-allowed page, public `/verify`          | done   | —       | `apps/web/src/auth/`, `routes.tsx`                                                                                                                                                            |
| `AUTH-04` | `onUserCreated`: profile and invite claiming                             | done   | —       | `firebase/functions/src/profile.ts`                                                                                                                                                           |
| `AUTH-05` | `setRoles`, token refresh on mirror change, no self-removal, bootstrap   | done   | —       | `firebase/functions/src/set-roles.ts`, `roles.ts`, `scripts/grant-kulapati.mjs`                                                                                                              |
| `AUTH-06` | App shell: sidebar generated from navigation metadata, TopBar            | done   | —       | `apps/web/src/Shell.tsx`                                                                                                                                                                      |
| `AUTH-07` | Sign-in works on mobile Safari and fails politely                        | done   | —       | `apps/web/src/auth/service.ts` (`prefersRedirect`, `finishRedirect`, cancel and blocked-popup handling), `AuthProvider.tsx` (`deniedMessage`, `wrongAccount`), `SignInPage.tsx`; auth domain switch is `OPS-21` |
| `AUTH-08` | Sign-in screen to the handoff | done | — | `apps/web/src/auth/SignInPage.tsx`, `styles.css` (`.signin*`): two-pane hero, benefits, invite Callout, footnote. Left: `AUTH-09` |
| `AUTH-09` | Sign-in states | done | — | Google mark, busy state (disabled, `aria-busy`, "Signing in…") and a quote line: `apps/web/src/auth/SignInPage.tsx`, `styles.css` (`.signin__quote`), `apps/web/test/App.test.tsx`. The inline `role=alert` message stays as the error state. Left: `AUTH-10` |
| `AUTH-10` | Sign-in: contact link and quote | blocked | — | Needs the maintainer: the contact address for the sign-in help link, and confirmation or replacement of the Sanskrit quote ("Knowledge gives humility") chosen without the handoff text. An error Toast with retry is dropped unless `Toast` gains an action slot; the inline alert already covers it |
| `SHL-01`  | Skip link, focus on route change, retry on load errors                   | done   | —       | "Skip to content" and focus/announce on navigation in `apps/web/src/Shell.tsx` + `src/routeFocus.ts`; Retry from `useAsync` (`src/data/useAsync.ts`) on the load-error callout (`src/learn/ui.tsx`); `test/route-focus.test.tsx` |
| `SHL-02`  | Focused shell for lesson, Pariksha and result                            | done   | —       | `FocusedShell` (top bar only) and `Frame` (search, skip link, route focus above both layouts) in `apps/web/src/Shell.tsx`, `FOCUSED` in `src/routes.tsx`; one `h1` each (`TopBar titleAs="p"`, `packages/ui/src/TopBar.tsx`); `ProgressBar caption` "60% · 3 / 5"; `test/focused-shell.test.tsx` |
| `SHL-03` | Handoff breakpoints and the menu button | done | — | `apps/web/src/Shell.tsx` (Menu button), `styles.css` (stacks below 808px, menu button below 560px). Not yet checked by eye at 390px and 700px |

## Learner experience

Plan: `05-learner-experience.md`, `design-handoff/01-learner.md` §02–§04, M2.

| ID       | Item                                                                     | Status | Depends  | Notes                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LRN-01` | Home: continue hero, assigned (mandatory, then due), empty state         | done   | —        | `apps/web/src/HomePage.tsx`, `learn/model.ts`                                                                                                                                                                     |
| `LRN-02` | Catalogue with level and "assigned to me" filters; self-enrolment        | done   | —        | `apps/web/src/CoursesPage.tsx`, `data/firebase.ts`                                                                                                                                                                |
| `LRN-03` | Course overview: outcomes, parva list with item states, ring, resume     | done   | —        | `apps/web/src/CoursePage.tsx`, `packages/schema/src/progress.ts`                                                                                                                                                  |
| `LRN-04` | Lesson player: eight block renderers, safe markdown, embed allow-list, mark complete, J/K, deleted-item resume | done | — | `apps/web/src/LessonPage.tsx`, `player/blocks.tsx`, `packages/schema/src/media.ts`                                                                                                                     |
| `LRN-05` | Progress: set-union completions, shared percent helper, progress trigger | done   | —        | `apps/web/src/data/firebase.ts`, `firebase/functions/src/progress.ts`                                                                                                                                             |
| `LRN-06` | One unreadable course or unknown block no longer breaks the app | done | — | `packages/schema/src/migrations/` (`steps.ts` registry, `upgradeCourse`, strict `migrateCourse`, tolerant `readCourse` with `UnsupportedBlock`); `apps/web/src/data/firebase.ts` and `apps/web/src/studio/firebase.ts` skip an unreadable course; `firebase/functions/src/courses.ts` publish and rollback upgrade first |
| `LRN-07` | Offline reading and queued completions                                   | done   | —        | `apps/web/src/firebase.ts` (persistent multi-tab cache), `LessonPage.tsx` (Mark complete does not wait), `OfflineBanner.tsx` in `Shell.tsx` |
| `LRN-09` | `video90` and `requireVideoWatch` are real | done | — | `apps/web/src/player/watch.ts` (`WatchLog`: seconds actually played; `needsWatching`), `player/videoTrack.ts` (YouTube IFrame API, Loom player.js), `player/TrackedVideo.tsx` (Drive and unreachable players fall back to self-attest), `LessonPage.tsx` (hint and tooltip on the disabled button), `packages/ui/src/VideoBlock.tsx` (`frameRef`) |
| `LRN-10` | Split layout | done | — | `apps/web/src/LessonPage.tsx` (first video of a split lesson in `.article__media`), `styles.css` (`.article--split`, 55/45 with a sticky video from 1100px; stacks below) |
| `LRN-11` | Outline rail grouped by parva | done | — | `apps/web/src/LessonPage.tsx` (`OutlineRail`: parva groups as `<button aria-expanded>`, current parva open, state glyphs; "Parva n · Lesson x of y" kicker, `kindLabel`/`minutes` chips; footer names previous and next), `styles.css`. Not remembered: open groups; 40px rows and the lock tooltip text |
| `LRN-12` | Course overview to the handoff | done | `STU-06` | `apps/web/src/CoursePage.tsx`, `learn/openParvas.ts`: description markdown, Acharya card, locked-row tooltip, remembered parvas, certificate link. Left: `LRN-18` |
| `LRN-18` | Course overview: hero band and due date | done | — | Hero band and due date: `apps/web/src/CoursePage.tsx` (`--cover-forest` band with title, summary, meta, due-date chip from `myAssignments`; the page still opens if that call fails), `styles.css`, `apps/web/test/learner-pages.test.tsx`. Left: `LRN-20` |
| `LRN-13` | Home to the handoff | done | — | `apps/web/src/HomePage.tsx`, `learn/model.ts` (`statusLine`, `upNext`, `recentActivity`), `learn/ui.tsx` (`CoverTile`), `styles.css`. Left: assigned-by, `LRN-19` |
| `LRN-19` | Assigned-by on the Home continue card | done | — | `assignedByName` stored on the assignment by the assign function (caller's token name; optional, so older assignments show nothing), shown on the Home continue card: `packages/schema/src/assignment.ts`, `firebase/functions/src/{assign,stores}.ts`, `apps/web/src/data/{types,firebase}.ts`, `HomePage.tsx`; `02-data-model.md` |
| `LRN-20` | Preview certificate on the course overview | blocked | — | Needs a plan decision: does it get a route, and what does the certificate show before it is earned (sample data, the learner's name)? Not built |
| `LRN-14` | Retired and "New lessons added" states                                   | done   | —        | `apps/web/src/learn/model.ts` (`isRetired`, `hasNewLessons`), `learn/ui.tsx` (`RetiredNote`), `HomePage.tsx`, `CoursePage.tsx`, `LessonPage.tsx`, `pariksha/ParikshaPage.tsx` (closed for retired); `firebase/functions/src/grading.ts` refuses archived with `CRS_1004` (`packages/schema/src/api.ts`) |
| `LRN-15` | Block renderer polish | done | — | `packages/schema/src/course.ts` (optional video `title` and `caption`), `packages/ui/src/CodeBlock.tsx` (`copyable`), `apps/web/src/player/blocks.tsx`, `TrackedVideo.tsx`, `styles.css`; file-row icon. Studio inputs for the new fields: `STU-17` |
| `LRN-16` | Check blocks reveal the right option | done | — | Schema v3: optional `check.correct` (`packages/schema/src/course.ts`, `migrations/steps.ts`), publish check in `draft.ts`, player in `player/blocks.tsx`, Studio radio in `studio/blocks/CheckEditor.tsx`, `studio/lessonEdit.ts`; seed keyed in `firebase/seed/src/git-course.ts`. Live courses at schemaVersion 2 need an Acharya to mark answers before the next publish |
| `LRN-17` | Keyboard shortcuts dialog | done | — | `apps/web/src/ShortcutsDialog.tsx`, `keys.ts` (`isTyping`), mounted in `Shell.tsx` |

## Parikshas and certificates

Plan: `06-pariksha-and-certificates.md`, `design-handoff/01-learner.md` §05–§08, M3.

| ID       | Item                                                                                       | Status  | Depends | Notes                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRK-01` | `checkAnswer` and `gradeAttempt`: cooldown, best score, reveal modes, random subset, shuffle | done  | —       | `firebase/functions/src/grading.ts`, `apps/web/src/pariksha/model.ts`                                                                                                     |
| `PRK-02` | Pariksha and Result screens                                                                | done    | —       | `apps/web/src/pariksha/`                                                                                                                                                  |
| `PRK-03` | Certificate issue, `NSG-…` id from a counter, certificate page, print, LinkedIn, `/verify`, revoke | done | — | `firebase/functions/src/certificates.ts`, `progress.ts`, `apps/web/src/certificates/pages.tsx`                                                                         |
| `PRK-04` | Completion screen (first cut)                                                              | done    | —       | `apps/web/src/certificates/pages.tsx`                                                                                                                                     |
| `PRK-05` | Sequential unlocking follows the plan and the server enforces it                           | done    | —       | `packages/schema/src/progress.ts` (`isParvaPassed`, `itemStates`), `firebase/functions/src/grading.ts` (`checkUnlocked`, `PRK_1003`). Lesson completions in a locked parva are still not refused by the rules |
| `PRK-06` | Pariksha answers survive a reload                                                          | done    | —       | `apps/web/src/pariksha/draftStore.ts` (answers, verdicts and the draw kept in localStorage per learner and Pariksha), `apps/web/src/pariksha/model.ts` (`restoreQuestions`, `answerLetters`), `apps/web/src/pariksha/ParikshaPage.tsx` (exit confirmation, Enter, options locked while checking). Saved per browser, not across devices |
| `PRK-07` | Result page survives a reload                                                              | done    | —       | `apps/web/src/pariksha/ResultPage.tsx` (router state after Finish, else the latest attempt; "Continue to Parva n", "Revisit lesson: {title}", live `Retake` countdown), `apps/web/src/pariksha/model.ts` (`reviewOfAttempt`, `formatCountdown`, `parvaNumber`), `apps/web/src/data/firebase.ts` (`latestAttempt`), attempts index in `firebase/firestore.indexes.json`. A reloaded review names the learner's answers, not the right options |
| `PRK-08` | Completion screen to the handoff | done | — | `apps/web/src/certificates/pages.tsx` (`CompletePage`, `CertificateThumb`, `UpNextCard`), `learn/model.ts` (`nextAssigned`, `durationLabel`), `styles.css` (`.complete__*`). Time invested is summed lesson minutes, not measured |
| `PRK-09` | Revocation date on certificates                                                            | done    | —       | `firebase/functions/src/stores.ts` (`setRevoked` stamps `revokedAt`, null on restore), `packages/schema/src/certificate.ts`, `apps/web/src/data/firebase.ts`, `apps/web/src/certificates/pages.tsx` ("Revoked on …"). Certificates revoked earlier have no date and keep the old wording |
| `PRK-10` | Tell a learner their certificate was revoked | done | `KUL-24` | `firebase/functions/src/certificates.ts` (`revokeCertificate` emails the learner on a new revoke through the mailer; a restore or repeat revoke sends nothing; a missing address or failed send logs a warn and never undoes it), `mail.ts` (`buildRevokedEmail`, contact gurukul@nonstopio.com), `stores.ts` (`setRevoked`, `emailOf`), `handlers.ts`, `index.ts` |

## Kulapati console and Sanjaya

Plan: `07-kulapati-console.md`, `09-analytics.md`, `design-handoff/02-kulapati-console.md`, M4.

| ID       | Item                                                                         | Status  | Depends  | Notes                                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KUL-01` | `assignCourses`: normalise, classify, batches of 400, idempotent ids         | done    | —        | `firebase/functions/src/assign.ts`, `packages/schema/src/assign.ts`                                                                                                                  |
| `KUL-02` | Assign screen: courses, paste, CSV, team, client preview, due/mandatory/reminder | done | —        | `apps/web/src/console/AssignPage.tsx`                                                                                                                                                |
| `KUL-03` | Learners table, tabs, paging, drawer with reset cooldown and revoke (first cut) | done  | —        | `apps/web/src/console/LearnersPage.tsx`                                                                                                                                              |
| `KUL-04` | Roles & access: role cards, permission matrix, Acharyas, grant dialog        | done    | —        | `apps/web/src/console/RolesPage.tsx`                                                                                                                                                 |
| `KUL-05` | Audit log written by functions; console view of the latest 100               | done    | —        | `firebase/functions/src/stores.ts`, `apps/web/src/console/AuditPage.tsx`                                                                                                             |
| `KUL-06` | Sanjaya overview: active learners, assignments, weekly chart, funnel, CSV export | done | —        | `apps/web/src/console/OverviewPage.tsx`, `console/model.ts`                                                                                                                          |
| `KUL-07` | Course analytics: funnel, parva drop-off, hardest questions                  | done    | —        | `apps/web/src/console/CourseAnalyticsPage.tsx`                                                                                                                                       |
| `KUL-08` | Counter triggers and the daily org roll-up                                   | done    | —        | `firebase/functions/src/analytics.ts`                                                                                                                                                |
| `KUL-09` | Daily reminders and `remindLearners`, queued to `mail`                       | done    | —        | `firebase/functions/src/remind.ts`, `mail.ts`. Queued only: delivery is `KUL-24`                                                                                                    |
| `KUL-10` | Learners table: pending invites and filters that combine                     | done    | —        | `apps/web/src/console/LearnersPage.tsx`, `model.ts` (`filterPeople`, `onTab`, `tabCounts`, `allPage`). Counts past 500: `KUL-26`                                                     |
| `KUL-11` | People search by name                                                        | done    | —        | `apps/web/src/console/firebase.ts` (`searchUsers`: `email` and `nameLower` prefixes), `usePeopleSearch.ts` (newest answer wins), `model.ts` (`filterPeople`); `nameLower` set by `firebase/functions/src/profile.ts`, backfilled at sign-in (`apps/web/src/firestore.ts`), kept in step by `firestore.rules` |
| `KUL-12` | Learner drawer completeness | done | — | `apps/web/src/console/LearnerDrawer.tsx`, `model.ts` (`drawerCourses`, `parikshaTitle`), `firebase.ts` (`assignmentsFor`, `attemptsFor`: score, verdict and date only) |
| `KUL-13` | Bulk role change and select all | done | — | Change role dialog: `apps/web/src/console/LearnersPage.tsx` (`BulkRoleDialog`, one `setRoles` call per person). Left: `KUL-28` |
| `KUL-28` | Select all N across pages on Learners | done | — | "Select all N" in the bulk bar: `apps/web/src/console/LearnersPage.tsx` (`selectAll`); filtered views use the rows in memory, unfiltered All and Signed in read everyone by cursor. Role change is still one `setRoles` call per person; a batch callable only if the list grows to hundreds |
| `KUL-14` | Assign screen finish | done | — | `apps/web/src/console/AssignPage.tsx` (lesson counts, CSV drop zone, team size, wording), `LearnersPage.tsx` (`?course=` filter). Left: `KUL-29` |
| `KUL-29` | Assign: partial failures and per-course preview | done | — | `firebase/functions/src/assign.ts`, `stores.ts` (a failed batch no longer aborts the call; `AssignResult.failed` lists failed course/email pairs, only written pairs are counted, audited and emailed), `apps/web/src/console/AssignPage.tsx` (failed list with Retry, per-course preview), `firebase.ts` (`knownEmails` returns `byCourse`); `07-kulapati-console.md`, `16-api-contract.md` |
| `KUL-15` | Reminders: one per person per day, mandatory only                            | done    | —        | Daily run takes mandatory assignments only and sends one email per person, none to anyone reminded in the last 20 h (`firebase/functions/src/remind.ts`, `mail.ts` `buildReminderEmail`, `stores.ts`); `hourUtc` dropped from `packages/schema/src/user.ts`, the schedule stays 04:00 UTC (`.plan/07-kulapati-console.md`) |
| `KUL-16` | Org settings: teams and reminders                                            | done    | —        | `apps/web/src/console/SettingsPage.tsx` (`/kulapati/settings`), `model.ts` (`addTeam`), `firebase.ts` (`orgSettings`, `saveOrgSettings`); rule `match /config/org` with shape checks, tests in `firebase/rules/test/assignments-config.test.ts`; default from `firebase/seed/src/seed.ts` (`seedOrgConfig`, never overwrites) |
| `KUL-17` | Learners pick their team                                                     | done    | `KUL-16` | Home asks a learner with no team to pick one from `config/org.teams` (`apps/web/src/learn/TeamPrompt.tsx`, `LearnerData.orgTeams`/`setTeam`); the `users` rule accepts only a listed team or `null`, reading `config/org` only when the team changes (`firebase/rules/test/users.test.ts`). Changing it afterwards is not built |
| `KUL-18` | Org Pariksha KPIs and a true overdue count                                   | done    | —        | `stats/org.pariksha*` from `firebase/functions/src/analytics.ts` (`handleAttemptCreated`), `stores.ts` (`bumpAttemptStats`), `packages/schema/src/stats.ts`; `apps/web/src/console/OverviewPage.tsx`, `firebase.ts` (`overdueCount`: `count()`). Pending invites there: `KUL-27` |
| `KUL-19` | Needs attention, pending-invite strip, overview filters | done | — | `apps/web/src/console/NeedsAttention.tsx`, `model.ts` (`overdueEntries`, `failedTwice`, `pendingInvites`), `OverviewPage.tsx`, `firebase.ts` (`recentProgress`). Nudge and Resend use `remindLearners`. Failed-twice scans only the 100 most recent progress documents; filters narrow the lists, not the KPIs |
| `KUL-20` | Course analytics finish | done | — | `apps/web/src/console/CourseAnalyticsPage.tsx`, `model.ts` (`parikshaRows`, `WARN_BELOW_PERCENT`), `studio/ParikshaBuilderPage.tsx` (`?question=`): per-Pariksha table summed in the browser, warning below 70%, edit links. Left: `KUL-30` |
| `KUL-30` | Course analytics: median time to finish | done | — | `packages/schema/src/stats.ts` (`finishDaysHistogram`), `firebase/functions/src/analytics.ts` (`finishBucket`, `recountFromSource`), `stores.ts`, `apps/web/src/console/model.ts` (`medianDays`), `CourseAnalyticsPage.tsx` (median with the average beside it). Courses finished before this show a dash until the nightly roll-up fills the histogram |
| `KUL-31` | Bulk role dialog matches the Roles screen | done | — | `apps/web/src/console/LearnersPage.tsx` (`BulkRoleDialog`): independent Acharya and Kulapati choices (leave, add, remove); untouched roles are not sent, removing Acharya clears `grantedCourseIds`, own account skipped only when removing Kulapati |
| `KUL-32` | Learner roster backfill and renames | done | — | The daily roll-up adds missing roster entries and copies profile renames: `firebase/functions/src/analytics.ts` (`planRoster`, `runDailyRollup`), `stores.ts` (`firestoreRollupStore`); `.plan/09-analytics.md`. No Studio Analytics e2e step for the table |
| `KUL-21` | Daily roll-up repairs course counters                                        | done    | —        | `firebase/functions/src/analytics.ts` (`recountFromSource`, `runDailyRollup`), `stores.ts` (`firestoreRollupStore`). `weekly` cannot be rebuilt from source (`09`) |
| `KUL-22` | Roles screen polish | done | — | `apps/web/src/console/RolesPage.tsx` (real Learner count, Kulapatis list, Acharya and Kulapati as independent checkboxes, drafts grantable), `console/firebase.ts` (`allCourses`) |
| `KUL-23` | Audit log view finish | done | — | `apps/web/src/console/AuditPage.tsx` ("Load older entries", 50 at a time), `firebase.ts` (`auditPage`), `model.ts` (`auditDetail`), `firebase/functions/src/assign.ts` (assign entries record emails). Course targets still show ids |
| `KUL-24` | Email delivery | done | — | `firebase/functions/src/gmail.ts` (Gmail API sender behind `GmailPort`/`Mailer`; `createMailer` logs a warn and sends nothing without `GMAIL_CREDENTIALS`), `mail.ts` (`SITE_URL`-configurable links), `index.ts`; setup in `docs/operations.md`. The `mail` queue is retired. Live delivery waits on `OPS-25` |
| `KUL-25` | Acharyas see their learners | done | — | First slice: Studio Analytics lists learner names, progress and last active for an Acharya's own courses: `firebase/firestore.rules` (`courses/{id}/learners`, no client writes), `firebase/functions/src/progress.ts` and `stores.ts` (`recordLearner` on a first start), `apps/web/src/studio/AnalyticsTab.tsx`; `.plan/09-analytics.md`. Left: `KUL-32` |
| `KUL-26` | Learners counts and pending invites past the newest 500 assignments          | done    | —        | `apps/web/src/console/firebase.ts` (`openAssignments`), `LearnersPage.tsx`, `model.ts`; index `status`+`dueAt`                                                                       |
| `KUL-27` | Overview pending-invite count past the newest 500 assignments | done | — | `apps/web/src/console/OverviewPage.tsx` (Pending invites: distinct emails from `openAssignments`, same source as Learners); test in `apps/web/test/console-pages.test.tsx` |

## Vyasa Studio

Plan: `08-vyasa-studio.md`, `design-handoff/03-vyasa-studio.md`, M5.

| ID       | Item                                                                     | Status | Depends | Notes                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STU-01` | Courses list, create course, edit only granted courses                   | done   | —       | `apps/web/src/studio/StudioCoursesPage.tsx`, `NewCourseDialog.tsx`, `firebase/functions/src/courses.ts`                                                       |
| `STU-02` | Draft autosave with `rev` conflict check; publish, rollback, archive     | done   | —       | `apps/web/src/studio/useDraft.ts`, `firebase/functions/src/courses.ts`, `packages/schema/src/draft.ts`                                                        |
| `STU-03` | Structure editor: keyboard drag list, add, delete with learner count     | done   | —       | `apps/web/src/studio/StructureTab.tsx`, `packages/ui/src/DragList.tsx`                                                                                       |
| `STU-04` | Lesson editor: every block editor, toolbar, settings, publish validation | done   | —       | `apps/web/src/studio/LessonEditorPage.tsx`, `studio/blocks/`                                                                                                  |
| `STU-05` | Pariksha builder, question health, question bank, media library, preview | done   | —       | `apps/web/src/studio/ParikshaBuilderPage.tsx`, `QuestionBankPage.tsx`, `MediaPage.tsx`, `PreviewPage.tsx`                                                    |
| `STU-06` | Acharya names on courses | done | — | `packages/schema/src/course.ts` (`acharyaNames`, v2 migration in `migrations/steps.ts`), `firebase/functions/src/courses.ts`, `stores.ts` `applyCourseGrants`, `apps/web/src/studio/studioModel.ts` `acharyaSummary` |
| `STU-07` | Acharyas see every course                                                | done   | —       | `firebase/firestore.rules` (`courses/{id}` read: any Acharya; `drafts/`, `versions/` still the course's own), `apps/web/src/studio/firebase.ts` `listCourses` |
| `STU-08` | "Draft vN · saved just now" | done | — | `apps/web/src/studio/saveLabel.ts` (`useSaveLabel`: "Draft v7 · saved just now", refreshed every 30 s), `EditorBar.tsx`, `CourseEditorPage.tsx`, `useDraft.ts` (`savedAt`) |
| `STU-09` | Failed saves are kept; leaving with unsaved edits asks | done | — | `apps/web/src/studio/draftBackup.ts`, `UnsavedGuard.tsx`, `useDraft.ts` (failed save kept in localStorage, restore offered while `rev` matches; `useBlocker` saves first, asks only if the save fails). The backup holds the working copy, answer keys included, in the Acharya's own browser |
| `STU-10` | Learner counts in the publish dialog and on course cards | done | — | `apps/web/src/studio/PublishDialog.tsx` (removed lessons show completed counts), `StudioCoursesPage.tsx` (card "N learners"), `firebase.ts` (`learnersStarted`). Acharya read of `stats/course_{id}`: `STU-18` |
| `STU-18` | Acharya read of `stats/course_{id}` is tested | done | — | `firebase/rules/test/stats-audit-lists.test.ts` (`stats/{scope}`: Acharya of the course allowed on `stats/course_{id}`; other course, org doc, non-granted Acharya and learner denied) |
| `STU-11` | Preview uses the real learner screens | done | — | `apps/web/src/pariksha/QuestionFields.tsx` shared by Preview (`studio/PreviewPage.tsx`) and the learner Pariksha; letters A to H via `letterOf` in `pariksha/model.ts`; `QuizOptionLetter` in `packages/ui/src/QuizOption.tsx`. Preview shows every question in authored order (no draw or shuffle) on purpose |
| `STU-12` | Publishing an archived course | done | — | `apps/web/src/studio/PublishDialog.tsx` (warning Callout for an archived course), test in `apps/web/test/studio-editor.test.tsx` |
| `STU-13` | Structure editor polish | done | — | `apps/web/src/studio/StructureTab.tsx` (Rename on each item row), `courseEdit.ts` (`renameItem`), `LessonEditorPage.tsx` (rail lists Parikshas; "This lesson is empty.") |
| `STU-15` | Lesson editor extras | done | — | `apps/web/src/studio/blocks/VideoEditor.tsx` (16:9 preview), `LessonEditorPage.tsx` ("/" opens the palette), `ParikshaBuilderPage.tsx`, `questionEdit.ts` (`firstTryPercent`) |
| `STU-16` | CodeMirror for markdown and code | done | — | `apps/web/src/studio/blocks/CodeField.tsx`, `CodeMirrorView.tsx` (CodeMirror 6, MIT, own lazy chunk about 225 KB gzip; initial JS 187 of 320 KB). No Kotlin, Swift or Bash mode yet; "Highlight lines" not drawn |
| `STU-17` | Studio video Title and Caption inputs | done | — | `apps/web/src/studio/blocks/VideoEditor.tsx` (optional Title, max 200, and Caption, max 300; empty means absent), test in `apps/web/test/studio-block-editors.test.tsx` |

## Design system

Plan: `04-design-system.md`.

| ID      | Item                                                     | Status | Depends | Notes                                                                                                                          |
| ------- | -------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DS-01` | Every M1–M5 component, with tests and a recipe          | done   | —       | `packages/ui/src/`, `.claude/skills/gurukul-design/references/components.md`                                                   |
| `DS-02` | axe in component tests; tokens test                      | done   | —       | `packages/ui/test/axe.ts`, `packages/ui/test/tokens.test.ts`                                                                   |
| `DS-03` | `/__ui` component gallery | done | — | `apps/web/src/ui-gallery/UiGalleryPage.tsx`, `devRoutes()` in `routes.tsx` (dev builds only), axe test `apps/web/test/ui-gallery.test.tsx` |
| `DS-06` | Gallery: Sidebar, TopBar, VideoBlock, Certificate | done | — | `apps/web/src/ui-gallery/UiGalleryPage.tsx` (Sidebar, SidebarGroup, NavItem, TopBar, VideoBlock, a normal and a revoked long-name Certificate in size-capped frames), `ui-gallery.css`; axe-checked in `apps/web/test/ui-gallery.test.tsx` |
| `DS-04` | Shared icon set                                          | todo   | —       | `packages/ui/icons` does not exist; about twenty one-off inline SVGs move onto stroke icon components (`aria-hidden` by default) |
| `DS-05` | axe on the remaining page tests | done | — | `apps/web/test/ChangelogPage.test.tsx`, `apps/web/test/GlobalSearch.test.tsx` (`axeViolations` from `apps/web/test/axe.ts`) |

## Global search

Plan: `15-changelog-and-search.md` Global search.

| ID       | Item                                                         | Status | Depends  | Notes                                                                                                              |
| -------- | ------------------------------------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `SRC-01` | Pages by role from the session; sidebar from the same data; validator | done | — | `apps/web/src/navigation/`, `Shell.tsx`                                                                          |
| `SRC-02` | Learner navigation area | done | — | `apps/web/src/navigation/areas/learner.ts`; `platform.ts` keeps the changelog and `/verify/:id` |
| `SRC-03` | Courses and lessons in search                                | done   | —        | `apps/web/src/navigation/records.ts`, `GlobalSearch.tsx`, `Shell.tsx` (sources); loaded once on first open |
| `SRC-04` | People in search for Kulapatis                               | done   | `KUL-11` | `apps/web/src/navigation/records.ts` (`peopleLookup`: the console's `searchUsers`), `GlobalSearch.tsx` (`lookups`: debounced prefix, newest wins), `console/LearnersPage.tsx` (`?learner=` opens the drawer) |
| `SRC-05` | Draft courses in search for Acharyas                         | done   | —        | `apps/web/src/navigation/records.ts` (`editableCourseSource`: Vyasa Studio's `listCourses`, Acharyas and Kulapatis), `Shell.tsx`; opens `/studio/courses/<id>` |

## Platform, CI and operations

Plan: `01-architecture.md`, `02-data-model.md`, `10-testing-and-ci.md`, `11-deployment-and-cost.md`, M6.

| ID       | Item                                                                       | Status     | Depends  | Notes                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-01` | e2e for the three journeys, axe on four pages                              | done       | —        | `e2e/tests/`, `e2e/support/a11y.ts`. Journeys are shallow: `OPS-11`                                                                                         |
| `OPS-02` | Lighthouse CI on the built sign-in page; bundle budget                     | done       | —        | `.github/workflows/ci.yml`, `scripts/check-bundle-size.mjs`                                                                                                 |
| `OPS-03` | Weekly Firestore backup function                                           | done       | —        | `firebase/functions/src/backup.ts`, `docs/operations.md`                                                                                                     |
| `OPS-04` | User guides for learners, Kulapatis, Acharyas and operators                | done       | —        | `docs/`                                                                                                                                                     |
| `OPS-05` | Rules coverage gate | done | — | `npm run test:rules`: `firebase/rules/test/coverage-setup.ts` saves the emulator's report per test file, `scripts/check-rules-coverage.mjs` fails on any expression never evaluated (tests in `scripts/test/check-rules-coverage.test.mjs`) |
| `OPS-06` | Lighthouse on the preview URL | done | — | `.github/workflows/preview.yml` (Lighthouse step on the deployed preview URL), `lighthouserc.preview.json`. The `details_url` output of the hosting-deploy action is confirmed only by a real PR run |
| `OPS-07` | `onUserCreated` gets `maxInstances`                                        | done       | —        | `firebase/functions/src/index.ts` (`runWith({ maxInstances })` on the v1 trigger), `firebase/functions/test/index.test.ts` (asserts global and v1 options) |
| `OPS-08` | Envelope tests for every callable                                          | done       | —        | `firebase/functions/test/envelopes.test.ts`: success and failure bodies of all seven callables parse with `apiResponseSchema` |
| `OPS-09` | Progress rule checks what learners append | done | — | `firebase/firestore.rules` (`appendsAtMostOneItemId`: unchanged, or one new 1-80 character string id on the end, no duplicates), tests in `firebase/rules/test/courses-progress.test.ts` |
| `OPS-10` | Close the ESLint loopholes around callables                                | done       | —        | `eslint.config.js` bans `httpsCallableFromURL` and `https`/default imports of `firebase-functions`, `/v1`, `/v2` and the `/https` subpath outside `api/`; tests in `scripts/test/lint-rules.test.mjs` |
| `OPS-11` | Deeper e2e journeys | done | — | `e2e/tests/learner.spec.ts` (final Pariksha, certificate, `/verify`), `e2e/tests/studio.spec.ts` (publish v1, then in the catalogue), `e2e/support/emulators.ts` (`seedProgress`). Progress is seeded, not clicked through; a learner opening the just-published course is not covered |
| `OPS-12` | CI aggregator passes only when every job succeeded                         | done       | —        | `.github/workflows/ci.yml` (`ci` job: every `needs` result must be `success`)                                                                               |
| `OPS-13` | Dependency and docs hygiene                                                | done       | —        | `package.json` (`tsx`), `e2e/package.json` (`axe-core`), `CONTRIBUTING.md` links `docs/operations.md` for the bootstrap                                     |
| `OPS-14` | Trigger tests against the emulators | done | — | `firebase/functions/emulator-test/triggers.test.ts`, `vitest.emulator.config.ts`, `npm run test:triggers` (CI `rules` job, pre-push). Calls the exported triggers with `.run(event)`; `firebase-functions-test` does not install with firebase-admin 14. Covers `onProgressWritten` and `onAttemptCreated` only |
| `OPS-23` | Harden the flaky studio lesson editor test | done | — | `apps/web/test/setup.ts` (5 s `asyncUtilTimeout`), `apps/web/vite.config.ts` (15 s `testTimeout`): lazy app boot under full-suite load outran the 1 s `findBy` default |
| `OPS-15` | Firebase project setup                                                     | maintainer | —        | `11` First-time setup checklist: Blaze and the $1 budget with alerts, Firestore in asia-south1, Google provider, web app variables, both service accounts, branch protection |
| `OPS-16` | Backup bucket                                                              | maintainer | —        | Bucket with the 28-day lifecycle rule, `BACKUP_BUCKET` variable, IAM roles (`docs/operations.md`)                                                          |
| `OPS-17` | First Kulapati and the production seed                                     | maintainer | —        | `npm run grant-kulapati -- you@nonstopio.com`; `npm run seed -- --production`                                                                              |
| `OPS-26` | Set the real certificate signatory | maintainer | — | Production `config/org` has no `signatory`, so certificates fall back to the fictional default. A Kulapati saves the real one in Org settings before the first real certificate is issued |
| `OPS-18` | Custom domain | done | — | Repository variable `SITE_URL` feeds the web build (`VITE_SITE_URL`, certificate verify links) and the functions `.env` (emailed links); unset falls back to the current origin / `nonstop-gurukul.web.app`: `apps/web/src/certificates/pages.tsx`, `apps/web/.env.example`, `.github/workflows/deploy.yml`, `firebase/functions/src/mail.ts`; `11-deployment-and-cost.md`. Setting the variable is `OPS-27` |
| `OPS-19` | Licence holder | done | — | `LICENSE` names "NonStop io Technologies Pvt. Ltd." (question 10) |
| `OPS-20` | Launch: assign Git to everyone                                             | maintainer | `GIT-02` | M6 exit                                                                                                                                                     |
| `OPS-21` | Auth domain for the iOS redirect                                           | maintainer | —        | `VITE_FIREBASE_AUTH_DOMAIN` = `nonstop-gurukul.web.app` (GitHub variable) and its `/__/auth/handler` in the OAuth client's redirect URIs (`11` checklist step 4) |
| `OPS-22` | Load Firestore after sign-in; bundle budget back to 320 KB | done | — | `apps/web/src/firestore.ts` (the only importer of the Firestore SDK, a separate chunk), `lazy.ts` (`lazyPort`), `main.tsx` (loads it on first read), `auth/service.ts` (takes `watchProfile`); initial JS 181 KB gzip, budget 320 in `package.json` and `ci.yml` |
| `OPS-24` | DNS and Hosting custom domain for `gurukul.nonstopio.com` | maintainer | `OPS-18` | Add the Hosting custom domain and the DNS records; also the Firebase Auth authorised domain |
| `OPS-25` | Sender mailbox for email delivery | maintainer | — | `gurukul@nonstopio.com` mailbox and the service-account grant the Gmail API sender needs (`KUL-24`) |
| `OPS-27` | Set the `SITE_URL` repository variable | maintainer | `OPS-24` | After DNS is live, set repository variable `SITE_URL=https://gurukul.nonstopio.com`; production deploy then uses it (optionally flip the `mail.ts` fallback to the domain) |

## First course: Git

Plan: `14-first-course-git.md`.

| ID       | Item                                                                     | Status     | Depends | Notes                                                                                                                                         |
| -------- | ------------------------------------------------------------------------ | ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT-01` | Seed: 6 parvas, 22 lessons, 3 Parikshas (6/6/8), written lesson content  | done       | —       | `firebase/seed/src/git-course.ts`                                                                                                             |
| `GIT-02` | Record the videos                                                        | maintainer | —       | Real URLs and `durationSec` replace `TODO_RECORD_VIDEO`                                                                                       |
| `GIT-03` | Placeholder videos stop embedding a dead player                          | done | —       | `isPlaceholderVideo` in `packages/schema/src/media.ts`; `TrackedVideo.tsx` and `blocks.tsx` show "Video coming soon" |
| `GIT-04` | NonStop conventions and the `conflict-lab` repository                    | maintainer | —       | Branch naming, PR template, review expectations, release tagging replace the "Replace with NonStop's convention" callouts                     |
| `GIT-05` | Signatory and Acharya for Git | done | — | Signatory is `config/org.signatory` (name, role), edited in Org settings (`apps/web/src/console/SettingsPage.tsx`); the progress trigger stamps it on each certificate at issue (`firebase/functions/src/progress.ts`, `stores.ts`); removed from the course object and the Studio Certificate tab; rules in `firebase/firestore.rules`; seed default is the fictional Asha Example (`packages/schema/src/user.ts`). The Git Acharya is assigned at the production seed (`OPS-17`) |
| `GIT-06` | Seed matches the course outline                                          | done       | —       | `firebase/seed/src/git-course.ts`: Pariksha I and II cooldown 10; lesson minutes total 190 (3 h 10)                                               |

## Plan upkeep

| ID       | Item                                  | Status | Depends | Notes                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLN-01` | This tracker and the `pick-up-next` skill | done | —     | `.plan/tracker.md`, `scripts/tracker.mjs`, `.claude/skills/pick-up-next/`                                                                                                                                                                              |
| `PLN-02` | The plan matches what was built       | done   | —       | `.plan/01-architecture.md` (functions list, app folders), `02-data-model.md` (`counters`, `mail`, archived reads, update-only drafts), `03-auth-and-roles.md`, `08-vyasa-studio.md` (slug fixed at creation), `11-deployment-and-cost.md` (artifact policy step), `12-milestones.md` (M6 status), `13-open-questions.md` (questions 3, 8, 13) |
