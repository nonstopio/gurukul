---
paths:
  - 'apps/web/src/**'
  - 'packages/ui/**'
---

# Design system first — screens are assembled, not drawn

Before writing or changing any JSX or CSS here, read `.claude/skills/gurukul-design/SKILL.md`
(Need → Use, Page anatomy, Shell, States) and `references/components.md` for the component you
touch. These are blocking rules, not preferences.

- **Use the component or build it.** If a `@gurukul/ui` component does it, use it. If none does,
  build or extend it in `packages/ui` first (tests, axe, recipe, Need → Use row, Design system
  example), then use it. Never a local copy, never a look-alike class in `apps/web`.
- **Every sidebar page is `Page` → `PageHeader` → content.** `PageHeader` renders the only `h1`.
  Widths come from `Page width` (reading, default, wide). Shells are chosen in `routes.tsx`.
- **No component markup in `apps/web`:** no raw `<select>`, `<table>` or `<h1>`; dropdowns are
  `Select`, actions are `Menu`, tables are `DataTable`.
- **`apps/web` CSS is layout only** (grid, flex, gap, order, columns) with tokens: no hex, no
  `rgb()`, no px font size, no `box-shadow`, no `border-radius` literal, no raw `z-index`.
- **A card that stands for one destination is clickable all over.** One real link (its title)
  stretched over the card with `::after { inset: 0 }`; never only the title, never a `<div onClick>`, never a checkbox beside a course's name (a course you pick is a `CourseTile` with `onSelectedChange`),
  never a link nested in a clickable card. A course in any list is a `CourseTile`: its picture,
  else the first image in the course, else its name on its own colour. A list people search gets a
  `SearchCard`, not loose inputs.
- **No native checkbox or radio.** An on/off setting (a role, a notification, a rule) is a `ToggleCard` (name left, switch right); a tick
  in a list or "select all" is a `Checkbox`; one of several is a `Radio`; a card you pick is a
  `ChoiceCard` or `CourseTile`. `check:design` rejects `type="checkbox"` and `type="radio"` in `apps/web`.
- **A person is picked with `PeoplePicker`, everywhere.** Never a bare email box, a "find a person" text
  field with buttons under it, or a checkbox list of everyone: focus lists people with photos, typing
  narrows, a pick becomes a chip (`PeopleField` wires it to the console). Teams you pick are `ChoiceCard`s.
- **Every data region has loading, empty and error states**, and its test renders each. Action
  buttons use `Button loading`.
- Tests select by role and label, never by class; keep e2e role names stable or update the spec
  in the same change.

`npm run check:design` (`scripts/check-design.mjs`) enforces the markup and CSS rules and runs
in `npm run check`. An exception goes in its allow-list with the reason, never as a workaround.
