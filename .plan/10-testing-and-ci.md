# 10 · Testing and CI

## The rule

**100% coverage** — lines, branches, functions, statements — in every
workspace, enforced by each workspace's Vitest thresholds and by CI. No
excluded files, no lowered thresholds, no ignore comments except a documented
unreachable race. See `.claude/rules/coverage.md`.

## Layers

| Layer | Tool | Where | Runs in |
|---|---|---|---|
| Unit: pure logic (schema, progress %, classifiers, migrations) | Vitest | `packages/schema/test` | `test` job |
| Components | Vitest + Testing Library + axe-core | `packages/ui/test`, `apps/web/test` | `test` job |
| Routes and data hooks | Vitest with the Firestore emulator or typed fakes | `apps/web/test` | `test` job |
| Cloud Functions | Vitest; pure modules directly, triggers via `firebase-functions-test` against emulators | `firebase/functions/test` | `test` + `rules` jobs |
| Security rules | `@firebase/rules-unit-testing` | `firebase/rules/test` | `rules` job |
| End to end (built) | Playwright against emulators + built app | `e2e/` | `e2e` job |
| Accessibility | axe-core per component and page; Playwright axe on Home, the course page, the Kulapati overview and the Studio course list (built) | as above | as above |

Rules coverage: every `allow` has an allowed and a denied test. From M2, a
script reads the emulator's rules coverage report and fails if any rule
expression was never evaluated.

## CI — in place

`ci.yml`, on every PR and push to `main`:

| Job | Does |
|---|---|
| `quality` | `npm ci`, lint (TS strict, react-hooks, jsx-a11y), Prettier check, typecheck, navigation validator, hook and script tests (`npm run test:tooling`) |
| `test` | `npm run coverage` in every workspace at 100%; uploads coverage |
| `rules` | Java 21 + Firestore emulator, rules tests |
| `build` | App and functions build, then the bundle-size budget |
| `lighthouse` | Lighthouse CI on the built sign-in page |
| `e2e` | Java 21 + Playwright (Chromium) against the built app and the Auth, Firestore and Functions emulators: the learner, Kulapati and Acharya journeys plus an axe scan of four pages (`e2e/`, run with `npm run e2e`; see `docs/operations.md`) |
| `ci` | Passes only if all the above passed; branch protection requires it |

Other workflows:

| Workflow | Does |
|---|---|
| `pr-title.yml` | Conventional Commit PR title with an area scope; re-runs when the title is edited. Required check |
| `preview.yml` | Hosting preview channel for same-repo PRs, with a Hosting-only key |
| `deploy.yml` | Production after CI passes on `main`, then a `release-*` tag |
| `codeql.yml` | CodeQL on PRs, `main` and weekly |
| Dependabot | npm and actions, weekly, grouped, `chore(deps)` / `ci(deps)` titles |

Added later: bundle-size budget check (M3: initial JS < 320 KB gzip, enforced by `npm run check:bundle`: the Firebase SDK is about half of it; pages load on demand, and deferring Firestore until after sign-in is the next saving). Still to come: Lighthouse CI on the preview URL (M6) rather than the built page.

## Branch protection (to set on GitHub)

- Require the `ci` and `pr-title` checks and one review on `main`; squash merge only; linear history.
- Require the `production` environment approval for deploys (optional).

## Local git hooks (in place)

Husky, installed by `npm ci`:

| Hook | Runs |
|---|---|
| `pre-commit` | Changelog entry names; ESLint and Prettier on staged files (lint-staged) |
| `commit-msg` | commitlint: Conventional Commits, required area scope, no trailers |
| `pre-push` | Typecheck, navigation validator, hook tests if hooks changed, 100% coverage for each workspace the push touches |

They are the fast early warning; CI is the gate.
