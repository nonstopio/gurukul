# Global search and navigation metadata

Covers the ⌘K / Ctrl-K palette, the per-area metadata it is generated from, and the validator.
Back-pointer: [`../../CLAUDE.md`](../../CLAUDE.md).

## The rule

**Adding, renaming, removing or changing access to a page means editing that area's
`areas/<slug>.ts` in the same change.** Search is generated from it (and, from M1, the sidebar).
Every path in `src/route-paths.ts` must be classified there, and `npm run validate:navigation`
must pass — the build, CI and the Claude `navigation-nudge` hook all run it.

## Who owns what

| File                           | Owns                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `areas/<slug>.ts`              | One area's name, roles, keywords, pages and unlisted routes. Plain data — no imports except the type, no components, no functions |
| `types.ts`                     | `AreaNavigation`, `PageNavigation`, `Destination`, `Role`                                                                         |
| `catalog.ts`                   | Collects areas (by file name) and filters pages to what this person can open, **before** matching                                 |
| `search.ts`                    | The local matcher. Ranking is in its header. No network, no debounce, no dependency                                               |
| `validate.ts`                  | The rules; `scripts/validate-navigation.ts` runs them over the real files                                                         |
| `GlobalSearch.tsx`             | The one provider, the one shortcut listener, the `SearchTrigger` button. Mounted once in `App.tsx`                                |
| `packages/ui` `CommandPalette` | The dialog itself: combobox, listbox, keys. Knows nothing about pages                                                             |

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

## The palette

Accessible combobox + listbox (`aria-activedescendant`); focus stays in the input, Tab is held,
Escape and the backdrop close, focus returns to where it was. Twenty rows, then "Show N more".
Enter is ignored while an IME is composing. Matching 1,000 destinations is asserted under 25 ms
per query in `test/navigation-search.test.ts` (it measures well under 1 ms).

Roles come from the session from M1; until then everyone searches as a Shishya. Access in search
is convenience only — Firestore rules are the gate.
