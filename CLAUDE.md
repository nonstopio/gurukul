# Working on Gurukul

Gurukul is NonStop io's open-source learning platform (NonStop Academy):
Google sign-in, courses made of parvas and lessons, Pariksha checkpoints,
certificates, a Kulapati (admin) console and Vyasa Studio for Acharyas
(educators). This is the contributor contract for agents working in this
repository. Read the nearest nested `CLAUDE.md` before editing `apps/`,
`packages/` or `firebase/`.

## Repository map

| Path                                                 | Responsibility                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/`                                          | The React + Vite app: learner, Kulapati console, Vyasa Studio. Deployed to Firebase Hosting                                                                                                                                                                                                                                                  |
| `apps/web/src/changelog/`                            | The changelog: one file per entry, releases derived from git tags. Rendered at `/changelog`                                                                                                                                                                                                                                                  |
| `apps/web/src/navigation/`                           | Global search (⌘K / Ctrl-K): per-area metadata, matcher, validator                                                                                                                                                                                                                                                                           |
| `packages/ui/`                                       | Design system: `tokens.css`, `Button`, `CommandPalette`                                                                                                                                                                                                                                                                                      |
| `packages/schema/`                                   | The course object and every other Firestore shape, as zod schemas shared by web and functions                                                                                                                                                                                                                                                |
| `firebase/firestore.rules`, `firestore.indexes.json` | Security rules and indexes, deployed by CI                                                                                                                                                                                                                                                                                                   |
| `firebase/rules/`                                    | Rules tests against the Firestore emulator                                                                                                                                                                                                                                                                                                   |
| `firebase/functions/`                                | Cloud Functions (2nd gen): invite claiming, grading, certificates, role grants                                                                                                                                                                                                                                                               |
| `.claude/rules/`                                     | Path-scoped rules: coverage, Firestore rules, course object, design, cost, open source, changelog entries, navigation, Claude config, API responses, logging, end-to-end before push                                                                                                                                                         |
| `.claude/skills/`                                    | `gurukul-design` (read before any UI change), `writing-changelog-entries`, `updating-claude-md` (CLAUDE.md, rules and skills), `writing-commit-messages`, `writing-logs`, `pick-up-next` (one tracker item, one PR)                                                                                                                          |
| `.claude/hooks/`                                     | Node hooks, tested in `hooks/test/`: `claude-md-nudge` (names the CLAUDE.md, rules and skills governing an edited file), `changelog-nudge`, `navigation-nudge`, `api-response-nudge`, `logging-nudge`, `prod-guard` (asks before firebase CLI against production), `secret-write-guard` (asks before writing a secret into this public repo) |
| `.claude/settings.json`                              | Hook registration, permission denies, and the `ponytail` and `firebase` plugins (enabled for every contributor by the maintainer's choice)                                                                                                                                                                                                   |
| `.husky/`, `commitlint.config.mjs`                   | Git hooks: `pre-commit` (changelog names, lint-staged), `commit-msg` (commitlint), `pre-push` (`scripts/pre-push.sh`). Installed by `npm ci`                                                                                                                                                                                                 |
| `scripts/`                                           | `changelog-new.sh`, `check-changelog-names.sh`, `check-rules-coverage.mjs` (every rules expression evaluated), `pre-push.sh`, `pushed-files.sh`, `tracker.mjs` (`.plan/tracker.md` status and check); tested in `scripts/test/`                                                                                                              |
| `.plan/`                                             | The reviewed product and engineering plan. Code follows the plan; change the plan first. `tracker.md` is its status, item by item                                                                                                                                                                                                            |
| `.github/`                                           | CI, PR title, preview and production deploy, CodeQL, Dependabot, PR and issue templates                                                                                                                                                                                                                                                      |

## The plan comes first

`.plan/` is the source of truth for scope, data model and milestones. A change
that alters scope, the course object, roles or cost assumptions updates the
relevant `.plan/*.md` in the same PR. Do not build what the plan does not
describe; propose a plan change instead.

`.plan/tracker.md` says what is done and what is left. A PR that finishes, splits or blocks an item
updates its row in the same PR; `npm run -s tracker -- --check` keeps the file consistent. With no
other task, take the next item with the `pick-up-next` skill.

## Changelog — an entry with every change someone would notice

**One file in `apps/web/src/changelog/entries/`, in the same commit as the change.**
`npm run changelog:new -- "a few words"` names it (`YYYY-MM-DD-HHMMSS-slug.ts`, India time). One
per change a learner, Acharya or Kulapati would notice, not one per commit; none for tooling,
tests or refactors nobody can see. Write the **why**, not the title again. Never write a version:
releases come from the `release-*` tag each production deploy pushes. Skill:
`writing-changelog-entries`.

## Global search — every page is classified

**A new, renamed or removed page edits its area in `apps/web/src/navigation/areas/` in the same
change**, and `npm run validate:navigation` passes. Search only ever offers pages that exist and
that the person may open. Details: `apps/web/src/navigation/CLAUDE.md`.

## API responses — one shape, no exceptions

**Every callable function returns the `ApiResponse` envelope from `@gurukul/schema` — success and
failure — and fails with a code from `ERROR_CODES`.** Only the wrapper in
`firebase/functions/src/api/` builds responses or throws `HttpsError`; the browser calls functions only
through `apps/web/src/api/`. Never return an ad-hoc object, never 200 on failure, never raw exception
text. Contract: `.plan/16-api-contract.md`; rule: `.claude/rules/api-responses.md`. ESLint enforces it.

## Logging — structured, masked, once

**Every log statement is `log.<level>('Constant event', { fields })` through the one `log` helper.**
No interpolated messages, no `console.*`, no personal data or secrets at INFO and above, no answer
keys at any level; an error is logged once, by the API wrapper. Standard: `.plan/17-logging.md`;
skill: `writing-logs`; rule: `.claude/rules/logging.md`. ESLint enforces the form.

## Keeping the notes true

After an edit, the `claude-md-nudge` hook names the CLAUDE.md, rules and skills that govern the
file. If the change made a claim in them wrong, fix it in the same change; the `updating-claude-md`
skill decides where a note belongs, and most edits need none. A new rule, skill or hook adds a row
to the map above.

## Git hooks

`npm ci` installs them (`prepare` → husky). `pre-commit` checks changelog entry names and lints
and formats the staged files; `commit-msg` runs commitlint; `pre-push` runs typecheck, the
navigation validator, the hook tests when hooks changed, 100% coverage for each workspace the
push touches, and the CI jobs `check` leaves out when the push touches what they cover: the
end-to-end specs, the rules tests and the bundle budget (`scripts/pre-push.sh` lists the paths; it
refuses a push that needs them on a machine without Java 21). Never use `--no-verify` to get past
one; if a hook cannot run, say so. Check they are on with `git config core.hooksPath` (husky prints
`.husky/_`).

## Required checks

1. `npm run check` from the root: lint, format, typecheck, navigation validator, hook and
   script tests, 100% coverage in every workspace, build, bundle budget. CI also runs the
   emulator jobs `check` skips, so a change to the app, UI, schema, functions, rules or seed runs
   `npm run e2e` before pushing (`.claude/rules/end-to-end.md`); the pre-push hook runs it for you. The `ci` and `pr-title` checks gate merges.
2. **100% coverage is mandatory.** Lines, branches, functions and statements,
   in every workspace. See `.claude/rules/coverage.md`. Never lower a threshold,
   exclude a file or add an ignore comment to pass.
3. Rules changes: `npm run test:rules` (Firestore emulator, needs Java 21), with
   an allowed and a denied test for every `allow`. See `.claude/rules/firestore-rules.md`.
4. UI changes follow `.claude/skills/gurukul-design/SKILL.md`; check 1280px and
   390px widths, keyboard focus and contrast.
5. Fill `.github/PULL_REQUEST_TEMPLATE.md`. Report any check not run or claim
   not verified. Never describe a planned check as completed.

## Runtime and design invariants

- One course, one document. The learner player is a generic renderer over the
  course object; nothing in the player is course-specific. See `.claude/rules/course-object.md`.
- Security rules are the access gate; the UI only reflects them. Roles are
  custom claims (`acharya`, `kulapati`); everyone signed in is a Shishya.
- Only `@nonstopio.com` Google accounts sign in. Assignments are keyed by email
  so people can be assigned before their first sign-in.
- Quiz answer keys never reach the browser; grading runs in a Cloud Function.
- Stay inside the free quota (Blaze plan, budget alert): see `.claude/rules/firebase-cost.md`.
- Open source: no secrets, no real learner data, MIT-compatible dependencies.
  See `.claude/rules/open-source.md`.
- Conventional Commits with a required area scope, no ticket ids: `type(scope): description`,
  scope one of `web` `ui` `functions` `rules` `changelog` `search` `ci` `plan` `claude` `deps`
  `repo`. No trailers. `.husky/commit-msg` (commitlint) and CI's PR-title check enforce it.
  Skill: `writing-commit-messages`.
- Production deploys only from `main`, through `.github/workflows/deploy.yml`, and only after CI
  has passed on that commit. Never run `firebase deploy` against `nonstop-gurukul` from a laptop.

## Commands

```bash
npm ci                       # install every workspace (Node 22, see .nvmrc)
npm run dev -w @gurukul/web  # app at localhost:5173
npm run emulators            # Auth, Firestore, Functions, Hosting emulators (demo project)
npm run check                # what CI runs, minus the emulator job
npm run test:rules           # Firestore rules against the emulator
npm run changelog:new -- "…" # a correctly named changelog entry
npm run validate:navigation  # every route classified for global search
npm run tracker              # plan status per section and the next item to pick up
npm run test:tooling           # tests for the Claude hooks and repo scripts
```

## Communicating with the maintainer

These preferences apply to chat, not to documents or code comments.

- Lead with the answer in plain English. Group topics under headings, use short
  bullets, keep each topic within ten lines, and omit investigation narration.
- Close with `What I need from you:` followed by actions or `Nothing`. Name
  unfinished work and skipped checks explicitly.
- Explain what something does before its implementation. Use a concrete example
  for abstract ideas; keep gotchas visible. Corrections are one line, first.
- When presenting options, recommend one and give its reason and cost. If a
  short-term patch differs from the proper fix, explain both, recommend today's
  action, and say whether the remaining work needs an issue.
- Make each decision understandable in place. Do not use issue numbers or
  references to earlier options as substitutes for explaining the fact.

Verify before concluding: read callers before claiming a guard is missing,
inspect the whole diff, and check whether a defect is your own uncommitted
change. If evidence is incomplete, say what would settle it.
