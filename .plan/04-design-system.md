# 04 · Design system

The contract is `.claude/skills/gurukul-design/SKILL.md`; the values are
`packages/ui/src/tokens.css`. This file plans how the system grows.

## Already in place (M0)

- Two-layer tokens: scale (`--g-*`) and roles (`--bg`, `--text`, `--accent`,
  `--chrome-*`, state, ceremony, code, type, space, radius, motion).
- `Button` / `buttonClass` with four variants, tests at 100%.
- `CommandPalette` (global search dialog), keyboard and screen-reader tested.
- A token test that fails if a role in `tokens.ts` is missing from the CSS.
- Rules: role tokens only, one accent, 44px targets, focus ring, 4.5:1, real
  elements, no emoji or gradient washes.

## Look in one paragraph

Two themes, Light and Dark, that follow the system until a person chooses (System / Light / Dark in
the account menu and Profile, kept on the device). Light: a warm `#F6F7F3` page, white cards, a
light-tinted sidebar that follows the theme (no permanent dark slab). Dark: deep green `#0E1511`
ground. NonStop green is the one accent (`#0A6A46` in Light, `#46D39B` in Dark); saffron is a
highlight fill (streaks, new), never text on a surface. Body text holds 11:1 or
more, the palest text 5:1 or more, control edges 3:1 or more, in both themes. Inter for UI,
Fraunces for titles and ceremony, JetBrains Mono for code. The certificate is the one "paper and
gold" surface. The full system, with live previews, is the "Gurukul Design System" artifact
(palette, motion, states, flows, where things go); this file is what the code follows.

## Component roadmap

| Milestone | Components |
|---|---|
| M1 | Chip, ProgressBar, ProgressRing, Card, Sidebar + NavItem, TopBar, Field (Input, Select, Textarea), Toggle, Tabs, Callout, EmptyState, Skeleton, Toast |
| M2 | CodeBlock (copy, highlight, terminal), VideoBlock (YouTube/Drive/Loom with captions), QuizOption, ResultRow, Breadcrumb |
| M3 | Certificate, Seal, StatCard, BarChart (SVG, no chart library), FunnelBar |
| M4 | DataTable (selection, pagination, sticky header), PeoplePicker (also takes emails), Stepper, Dialog |
| M5 | DragList (keyboard reorderable), BlockFrame, ColourSwatch |

Each component ships with: a recipe in `references/components.md`, tests for
every variant/state and keyboard path, 100% coverage, and a live example in
the Design system tab of Org settings (Admins only; `18-redesign.md`). Since the
redesign, screens are assembled from these components only: page CSS lays them
out and `npm run check:design` enforces it.

## Accessibility bar

WCAG 2.1 AA. Automated: axe-core (`test/axe.ts` helper) in component and page tests and
Playwright axe scan on every route (M6). Manual per release: keyboard-only
walkthrough of the learner path and Studio, VoiceOver spot check.

## Dark mode and motion

Roles keep their names; `tokens.css` declares Light values in `:root` and Dark values in
`:root[data-theme='dark']` and, when no choice is saved, `@media (prefers-color-scheme: dark)`
(a test keeps the two dark blocks identical). `index.html` applies the saved choice before first
paint and shows a boot loader until the session is known. Motion tokens: `--ease` (out), `--ease-in`,
`--ease-in-out`, `--ease-spring`; `--dur-instant` to `--dur-page`; all collapse to 0 under reduced
motion except the loader's cycle, where the G stops moving and only pulses in opacity. Toasts stay 4s (success), 6s
(info), 8s (warning) and until closed (error).

## Reporting a failure

Every error toast, every failed load (`Loaded`, the Studio draft and analytics notices) and the crash
page carry **Report issue**: a link that opens a new bug on the
public GitHub repo with the `bug.yml` form already filled (what failed, the sentence shown, the UI
code, the API code and trace id, the page, area, browser, time and build). The person reads it and
submits; nothing is sent without them. The issue is public, so the report holds only what the app
wrote: raw error text only from JavaScript engine errors (which quote code, not data), never from
Firestore or the API, whose trace id finds the details in the logs; and every sentence is scrubbed
of emails, long ids and long numbers as a second net (`apps/web/src/report.ts`).
It replaces "write to gurukul@nonstopio.com" on error screens. The sign-in page has no email
link either (maintainer's choice, 2026-11-05): its footer carries the app bar's open-source line,
whose "Tell us" link opens a GitHub issue, and the people who built Gurukul.

## Decisions

- No Tailwind or CSS-in-JS: plain CSS with custom properties keeps tokens the
  single source and the bundle small.
- No icon font: inline Lucide-style stroke SVG components in `packages/ui/src/Icon.tsx`.
- No chart library: the few charts are simple SVG, keeping bundle and licence surface small.
