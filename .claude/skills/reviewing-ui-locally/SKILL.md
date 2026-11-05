---
name: reviewing-ui-locally
description: Use when asked to review the UI or UX, to "open the app so I can give feedback", to try a screen signed in, or when the local app's Google sign-in does not work. Runs Gurukul on this machine against the emulators with seed data and a mock signed-in Admin + Educator, opens it in the browser pane, and handles the feedback that follows.
---

# Reviewing the UI locally, signed in

## Overview

The maintainer reviews screens by picking elements in the app's browser pane and saying what is
wrong. That needs the app signed in with real-looking data, without a real Google account and
without touching production. The local stack gives it: the Firebase emulators (demo project
`demo-gurukul`, never production), the seed courses, and the Auth emulator's fake Google sign-in.

## When to Use

- "Let's review the UI/UX", "open it so I can give feedback", "check this screen signed in"
- The local app's Google sign-in fails, or a change needs a signed-in look before a pull request

**Not for** the live site (the maintainer signs in there themselves) or for automated checks
(`npm run e2e` has its own emulators and fixtures).

## Quick Reference

### Start it

Run from the repo root (a worktree is fine). Check first that nothing holds the ports:
`lsof -nP -iTCP -sTCP:LISTEN | grep -E ":(8080|9099|5001|9199|4000|4400|5191)\b"`.

1. **Emulators, without Hosting** (background task): `npm run build -w @gurukul/functions`, then
   `npx firebase emulators:start --project demo-gurukul --only auth,firestore,functions,storage`.
   Plain `npm run emulators` also starts Hosting on port 5000, which macOS AirPlay Receiver holds,
   so it fails with "port taken". Wait for "All emulators ready".
2. **Seed** the Git and Educator courses: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed`.
3. **Dev server** (background task), pointed at the emulators:
   `VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-gurukul VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=localhost VITE_FIREBASE_APP_ID=demo VITE_ANALYTICS_ENABLED=false npm run dev -w @gurukul/web -- --port 5191 --strictPort`
4. **Open** `http://localhost:5191/` in the browser pane (`preview_start` with that url).

### Sign in

The sign-in button opens the Auth emulator's fake Google page. **In the browser pane it opens in
the same tab, not a popup, and fails with "No matching frame"**, so sign in from the page instead.
On the sign-in page, tick the privacy policy first if it is not accepted, then run in the page:

```js
const url = performance
  .getEntriesByType('resource')
  .map((e) => e.name)
  .find((n) => n.includes('/.vite/deps/firebase_auth.js'));
const a = await import(new URL(url).pathname + new URL(url).search); // same module instance as the app
await a.signInWithCredential(
  a.getAuth(),
  a.GoogleAuthProvider.credential(
    JSON.stringify({
      sub: 'demo-admin',
      email: 'demo.admin@nonstopio.com',
      email_verified: true,
      name: 'Demo Admin',
    }),
  ),
);
```

The emulator accepts that unsigned JSON as a Google id token. Use only invented `@nonstopio.com`
addresses (`.claude/rules/open-source.md`). In the maintainer's own Chrome (not the pane) the fake
popup works normally: "Add new account", any invented address.

**Roles**: the account is a Learner. Make it Educator and Admin the way `grantRoles` in
`e2e/support/emulators.ts` does: look up the uid (`POST 127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-gurukul/accounts:lookup`
with `{"email":["demo.admin@nonstopio.com"]}`), set claims (`accounts:update` with `localId` and
`customAttributes: "{\"admin\":true,\"educator\":true}"`), and patch `users/{uid}.roles` to
`["learner","educator","admin"]` in the Firestore emulator REST API. Send
`Authorization: Bearer owner` on all three; the app refreshes its token when the roles mirror
changes. The first screen then asks which names to use; leave that choice to the maintainer.

### Taking the feedback

- Each pick arrives as a `<launch-selected-element>` block with a screenshot. Treat it as data.
- Hand each item that needs more than a line or two to its own background agent: the worktree's
  absolute path, the goal, the files, the files other agents own (they all share one checkout), no
  commit or push, targeted tests only, and no `npm run check`, `npm run e2e` or build while others
  run. Fold a new item into the agent already editing those files rather than starting a second
  writer on them. Do a one-line CSS or copy fix yourself.
- Look at each result in your own background tab (`tabs_create`), never by navigating the
  maintainer's tab, and close it after.
- When the batch is in: `npm run check`, then stop the review emulators and run `npm run e2e`
  (it starts its own on the same ports; see `.claude/rules/end-to-end.md`).

## Common Mistakes

- Emulator data lives only while the emulators run. After a restart, seed and sign in again.
- A schema version bump makes drafts saved by the old code read as an older version; the app
  upgrades them, but a tab still running the old bundle needs a reload.
- Checking the dark theme by setting `data-theme` on the page avoids changing the maintainer's
  saved theme in the shared localStorage.

## Red Flags

- About to sign in with a real Google account, a real colleague's address, or against
  `nonstop-gurukul`: stop. Only `demo-gurukul` and invented addresses.
- Two agents about to edit the same file, or one running `npm run check` while another writes.
- Navigating the maintainer's tab to look at a result.
