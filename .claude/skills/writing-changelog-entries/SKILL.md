---
name: writing-changelog-entries
description: Use when a change alters what a learner, Educator or Admin sees or can do in Gurukul, when the changelog nudge hook asks whether an entry is owed, when a change to apps/web/src, packages/ui/src, firebase/firestore.rules or firebase/functions/src has no file under apps/web/src/changelog/entries, when an entry's `why` restates its title, when an area does not fit the AREAS map, or when a change feels too small to write up.
---

# Writing a changelog entry

## Overview

The changelog lives in the repo (`apps/web/src/changelog/`) so an entry travels with the code it
describes: a pull request that changes behaviour and adds none is visible in review, and the text
cannot drift from what shipped. `git log` already says _what_ changed. `why` is the field that
earns the page its place.

## When to Use

- A screen, control, label, default, message or email changed, or who can see or do what
- A rules or function change alters what someone is allowed to do or what they get back
- The changelog nudge hook asked, or a change under `apps/web/src`, `packages/ui/src`,
  `firebase/firestore.rules` or `firebase/functions/src` adds no entry
- An entry's `why` repeats its title

**When NOT to use:** refactors nobody can see, tests, CI, hooks, scripts, `.claude/` notes,
formatting, the plan. **One entry per change somebody would notice, not one per commit.** A pull
request that fixes one thing in three commits gets one entry.

## Quick Reference

Scaffold it: `npm run changelog:new -- "a few words"`. That creates
`apps/web/src/changelog/entries/YYYY-MM-DD-HHMMSS-slug.ts`, named with the **India** date and time
(`TZ=Asia/Kolkata date +%Y-%m-%d-%H%M%S`), holding one `export default { … } satisfies
ChangelogEntry;`. Replace every line of the template; the tests reject leftovers.

| Field    | Rule                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| `date`   | `YYYY-MM-DD`. Must equal the date at the front of the file name                |
| `id`     | The GitHub issue or PR (`GH-42`), or a short UPPER-KEBAB tag. Never `GH-0000`  |
| `title`  | What is now true, in the user's words                                          |
| `area`   | `LEARN` `QUIZ` `ADMIN` `STUDIO` `DESIGN` `PLATFORM`; see `reference.md`        |
| `kind`   | `feature` `fix` `security` `ops` `docs` `chore`. `feature`, not `feat`         |
| `why`    | Required. The reason said out loud; never the title again                      |
| `detail` | Optional. What someone will notice: a string, or an array of non-empty strings |
| `notes`  | Optional array. Alternatives rejected, history, for the curious                |
| `deploy` | Only when a deploy step or ordering matters                                    |

**There is no `version` field.** The release is derived at build time from the first `release-*`
git tag containing the commit that added the file. Never type one.

Never rename an entry once it exists: the file name is its order and its release lookup.

## Common Mistakes

| Mistake                                       | Instead                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `why` repeats or paraphrases the title        | Name what somebody hit, or what they could not do before              |
| One entry per commit                          | One per noticeable change                                             |
| An entry for a refactor, test or script       | Write none                                                            |
| Inventing an area or a kind                   | Use the maps in `vocabulary.ts`; an unknown key is a type error       |
| Naming the file by hand in your own time zone | `npm run changelog:new`, which uses India time                        |
| Two entries in the same second                | Pick a different second; the tests and the pre-commit check reject it |
| Adding `version: '1.2.0'`                     | Delete it. Releases come from tags                                    |

Good `why`: _"A learner who failed a Quiz could not tell whether the retry was locked or
broken; the button just did nothing for 24 hours."_ Bad: _"The retry cooldown message was added."_

## Red Flags - STOP

- A deadline is the reason there is no entry
- Typing an `area` you have not seen in `vocabulary.ts`
- The `why` could be guessed from the title
- An entry for a rename, a test, a hook or a script
- Any template text left: `GH-0000`, "What is now true", "The reason, said out loud"
- Editing the date in the name of an entry that already exists

## Not yet tested

This skill has not been pressure-tested with a baseline scenario (an agent working without it,
under time pressure) for Gurukul. Treat its rules as the house standard, and record what a
baseline run actually does wrong before adding a rationalisation table.
