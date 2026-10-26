---
paths:
  - 'apps/**'
  - 'packages/**'
  - 'firebase/functions/**'
---

# 100% coverage

CI fails the `test` job unless every workspace covers 100% of lines,
statements, functions and branches. Each workspace sets the thresholds in its
own `vitest.config.ts` / `vite.config.ts`; `npm run coverage` at the root runs
them all.

- A change is not done until every line and branch you added is exercised. A
  new `if`, `??`, `?.`, `?:`, `catch`, default parameter or early `return` is a
  branch: write the test that takes it, in both directions.
- Measure with the whole workspace, not one file: `npm run coverage -w <workspace>`.
  Read the `Uncovered Line #s` column for the files you changed.
- Test the edge, not around it: a missing element, a denied write, an empty
  course, a network failure, an expired cooldown. Use `vi.spyOn(Date, 'now')`
  or fake timers instead of waiting.
- Never lower a threshold, add a file to `coverage.exclude`, or add a
  `/* v8 ignore */` comment to pass. The one accepted ignore is a race no test
  can reach, with the reason on the same line. If code truly cannot be tested,
  that is a design problem: move the logic into a pure function and test that.
- Prove a test bites: remove the guard it protects, see it fail, put it back.
- Code outside a workspace's `src/` (the shell scripts in `scripts/`, `apps/web/scripts/*.ts`,
  the Claude hooks) is not measured by V8 either. It is covered by behaviour tests in
  `scripts/test/` and `.claude/hooks/test/` (`npm run test:tooling`): a change there adds a test there.
- `firebase/firestore.rules` is not measured by V8. Its equivalent rule is in
  `.claude/rules/firestore-rules.md`: every `allow` has an allowed and a denied test.
