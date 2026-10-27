---
name: pick-up-next
description: Use when starting a fresh Gurukul session with no specific task, when asked to "pick up next", "take the next item", "what's next" or to work through the plan, when asked to do a named tracker item (an id like KUL-04), when a tracker item turns out bigger than one pull request, or when a change finishes, adds or blocks work listed in .plan/tracker.md.
---

# Picking up the next tracker item

## Overview

`.plan/tracker.md` is the status of the plan: every piece of `.plan/` as an item with an id, a
status and the plan file it comes from. This skill takes **one** item, builds it, ticks it and opens
**one** pull request, so each session ends with something reviewable and the next session starts
from the tracker again.

The plan says what to build; the tracker says what is left. When they disagree, the plan wins and
the tracker gets fixed.

## When to Use

- A session starts with "pick up next", "what's next", or no task of its own
- The maintainer names an item: `/pick-up-next KUL-04`
- A change you made finishes, splits, adds or blocks a tracker item

**When NOT to use:** an unrelated fix the maintainer asked for directly (still tick a tracker row if
it happens to finish one), Dependabot bumps, or answering a question.

## Quick Reference

| Step          | Do                                                                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Sync       | `git fetch origin main`; work from the latest `main` (a fresh branch, or the branch the session was given, reset onto `main` if it has no work of its own)                                                                                                                                                       |
| 2. Claimed?   | List **open** pull requests in `nonstopio/gurukul`; each one's body names its item as `Tracker: ABC-NN`. Those ids are taken                                                                                                                                                                                     |
| 3. Pick       | `npm run -s tracker` prints the first `todo` in **Pick order** whose `Depends` are `done`. If it is claimed, take the next one that qualifies. A named id wins over the order, if it is not claimed                                                                                                              |
| 4. Re-check   | Read the item's plan file(s) and the code. Already built? Mark it `done` with evidence and pick again in the same PR. Needs a decision? Set it `blocked`, say why in Notes, pick again                                                                                                                           |
| 5. Say it     | One line to the maintainer: the id, what it is, why it is next. Then build; do not wait for a go-ahead                                                                                                                                                                                                           |
| 6. Build      | By the root `CLAUDE.md`: nearest nested `CLAUDE.md`, rules, `gurukul-design` for UI, a changelog entry if someone would notice, navigation areas for pages, 100% coverage, `npm run check` (and `npm run test:rules` for rules)                                                                                  |
| 7. Tick       | In `.plan/tracker.md`: the row's status `done`, Notes = where it lives (`file` paths); remove the id from **Pick order**; fix the **Summary** counts. Work found along the way gets a new row (next free number in that section) and a place in the pick order, not a bigger PR. `npm run -s tracker -- --check` |
| 8. Plan       | If the work changed scope, the data model or a decision, update the `.plan/*.md` that says so, in the same PR                                                                                                                                                                                                    |
| 9. Ship       | Commit per `writing-commit-messages` (no item id in the commit or title); push; open the PR from `.github/PULL_REQUEST_TEMPLATE.md` with `Tracker: ABC-NN` as the first line of **Why**                                                                                                                          |
| 10. Hand over | Report per the root `CLAUDE.md` chat rules: what shipped, checks run and skipped, the PR link, and the item the next session will get                                                                                                                                                                            |

**Statuses:** `todo` (anyone can take it), `blocked` (waits on a maintainer decision, named in
Notes; never picked), `maintainer` (an action outside the code: accounts, credentials, content;
never picked), `done`. "In progress" is not a status: an open PR naming the id is the claim.

**One PR's worth.** An item should land in one reviewable PR. If it is bigger than it looked, build
the first slice that works on its own, mark the item `done` with what shipped, and add the rest as a
new `todo` row right after it in the pick order.

## Common Mistakes

| Mistake                                                     | Instead                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Picking an id an open PR already names                      | Check open PRs first; take the next one                                               |
| Building a `blocked` item on the plan's recommendation      | The maintainer answers `13-open-questions.md` first; pick another item                |
| Two items in one PR "while I was there"                     | One item; the other gets its own session                                              |
| Ticking the row but leaving it in Pick order or the Summary | All three, then `npm run -s tracker -- --check`                                       |
| Trusting the tracker's `todo` without looking at the code   | Re-check: someone may have built it outside this flow                                 |
| Building what no plan file describes                        | Change the plan first (`CLAUDE.md`, "The plan comes first"), as its own item if large |
| `ABC-NN` in the commit message or PR title                  | Only in the PR body: commits carry no ticket ids                                      |
| Waiting for "go" after announcing the item                  | Announce and build; the PR is where the maintainer says no                            |

## Red Flags - STOP

- The picked item's id appears in an open PR
- The item is `blocked` or `maintainer`
- The diff touches a second item's rows or files
- `npm run check` was not run, or failed, and the PR is about to open anyway
- The tracker says `done` but no file in Notes shows it

## Not yet tested

This skill has not been pressure-tested with a baseline scenario for Gurukul. Add a
rationalisation table only from a real run.
