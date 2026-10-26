# Changelog reference

Heavy reference for `writing-changelog-entries`. The SKILL.md carries the rules; this carries the
detail behind them. The code is the authority: `apps/web/src/changelog/index.ts`, `types.ts`,
`vocabulary.ts` and `releases.ts`. When this file and the code disagree, the code is right and this
file is stale; fix it here.

## Areas

Defined in `apps/web/src/changelog/vocabulary.ts` as `AREAS`. `satisfies ChangelogEntry` makes an
unknown key a type error, so a typo fails `npm run typecheck` rather than shipping an entry no
filter can find.

| Key        | Label                    | Use for                                                        |
| ---------- | ------------------------ | -------------------------------------------------------------- |
| `LEARN`    | Learning                 | The learner player, course list, progress, the Shishya's view  |
| `PARIKSHA` | Parikshas & certificates | Checkpoints, grading, retries, certificates                    |
| `KULAPATI` | Kulapati console         | Admin: assignments, roles, reports                             |
| `STUDIO`   | Vyasa Studio             | Acharya authoring: courses, parvas, blocks, question banks     |
| `DESIGN`   | Design system            | `packages/ui` changes a user would see across screens          |
| `PLATFORM` | Platform                 | Sign-in, access, the changelog itself, anything spanning areas |

Prefer the most specific area. `PLATFORM` is for what genuinely spans areas, not for "unsure".

Adding an area is an edit to `vocabulary.ts`, a shared file, so it can conflict with someone
else's branch in a way new entry files never do. Raise it in the pull request rather than adding
one in passing.

## Kinds

| Key        | Label        | Notes                                                               |
| ---------- | ------------ | ------------------------------------------------------------------- |
| `feature`  | New          | A new capability. The key is `feature`, not `feat`                  |
| `fix`      | Fix          | Something that did not work now does                                |
| `security` | Security     | An access rule, a leak closed, an answer key kept server-side       |
| `ops`      | Operability  | Cost, quota, reliability, deploy behaviour a user could feel        |
| `docs`     | Docs         | In-app help or guidance text                                        |
| `chore`    | Housekeeping | Renames, moves, dependency bumps, but only when a reader would care |

A change with no user-visible effect usually needs no entry at all, rather than a `chore` one.

## What the tests enforce

`apps/web/test/changelog-entries.test.ts`, run by `npm run coverage -w @gurukul/web` and in CI:

- file names match `YYYY-MM-DD-HHMMSS-lowercase-words.ts`
- the date in the name equals the entry's `date`
- each file has exactly one export, `export default {`, ending `} satisfies ChangelogEntry;`
- no two files share a day and time (the first 17 characters)
- no two entries share the row key `date-id-title`; React would silently drop the second row
- every file is collected, newest first; an empty glob would otherwise empty the page quietly
- `why` is not empty and is not the title
- no template text from `changelog:new` is left (`GH-0000`, the placeholder title or `why`)
- `area` and `kind` are known keys; `detail` items and `notes` are well formed

The pre-commit hook (`.husky/pre-commit` → `scripts/check-changelog-names.sh`) checks the name, the
date match and the clash on staged files, seconds after `git commit` rather than minutes after a
push.

## How an entry finds its release

There is no `version` field, deliberately. A hand-typed version can be wrong; a derived one cannot.

1. `deploy.yml` pushes a `release-*` tag after a successful production deploy.
2. At build time, `releases.ts` asks git which commit added each entry file, and which release tags
   contain that commit.
3. The entry belongs to the **oldest** release tag that contains it. Anything not in a tag yet is
   "Unreleased", unless this build is the release being cut, in which case it belongs to that one.
4. The result is written to `releases.generated.json`, which is gitignored.

Consequences:

- Renaming an entry file changes the commit that "added" it, which can move it to a later release.
  That is why entries are never renamed.
- The page groups Unreleased first, because "is my fix live?" is why people open it.

## Why the name is the India time to the second

Order comes from sorting file names, newest first. The `date` field alone cannot order entries
within a day. Time to the second means nobody hunts for "the next free number", so nothing is ever
renumbered. India time because that is where the maintainers are; a fixed zone means two people
writing at the same moment get comparable names.

## Worked example

A learner's certificate showed the course title as it was when they finished, so a renamed course
produced certificates that no longer matched the course list.

```ts
import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'GH-57',
  title: 'Certificates show the course title as it is today',
  area: 'PARIKSHA',
  kind: 'fix',
  why:
    'After an Acharya renamed a course, learners downloaded certificates whose title matched ' +
    'nothing on their dashboard, and asked whether they had finished the wrong course.',
  detail: ['Open any certificate: the title now follows the course.'],
} satisfies ChangelogEntry;
```
