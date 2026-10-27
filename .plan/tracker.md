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
| Foundations                   | 7    | 0    | 0       | 0          |
| Sign-in, roles and shell      | 7    | 4    | 0       | 0          |
| Learner experience            | 7    | 9    | 0       | 0          |
| Parikshas and certificates    | 5    | 4    | 1       | 0          |
| Kulapati console and Sanjaya  | 9    | 14   | 2       | 0          |
| Vyasa Studio                  | 5    | 10   | 0       | 0          |
| Design system                 | 2    | 3    | 0       | 0          |
| Global search                 | 1    | 4    | 0       | 0          |
| Platform, CI and operations   | 5    | 10   | 2       | 5          |
| First course: Git             | 1    | 2    | 1       | 2          |
| Plan upkeep                   | 2    | 0    | 0       | 0          |
| **Total**                     | 51   | 60   | 6       | 7          |

## Pick order

Correctness and cost first, then what learners meet, then the console and Studio, then polish.
Blocked items wait at the end until the maintainer answers their question.

1. `LRN-09` — `video90` and `requireVideoWatch` are real
2. `KUL-15` — reminders: one per person per day, mandatory only
3. `OPS-09` — progress rule checks what learners append
4. `OPS-05` — rules coverage gate
5. `OPS-12` — CI aggregator treats a skipped job as a failure
6. `OPS-13` — dependency and docs hygiene
7. `OPS-22` — load Firestore after sign-in; bundle budget back to 320 KB
8. `OPS-08` — envelope tests for every callable
9. `OPS-10` — close the ESLint loopholes around callables
10. `GIT-03` — placeholder videos stop embedding a dead player
11. `GIT-06` — seed matches the course outline
12. `PRK-06` — Pariksha answers survive a reload
13. `PRK-07` — Result page survives a reload
14. `SHL-01` — skip link, focus on route change, retry on load errors
15. `SHL-02` — focused shell for lesson, Pariksha and result
16. `KUL-10` — Learners table: pending invites and filters that combine
17. `KUL-11` — people search by name
18. `KUL-12` — learner drawer completeness
19. `KUL-16` — org settings: teams and reminders
20. `KUL-17` — learners pick their team
21. `STU-07` — Acharyas see every course
22. `STU-06` — Acharya names on courses
23. `LRN-14` — Retired and "New lessons added" states
24. `PRK-09` — revocation date on certificates
25. `KUL-18` — org Pariksha KPIs and a true overdue count
26. `KUL-21` — daily roll-up repairs course counters
27. `SRC-02` — learner navigation area
28. `SRC-03` — courses and lessons in search
29. `SRC-04` — people in search for Kulapatis
30. `SRC-05` — draft courses in search for Acharyas
31. `STU-11` — preview uses the real learner screens
32. `STU-09` — failed saves are kept; leaving with unsaved edits asks
33. `STU-08` — "Draft vN · saved just now"
34. `STU-10` — learner counts in the publish dialog and on course cards
35. `STU-12` — publishing an archived course
36. `STU-13` — structure editor polish
37. `LRN-12` — course overview to the handoff
38. `LRN-13` — Home to the handoff
39. `LRN-11` — outline rail grouped by parva
40. `LRN-10` — split layout
41. `LRN-15` — block renderer polish
42. `LRN-16` — check blocks reveal the right option
43. `LRN-17` — keyboard shortcuts dialog
44. `PRK-08` — completion screen to the handoff
45. `AUTH-08` — sign-in screen to the handoff
46. `SHL-03` — handoff breakpoints and the menu button
47. `KUL-13` — bulk role change and select all
48. `KUL-14` — Assign screen finish
49. `KUL-19` — Needs attention, pending-invite strip, overview filters
50. `KUL-20` — course analytics finish
51. `KUL-22` — Roles screen polish
52. `KUL-23` — audit log view finish
53. `DS-05` — axe on the remaining page tests
54. `DS-04` — shared icon set
55. `DS-03` — `/__ui` component gallery
56. `STU-15` — lesson editor extras
57. `STU-16` — CodeMirror for markdown and code
58. `OPS-11` — deeper e2e journeys
59. `OPS-06` — Lighthouse on the preview URL
60. `OPS-14` — trigger tests against the emulators
61. `KUL-24` — email delivery (blocked: question 4)
62. `KUL-25` — Acharyas see their learners (blocked: question 7)
63. `PRK-10` — tell a learner their certificate was revoked (blocked)
64. `OPS-18` — custom domain (blocked: question 6)
65. `OPS-19` — licence holder (blocked: question 10)
66. `GIT-05` — signatory and Acharya for Git (blocked: question 5)

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
| `AUTH-08` | Sign-in screen to the handoff                                            | todo   | —       | Two-pane hero, benefits, invite callout, footnote (`design-handoff/01-learner.md` §01). Today: one column, logo, title, button                                                               |
| `SHL-01`  | Skip link, focus on route change, retry on load errors                   | todo   | —       | "Skip to content"; focus the `h1` and announce the page (`aria-live`) on navigation; a Retry button on the load-error callout (`apps/web/src/learn/ui.tsx`). `00-shared-patterns.md` Accessibility |
| `SHL-02`  | Focused shell for lesson, Pariksha and result                            | todo   | —       | Those routes leave `<Shell>` for a TopBar-only layout; one `h1` per page (lesson page has two today); "44% · 10 / 22" caption                                                                 |
| `SHL-03`  | Handoff breakpoints and the menu button                                  | todo   | —       | Sidebar stacks below 808px and becomes a menu button below 560px; today 760px/900px and no menu button                                                                                        |

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
| `LRN-09` | `video90` and `requireVideoWatch` are real                               | todo   | —        | Today `video90` is a self-attest checkbox and `rules.requireVideoWatch` is read only by Studio. Watch progress from the YouTube IFrame API and Loom events; disabled-button tooltip                              |
| `LRN-10` | Split layout                                                             | todo   | —        | No `.article--split` CSS, so split renders as stacked. Sticky 55% video at ≥1100px                                                                                                                                |
| `LRN-11` | Outline rail grouped by parva                                            | todo   | —        | Collapse all but the current parva, state icons; "PARVA n · LESSON x OF y" kicker with type and duration chips (`kindLabel`, `minutes`); footer labels with item titles                                          |
| `LRN-12` | Course overview to the handoff                                           | todo   | `STU-06` | Render `description` markdown; due date; Acharya card; hero band; "Preview certificate"; locked-row tooltip; remember expanded parvas; link to the certificate once finished                                    |
| `LRN-13` | Home to the handoff                                                      | todo   | —        | Status line; continue card cover, chips, assigned-by, "Up next"; 48px cover tiles; "Show all" past 10; recent-activity card                                                                                      |
| `LRN-14` | Retired and "New lessons added" states                                   | todo   | —        | "Retired" on Home rows and in the player; `gradeAttempt` refuses archived courses, so a learner part-way through can never finish; "New lessons added" when completed and percent < 100 (`05` Edge cases)       |
| `LRN-15` | Block renderer polish                                                    | todo   | —        | Video title and caption from the block; respect `code.copy = false`; file-row icon                                                                                                                                |
| `LRN-16` | Check blocks reveal the right option                                     | todo   | —        | The `check` block has no correct-option field, so reveal shows only the explanation. Changes the course object: `02-data-model.md`, `schemaVersion`, migration and the Studio editor together                  |
| `LRN-17` | Keyboard shortcuts dialog                                                | todo   | —        | `?` opens a dialog listing J/K and the Pariksha keys                                                                                                                                                              |

## Parikshas and certificates

Plan: `06-pariksha-and-certificates.md`, `design-handoff/01-learner.md` §05–§08, M3.

| ID       | Item                                                                                       | Status  | Depends | Notes                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRK-01` | `checkAnswer` and `gradeAttempt`: cooldown, best score, reveal modes, random subset, shuffle | done  | —       | `firebase/functions/src/grading.ts`, `apps/web/src/pariksha/model.ts`                                                                                                     |
| `PRK-02` | Pariksha and Result screens                                                                | done    | —       | `apps/web/src/pariksha/`                                                                                                                                                  |
| `PRK-03` | Certificate issue, `NSG-…` id from a counter, certificate page, print, LinkedIn, `/verify`, revoke | done | — | `firebase/functions/src/certificates.ts`, `progress.ts`, `apps/web/src/certificates/pages.tsx`                                                                         |
| `PRK-04` | Completion screen (first cut)                                                              | done    | —       | `apps/web/src/certificates/pages.tsx`                                                                                                                                     |
| `PRK-05` | Sequential unlocking follows the plan and the server enforces it                           | done    | —       | `packages/schema/src/progress.ts` (`isParvaPassed`, `itemStates`), `firebase/functions/src/grading.ts` (`checkUnlocked`, `PRK_1003`). Lesson completions in a locked parva are still not refused by the rules |
| `PRK-06` | Pariksha answers survive a reload                                                          | todo    | —       | The banner says progress is saved after every answer; nothing is saved until Finish. Persist per answer; exit confirmation; Enter checks then advances; lock option clicks while checking; name the right letter |
| `PRK-07` | Result page survives a reload                                                              | todo    | —       | Review and revisit links exist only in router state; read the latest attempt. "Continue to Parva n", "Revisit lesson: {title}", a live cooldown countdown               |
| `PRK-08` | Completion screen to the handoff                                                           | todo    | —       | "Add to LinkedIn" (missing here), time invested, certificate thumbnail, "Up next", chrome background and enter animation                                                  |
| `PRK-09` | Revocation date on certificates                                                            | todo    | —       | Store `revokedAt` in `revokeCertificate`; `/verify` says "Revoked on …"                                                                                                   |
| `PRK-10` | Tell a learner their certificate was revoked                                               | blocked | —       | Open question in `06-pariksha-and-certificates.md`; also needs email (`KUL-24`)                                                                                           |

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
| `KUL-10` | Learners table: pending invites and filters that combine                     | todo    | —        | "All" omits pending invites although its count includes them; search, team, course, role and tab do not compose; counts stop at the newest 500 assignments; 250 ms debounce          |
| `KUL-11` | People search by name                                                        | todo    | —        | Email-prefix only today, in Learners, Assign and the grant dialog; a lower-cased name field on `users`; ignore out-of-order responses                                               |
| `KUL-12` | Learner drawer completeness                                                  | todo    | —        | Assigned-but-unstarted courses with due dates; attempt history from `attempts`; Pariksha titles, not ids; pending-invite drawers; confirm before revoking                           |
| `KUL-13` | Bulk role change and select all                                              | todo    | —        | "Change role" is only a link today; "Select all N" across pages                                                                                                                      |
| `KUL-14` | Assign screen finish                                                         | todo    | —        | Lesson counts, CSV drop zone, team member count; toast counts people, not pairs; land on Learners filtered by course; partial-failure list with retry; per-course preview matches the server |
| `KUL-15` | Reminders: one per person per day, mandatory only                            | todo    | —        | The cap is per assignment and `mandatory` is ignored (`07` Email notifications). Honour `config/org.reminders.hourUtc` or drop it                                                   |
| `KUL-16` | Org settings: teams and reminders                                            | todo    | —        | Nothing writes `config/org`, so the team filter and "whole team" are empty. Kulapati screen for teams and reminders on/off; seed a default; narrow the `config` rule to `org` with shape validation and tests |
| `KUL-17` | Learners pick their team                                                     | todo    | `KUL-16` | One-time prompt or profile setting writing `users/{uid}.team` from `config/org.teams` (`13-open-questions.md` question 8)                                                          |
| `KUL-18` | Org Pariksha KPIs and a true overdue count                                   | todo    | —        | `stats/org` has no Pariksha fields (`09` table: average score, first-try pass rate); overdue is counted from 500 loaded rows, not a `count()` aggregation                          |
| `KUL-19` | Needs attention, pending-invite strip, overview filters                      | todo    | —        | Overdue and failed-twice lists (`limit(5)`) with Nudge and Reset; pending invites with Resend; date range and team filters                                                         |
| `KUL-20` | Course analytics finish                                                      | todo    | —        | Per-Pariksha counters and table; median time to finish (mean today); warning colour only below 70%; "Edit question" and "Edit in Vyasa Studio" links                              |
| `KUL-21` | Daily roll-up repairs course counters                                        | todo    | —        | Only four org counters are recomputed; course counters, org started/completed and `weekly` never are (`09` How it is counted)                                                      |
| `KUL-22` | Roles screen polish                                                          | todo    | —        | Real Shishya count; Kulapati list; keep Acharya and Kulapati together; grant unpublished courses                                                                                    |
| `KUL-23` | Audit log view finish                                                        | todo    | —        | Paging past 100, a detail column, names instead of uids; `assign` entries record who was assigned                                                                                   |
| `KUL-24` | Email delivery                                                               | blocked | —        | Question 4: the code queues for the Trigger Email extension, the plan recommends the Gmail API. Then: sender, `from`/`replyTo`, HTML template, configurable site URL              |
| `KUL-25` | Acharyas see their learners                                                  | blocked | —        | Question 7. Course analytics is Kulapati-only; names need a rules change                                                                                                            |

## Vyasa Studio

Plan: `08-vyasa-studio.md`, `design-handoff/03-vyasa-studio.md`, M5.

| ID       | Item                                                                     | Status | Depends | Notes                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STU-01` | Courses list, create course, edit only granted courses                   | done   | —       | `apps/web/src/studio/StudioCoursesPage.tsx`, `NewCourseDialog.tsx`, `firebase/functions/src/courses.ts`                                                       |
| `STU-02` | Draft autosave with `rev` conflict check; publish, rollback, archive     | done   | —       | `apps/web/src/studio/useDraft.ts`, `firebase/functions/src/courses.ts`, `packages/schema/src/draft.ts`                                                        |
| `STU-03` | Structure editor: keyboard drag list, add, delete with learner count     | done   | —       | `apps/web/src/studio/StructureTab.tsx`, `packages/ui/src/DragList.tsx`                                                                                       |
| `STU-04` | Lesson editor: every block editor, toolbar, settings, publish validation | done   | —       | `apps/web/src/studio/LessonEditorPage.tsx`, `studio/blocks/`                                                                                                  |
| `STU-05` | Pariksha builder, question health, question bank, media library, preview | done   | —       | `apps/web/src/studio/ParikshaBuilderPage.tsx`, `QuestionBankPage.tsx`, `MediaPage.tsx`, `PreviewPage.tsx`                                                    |
| `STU-06` | Acharya names on courses                                                 | todo   | —       | "View only — Acharya: …" has no name and the access list shows uids, because `users` is private. Store names on the course; `02-data-model.md` changes with it |
| `STU-07` | Acharyas see every course                                                | todo   | —       | Another Acharya's never-published course is invisible, and rules forbid it (`08` Who can do what). Widen the course read for Acharyas, keep drafts restricted |
| `STU-08` | "Draft vN · saved just now"                                              | todo   | —       | Today "Saved" / "Saving…"; relative time from the draft's `updatedAt`                                                                                         |
| `STU-09` | Failed saves are kept; leaving with unsaved edits asks                   | todo   | —       | Keep a failed save locally and offer to restore it; block in-app navigation while dirty                                                                       |
| `STU-10` | Learner counts in the publish dialog and on course cards                 | todo   | —       | Removed items show no completion count at publish; cards show no learner count                                                                                |
| `STU-11` | Preview uses the real learner screens                                    | todo   | —       | `PreviewPage` copies the player and grades with letters A–D only, though questions can have six options                                                      |
| `STU-12` | Publishing an archived course                                            | todo   | —       | Publishing silently un-archives it; warn in the publish dialog, with a test                                                                                  |
| `STU-13` | Structure editor polish                                                  | todo   | —       | Rename lessons and Parikshas inline; list Parikshas in the lesson rail; show "This lesson is empty" in the lesson editor                                      |
| `STU-15` | Lesson editor extras                                                     | todo   | —       | 16:9 video preview; "/" opens the block palette; first-try percentage in the question list                                                                   |
| `STU-16` | CodeMirror for markdown and code                                         | todo   | —       | Plain textareas today (`design-handoff/03-vyasa-studio.md` §16). Check the licence and the bundle budget                                                     |

## Design system

Plan: `04-design-system.md`.

| ID      | Item                                                     | Status | Depends | Notes                                                                                                                          |
| ------- | -------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DS-01` | Every M1–M5 component, with tests and a recipe          | done   | —       | `packages/ui/src/`, `.claude/skills/gurukul-design/references/components.md`                                                   |
| `DS-02` | axe in component tests; tokens test                      | done   | —       | `packages/ui/test/axe.ts`, `packages/ui/test/tokens.test.ts`                                                                   |
| `DS-03` | `/__ui` component gallery                                | todo   | —       | Development builds only, every variant and state, an axe smoke test; not in production or the navigation validator             |
| `DS-04` | Shared icon set                                          | todo   | —       | `packages/ui/icons` does not exist; about twenty one-off inline SVGs move onto stroke icon components (`aria-hidden` by default) |
| `DS-05` | axe on the remaining page tests                          | todo   | —       | `ChangelogPage.test.tsx` and `GlobalSearch.test.tsx` (palette open)                                                            |

## Global search

Plan: `15-changelog-and-search.md` Global search.

| ID       | Item                                                         | Status | Depends  | Notes                                                                                                              |
| -------- | ------------------------------------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `SRC-01` | Pages by role from the session; sidebar from the same data; validator | done | — | `apps/web/src/navigation/`, `Shell.tsx`                                                                          |
| `SRC-02` | Learner navigation area                                      | todo   | —        | Learner pages sit in `areas/platform.ts`; move them to `areas/learner.ts`; drop the stale "until M1" notes        |
| `SRC-03` | Courses and lessons in search                                | todo   | —        | From published courses the learner can already read, client-side (M2 row)                                        |
| `SRC-04` | People in search for Kulapatis                               | todo   | `KUL-11` | By name or email, opening the learner drawer (M4 row)                                                             |
| `SRC-05` | Draft courses in search for Acharyas                         | todo   | —        | The courses they can edit, opening the course editor (M5 row)                                                     |

## Platform, CI and operations

Plan: `01-architecture.md`, `02-data-model.md`, `10-testing-and-ci.md`, `11-deployment-and-cost.md`, M6.

| ID       | Item                                                                       | Status     | Depends  | Notes                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-01` | e2e for the three journeys, axe on four pages                              | done       | —        | `e2e/tests/`, `e2e/support/a11y.ts`. Journeys are shallow: `OPS-11`                                                                                         |
| `OPS-02` | Lighthouse CI on the built sign-in page; bundle budget                     | done       | —        | `.github/workflows/ci.yml`, `scripts/check-bundle-size.mjs`                                                                                                 |
| `OPS-03` | Weekly Firestore backup function                                           | done       | —        | `firebase/functions/src/backup.ts`, `docs/operations.md`                                                                                                     |
| `OPS-04` | User guides for learners, Kulapatis, Acharyas and operators                | done       | —        | `docs/`                                                                                                                                                     |
| `OPS-05` | Rules coverage gate                                                        | todo       | —        | A script reads the emulator's rules coverage report after `test:rules` and fails on any expression never evaluated (`10` Layers)                           |
| `OPS-06` | Lighthouse on the preview URL                                              | todo       | —        | `preview.yml` has no Lighthouse step (`10` CI)                                                                                                              |
| `OPS-07` | `onUserCreated` gets `maxInstances`                                        | done       | —        | `firebase/functions/src/index.ts` (`runWith({ maxInstances })` on the v1 trigger), `firebase/functions/test/index.test.ts` (asserts global and v1 options) |
| `OPS-08` | Envelope tests for every callable                                          | todo       | —        | Success and failure bodies parse with `apiResponseSchema` for setRoles, checkAnswer, gradeAttempt, revokeCertificate, assignCourses, resetCooldown, remindLearners |
| `OPS-09` | Progress rule checks what learners append                                  | todo       | —        | `completedItemIds` entries are strings and grow by a bounded number per write (`03` Rules outline: "arrayUnion of known ids"), with allow and deny tests   |
| `OPS-10` | Close the ESLint loopholes around callables                                | todo       | —        | `httpsCallableFromURL`, and `https` namespace access on `firebase-functions`/`v1`/`v2`, are not banned; extend `scripts/test/lint-rules.test.mjs`          |
| `OPS-11` | Deeper e2e journeys                                                        | todo       | —        | Learner: Pariksha, certificate, `/verify`. Acharya: publish, then the course is in the catalogue                                                           |
| `OPS-12` | CI aggregator treats a skipped job as a failure                            | todo       | —        | `ci` passes when a needed job is skipped; require `success`                                                                                                 |
| `OPS-13` | Dependency and docs hygiene                                                | todo       | —        | `tsx` in root devDependencies; `axe-core` in `e2e`; CONTRIBUTING points at the bootstrap in `docs/operations.md` (`03` Bootstrap)                          |
| `OPS-14` | Trigger tests against the emulators                                        | todo       | —        | `10` Layers names `firebase-functions-test`; today triggers are tested with mocks only                                                                     |
| `OPS-15` | Firebase project setup                                                     | maintainer | —        | `11` First-time setup checklist: Blaze and the $1 budget with alerts, Firestore in asia-south1, Google provider, web app variables, both service accounts, branch protection |
| `OPS-16` | Backup bucket                                                              | maintainer | —        | Bucket with the 28-day lifecycle rule, `BACKUP_BUCKET` variable, IAM roles (`docs/operations.md`)                                                          |
| `OPS-17` | First Kulapati and the production seed                                     | maintainer | —        | `npm run grant-kulapati -- you@nonstopio.com`; `npm run seed -- --production`                                                                              |
| `OPS-18` | Custom domain                                                              | blocked    | —        | Question 6. Also the hard-coded site URL in emails (`firebase/functions/src/mail.ts`)                                                                      |
| `OPS-19` | Licence holder                                                             | blocked    | —        | Question 10: confirm the legal entity in `LICENSE`                                                                                                          |
| `OPS-20` | Launch: assign Git to everyone                                             | maintainer | `GIT-02` | M6 exit                                                                                                                                                     |
| `OPS-21` | Auth domain for the iOS redirect                                           | maintainer | —        | `VITE_FIREBASE_AUTH_DOMAIN` = `nonstop-gurukul.web.app` (GitHub variable) and its `/__/auth/handler` in the OAuth client's redirect URIs (`11` checklist step 4) |
| `OPS-22` | Load Firestore after sign-in; bundle budget back to 320 KB                 | todo       | —        | Firestore is about 140 KB of the 335 KB initial JS; the persistent cache pushed it over 320, so the budget is 340 for now (`10` CI). Touches `main.tsx`, `App.tsx`, `auth/service.ts` and the data ports |

## First course: Git

Plan: `14-first-course-git.md`.

| ID       | Item                                                                     | Status     | Depends | Notes                                                                                                                                         |
| -------- | ------------------------------------------------------------------------ | ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT-01` | Seed: 6 parvas, 22 lessons, 3 Parikshas (6/6/8), written lesson content  | done       | —       | `firebase/seed/src/git-course.ts`                                                                                                             |
| `GIT-02` | Record the videos                                                        | maintainer | —       | Real URLs and `durationSec` replace `TODO_RECORD_VIDEO`                                                                                       |
| `GIT-03` | Placeholder videos stop embedding a dead player                          | todo       | —       | The placeholder passes the YouTube id check, so learners see a broken iframe. Leave the block out or show "Video coming soon" until `GIT-02` |
| `GIT-04` | NonStop conventions and the `conflict-lab` repository                    | maintainer | —       | Branch naming, PR template, review expectations, release tagging replace the "Replace with NonStop's convention" callouts                     |
| `GIT-05` | Signatory and Acharya for Git                                            | blocked    | —       | Question 5; the seed says "The Kulapati" and has no Acharya                                                                                   |
| `GIT-06` | Seed matches the course outline                                          | todo       | —       | Pariksha I and II cooldown 10 (0 today); lesson minutes add up to about 3 h 10 (183 min today)                                               |

## Plan upkeep

| ID       | Item                                  | Status | Depends | Notes                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLN-01` | This tracker and the `pick-up-next` skill | done | —     | `.plan/tracker.md`, `scripts/tracker.mjs`, `.claude/skills/pick-up-next/`                                                                                                                                                                              |
| `PLN-02` | The plan matches what was built       | done   | —       | `.plan/01-architecture.md` (functions list, app folders), `02-data-model.md` (`counters`, `mail`, archived reads, update-only drafts), `03-auth-and-roles.md`, `08-vyasa-studio.md` (slug fixed at creation), `11-deployment-and-cost.md` (artifact policy step), `12-milestones.md` (M6 status), `13-open-questions.md` (questions 3, 8, 13) |
