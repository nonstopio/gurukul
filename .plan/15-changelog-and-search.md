# 15 · Changelog and global search (built in M0)

Two platform features exist from the first commit, because both get harder to retrofit with
every screen added. Both follow conventions proven in an earlier internal platform and
rewritten for Gurukul.

## Changelog

**What:** `/changelog` lists every change someone would notice, newest first, grouped by the
release that shipped it, with the reason it was made. Search and filter by area and kind.

**How:**

- One file per entry, `apps/web/src/changelog/entries/YYYY-MM-DD-HHMMSS-slug.ts`, in the same
  commit as the change. One shared array would make every branch conflict on the same lines;
  new files cannot conflict. The time to the second means nobody ever renames a file.
- `satisfies ChangelogEntry` makes a wrong `area` or `kind` a type error; tests check names,
  dates, uniqueness, template leftovers and that every file is collected.
- **Releases are derived, never typed.** `deploy.yml` names each production deploy
  `release-YYYY.MM.DD-HHMM`, builds with that name so untagged entries are filed under it, and
  pushes the tag only after the deploy succeeds. An entry belongs to the oldest tag containing
  the commit that added it. Preview and CI builds show new entries as Unreleased.
- Guard rails: `.husky/pre-commit` checks staged entry names; `changelog-nudge` hook asks
  once per session when user-visible code changed with no entry; the `writing-changelog-entries`
  skill decides when one is owed.

**Areas today:** Learning, Parikshas & certificates, Kulapati console, Vyasa Studio, Design
system, Platform. **Kinds:** New, Fix, Security, Operability, Docs, Housekeeping.

## Global search

**What:** Ctrl K / ⌘K (or the Search button) opens a palette that finds any page the person can
open, by name, area or other words for it. Today that is Home and Changelog; every milestone adds
its pages.

**How:**

- Per-area metadata in `apps/web/src/navigation/areas/<slug>.ts` (plain data: pages, roles,
  keywords, unlisted routes with reasons). Search, and the sidebar from M1, are generated from it.
- Access is filtered before matching, so nothing a person cannot open is ranked or shown.
- Local, deterministic ranking (exact label, prefix, path terms, contains, keywords); no network.
- `npm run validate:navigation` fails if any route is unclassified or any page points nowhere.
  It runs in the build, in CI and in the `navigation-nudge` hook.
- The dialog is `CommandPalette` in `packages/ui`, generic and fully keyboard-operable.

**Later (proposed, needs review):**

| Milestone | Search gains |
|---|---|
| M1 | Real roles from the session; sidebar generated from the same metadata |
| M2 | Courses and lessons as results (from published course documents, filtered client-side) |
| M4 | Kulapati: people by name or email |
| M5 | Acharya: their draft courses |

Content results stay client-side over data the person can already read; no search service is
needed at Gurukul's size. Revisit only if the catalogue outgrows a few thousand items.

## Claude Code support

| Piece | What it does |
|---|---|
| `writing-changelog-entries` skill | When an entry is owed, how to write the why |
| `updating-claude-md` skill | Where a note belongs: CLAUDE.md, a rule or a skill — or nowhere |
| `writing-commit-messages` skill | Conventional Commits with a scope; branch names |
| `claude-md-nudge` hook | After an edit, names the CLAUDE.md, rules and skills governing that file |
| `changelog-nudge` hook | Asks once per session when user-visible code changed with no entry |
| `navigation-nudge` hook | Runs the validator after navigation edits; silent when clean |
| `prod-guard` hook | Asks before any firebase CLI command against `nonstop-gurukul` |
| `secret-write-guard` hook | Asks before writing a key, token or service account into this public repo |

Hooks are Node with no dependencies, fail open, and are tested in CI (`npm run test:tooling`).

The committed `.claude/settings.json` also enables two plugins for every contributor, by the
maintainer's choice: the third-party `ponytail` plugin (marketplace `DietrichGebert/ponytail`) and
Firebase's own `firebase` plugin (marketplace `firebase/agent-skills`), whose skills cover the
Firebase CLI, rules and emulators. Claude Code asks each contributor to trust a marketplace before
installing from it.
