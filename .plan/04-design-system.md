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
motion except the loader's cycle, where the G and the loading owl stop moving and only pulse in opacity. Toasts stay 4s (success), 6s
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

## The owl mascot

Gurukul's companion is an owl, the "Classic" drawing: a NonStop green body, a saffron belly and
feet, a pale face disc. It is Eklavya's mascot system ported to Gurukul: the same 24 expressions
with the same names, the same product states mapped to them, the same fallbacks, redrawn on the
owl's face. It is original artwork in this repository (MIT), no assets copied.

- **Component.** `Mascot` in `packages/ui/src/Mascot.tsx`, drawn as inline SVG on a 200 by 200
  grid; colours are the `--mascot-*` roles in `tokens.css`, the same on both grounds except a
  lighter body and a darker shadow in Dark so the owl does not sink into the ground.
- **Faces.** neutral, happy, excited, celebrate, curious, thinking, focused, wink, surprised,
  confused, worried, sad, sleepy, proud, determined, idea, laugh, love, shy, relieved, starstruck,
  cool, hopeful, nervous (`MASCOT_EXPRESSIONS`, with the words each one means). Extras sit around
  the owl: sparkles (celebrate, proud), a lightbulb (idea), blush (laugh, love, shy), a sweat drop
  (relieved, nervous), eye shine (idea, hopeful). An unknown face is `neutral`.
- **States.** Product UI asks for a moment, not a face, so the owl reacts the same way
  everywhere: idle → sleepy, info → neutral, success → happy, complete and milestone →
  celebrate, empty and notFound → curious, loading → cool, review → focused, tip → wink, new →
  surprised, validation → confused, warning → worried, error → sad. A state wins over an
  expression; an unknown state is `neutral`. A learner's wrong answer is `tip`, never `sad`.
- **Variants.** `body` (the whole owl), `face` (the head cropped, for 24–40px), `loading` (the
  owl waddles in place, wings flapping, one cycle of `--dur-loader`; transform and opacity only;
  under reduced motion it stands still and only pulses in opacity). Eklavya's second loader, the bow draw, has no owl equivalent and is
  left out.
- **Sizes.** Faces at 24–40px; the whole owl at 56px inline or 64px and up in open space; the
  loader at 56px inline or 96px on a page. Size is clamped to 16–512, anything else is 64.
- **Accessibility.** Decorative (`aria-hidden`) by default: the text beside it carries the
  meaning. A `label` makes it a named image, only when the picture says something on its own. A
  loader's words belong to one surrounding `role="status"` region, in plain words saying what is
  happening ("Loading your courses"), never a joke verb.
- **Admin → Mascot** (`/admin/mascot`, right after Design system, Admins only) is the owl's own
  page, Eklavya's mascot studio for Gurukul in the same order: a large owl beside a headline with
  "Show face only" and "Play loading loop" toggles, a grid of all 24 faces (each a toggle button;
  picking one updates the large owl and its label), both loaders with a pause control, the size
  scale, the 14 states as toggle chips (the owl for the chosen state, `state → face`, a line of
  copy and when to use it), the owl on a fixed light and dark ground (`ground`, from the
  `--mascot-light-*` and `--mascot-dark-*` roles, whatever the theme), then copyable code, the
  usage note and the wrong-answer callout. Its toggles are `Button aria-pressed`. The Design system page keeps the short `Mascot` example.
- **Where it appears.** Through the shared components, so every caller gets it from one edit:
  every `EmptyState` (curious, 64px; `notFound` for a missing course, lesson, Quiz or page,
  `success` for good news such as "Nobody is overdue"; an `icon` such as a lock replaces it), the
  failed-load and failed-request `Callout`s (`mascot="error"`, face 32px; Retry, the error code
  and Report issue unchanged), every `StateCard` (64px: error sad, offline worried, forbidden
  confused). Every alert box leads with the owl's face in place of an icon, top-aligned beside its
  words: every `Callout` (32px, by tone: note info, tip wink, warning worried), every
  `Explanation` (32px: correct happy, incorrect the `tip` wink, never sad, neutral info), every
  `Toast` (32px, by tone), and `Dialog mascot` (40px: confirm and delete dialogs `warning`, the
  update dialog `new`; a dialog whose body already has a `Callout` takes none); the sign-in refusal
  and the Assign failures are warning `Callout`s (sign-in: a non-NonStop account is `validation`,
  confused, since picking it was the person's choice; "Sign-in did not finish" is `error`, sad), the
  offline banner a 24px face. One-line field errors under a control stay plain text.
  Admin → Design system → Alerts raises each of these from a button. The owl also leads the
  `GlobalLoader` (`section` and `overlay`: the waddling owl at 96px with its words; `inline` keeps
  the small G), which now shows while the session loads, and the feature-tip bubble (wink face, 28px). With `PageHeader mascot`:
  course complete (`milestone`), the crash page (`error`) and a missing certificate (`notFound`).
  The Quiz result shows the owl beside the score (`complete` on a pass, `tip` on a miss). Skeletons stay wherever the layout is known, and
  the boot loader in `index.html` keeps the G (it paints before any script or component).

## Decisions

- No Tailwind or CSS-in-JS: plain CSS with custom properties keeps tokens the
  single source and the bundle small.
- No icon font: inline Lucide-style stroke SVG components in `packages/ui/src/Icon.tsx`.
- No chart library: the few charts are simple SVG, keeping bundle and licence surface small.
