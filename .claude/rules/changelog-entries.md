---
paths:
  - 'apps/web/src/changelog/**'
---

# Changelog entries

A change that alters what someone using Gurukul sees or can do needs one entry, in the same pull
request. This rule loads when you touch the changelog folder; the `writing-changelog-entries`
skill and the changelog nudge hook cover the moment you change a screen.

- **One file per entry: `apps/web/src/changelog/entries/YYYY-MM-DD-HHMMSS-slug.ts`**, the India
  date and time it was written (`TZ=Asia/Kolkata date +%Y-%m-%d-%H%M%S`). Use
  `npm run changelog:new -- "a few words"`. The slug is lowercase; order comes from sorting names.
  Never rename an entry once it exists: its name is its order and its release lookup.
- **Exactly `export default { … } satisfies ChangelogEntry;`**, with `date` equal to the name's
  date, an `id`, and `area` / `kind` from `vocabulary.ts` (`feature`, not `feat`). The page keys
  rows on `date-id-title` and React silently drops a duplicate, so the tests reject one.
- **No `version` field.** The release is derived from `release-*` git tags at build time
  (`releases.ts`); `releases.generated.json` is build output and gitignored.
- **The reason is the point.** `why` restating the title fails the tests and helps nobody.
- Run `npm run coverage -w @gurukul/web` (it includes `test/changelog-entries.test.ts`) before
  committing; the pre-commit hook checks staged names.
