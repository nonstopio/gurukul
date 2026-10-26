---
paths:
  - 'apps/web/src/**'
  - 'packages/ui/**'
---

# Design system first

Before writing or changing UI, read `.claude/skills/gurukul-design/SKILL.md`
(and `references/components.md` for the component you touch).

- Reach for a `packages/ui` component before writing markup. If the pattern
  repeats twice in `apps/web`, it moves into `packages/ui` with tests.
- New CSS uses role tokens from `packages/ui/src/tokens.css` only. A raw hex,
  px font size or one-off shadow in `apps/web` is a review blocker.
- Every new `packages/ui` component ships with: a recipe entry in
  `references/components.md`, keyboard and screen-reader tests, and 100% coverage.
