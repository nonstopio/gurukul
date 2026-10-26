# The changelog

Rendered at `/changelog`. Back-pointer: [`../../CLAUDE.md`](../../CLAUDE.md). The how-to is the
`writing-changelog-entries` skill; the constraints are `.claude/rules/changelog-entries.md`.

| File                                 | Owns                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `entries/YYYY-MM-DD-HHMMSS-slug.ts`  | One entry each, `export default {…} satisfies ChangelogEntry`. Never renamed once it exists |
| `vocabulary.ts`                      | `AREAS` and `KINDS`. Adding an area is a change here                                        |
| `types.ts`                           | `ChangelogEntry` (what you write) and `Change` (what the page renders)                      |
| `index.ts`                           | Collects entries by glob, sorts by file name, filters, groups by release                    |
| `releases.ts`, `git.ts`              | Which release shipped each entry, derived from `release-*` tags                             |
| `releases.generated.json`            | Written by `scripts/changelog-releases.ts` before dev and build. Gitignored                 |
| `ChangelogPage.tsx`, `changelog.css` | The screen. Layout and filtering only; it fetches nothing                                   |

- `npm run changelog:new -- "a few words"` creates a correctly named entry.
- There is no `version` field. `deploy.yml` tags each production deploy `release-YYYY.MM.DD-HHMM`
  after it succeeds, and the build files every untagged entry under the release it is cutting
  (`GURUKUL_RELEASE`). Preview and CI builds show new entries as Unreleased.
- Vitest's on-disk module cache is off in `vite.config.ts` because it kept the expanded glob and
  hid new entry files from the tests.
