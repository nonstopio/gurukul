---
name: writing-commit-messages
description: Use when writing or amending a commit message or pull request title in Gurukul, when naming a new branch, when a change is ready to commit, when the commit-msg hook or the PR title check rejects a message, when a message would carry no type or no scope, or when a message would append a trailer such as Co-Authored-By.
---

# Writing a commit message

## Overview

[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):
`type(scope): description`. The spec makes the scope optional; here it is **required**, and it is
**the area of the codebase**, from a fixed list. Gurukul uses no ticket ids in commits.

It is enforced, not just written down: `.husky/commit-msg` runs commitlint
(`commitlint.config.mjs`) on every commit, and CI checks the pull request title, which becomes the
commit on `main` after a squash merge.

Branches take the same three parts: `type/scope/description-in-kebab-case`.

The description says what is now true, not what was done.

## When to Use

Every commit, every PR title, every new branch.

| Change                              | Commit                                            | Branch                      |
| ----------------------------------- | ------------------------------------------------- | --------------------------- |
| Learners can retry a Quiz           | `feat(web): learners can retry a quiz`            | `feat/web/quiz-retry`       |
| Rules stop learners setting a score | `fix(rules): learners cannot set their own score` | `fix/rules/no-self-scoring` |
| Hooks gained tests                  | `test(claude): hooks have tests`                  | `test/claude/hook-tests`    |

**When NOT to use:** never skipped. A formatting-only change is still `style(scope):`, no body.

## Quick Reference

| Element     | Rule                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Type        | `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`                       |
| Scope       | Required, one of: `web` `ui` `functions` `rules` `changelog` `search` `ci` `plan` `claude` `deps` `repo` |
| Description | Lower-case start, present tense, the new state; whole header ≤ 100 characters                            |
| Breaking    | `!` before the colon, and a `BREAKING CHANGE:` footer explaining the migration                           |
| Body        | Only when it carries content. Four parts in `reference.md`                                               |
| Trailers    | None. No `Co-Authored-By`, `Signed-off-by` or tool attribution — commitlint rejects them                 |

## Common Mistakes

| Mistake                                     | Instead                                                       |
| ------------------------------------------- | ------------------------------------------------------------- |
| `Fix certificate title after course rename` | `fix(web): certificates follow the course title`              |
| `feat: add retry`                           | `feat(web): learners can retry a quiz`                        |
| `feat(frontend): …`, `feat(Web): …`         | A scope from the list, lower-case                             |
| `docs(docs): update readme`                 | `docs(repo): …` or `docs(plan): …` — the scope is the subject |
| `chore(ui,web): …`                          | One scope. Split the commit, or pick the main one             |
| `feat(web): Added retry`                    | `feat(web): learners can retry a quiz`                        |
| Branch `ajay/retry-fix`                     | `fix/web/quiz-retry`                                          |

## Red Flags - STOP

- No type, or no scope
- A scope not on the list, invented for this one commit
- A description opening with a capital or a past-tense or imperative verb ("Added…", "Fix…")
- Any trailer, `Co-Authored-By` included
- `--no-verify` to get a message past the hook
- A branch missing its type segment

## Not yet tested

This skill has not been pressure-tested with a baseline scenario for Gurukul. Add a
rationalisation table only from a real run.
