# Shared patterns

## App shells

### Sidebar shell (Home, Course overview, console, Studio lists)

| Part | Spec |
|---|---|
| Root | `display:flex; flex-wrap:wrap; min-height:100vh` |
| Sidebar | `flex: 1 1 248px`, `--chrome`, padding `--space-6` / `--space-4`, column gap `--space-8` |
| Brand | Logo PNG 26px tall (white wordmark: chrome only) · 1px `--chrome-line` divider · "Gurukul" Fraunces 19px `--chrome-accent` |
| Nav group | Micro label (11px/600, 0.12em, uppercase, `--chrome-label`) + NavItems |
| NavItem | 44px, `--radius-md`, 14px/500 `--chrome-text`, 18px stroke icon; hover `--chrome-hover`; current `--chrome-active`, white text, `aria-current="page"` |
| User card | Pinned bottom; 36px initials avatar; name 14px/600 white; email or role 12px `--g-ink-200` |
| Content | `flex: 999 1 560px; min-width:0`, padding `--space-10` / `clamp(20px, 4vw, 56px)`; inner `max-width: 1120px` (console 1200px), centred |

Nav sets: **Learner** (My learning, Course catalog, Certificates; "Consoles"
group only with roles) · **Kulapati** (Sanjaya overview, Learners, Assign
courses, Course analytics, Roles & access; Switch to: Vyasa Studio, My
learning) · **Studio** (Courses, Question bank, Media library; Switch to).

### Focused shell (Lesson, Pariksha, Result, editors)

Top bar: `--chrome`, padding 12px `clamp(16px,3vw,32px)`, wraps. Left: back
link (44px target, chevron + label, `--chrome-text`) · divider · course title
Fraunces 17–18px white. Right: progress (6px bar `--chrome-active` track,
mint fill, "44% · 10 / 22") or save state, then actions (`chrome` Button).

## Breakpoints

| Width | Behaviour |
|---|---|
| ≥ 1280 | As drawn |
| 900–1279 | Two-column content wraps to one column where cards have `flex-basis` > half |
| < 808 (sidebar + 560) | Sidebar stacks above content full width; nav becomes a horizontal scroll row (M1 decision: collapse to a menu button below 560px) |
| < 560 | Tables scroll horizontally in their card; button rows wrap; page titles step down one size |

Test widths: 1440, 1280, 900, 390.

## Shared states

| State | Pattern |
|---|---|
| Loading (first) | Skeleton blocks matching the final layout; no spinners for page loads |
| Loading (action) | Button shows a 16px spinner, keeps its label, `aria-busy="true"`, disabled |
| Empty | `EmptyState`: 40px line icon, one sentence, one action. Never invented numbers |
| Error (load) | Inline Callout (warning tone) with retry; the shell stays usable |
| Error (action) | Toast (bottom-left, 5s, `role="status"`, dismissible) + inline field errors |
| Offline | Thin banner under the top bar: "You're offline. Progress will sync when you're back." |
| Not allowed | Full content-area message with a link back to My learning |

## Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Buttons, nav items | hover/focus | background colour | `--dur-fast` | `--ease` |
| Progress bars/rings | value change | width / dash offset | `--dur-slow` | `--ease` |
| Quiz option feedback | answer checked | border + ground colour | `--dur-base` | `--ease` |
| Toast | show/hide | fade + 8px rise | `--dur-base` | `--ease` |
| Completion certificate | screen enters | fade + 12px rise, then settles at -1.5° | `--dur-slow` | `--ease` |

All durations go to 0 under `prefers-reduced-motion`.

## Accessibility (applies to every screen)

- Landmarks: `<aside>`/`<nav aria-label>`, one `<main>`, one `<h1>` per page.
- Skip link "Skip to content" as the first focusable element.
- Focus order follows reading order; focus moves to the `<h1>` on route change
  and route changes are announced (`aria-live="polite"` title region).
- Icon-only buttons have `aria-label`; decorative SVG `aria-hidden="true"`.
- Status chips always include words, never colour alone.

## Global search (shipped in M0)

Trigger: a 44px field-shaped button ("Search" + key cap `Ctrl K` / `⌘K`) in the top bar of every
shell; on the M0 placeholder it sits fixed top-right. Palette spec: `CommandPalette` recipe in
`.claude/skills/gurukul-design/references/components.md`. Results show label, "Area · description"
and a kind ("Page"). Empty: "No pages match “query”." From M2 results add courses and lessons
(kind "Course", "Lesson"), ranked after pages on a tie.

## Changelog (shipped in M0) — `/changelog`

Single column, max 880px. Header: micro label "Gurukul · Platform", `<h1>` "Changelog" Fraunces,
sub-line. Filter row: labelled search field, Area and Kind selects (options only for values in
use), live count "3 of 4" (`role="status"`). Groups: "Unreleased — merged, not yet in a release"
first, then each `release-*` newest first; group heading micro label in `--accent` with a change
count. Entry card: kind chip (New accent, Fix warning, Security danger, Operability info, Docs and
Housekeeping neutral), area chip, id in mono, date right-aligned; title 16/600; the why in body
text; detail as bullets or prose; notes in a "Background" disclosure; deploy note in a warning
panel. Linked from the M1 sidebar footer ("What's new") for everyone.
