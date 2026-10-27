# 12 · Milestones

Each milestone ends deployable, at 100% coverage, with the plan updated.
Sizes are rough, for one engineer with Claude Code.

## M0 · Foundations — done in the setup PR

Repo, npm workspaces, Claude rules and design skill, tokens + Button, CI
(quality, 100% coverage, rules on emulator, build, PR titles), deploy and
CodeQL workflows, Dependabot, open-source hygiene, the changelog and global search
(`15-changelog-and-search.md`), Claude hooks and skills, this plan and the screen-by-screen
design handoff (`design-handoff/`).

**Exit:** CI green on `main`; maintainer approves the plan.

## M1 · Sign-in, shell and schema (~1 week) — done

- `packages/schema`: Course, Progress, Assignment, Certificate, User schemas;
  progress-percent and item-state helpers; tests.
- Firebase init with emulator switch; Google sign-in; domain lock in rules;
  `useSession` with roles from claims; `RequireRole`.
- `onUserCreated`: profile + invite claiming. `setRoles` callable + bootstrap script.
- App shell: Sidebar (generated from the navigation metadata), TopBar with the search trigger,
  React Router for the three areas, not-allowed page. Global search uses the session's roles.
- UI components from the M1 list in `04-design-system.md`.
- Rules for `users`, `assignments` (read), `config`.

**Exit:** a NonStop account signs in and lands on an empty Home; a Gmail
account is refused; a Kulapati sees the console nav; rules tests cover every rule.

## M2 · Learner core (~2 weeks) — built; Pariksha items stay locked until M3

- Seed script: the Git course (from `14-first-course-git.md`) into the emulator and production.
- Home, Catalogue, Course overview, Lesson player with all block renderers and
  three layouts, outline rail, mark complete, resume.
- Progress rules (owner append-only) and the progress trigger (percent, stats counters).
- Functions join `deploy.yml`.

**Exit:** a learner can take every Git lesson end to end and resume on another device.

## M3 · Parikshas and certificates (~1.5 weeks) — built

- `checkAnswer`, `gradeAttempt` with cooldowns; Pariksha and Result screens.
- Sequential unlocking.
- Certificate issue trigger, certificate page + print PDF, public `/verify/:id`, LinkedIn link.
- Completion screen.

**Exit:** a learner earns a verifiable Git certificate; answer keys never reach the browser (asserted by a test).

## M4 · Kulapati console (~2 weeks) — built; email sending waits on open question 4

- Learners table (with pending invites), filters, pagination, bulk actions.
- Assign flow: search, paste, CSV, team; client-side preview; `assignCourses`.
- Email notifications and daily reminders (option chosen in open questions).
- Roles & access screen; Sanjaya overview; course analytics; CSV export.

**Exit:** a Kulapati assigns Git to 20 emails (5 not yet signed in) and sees them appear as they sign in.

## M5 · Vyasa Studio (~2.5 weeks)

- Courses list with grants; course editor with keyboard drag list; lesson
  editor with every block editor and validation; Pariksha builder.
- Drafts with autosave and conflict check; `publishCourse`; versions and rollback; preview as learner.
- Audit log; question bank.

**Exit:** an Acharya builds and publishes a second course without engineering help.

## M6 · Hardening and launch (~1 week)

- Playwright e2e for the three journeys; axe scans; Lighthouse CI.
- Rules coverage gate; budget and alerts verified; backups (scheduled Firestore export — needs a Storage bucket, so decide or skip).
- Docs: user guide for Kulapatis and Acharyas.
- Launch: assign Git to everyone.

**Total:** about 10 weeks of focused work.
