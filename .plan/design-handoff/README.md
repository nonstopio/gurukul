# Design handoff

Developer handoff for the 19 artboards on the design canvas **"NonStop
Gurukul — L&D Platform"** (claude.ai artifact, private to the maintainer —
ask for access; exported PNGs go in `.plan/design-handoff/screens/` once taken).

The canvas is the visual reference; these files are the build contract. Where
they differ, these files win and the canvas is updated.

| File | Screens |
|---|---|
| [00-shared-patterns.md](00-shared-patterns.md) | App shells, breakpoints, tokens per surface, shared states, motion, accessibility |
| [01-learner.md](01-learner.md) | 01 Sign in · 02 Home · 03 Course overview · 04 Lesson player · 05 Pariksha · 06 Result · 07 Complete · 08 Certificate |
| [02-kulapati-console.md](02-kulapati-console.md) | 09 Sanjaya overview · 10 Learners · 11 Assign courses · 12 Roles & access · 13 Course analytics |
| [03-vyasa-studio.md](03-vyasa-studio.md) | 14 Courses · 15 Course editor · 16 Lesson editor · 17 Pariksha builder |

Artboards 18 (Naming) and 19 (Data model) are documentation, covered by
`README.md` and `02-data-model.md`.

## Conventions in these specs

- Token names refer to `packages/ui/src/tokens.css` (`--accent`, `--space-6`).
  Raw values appear only where no token exists yet; those become tokens when built.
- Component names refer to `packages/ui` (shipped or planned in `04-design-system.md`).
- Each screen lists: purpose, route, layout, components, states, data,
  responsive behaviour, edge cases, accessibility. Milestone in brackets.
- Sample names and numbers on the canvas are illustrative; real screens show
  real data or a clear empty state, never invented numbers.

## Corrections from the canvas

| Canvas | Build |
|---|---|
| Quiz feedback after each answer only | Configurable per Pariksha (`revealAnswers`) |
| "Continue with Google" uses a plain "G" glyph | Use Google's official sign-in button assets per their branding guidelines |
| Learner sidebar shows "Consoles" to everyone | Shown only to Acharyas / Kulapatis |
| Certificate placeholders `[SIGNATORY NAME]`, `[ACADEMY URL]` | From `course.certificate` and `config/org` |
| Toggle switches drawn as checkboxes | `Toggle` component (checkbox semantics, switch visuals) |
