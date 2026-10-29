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

Light work surfaces (`#F6F7F5` page, white cards, hairline borders), a dark ink
chrome (`#061316` sidebars and focused top bars), NonStop green for action and
progress (`#05764C` for text and fills, `#08A66A` for decoration, mint
`#24D39A` only on chrome). Inter for UI, Fraunces for titles and ceremony,
JetBrains Mono for code. The certificate is the one "paper and gold" surface.

## Component roadmap

| Milestone | Components |
|---|---|
| M1 | Chip, ProgressBar, ProgressRing, Card, Sidebar + NavItem, TopBar, Field (Input, Select, Textarea), Toggle, Tabs, Callout, EmptyState, Skeleton, Toast |
| M2 | CodeBlock (copy, highlight, terminal), VideoBlock (YouTube/Drive/Loom with captions), QuizOption, ResultRow, Breadcrumb |
| M3 | Certificate, Seal, StatCard, BarChart (SVG, no chart library), FunnelBar |
| M4 | DataTable (selection, pagination, sticky header), EmailChipInput, Stepper, Dialog |
| M5 | DragList (keyboard reorderable), BlockFrame, LayoutPicker, ColourSwatch |

Each component ships with: a recipe in `references/components.md`, tests for
every variant/state and keyboard path, 100% coverage, and a story-style
example page at `/__ui` in development builds only.

## Accessibility bar

WCAG 2.1 AA. Automated: axe-core (`test/axe.ts` helper) in component and page tests and
Playwright axe scan on every route (M6). Manual per release: keyboard-only
walkthrough of the learner path and Studio, VoiceOver spot check.

## Dark mode

Not in v1. Tokens are role-based so a `[data-theme="dark"]` block can be added
later without touching components.

## Decisions

- No Tailwind or CSS-in-JS: plain CSS with custom properties keeps tokens the
  single source and the bundle small.
- No icon font: inline Lucide-style stroke SVG components in `packages/ui/src/Icon.tsx`.
- No chart library: the few charts are simple SVG, keeping bundle and licence surface small.
