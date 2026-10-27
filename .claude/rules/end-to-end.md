---
paths:
  - 'apps/web/src/**'
  - 'packages/ui/src/**'
  - 'packages/schema/src/**'
  - 'firebase/functions/src/**'
  - 'firebase/firestore.rules'
  - 'firebase/seed/**'
  - 'e2e/**'
---

# Run the end-to-end tests before pushing

`npm run check` is CI minus its emulator jobs, so a green `check` says nothing about the
`End to end (Playwright)` or `Firestore rules (emulator)` jobs. Changing a label, a gate or a flow
that a spec walks through passes every unit test and still turns CI red.

- **Before every push that touches these paths, run `npm run e2e` from the root** and see it pass.
  It starts the emulators, builds the app and runs every spec in `e2e/tests/` (about a minute).
  Rules changes also run `npm run test:rules` (`firestore-rules.md`). The pre-push hook runs both,
  and the bundle budget, for a push that touches their paths, and refuses the push without Java;
  run them yourself first so the hook is a formality, not where you find out.
- **Search the specs for what you changed.** `grep -rn "<label or text>" e2e/` for every visible
  string, role or route you renamed, removed or made conditional, and update the spec in the same
  commit.
- **Keep runs off the internet.** A spec never depends on a third-party service (YouTube, fonts,
  CDNs): block it in `e2e/support/fixtures.ts` (`EXTERNAL`) and test the fallback instead.
- **Prerequisites:** Java 21 and Chromium. Where a browser is preinstalled, point at it with
  `PW_CHROMIUM_PATH=/path/to/chrome`; to run one spec, `cd e2e && npx playwright test -g "name"`
  (`npm run e2e -- -g` does not reach Playwright). `E2E_SKIP_FUNCTIONS_BUILD=1` reuses the last
  functions build.
- **A test that waits on effects, focus or timers runs ten times before you push:**
  `for i in $(seq 10); do npx vitest run <file> || break; done` from its workspace. Main went red
  three times on one such test that had passed once on its pull request.
- **Could not run it?** Say so in the PR's "How it was checked" and the chat report, with the
  reason. Never tick or describe the e2e job as passing on CI's word in advance.
