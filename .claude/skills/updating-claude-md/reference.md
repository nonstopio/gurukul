# Notes placement reference

Heavy reference for `updating-claude-md`.

## How each kind of file loads

| File                          | Loads                                                        | Cost model                        |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Root `CLAUDE.md`              | Every session                                                | Every line, every session         |
| Nested `CLAUDE.md`            | When working in or below its folder                          | Paid by work in that folder       |
| Rule with `paths:`            | When a file matching one of its globs is read or edited      | Paid only by work on those files  |
| Rule without `paths:`         | Every session                                                | Same as the root CLAUDE.md        |
| Skill `description`           | Every session (frontmatter only)                             | One paragraph each, keep it tight |
| Skill body and `reference.md` | When the task matches the description, or the skill is named | Paid only when used               |

So the same sentence costs very different amounts depending on where it goes. Depth is not
tidiness; it is who pays.

## Choosing between the three

Ask what the reader will do with it:

- **Orient** ("where is X, what owns Y, what must never happen here"): a `CLAUDE.md`. It is a map
  and a contract for a folder. Short table of children, a handful of invariants, the commands that
  folder runs.
- **Obey** ("files matching these paths must…"): a rule. Constraints that follow a file wherever the
  session started, such as `firestore-rules.md` following `firebase/firestore.rules`. Name the
  paths precisely; a broad glob is an unscoped rule in disguise.
- **Do** ("to write a changelog entry, first…"): a skill. Anything with steps, a decision table, or
  mistakes worth naming. `SKILL.md` carries the rules in under a page; `reference.md` carries the
  measurements, worked examples and long tables.

When a note is two of these, split it: the rule states the constraint in one line and points at the
skill for the procedure. `changelog-entries.md` and `writing-changelog-entries` work this way.

## Depth: the deepest file that covers every case

Walk up from the file the note is about. Stop at the first file whose scope includes every case the
note applies to, and no more.

- True of `firebase/functions/src/grading/` only: that folder's CLAUDE.md, or a rule with
  `paths: ['firebase/functions/src/grading/**']` if it is a constraint.
- True of all of `firebase/`: `firebase/CLAUDE.md`.
- True of every workspace: the root CLAUDE.md, or an unscoped rule. Both cost every session, so
  this bar is high.

## Correcting something already written

Never overwrite a wrong claim silently. A silent fix reads as "this was always true" and leaves the
next reader unable to tell a stable fact from one that just changed. Say what was believed and that
it changed, next to the claim:

> "`App.tsx` used to be the placeholder shell; routing now lives in `routes.ts`."

## Phrasing that earns its place

- **"There is no X"** forecloses a plausible wrong assumption: _"There is no `version` field;
  releases come from tags."_ That one line prevents a whole class of edits.
- Name the mechanism, not the mood: _"React drops a duplicate row key silently"_ beats _"be careful
  with ids"_.
- Point, do not copy. If the code or a test states it, link to the file instead of restating it;
  a copy drifts.

## A shipped plan is not documentation

`.plan/` describes what is intended. Once something ships, the notes describe what is true, in the
present tense. A note that still says "will" after the work is done reads as outstanding work.

## Worked example

A daily Cloud Function is added to `firebase/functions/src/digest/` that emails Admins a summary.

| Where                            | What goes there                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Root `CLAUDE.md`                 | Nothing. One function changes nothing true of the whole repo                         |
| `firebase/CLAUDE.md`             | One row for `functions/src/digest/` in its map, if it keeps one                      |
| `.claude/rules/firebase-cost.md` | Nothing new: it already says daily is the ceiling for schedules                      |
| A skill                          | Nothing: there is no repeatable procedure here                                       |
| `digest/index.ts` header         | Why daily and not hourly, and why it reads the aggregate doc, not every progress doc |
