# Commit message reference

Heavy reference for `writing-commit-messages`. The SKILL.md carries the rules; this carries the
worked detail.

## The scope is the whole decision

Conventional Commits leaves the scope optional. Gurukul requires it, because a commit with no area
is a commit nobody can group or trace. There are no ticket ids in this project's commits: the
scope is always an area from the table below, and commitlint rejects anything else.

### Area scopes

| Scope       | Covers                                                             |
| ----------- | ------------------------------------------------------------------ |
| `web`       | `apps/web`: the learner app, Admin console, Studio                 |
| `ui`        | `packages/ui`: tokens and shared components                        |
| `functions` | `firebase/functions`                                               |
| `rules`     | `firebase/firestore.rules`, indexes and the rules tests            |
| `changelog` | The changelog page, its entries tooling and tests                  |
| `search`    | Global search and its navigation metadata                          |
| `ci`        | `.github/` workflows, Husky hooks, repo scripts                    |
| `deps`      | Dependency bumps (Dependabot uses `chore(deps)` and `ci(deps)`)    |
| `repo`      | Root files: README, LICENSE, root configs                          |
| `plan`      | `.plan/`                                                           |
| `claude`    | `CLAUDE.md` files and `.claude/` rules, skills, hooks and settings |

Prefer one that already exists. A scope invented per commit groups nothing. If a new area genuinely
appears (a new workspace), add it in the same pull request to three places that must agree:
`SCOPES` in `commitlint.config.mjs`, `scopes:` in the `pr-title` job of `.github/workflows/ci.yml`,
and this table.

> `docs` is both a type and a plausible area. When documentation changes, the type carries it and
> the scope names the subject: `docs(plan): …`, `docs(claude): …`, never `docs(docs): …`.

## Types

`feat` and `fix` are the two the spec mandates. The rest are the common Angular set:

| Type       | For                                                            |
| ---------- | -------------------------------------------------------------- |
| `feat`     | A new capability                                               |
| `fix`      | A bug fix                                                      |
| `docs`     | Documentation only, including `CLAUDE.md`, `.plan/`, README    |
| `style`    | Formatting, no behaviour change (Prettier)                     |
| `refactor` | Same behaviour, different shape                                |
| `perf`     | A measured speed, size or quota change                         |
| `test`     | Tests only                                                     |
| `build`    | npm, Vite, TypeScript config, packaging                        |
| `ci`       | Workflows, Husky, `scripts/`                                   |
| `chore`    | Anything else with no product effect, such as dependency bumps |
| `revert`   | Undoing a commit, naming it in the body                        |

A `feat` or `fix` a user can notice usually also adds a changelog entry; see the
`writing-changelog-entries` skill.

## Breaking changes

```
feat(functions)!: grading returns a result object instead of a number

BREAKING CHANGE: callers read result.score. The web app is updated in this commit; any fork
calling the function directly must do the same.
```

The `!` is what a reader scanning `git log --oneline` sees, so use it. The footer explains the
migration. `BREAKING-CHANGE` is a synonym, and the token must be uppercase.

## The body, when there is one

Four parts, in order. Skip any with no content; never invent one.

1. **What was happening.** The problem, with a real number where there is one: _"Every progress
   write re-read the whole course document: 40 reads per lesson on a 40-lesson course."_
2. **What you rejected.** The obvious alternative, named, before the choice is explained: _"NOT a
   per-lesson subcollection: that turns one read into forty on the dashboard."_
3. **What it costs.** Who is affected, plainly. A cost stated rather than hidden.
4. **What is still not fixed.** The honest edge of the change.

### Correcting yourself

Open plainly and do not bury it: _"Correcting my last commit, which said the rule denied writes
from signed-out users. It allowed reads; this closes them."_ That habit is what makes the rest of
the log trustworthy.

## Trailers

None, by the maintainer's house style. No `Co-Authored-By` (for people or tools), no
`Signed-off-by`, no "Generated with" lines. If a tool's defaults add one, remove it before
committing.

## What enforces it

| Where                                                 | Checks                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/commit-msg` → `commitlint.config.mjs`         | Every local commit: type and scope from the lists, scope present and lower-case, description lower-case, header ≤ 100, no trailers |
| CI `pr-title` (`amannn/action-semantic-pull-request`) | The PR title, which becomes the squash commit: same types and scopes, scope required, lower-case description                       |

Neither can tell whether the description is good or whether the scope is the right one of the
list. That part is review and this skill.

## Branch naming

`type/scope/description-in-kebab-case`, the same three parts as the commit:

- `feat/web/quiz-retry`
- `chore/claude/port-hooks-and-skills`

Nothing enforces branch names today.
