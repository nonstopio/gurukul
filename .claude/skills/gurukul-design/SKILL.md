---
name: gurukul-design
description: Use when building, restyling or reviewing any NonStop Gurukul screen or component — the learner app, Kulapati console, Vyasa Studio, certificates — so colour, type, shape, motion, accessibility and voice stay consistent.
---

# Gurukul design system

Gurukul looks like a modern product with a little ceremony: light working
surfaces, a dark ink chrome (sidebars, top bars), one NonStop green accent,
Inter for everything you read and click, Fraunces for titles and moments that
matter (course names, the certificate), and JetBrains Mono for code. The
Mahabharata shows up in **words** (Shishya, Parva, Pariksha), not in ornament.

**Values live in `packages/ui/src/tokens.css`.** This file states the rules; the
CSS states the numbers. When they disagree the CSS is right and this file is
stale — fix it here. Component recipes are in `references/components.md`. The
reference screens are the 19 artboards of the "NonStop Gurukul — L&D Platform"
design canvas.

## Rules at a glance

| #   | Rule                                                                            | A violation looks like                             |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Components use a **role** token, never a scale step or raw colour               | `color: #475467`, `background: var(--g-green-500)` |
| 2   | **One accent hue.** Green is for the primary action, progress, links and "done" | a blue primary button, a purple link               |
| 3   | `--accent-decor` (#08A66A) is decoration only                                   | brand green as text on white (3.2:1, fails)        |
| 4   | State colours only for real state, always with a word or icon                   | an orange "New" badge, red used for emphasis       |
| 5   | Three families, through their variables                                         | `font-family: system-ui`, a fourth face            |
| 6   | Fraunces for titles, never for UI controls or body text                         | a serif button label, serif table cells            |
| 7   | Hairlines first; shadow only for things that float                              | `box-shadow` on a resting card                     |
| 8   | 44px minimum touch target                                                       | a 32px icon button in the main UI                  |
| 9   | Visible focus on every control (`--focus-ring`)                                 | `outline: none` with nothing in its place          |
| 10  | Text ≥ 4.5:1 on its ground (3:1 at 24px+)                                       | `--g-gray-400` captions                            |
| 11  | Real elements: `<button>`, `<a href>`, `<input>` + `<label>`                    | a clickable `<div>`                                |
| 12  | No emoji, no gradient washes, no left-border accent cards                       | `🎉 Course complete!`                              |
| 13  | Sentence case; Sanskrit term paired with English on first sight                 | `MY LEARNING`, "Pariksha" with no hint of "quiz"   |
| 14  | Motion on `--ease`, 120–320ms, reduced motion honoured                          | a bounce, a looping shimmer                        |

## Colour

Two kinds of surface:

| Surface      | Ground                             | Text                                                      | Accent                   | Used for                                                  |
| ------------ | ---------------------------------- | --------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| **Work**     | `--bg` (page), `--surface` (cards) | `--text`, `--text-body`, `--text-muted`, `--text-subtle`  | `--accent`               | Lists, lessons, forms, tables                             |
| **Chrome**   | `--chrome`, `--chrome-raised`      | `--chrome-text`, `--chrome-text-strong`, `--chrome-label` | `--chrome-accent` (mint) | Sidebar, focused top bar, sign-in hero, completion screen |
| **Ceremony** | `--paper`                          | `--cover-forest`, `--gold-text`                           | `--gold` hairlines       | The certificate and naming pages only                     |

- Mint (`--chrome-accent`) only ever sits on chrome. On white it fails contrast.
- The primary button on a work surface is `--accent` with `--accent-on`. On
  chrome it is `--chrome-accent` with `--chrome-accent-on` (variant `chrome`).
- A new colour need is a new **role** in `tokens.css`, defined from the scale,
  never a literal in a component.
- Course covers use a small set of named themes (`forest`, `sand`, `sky`,
  `stone`) with line-art glyphs, never photos or gradients.

## Type

| Use                       | Family                                   | Size / weight                                  |
| ------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Page title                | Fraunces 500                             | `--text-3xl`–`--text-4xl`, `--leading-tight`   |
| Course and section titles | Fraunces 500                             | `--text-xl`–`--text-2xl`                       |
| Body, lesson prose        | Inter 400                                | `--text-md` (lessons 16.5px), `--leading-body` |
| UI, tables, buttons       | Inter 500/600                            | `--text-sm`                                    |
| Micro labels (`PARVA 3`)  | Inter 600, uppercase, `--tracking-label` | `--text-xs`                                    |
| Code                      | JetBrains Mono 400                       | 13–14px                                        |

Load all three from one Google Fonts `css2` link with `display=swap`.

## Shape and space

- Radius: `--radius-md` (10px) for controls and nav items, `--radius-lg` for
  code wells and blocks, `--radius-xl` for cards, `--radius-pill` for chips and
  progress bars. Not square, not bubbly.
- Spacing is a 4px grid (`--space-*`). Lay out siblings with flex/grid + `gap`.
- Pages are fluid: sidebar + content is a `flex-wrap` row (sidebar `1 1 248px`,
  content `999 1 560px`) so the sidebar stacks on a phone. Content max-width
  ~1120–1200px. Wide tables scroll inside their card.

## Components

`packages/ui` ships the shared pieces; screens compose them. Current:

| Component                                                       | Status  |
| --------------------------------------------------------------- | ------- |
| `Button` / `buttonClass` (primary, secondary, ghost, chrome)    | shipped |
| `CommandPalette` (global search dialog: combobox + listbox)     | shipped |
| Chip, ProgressBar, ProgressRing, Card, NavItem, Sidebar, TopBar | shipped |
| Tabs, Field (input/select/textarea + label), Toggle, Callout    | shipped |
| EmptyState, Skeleton, Toast, Breadcrumb                         | shipped |
| CodeBlock, VideoBlock, QuizOption, ResultRow                    | shipped |
| Seal, Certificate, StatCard                                     | shipped |
| DataTable, Pagination, EmailChipInput, StepCard (Stepper.Step)  | shipped |
| Dialog (modal and drawer), BarChart, FunnelBar                  | shipped |
| DragList, BlockFrame, LayoutPicker, ColourSwatch, TypeTile      | shipped |

Recipes, states and accessibility notes: `references/components.md`.

## Voice

- Plain English first, Sanskrit as flavour: "Pariksha II · Branching & merging",
  "Kulapati console". The first time a term appears on a screen, the English
  role is nearby ("Acharya · Educator").
- Specific over generic: "Resume — Resolving merge conflicts", not "Continue".
- No invented numbers in UI copy or empty states. Missing data says so.
- Encouraging, never cute: "Pariksha II cleared." not "Woohoo!".

## Checklist before a UI PR

1. Only role tokens and `--space-*`/`--radius-*` in new CSS (`grep -E '#[0-9a-fA-F]{3,6}'` your diff).
2. Every interactive element is a real control, reachable by Tab, with a visible focus ring.
3. Contrast checked for any new text/ground pair.
4. Layout checked at 1280px and 390px.
5. Icon-only buttons have `aria-label`; decorative SVG has `aria-hidden="true"`.
