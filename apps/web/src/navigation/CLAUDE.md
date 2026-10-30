# Global search and navigation metadata

Covers the ⌘K / Ctrl-K palette, the per-area metadata it is generated from, and the validator.
Back-pointer: [`../../CLAUDE.md`](../../CLAUDE.md).

## The rule

**Adding, renaming, removing or changing access to a page means editing that area's
`areas/<slug>.ts` in the same change.** Search and the sidebar are generated from it.
Every path in `src/route-paths.ts` must be classified there, and `npm run validate:navigation`
must pass — the build, CI and the Claude `navigation-nudge` hook all run it.

## Who owns what

| File                           | Owns                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `areas/<slug>.ts`              | One area's name, roles, keywords, pages and unlisted routes. Plain data — no imports except the type, no components, no functions                                            |
| `types.ts`                     | `AreaNavigation`, `PageNavigation`, `Destination`, `Role`                                                                                                                    |
| `catalog.ts`                   | Collects areas (by file name) and filters pages to what this person can open, **before** matching                                                                            |
| `search.ts`                    | The local matcher. Ranking is in its header. No network, no debounce, no dependency                                                                                          |
| `localize.ts`                  | Area metadata is written in generic names; `localizePage` swaps them for the person's label set where the sidebar, title and search show them, and search matches both names |
| `records.ts`                   | Record results: courses and lessons, and editable courses, as `RecordSource`s, people as a `RecordLookup`; `loadRecords`/`findRecords` drop and log a failure                |
| `validate.ts`                  | The rules; `scripts/validate-navigation.ts` runs them over the real files                                                                                                    |
| `GlobalSearch.tsx`             | The one provider, the one shortcut listener, the `SearchTrigger` button. Mounted once in `App.tsx`                                                                           |
| `packages/ui` `CommandPalette` | The dialog itself: combobox, listbox, keys. Knows nothing about pages                                                                                                        |

## Every route is one of three things

| It is…                                                       | Declared as                                                             | In search?                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------- |
| A page anyone (or a role) can open directly                  | a `pages` entry: `{ id, path, label, description?, keywords?, roles? }` | yes, for the roles allowed        |
| A screen that needs a record (a course id, a certificate id) | `unlisted: { '/courses/:id': { context: 'why' } }`                      | no — search has no record to pass |
| Anything else deliberately hidden                            | `unlisted: { '/x': { excluded: 'why' } }`                               | no                                |

Only pages that exist go in an area: search must never offer something that is not built.

## Adding a page — the whole change

1. Add the path to `src/route-paths.ts`; TypeScript then demands its screen in `src/routes.tsx`.
2. Add a `pages` entry in the area's file, with `roles` if it is not for everyone.
3. A changelog entry, because a new page is something people notice.

Forget step 2 and the validator prints:

```
x navigation: 1 problem
  x /studio: route is not classified — list it as a page in an area's navigation, …
```

A new area is a new file in `areas/`; nothing to register.

## Record results

Search also offers records — courses and their lessons, the courses an Educator or Admin may
edit (drafts included), and people for Admins. Each comes from a `RecordSource` (`types.ts`): an id, optional `roles`,
and `load()` returning `Destination`s with a `kind` ("Course", "Lesson"). The sources are built in
`Frame` (`src/Shell.tsx`) and passed to `GlobalSearchProvider`, which:

- loads them **once, the first time the palette opens** — no reads before someone searches, and a
  source reuses a query the person's screens already make (courses: the catalogue's `listCourses`;
  editable courses: Studio's `listCourses`, opening `/studio/courses/<id>`);
- keeps them with the roles they were loaded for, so a change of roles never shows the old ones;
- ranks them with the pages, but lists pages only while the query is empty.

A source offers only what the person can already read; the rules are still the gate. A new source
is one function in `records.ts` and one entry in `Frame`'s list.

Records too many to load up front (people) are a `RecordLookup` instead: `find(prefix)` makes one
lookup (the console's `searchUsers` reads the roster once per five minutes and matches in memory), run from two characters once typing pauses (`SEARCH_DELAY_MS`, the Learners page's
own), and only the newest answer is kept. The palette tells the provider what is typed through
`onQueryChange`. People reuse the console's `searchUsers` and open `/admin/learners?learner=<uid>`,
which opens the learner drawer.

## The palette

Accessible combobox + listbox (`aria-activedescendant`); focus stays in the input, Tab is held,
Escape and the backdrop close, focus returns to where it was. Twenty rows, then "Show N more".
Enter is ignored while an IME is composing. Matching 1,000 destinations is asserted under 25 ms
per query in `test/navigation-search.test.ts` (it measures well under 1 ms).

Roles come from the session's custom claims; everyone signed in is a Learner. Access in search
is convenience only — Firestore rules are the gate.
