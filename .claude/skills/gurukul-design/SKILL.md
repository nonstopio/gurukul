---
name: gurukul-design
description: Use before writing or changing any JSX or CSS in apps/web or packages/ui, when adding a screen, page, dialog, form, table, filter, menu or dropdown, when restyling or reviewing any Gurukul screen (learner app, Admin console, Studio, certificates), when `npm run check:design` fails, or when a screen needs something no `@gurukul/ui` component does yet.
---

# Gurukul design system

## Overview

**Screens are assembled, not drawn.** Every screen is `@gurukul/ui` components in a fixed
order; `apps/web` CSS only lays them out. When no component does what a screen needs, the
component is built (or extended) in `packages/ui` first, with tests and a recipe, and then used.
A local copy, a one-off class that looks like a component, or "just this once" markup is how the
app drifted into six page-header styles and five content widths. That is the failure this skill
exists to prevent.

Gurukul looks like a modern product with a little ceremony: a dark ink chrome that stays put,
light working surfaces, one NonStop green accent, Inter for everything you read and click,
Fraunces for titles and moments that matter, JetBrains Mono for code. The Mahabharata shows up
in **words**, not ornament: a person picks the Gurukul labels (Shishya, Parva, Pariksha) or
plain English; copy takes them from `useTerms()` (`apps/web/src/labels/`), never typed.

**Where the truth lives.** Values: `packages/ui/src/tokens.css` (when it and this file
disagree, the CSS is right and this file is stale: fix it here). Recipes, states and keyboard
contracts per component: `references/components.md`. Live examples: Admin → Design system
(`/admin/design-system`), which renders the real components and reads the real
tokens. Look-and-feel reference: the "NonStop Gurukul — L&D Platform" canvas, summarised in
`.plan/design-handoff/`. Why the rules are strict: `.plan/18-redesign.md`.

## When to Use

- Before any JSX or CSS in `apps/web/src` or `packages/ui/src`.
- Adding a page: read **Page anatomy** and **Shell** first.
- Adding a control: find it in **Need → Use**; if it is not there, read **New components**.
- Reviewing a UI PR: run the **Checklist**.
- Not for: course content (lesson prose), the certificate artwork (its own recipe), emails.

## Need → Use

The first column is what you want; the second is the only accepted way to get it. Anything
else is a review blocker, and most of it fails `npm run check:design`.

| Need                                                 | Use                                                                                   | Never                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A page                                               | `Page` → `PageHeader` → content (see Page anatomy)                                    | a bare `<div class="page">`, a page-specific max-width                            |
| A page title                                         | `PageHeader title=…` (it renders the only `h1`)                                       | `<h1 className="…">`, `TopBar` as a page header                                   |
| Navigation chrome                                    | `AppShell` (sidebar) or `FocusedShell` (task); chosen in `routes.tsx`                 | a page drawing its own sidebar or top bar                                         |
| Who is signed in, sign out, profile                  | `UserCard` in the shell (its `Menu`) and `/profile`                                   | name text and buttons in a footer                                                 |
| Moving between Learn, Studio and Admin               | `AreaSwitcher` in the `Sidebar` (only with more than one area)                        | links to other areas mixed into one long nav                                      |
| A list or page that enters                           | `.route-enter`, `g-stagger` + `--i` (see references/components.md)                    | a keyframe with a literal duration, a transform-only reduced motion               |
| A choice from a list (form or filter)                | `Select` (styled native `<select>` with label)                                        | a raw `<select>`, a hand-built dropdown under an input                            |
| Actions on a thing (row, card, account)              | `Menu` (menu button + `role="menu"`)                                                  | a row of five small buttons, a `<details>` used as a menu                         |
| 2–4 mutually exclusive modes                         | `SegmentedControl` (modes) or `Tabs` (views with panels)                              | toggle buttons with `aria-pressed` rebuilt per page                               |
| A boolean setting                                    | `Toggle` (`role="switch"`)                                                            | a checkbox styled as a switch                                                     |
| Search + filters for a list people search            | `SearchCard` (large search field, views, dropdowns, active-filter chips, count)       | a bare search box with loose dropdowns beside it, a filter row of mixed widths    |
| Filters above a table                                | `FilterBar` (search, `Select`s, toggles, Clear filters)                               | `.filters` rows, a paragraph inside a filter row                                  |
| Tabular data                                         | `DataTable` (read-only: no selection or paging, `rowHeader` column)                   | `<table class="plain-table">`, a CSS grid pretending to be a table                |
| A number with its label                              | `StatCard`                                                                            | a card with a big `<p>`                                                           |
| A status word                                        | `Chip tone=…` with the word                                                           | coloured text alone                                                               |
| A person                                             | `Avatar` (initials; colour by role)                                                   | an `<img>` of a Google photo, a coloured `<span>`                                 |
| A course, or any record that opens a page, in a list | `CourseTile` (cover picture, else the name on its colour; the whole tile is the link) | a card where only the title is a link, a `<div onClick>`, a list row for a course |
| Something just happened                              | `useToast()`; a failed action: `toastError(toast, e, fallback)`                       | an error `Callout` kept in state after a click                                    |
| Something is true about this page                    | `Callout` (one per region)                                                            | a toast that should have stayed                                                   |
| Confirm a destructive or costly action               | `Dialog` with a verb-plus-object primary                                              | `window.confirm`, an inline "Are you sure?"                                       |
| One record's detail beside a list                    | `Dialog variant="drawer"`                                                             | a new route for a quick look                                                      |
| First load of a page or region                       | `PageSkeleton` / `Skeleton` in the final layout's shape                               | "Loading…" text, a spinner                                                        |
| Waiting on a click                                   | `Button loading`                                                                      | a label swapped to "Saving…" by hand                                              |
| Nothing to show                                      | `EmptyState` (what the emptiness means + one action)                                  | "No data", an invented zero                                                       |
| A failed load                                        | `Loaded` (warning `Callout` with Retry); shell stays usable                           | a blank page, raw error text                                                      |
| A page that is failed, offline or denied             | `StateCard variant="error\|offline\|forbidden"` (sentence, code, action)              | a bare 404 for a page someone may not open                                        |
| An icon                                              | `Icon` / the named icons in `Icon.tsx`                                                | an emoji, an inline one-off SVG for a UI icon                                     |
| A link that looks like a button                      | `buttonClass(…)` on `<Link>`                                                          | `<a href>` for an in-app route (full reload)                                      |
| ---------------------------------------              | ---------------------------------------------------------------------                 | ------------------------------------------------------------------                |
| A gallery of images, video, files                    | `MediaGallery` (+ `MediaPreview` in the detail drawer)                                | a list of links, a grid of hand-rolled `<img>` cards                              |
| Pick several people from a search                    | `PeoplePicker` (combobox; a pick adds a chip, clears and closes)                      | a `Select` of everyone, a list left open after a choice                           |
| A task in ordered steps                              | `FlowSteps` + `FlowPanel`; `SuccessCheck` at the end                                  | one long form, a wizard with no way back                                          |

## Page anatomy

Every screen in the sidebar shell is exactly this, top to bottom. Leave out what you do not
need; never reorder, never add a second header.

```tsx
<Page width="default">                       {/* reading 780 · default 1120 · wide 1280 */}
  <PageHeader
    eyebrow={t.Admin}                         {/* area or context, from useTerms() */}
    title="Learners"                          {/* the only h1 on the page */}
    lead="Everyone who can sign in, and how far they are."
    breadcrumb={<Breadcrumb …/>}              {/* only below a top-level page */}
    actions={<><Button variant="secondary">Export CSV</Button><Button>Invite & assign</Button></>}
  />
  {notice && <Callout tone="warning">…</Callout>} {/* at most one page-level callout */}
  <div className="stat-row">…StatCards…</div> {/* optional KPIs */}
  <FilterBar>…</FilterBar>                    {/* optional; directly above what it filters */}
  <Loaded state={…}>{(data) => <Card>…</Card>}</Loaded>   {/* content in Cards */}
</Page>
```

- **One primary button per view**, in the header actions or the form footer, never both.
- Content widths come from `Page width`; a page never sets `max-width` itself.
- Two-column layouts use `Page`'s `aside` prop (main + 320px aside), which stacks below
  1024px. The aside holds summary and settings, never the primary task.
- Sections inside a page are `Card`s with a `title`; vertical rhythm is `--space-6` between
  them (`Page` does it; do not add margins).

## Shell

Two layouts, chosen per route in `routes.tsx` (`FOCUSED`), never by a page:

| Layout         | Routes                                                                           | Chrome                                                                                       |
| -------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AppShell`     | Home, catalogue, course, certificates, profile, console, Studio lists, changelog | Ink sidebar: brand, nav groups, `UserCard` pinned at the bottom. Top bar in content: search. |
| `FocusedShell` | Lesson, Quiz, result, Studio course editor, lesson editor, Quiz builder, preview | Ink top bar: back link, title, status (progress or save state), actions. No sidebar.         |

The contract, tested in `packages/ui/test/app-shell.test.tsx`:

- **The chrome never scrolls away.** At ≥ 1024px the sidebar is `position: sticky; top: 0;
height: 100dvh`; its nav scrolls inside it when it is taller than the window; the `UserCard`
  is always visible at the bottom. The content top bar and the focused top bar are sticky.
- **Below 1024px** the sidebar becomes a drawer opened from a Menu button in the top bar:
  scrim, Escape and scrim click close it, focus moves into it and returns to the button,
  navigating closes it. The page never has a sidebar stacked above it.
- **Areas.** The sidebar belongs to one area: Learn (`/`, catalogue, certificates, profile,
  changelog), Studio (`/studio…`) or Admin (`/admin…`, with Design system its own page beside Org
  settings). When the person may open more than one, an `AreaSwitcher` under the brand moves
  between them, the current one follows the route, and the nav lists only that area's pages. A
  person with one area sees no switcher. Global search still reaches every page they may open.
- **Motion.** The routed page enters with a fade and 8px rise (`.route-enter`, `--dur-page`);
  focus still moves to the new `h1`. The active nav item and switcher link change colour on
  `--dur-base`; the drawer, dialogs and lists use the durations in `references/components.md`
  (Motion). Reduced motion zeroes the durations.
- **The page scrolls, not the shell.** Only the document scrolls; no page sets `overflow` on a
  full-height wrapper (it breaks sticky, find-in-page and scroll restore).
- Nav items have an 18px icon and a label; the current item has `aria-current="page"`.
- The `UserCard` shows avatar, name, and email or role; its `Menu` opens on a header with name,
  email and a role chip, then Profile, the label switch, Theme, What's new and Sign out. Sign out is never more than two clicks from any page.

## States

Every region that loads data has all of these designed, and its test renders each:

| State            | Pattern                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Loading (first)  | `Skeleton`s in the shape of the final layout; the `PageHeader` renders at once when the title is known |
| Loading (action) | `Button loading`: label kept, `aria-busy`, disabled; the rest of the form stays readable               |
| Empty            | `EmptyState`: icon, one sentence on what empty means, one action ("Assign a course")                   |
| Error (load)     | `Loaded`: warning `Callout` with Retry inside the region; the shell and other regions keep working     |
| Error (action)   | `toastError(toast, e, fallback)` (`apps/web/src/errors.ts`); field errors inline under the field       |
| Not allowed      | `NotAllowedPage` inside the shell, with a link home                                                    |
| Offline          | `OfflineBanner` under the top bar                                                                      |

A number that failed to load reads "Unavailable", never 0. A count still loading reads "—".

## Controls and forms

- **Every control has a visible label** (`Field label=…`), except inside `FilterBar` where the
  label is visually hidden but present. Placeholder is never the label — but a hidden-label
  search box always has one naming what it searches ("Search by name or email"), or it reads as
  an empty box.
- **Dropdowns are `Select`**: a native `<select>` (phones get their own picker; keyboard and
  screen readers work) with our chevron, 44px height, hover, focus, invalid and disabled
  states. Filter selects start with an "Any …" option; "All" is for tabs and chips.
- **Menus are `Menu`**: a button with `aria-haspopup="menu"` opening `role="menu"` items. Arrow
  keys move, Home/End jump, a letter jumps, Enter/Space choose, Escape and outside click close,
  focus returns to the button. Destructive items sit last, after a separator, in danger text.
- Forms are one column, max 640px, label above control, help under it, error under that.
  Footer: secondary left of primary, both right-aligned; the primary is a verb plus an object
  ("Save settings", "Assign to 23 people"), never "OK", "Submit" or "Yes".
- Saving is explicit (a button) except in Studio editors, which autosave and say so in the top
  bar ("Saved just now").
- Inputs are ≥ 16px text so iOS does not zoom.

## Rules at a glance

| #   | Rule                                                                                                                                                                 | A violation looks like                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Components use a **role** token, never a scale step or raw colour                                                                                                    | `color: #475467`, `background: var(--g-green-500)`                                |
| 2   | **One accent hue.** Green is for the primary action, progress, links and "done"                                                                                      | a blue primary button, a purple link                                              |
| 3   | `--accent-decor` (#08A66A) is decoration only                                                                                                                        | brand green as text on white (3.2:1, fails)                                       |
| 4   | State colours only for real state, always with a word or icon                                                                                                        | an orange "New" badge, red used for emphasis                                      |
| 5   | Three families, through their variables                                                                                                                              | `font-family: system-ui`, a fourth face                                           |
| 6   | Fraunces for titles, never for UI controls or body text                                                                                                              | a serif button label, serif table cells                                           |
| 7   | Hairlines first; shadow only for things that float (menus, dialogs, toasts, drawer)                                                                                  | `box-shadow` on a resting card                                                    |
| 8   | 44px minimum touch target (`--control-height`); `size="sm"` 36px only in dense rows                                                                                  | a 32px icon button in the main UI                                                 |
| 9   | Visible focus on every control (`--focus-ring`)                                                                                                                      | `outline: none` with nothing in its place                                         |
| 10  | Text ≥ 4.5:1 on its ground (3:1 at 24px+)                                                                                                                            | `--g-gray-400` captions                                                           |
| 11  | Real elements: `<button>`, `<Link>`, `<input>` + `<label>`                                                                                                           | a clickable `<div>`, `<a href>` to an in-app route                                |
| 12  | No emoji, no gradient washes, no left-border accent cards                                                                                                            | `🎉 Course complete!`                                                             |
| 13  | Sentence case; role and area names from `useTerms()`, never typed in copy                                                                                            | `MY LEARNING`, a literal "Admin" in a button label                                |
| 14  | Motion on `--ease`, 120–320ms, reduced motion honoured; the only loop allowed is the global loader's                                                                 | a bounce, a looping shimmer, a pulsing badge                                      |
| 15  | **No component markup in `apps/web`**: no `<select>`, `<table>`, `<h1>`                                                                                              | `<h1 className="page__title">`, `<table className="plain-table">`                 |
| 16  | **`apps/web` CSS is layout only**: tokens only, no colour, radius, shadow or font literals                                                                           | `#fff`, `13px` font size or a `box-shadow` literal in `console.css`               |
| 17  | **One width system**: `Page width` reading / default / wide                                                                                                          | `max-width: 960px` on a page class                                                |
| 18  | z-index only from `--z-*` tokens                                                                                                                                     | `z-index: 9999`                                                                   |
| 19  | **A card that stands for one destination is clickable all over**: one real link (the title), stretched over the whole card; hover, focus ring and cursor on the card | only the title being a link; a `<div onClick>`; a link nested in a clickable card |
| 20  | **A course is always a `CourseTile`** (grid), with its picture, else the first image in the course, else its name on its colour                                      | a text-only list row for a course, an empty grey box for a missing image          |

Rules 1, 15, 16, 17 and 18 are checked by `npm run check:design` (`scripts/check-design.mjs`).

## Colour

Two kinds of surface, and one for ceremony:

| Surface      | Ground                             | Text                                                      | Accent                   | Used for                                                  |
| ------------ | ---------------------------------- | --------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| **Work**     | `--bg` (page), `--surface` (cards) | `--text`, `--text-body`, `--text-muted`, `--text-subtle`  | `--accent`               | Lists, lessons, forms, tables                             |
| **Chrome**   | `--chrome`, `--chrome-raised`      | `--chrome-text`, `--chrome-text-strong`, `--chrome-label` | `--chrome-accent` (mint) | Sidebar, focused top bar, sign-in hero, completion screen |
| **Ceremony** | `--paper`                          | `--cover-forest`, `--gold-text`                           | `--gold` hairlines       | The certificate and naming pages only                     |

- Mint (`--chrome-accent`) only ever sits on chrome. On white it fails contrast.
- The primary button on a work surface is `--accent` with `--accent-on`. On chrome it is
  `--chrome-accent` with `--chrome-accent-on` (variant `chrome`).
- A new colour need is a new **role** in `tokens.css` (and `tokens.ts`), defined from the
  scale, never a literal in a component, never `var(--x, #hex)`.
- Course covers use named themes (`forest`, `sand`, `sky`, `stone`) with line-art glyphs.
- Avatars colour by role: learner mint on ink, Educator violet, Admin sand (`--avatar-*`).

## Type

| Use                        | Family                                   | Size / weight                                              |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Page title (`PageHeader`)  | Fraunces 500                             | `--text-3xl` (`--text-2xl` below 640px), `--leading-tight` |
| Course and section titles  | Fraunces 500                             | `--text-xl`–`--text-2xl`                                   |
| Card titles                | Inter 600                                | `--text-lg`                                                |
| Body, lesson prose         | Inter 400                                | `--text-md` (lessons 16.5px), `--leading-body`             |
| UI, tables, buttons        | Inter 500/600                            | `--text-sm`                                                |
| Micro labels (`CHAPTER 3`) | Inter 600, uppercase, `--tracking-label` | `--text-xs`                                                |
| Code                       | JetBrains Mono 400                       | 13–14px                                                    |

Weights 400, 500, 600 and 700 only. Load all three families from one Google Fonts `css2` link
with `display=swap`.

## Shape and space

- Radius: `--radius-md` (10px) controls and nav items, `--radius-lg` code wells and blocks,
  `--radius-xl` cards, `--radius-pill` chips and bars. Not square, not bubbly.
- Spacing is a 4px grid (`--space-*`). Lay out siblings with flex or grid and `gap`; no margins
  between siblings.
- Breakpoints: 1024px (sidebar ↔ drawer, aside stacks), 640px (titles step down, button rows
  wrap). Check every change at 1280 and 390. Wide tables scroll inside their card; the page
  never scrolls sideways.

## New components

When a screen needs something no component does:

1. Check **Need → Use** and `references/components.md` again: most "new" needs are a variant.
2. Build it in `packages/ui/src/<Name>.tsx` + `<name>.css`, exported from `index.ts`. Real
   elements, keyboard support, an accessible name.
3. Test every variant and state with an axe check (`packages/ui/test/`), 100% coverage.
4. Add its recipe to `references/components.md` and its row to **Need → Use**.
5. Add an example to the Design system tab (`apps/web/src/design-system/`) with its one-line
   rule. The tab's test fails if an exported component has no example.

## Voice

- Role and area names come from the person's label set: `${t.Quiz} II · Branching & merging`
  reads "Quiz II" or "Pariksha II". Mid-sentence use the lower-case key (`t.learners`);
  `article(t.admin)` gives "an Admin" or "a Kulapati".
- Specific over generic: "Resume — Resolving merge conflicts", not "Continue".
- Buttons are a verb plus an object. No "please", no exclamation marks, no emoji.
- No invented numbers. Missing data says so; empty states say what empty means.
- Encouraging, never cute: "Quiz II cleared." not "Woohoo!".
- Metadata joins with " · "; durations "≈ 3 h 10 min"; dates "15 Nov".

## Common Mistakes

| Mistake                                                        | Fix                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Making only a card's title a link, or a card a `<div onClick>` | The title's link stretches over the card (`CourseTile`); the card is one link, hover, focus ring and cursor included |
| Styling a native control in page CSS to "match"                | Use the `@gurukul/ui` control; fix the control if it is wrong                                                        |
| A filter row built from `Field`s in a `div`                    | `FilterBar`                                                                                                          |
| `min-height: 100vh; overflow: auto` on a page wrapper          | Delete it; the document scrolls, the shell is sticky                                                                 |
| A page adding its own back link above the title                | `PageHeader breadcrumb`, or the route belongs in `FocusedShell`                                                      |
| Two primary buttons (header and footer)                        | Keep the one nearest the task                                                                                        |
| A test selecting by class name                                 | `getByRole` / `getByLabelText`; the redesign must not break e2e names                                                |

## Red Flags - STOP

- "This page is special, it needs its own header / width / table."
- "I'll copy the component and tweak it here."
- "Just a quick `<select>` / `<table>` / `<h1>`."
- "The colour is close enough to a token." Use the token or add a role.
- "Loading text is fine for now." / "The error state can come later."
- "I'll add it to the Design system tab later."

All of these mean: stop, use or extend the component, and finish its states now.

## Checklist before a UI PR

1. `npm run check:design` passes (tokens only, no component markup in `apps/web`, widths, z-index).
2. The page follows Page anatomy; one `h1`, one primary action.
3. Loading, empty and error states exist and are tested; action buttons use `loading`.
4. Every interactive element is a real control, reachable by Tab, with a visible focus ring;
   menus and drawers pass the keyboard contract.
5. Checked at 1280px and 390px: chrome stays put, nothing scrolls sideways.
6. Contrast checked for any new text and ground pair (axe in the page test).
7. A new component has a recipe, a Need → Use row and a Design system example.
8. e2e roles and names unchanged, or the spec is updated in the same change.
