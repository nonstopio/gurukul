# Contributing to Gurukul

Thanks for helping. Gurukul is small and opinionated: read this page, the root
[`CLAUDE.md`](CLAUDE.md) (it applies to people as much as agents) and the plan
in [`.plan/`](.plan/README.md) before starting anything sizeable.

## Setup

- Node 22 (`nvm use`), npm 10+.
- Java 21 for the Firestore emulator (rules tests).
- Optional: Firebase CLI comes with `npm ci` (`npx firebase`).

```bash
npm ci
npm run dev -w @gurukul/web   # http://localhost:5173
npm run emulators             # Auth, Firestore, Functions, Hosting on a demo project
```

For a real Firebase project, copy `apps/web/.env.example` to
`apps/web/.env.local` and fill in the web config. Never commit `.env.local`.

Setting up a new environment (the first Kulapati, seeding the first course,
backups, email) is in [`docs/operations.md`](docs/operations.md). The first
Kulapati is granted once, by the maintainer, with
`npm run grant-kulapati -- you@nonstopio.com`; never from CI.

## Checks

| Command                       | What it proves                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `npm run lint`                | ESLint (TypeScript strict, React hooks, jsx-a11y)                            |
| `npm run format:check`        | Prettier                                                                     |
| `npm run typecheck`           | `tsc --noEmit` in every workspace                                            |
| `npm run coverage`            | Vitest in every workspace at **100%** lines, branches, functions, statements |
| `npm run test:rules`          | Firestore rules against the emulator                                         |
| `npm run build`               | Production build of the app and functions                                    |
| `npm run validate:navigation` | Every route is classified for global search                                  |
| `npm run test:tooling`        | Tests for the Claude hooks and the repo scripts                              |
| `npm run check`               | All of the above except rules                                                |

CI (`.github/workflows/ci.yml`) runs them on every pull request; the `ci` job
must pass before merge.

## Pull requests

1. Branch from `main`. One concern per PR.
2. If the change alters scope, data shape, roles or cost, update `.plan/` first.
3. Conventional Commit title with an area scope: `feat(web): learners can retry a pariksha`.
   Scopes: `web` `ui` `functions` `rules` `changelog` `search` `ci` `plan` `claude` `deps` `repo`.
   The `commit-msg` hook and CI enforce it; see the `writing-commit-messages` skill.
4. Fill the template, including how you checked the change.
5. PRs from this repository get a Firebase Hosting preview link; forks do not
   (no secrets), so include screenshots.

## Security

Report vulnerabilities privately: see [SECURITY.md](SECURITY.md).
