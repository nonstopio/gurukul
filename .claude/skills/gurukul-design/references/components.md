# Gurukul component recipes

Each recipe lists the tokens it uses, its states and its accessibility contract.
"Shipped" means it exists in `packages/ui`; the rest are specifications for M1+.

## Button — shipped

`<Button variant="primary|secondary|ghost|chrome" icon={…}>`; for links use
`<a className={buttonClass('secondary')} href>`.

| Variant   | Ground | Tokens                                             | Use                           |
| --------- | ------ | -------------------------------------------------- | ----------------------------- |
| primary   | work   | `--accent` / `--accent-on`, hover `--accent-hover` | The one main action in a view |
| secondary | work   | `--surface`, `--border-strong`, `--text`           | Everything else               |
| ghost     | work   | `--accent` text, hover `--accent-soft`             | Inline "+ Add lesson" actions |
| chrome    | chrome | `--chrome-accent` / `--chrome-accent-on`           | Primary action on dark chrome |

States: hover, `:focus-visible` (`--focus-ring`), disabled (0.5 opacity,
`not-allowed`). Height `--control-height`. Defaults to `type="button"`.

## CommandPalette — shipped

`<CommandPalette open onClose search={(q) => items} onSelect label placeholder emptyText pageSize>`.
Generic: the caller decides what is searched and what selecting does (global search passes pages).

| Part      | Tokens                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Layer     | fixed, centred 12vh from the top; backdrop is a real `<button>` (ink at 55%) that closes                    |
| Panel     | `--surface`, 1px `--border`, `--radius-xl`, `--shadow-float` (it floats), max 640px wide, 70vh tall         |
| Input row | 44px input, `--text-md`, `Esc` key cap                                                                      |
| Option    | 44px, `--radius-md`; selected `--accent-soft`; label 14/600, sub 12 `--text-muted`, kind 12 `--text-subtle` |
| Footer    | key hints, `aria-hidden`                                                                                    |

Keyboard: focus stays in the combobox (`aria-activedescendant`); ↑ ↓ move (clamped), Enter opens,
Escape closes, Tab is held; Enter ignored while an IME composes. Options are `tabIndex={-1}` and
swallow `mousedown` so a click never steals focus. Twenty rows, then "Show N more". A
`role="status"` region announces the count; focus returns to the opener on close.

## Chip

24px tall, `--radius-pill`, 12px/600 text. Tones: neutral (`--surface-sunken`
/ `--text-body`), accent (`--accent-soft` / `--accent-soft-text`), warning,
danger, info (each `*-soft` ground with its strong colour as text), solid
(`--accent` / `--accent-on`) for "Completed". Always carries a word.

## ProgressBar and ProgressRing

Track `--border`, fill `--accent-decor`, `--radius-pill`. Bar 6–8px tall.
`role="progressbar"` with `aria-valuenow/min/max` and an `aria-label`; the
percentage is also printed as text beside it.

## Card

`--surface`, 1px `--border`, `--radius-xl`, no shadow. A highlighted card
(current parva) uses `--g-green-200`-derived role `--accent-line` (add it when
first needed) as border and a pale accent header.

## Sidebar and NavItem

Sidebar: `--chrome`, 24px/16px padding, logo + "Gurukul" in Fraunces
`--chrome-accent`, groups headed by micro labels in `--chrome-label`. NavItem:
44px, `--radius-md`, `--chrome-text`; hover `--chrome-hover`; current
`--chrome-active` + white text + `aria-current="page"`. Never a left-border
indicator. User card pinned to the bottom (`margin-top: auto`).

## TopBar (focused mode)

Used by the lesson player, Pariksha and editors: `--chrome`, back link, course
title in Fraunces, progress or save state on the right, primary action as
`chrome` button.

## Field

Label above (13px/600 `--text-body`), control 44px, `--border-strong`,
`--radius-md`; focus `--focus-ring`; error text `--danger` with an icon and
`aria-describedby`. Toggles are real checkboxes styled as switches.

## Table

Header row 12px/600 `--text-muted` on `--g-gray-25`-derived role; rows 14px,
1px `--border` separators; numbers right-aligned; whole table inside an
`overflow-x: auto` box. Row selection uses checkboxes with labels.

## Callout

Rounded `--radius-lg` box on a soft state ground with a 1px matching line,
an icon and a bold lead-in. Tones: note (info), tip (warning palette), warning
(danger palette). No left-border accent.

## CodeBlock

Header `--code-header` with filename in mono and a Copy button (`aria-label`
when icon-only); body `--code-bg`, `--code-text`, 13.5px/1.7. Highlighted
lines get a subtle mint wash. Horizontal scroll, never wrapped.

## QuizOption

A full-width `<button aria-pressed>` with a 32px letter badge. States:
idle (`--border-strong`), selected (`--text` border), correct (`--accent-decor`
border, `--accent-soft` ground), wrong (`--danger` border, `--danger-soft`).
Feedback is announced in a `role="status"` region and always says the right
answer in words.

## Certificate

Fixed 1123×794 (A4 landscape). Forest frame, `--paper` sheet, `--gold` hairline,
corner ornaments, learner name in Fraunces italic, seal in forest + gold with
the Gurukul monogram. Printed and exported as PDF client-side.
