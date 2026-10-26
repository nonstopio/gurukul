---
name: updating-claude-md
description: Use when adding to, editing or creating a CLAUDE.md, a .claude/rules file or a .claude/skills skill in Gurukul, when the claude-md nudge hook names notes that govern a file you changed, when code gained behaviour its notes do not mention, when a claim in any of them turned out to be wrong, when deciding whether a note belongs in CLAUDE.md, a rule or a skill, or when something feels worth recording "for context".
---

# Keeping CLAUDE.md, rules and skills current

## Overview

Gurukul keeps agent guidance in three places, and each is paid for differently:

- **`CLAUDE.md`**: every one from the working directory upward loads at session start. A line at
  the root is paid for by sessions that never touch that area.
- **`.claude/rules/*.md`**: loads when a file matching its `paths:` frontmatter is touched. A rule
  without `paths:` loads every session, like the root CLAUDE.md.
- **`.claude/skills/*/SKILL.md`**: only its `description` loads up front; the body loads when the
  task matches.

Two questions, in order: **is a note owed at all?** Then **which file, and how deep?** Most
notes die at the first.

## When to Use

- A change made a claim in a CLAUDE.md, rule or skill wrong
- Code gained behaviour its notes do not mention: a module, a trigger, a script, a constraint
- The claude-md nudge hook named notes for a file you changed
- A folder with substantial code has no CLAUDE.md
- The convenient file to edit is the root CLAUDE.md

**When NOT to use. Write nothing when:**

- Opening the file says the same thing; file headers and test names are already read
- It restates structure `ls` or `grep` answers: a file list, an export table
- It is a plan, a status or intended work; that belongs in `.plan/` or an issue
- It narrates how something got built

**A note nobody acts on is not free.** It costs tokens every session and dilutes the rest.

## Quick Reference

First pick the kind of file, then the deepest one that covers every case.

| The note is…                                               | Goes in                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| A folder's map and contract: what lives here, what it owns | That folder's `CLAUDE.md` (create it if the folder warrants)      |
| A constraint on specific files, wherever you start from    | A rule in `.claude/rules/` with `paths:` globs for them           |
| A procedure: steps, a checklist, a decision to make        | A skill in `.claude/skills/<name>/` (`SKILL.md` + `reference.md`) |
| True of one file or function                               | A comment in that file                                            |
| True of the whole repo, every session                      | The root `CLAUDE.md`, and only then                               |

**A map lists its children, never its grandchildren.** The root CLAUDE.md points at
`apps/web/CLAUDE.md`; it does not describe the web app's internal folders.

A new rule, skill or hook also adds one row to the root CLAUDE.md map (see
`.claude/rules/claude-config.md`).

## Common Mistakes

| Mistake                                          | Instead                                               |
| ------------------------------------------------ | ----------------------------------------------------- |
| Writing to the root because it is already open   | The deepest governing file, plus a pointer row if new |
| A procedure pasted into a CLAUDE.md              | A skill; the CLAUDE.md names it in one line           |
| A file constraint in a CLAUDE.md three levels up | A rule whose `paths:` match exactly those files       |
| A rule with no `paths:` "to be safe"             | `paths:`; an unscoped rule costs every session        |
| Notes for a folder you did not read              | Read the file headers first                           |
| Silently fixing a wrong claim                    | Fix it and say what it used to say                    |

## Red Flags - STOP

- The file you are about to edit is the one already open
- The note is going in the root because that is where you are
- Steps 1-2-3 are going into a CLAUDE.md
- You have not read the target folder's file headers
- Overwriting a wrong claim without saying it was wrong
- Writing because the hook fired, not because a reader would act differently

## Not yet tested

This skill has not been pressure-tested with a baseline scenario for Gurukul: no run yet shows
what an agent does without it. In particular, nothing yet shows the case the placement rules
exist for, where the convenient file is the wrong one. Add a rationalisation table only from a
real run.
