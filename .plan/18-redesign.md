# 18 — Redesign: one shell, strict components, a profile

Status: planned 2026-10-30. Tracker section "Redesign" (`RDS-*`). One pull request.

## Why

Gurukul works, but it does not feel finished. The design canvas ("NonStop Gurukul — L&D
Platform", 19 artboards) was the first thing made for the project and was only partly followed.
An audit of the code on 2026-10-30 found:

- **The chrome does not stay put.** The sidebar is a flex item as tall as the page, so on a long
  page the navigation scrolls out of view and the account block (name, label switch, Sign out)
  sits at the very bottom of the document. The focused top bar (lesson and Quiz progress) and the
  search bar scroll away too.
- **Dropdowns look broken.** `Select` renders a native `<select>` with the `g-control` box but no
  `appearance`, chevron or padding rule, so each OS paints its own arrow inside our border. The
  Changelog has its own 14px select style. There is no menu, so row and account actions are
  buttons in a line.
- **No account surface.** No avatar, no email or role, no profile page; a learner who picked the
  wrong team at the first prompt can never change it.
- **Six page-header styles, five content widths** (880, 960, 1120, 1200, 1400), four hand-made
  tables, a 2,154-line `styles.css` with ~370 page-specific classes. The rules said "reuse
  `packages/ui`" but nothing made it the only way, so every page drifted a little.
- **Studio editors and Preview render inside the sidebar shell** with a dark top bar in mid-page.
- Loading is a centred "Loading…" text; buttons have no busy state.

## What changes

### 1. Strict design rules first (the contract)

The `gurukul-design` skill and `.claude/rules/design.md` are rewritten to be prescriptive, after
the pattern that works in other NonStop products: a **Need → Use** table ("a page title →
`PageHeader`, never an `h1` with a class"), page anatomy, shell contract, state contract,
dropdown and menu rules, copy rules and a reviewer checklist. A rule that can be checked is
checked by a script in `npm run check` (`scripts/check-design.mjs`, tested in `scripts/test/`):

- no raw hex, `rgb()`, px font size or `box-shadow` literal in `apps/web` CSS; tokens only
- no raw `<select>`, `<table>` or `<h1>` in `apps/web` TSX (allow-listed exceptions name
  their reason); `max-width`, radius, shadow and z-index literals out of `apps/web` CSS
- in `packages/ui` CSS: role tokens only (no `--g-*` scale step, no colour literal outside
  `tokens.css`), z-index from `--z-*`

### 2. Components that were missing (`packages/ui`)

| Component       | Does                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AppShell`      | Sidebar shell. ≥ 1024px: sidebar `position: sticky; height: 100dvh`, nav scrolls inside it, user card pinned at the bottom. < 1024px: a top bar with Menu that opens the sidebar as a drawer (scrim, Escape, focus trap, focus returns). |
| `FocusedShell`  | Sticky dark top bar (back, title, status, actions) over a full-width body: player, Quiz, Studio editors, Preview.     |
| `PageHeader`    | Eyebrow, `h1`, lead, actions, optional breadcrumb. The only way a page gets its title.                                 |
| `Page`          | One content width per kind: `reading` 780, `default` 1120, `wide` 1280. Consistent padding and section gap.           |
| `Avatar`        | Initials circle, colour by role, sizes 24/34/36/48.                                                                    |
| `UserCard`      | Avatar, name, email or role; a menu button.                                                                            |
| `Menu`          | Menu button + `role="menu"` popover: arrow keys, Home/End, type-ahead, Escape, click-outside, focus return. Account menu and row actions. |
| `Select`        | Still a native `<select>` (keyboard, mobile pickers and screen readers for free; e2e `selectOption` keeps working), now with `appearance: none`, an SVG chevron, 44px, hover, focus, invalid and disabled states. |
| `FilterBar`     | Search + selects + toggles in one wrapping row, labels visually hidden, a "Clear filters" action.                     |
| `SegmentedControl` | Moved from `apps/web/src/studio/blocks/Segmented.tsx`.                                                              |
| `Button`        | Gains `loading` (spinner-free: label kept, `aria-busy`, disabled) and `size="sm"`.                                    |
| `DataTable`     | Absorbs the four `.plain-table` uses (a `plain` variant: no sort, no paging).                                          |
| `PageSkeleton`  | Replaces "Loading…" text for lazy routes and `Loaded`.                                                                 |

A custom listbox (combobox) is not built: the native select covers every list we have (the
longest is courses, tens of items). Add one when a list needs search.

### 3. Design system screens for Admins

A "Design system" tab in Org settings (`/admin/settings?tab=design-system`), replacing the
dev-only `/__ui` gallery. Inside it, sections kept in the URL (`&section=`):

- **Tokens** — read from `tokens.css` itself, each value resolved by the browser, so the page
  cannot drift from the code. Grouped: surfaces, text, lines, accent, state, chrome, spacing,
  radius, shadow, motion. A filter box.
- **Type** — families, the scale with line heights, weights.
- **Components** — every `packages/ui` component as an `Example` card: name, the one-line rule
  from the skill, the live component in each variant and state.
- **Patterns** — page anatomy, shell, states (loading, empty, error, not allowed), forms.

Org settings is already Admin-only (`RequireRole any={['admin']}`); search offers the tab to Admins.

### 4. Profile

`/profile`, for everyone signed in, reached from the user card menu:

- Who you are: avatar, name and email from the Google account (read only: certificates print
  that name), roles (read only, with what each allows).
- Your team (editable, from `config/org.teams`), your label set (Gurukul or plain).
- Your learning in numbers: courses in progress, completed, certificates (links).
- Sign out.

Team and labels save through the existing `LearnerData.setTeam` / `setLabels`; the rules already
allow both. No rules change.

### 5. Every screen rebuilt on the components

Learner (home, catalogue, course, lesson, Quiz, result, complete, certificates, verify, sign-in,
label choice), Admin console (overview, learners, assign, roles, audit, settings, course
analytics), Studio (courses, course editor, lesson editor, Quiz builder, preview, question bank,
media), Changelog, not found, not allowed. Each page is `Page` → `PageHeader` → content built
from `packages/ui`. Page CSS moves out of `styles.css` into one file per area
(`learn.css`, `console.css`, `studio.css`), holding layout only.

On 2026-10-30 the checker found 84 violations (mostly page `h1`s, width and shadow literals,
four raw tables); the PR lands at 0.

The canvas stays the reference for look: ink sidebar, light work surface, Fraunces titles,
green accent, 16px cards on hairlines. Where the canvas has no answer (menus, profile, dialogs,
dark-on-scroll behaviour) the skill decides.

## Not changing

Routes (except adding `/profile` and removing `/__ui`), the course object,
rules, functions, label sets, e2e selectors' roles and names (specs change only where a control
genuinely changed, such as a menu replacing a button).

## Checks

`npm run check` (100% coverage in every workspace, the design checker), `npm run e2e`, axe on
every page test, screenshots at 1280 and 390 of each area, keyboard pass on shell, menu and
drawer.

## Round 2: themes, feedback, flows (RDS-09 to RDS-15)

After the first full pass an Admin walked the deployed app and found the colours, contrast and
structure wanting. Decisions, all in the "Gurukul Design System" artifact and `04-design-system.md`:

- **Light and Dark themes**, a theme-following sidebar, a branded global loader (boot and blocked
  operations), motion tokens and entrances.
- **Feedback**: toasts by kind with set times, StateCard for failed, offline and denied pages, one
  lookup from API error codes to a type, a sentence, a code and a retry rule.
- **Where things go**: an area switcher (Learn, Studio, Admin); Design system, Teams on their own
  Admin pages; Profile in the account menu.
- **Teams hold their members** (`teams/{id}`, Admin-only); a multi-select people picker.
- **Assign is a four-step horizontal flow**; the catalogue gets search, filters and visibility;
  Home leads with a continue-learning hero.
- **Studio**: the media library is a gallery with previews; the question bank can create, import,
  edit and delete questions.
- **Sign-in page** redesigned as a calm two-column hero.

Not in this round: media upload (no Storage in v1), file sizes for linked media, an asset picker
in the lesson editor, "same toast twice becomes one with a count".
