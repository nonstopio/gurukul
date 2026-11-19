# Working on `apps/desktop/`

Gurukul Studio's desktop shell (`@gurukul/desktop`, Electron): one window over the live web app
and the `window.gurukulDesktop` bridge. Plan: `.plan/22-desktop-studio.md` (Architecture, The
bridge). The shell is thin on purpose: screens belong in `apps/web`, never here.

## Map

| File                                                                  | Does                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/bridge.ts`                                                       | The contract, version 1: calls, events, argument, result and event types, limits, name rules. No imports |
| `src/config.ts`                                                       | Production URL, dev URL, allowed origins. The one place to change the production host                    |
| `src/ipc.ts`                                                          | Typed handler registry and the gate every call passes: top frame, allowed origin, zod args               |
| `src/args.ts`                                                         | The zod pieces the handlers check arguments with                                                         |
| `src/handlers.ts`                                                     | `info`, `store.*`, and the composition of every area's handlers (`createHandlers`)                       |
| `src/agentCalls.ts`, `sourcesCalls.ts`, `authCalls.ts`, `appCalls.ts` | One area's handlers each; `notAvailable(schema)` until its item builds it                                |
| `src/events.ts`                                                       | Main → window events: to the window's top frame on an allowed origin only, payload never logged          |
| `src/store.ts`                                                        | Session files: `{userData}/sessions/{uid}/{sessionId}/…`, atomic writes, names checked                   |
| `src/navigation.ts`                                                   | Window stays on Gurukul; other links to the system browser; permissions                                  |
| `src/window.ts`                                                       | Window options (isolation, sandbox, no Node) and retry when the page cannot load                         |
| `src/app.ts`                                                          | Start-up over injected adapters; returns the `Shell` (`events`) for what later sends events              |
| `src/preloadApi.ts`                                                   | Builds `window.gurukulDesktop` from `CALLS` and `EVENTS`; exposes it to the allowed top frame only       |
| `src/main.ts`, `src/preload.ts`                                       | Electron glue only: hand the real objects to `app.ts` / `preloadApi.ts`                                  |
| `src/log.ts`                                                          | The main-process `log` helper; the only file here that may call `console.*`                              |

## Rules

- **Only `main.ts` and `preload.ts` import `electron`.** Everything else takes adapters, so it is a
  plain function tested in Vitest at 100%. A new Electron feature adds an adapter interface, not
  logic in the glue.
- **The whole version-1 contract is in `bridge.ts`**; calls not built yet answer
  `Not available in this version` (`notAvailable(schema)` in their area's `*Calls.ts`). Building one
  replaces that with a handler in the same file and keeps the schema; its dependencies are added to
  the area function and passed from `createHandlers`. Adding a call: `BridgeCalls`, `CALLS`,
  `GurukulDesktop`, then a handler; an event: `BridgeEvents`, `EVENTS`, `GurukulDesktop`. The
  compile-time checks in `bridge.ts` and the `Handlers` type fail until all agree. Raise
  `BRIDGE_VERSION` only for a change that breaks a site written for an older shell.
- **Events go out only through `Shell.events.send`** (`events.ts`): to the window's top frame, on
  an allowed origin, as plain data. The preload hands the page's handler the payload alone, never
  Electron's event object, and offers no way to listen on any other channel.
- **The window names a session, never a path.** `sources.*` and `agent.start` take
  `{ uid, sessionId }`; the shell remembers the chosen Sources folder itself, outside the session
  files the window can write.
- **Never widen the origins** beyond `config.ts`, and never from an environment variable: that
  would hand the bridge to another site. `localhost:5173` is allowed only when `app.isPackaged` is
  false.
- **The web app imports the bridge's types** from `@gurukul/desktop/bridge` with `import type`
  only (ESLint), so no code from here reaches its bundle; constants it needs are repeated there and
  held equal by their types (`BridgeErrors`). Only `apps/web/src/desktop/bridge.ts` may read
  `window.gurukulDesktop`.
- **Session files hold answer keys.** Never log a file name, chat text, course text or a key.
  Errors reach the window as `store.write failed (EACCES)`; Node's messages carry home-folder paths.
- No UI, no credentials. The shell never sees a Claude credential and never says "Claude Code" in
  a product name.

## Commands

```bash
npm run dev -w @gurukul/web        # the Vite dev server, first
npm run dev -w @gurukul/desktop    # bundle and open the shell on http://localhost:5173/studio
npm run coverage -w @gurukul/desktop
npm run build -w @gurukul/desktop  # typecheck and bundle to dist/ (main.cjs, preload.cjs)
```

Electron 45 downloads its binary the first time it is launched, not at `npm ci`. On Linux as root
(a container) Chromium needs `--no-sandbox`: `npx electron --no-sandbox .`. Installers and the
updater are `DSK-21`.
