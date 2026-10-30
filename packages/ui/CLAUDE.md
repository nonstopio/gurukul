# Working on `packages/ui/`

The design system package. `src/tokens.css` holds every value; components use
role tokens only. The rules are in `.claude/skills/gurukul-design/SKILL.md` and
the recipes in its `references/components.md` — update the recipe in the same
PR as the component.

- Add every new component and variant to the Design system tab (`apps/web/src/design-system/examples.tsx`,
  Admin → Design system), with its one-line rule. Its test fails on a component without one.
- Components are real elements with keyboard support and an accessible name.
- Each component has tests for every variant and state, at 100% coverage.
- One component per `src/<Name>.tsx` with its own `src/<name>.css`, exported with its prop types from
  `src/index.ts`; tests in `test/`, each with an axe check.
- `test/tokens.test.ts` fails if a role listed in `src/tokens.ts` is missing
  from `tokens.css`. Add new roles to both.

```bash
npm run coverage -w @gurukul/ui
```
