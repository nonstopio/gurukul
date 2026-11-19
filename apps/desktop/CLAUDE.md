# Working on `apps/desktop/`

Gurukul Studio's desktop shell (`@gurukul/desktop`, Electron): one window over the live web app
and the `window.gurukulDesktop` bridge. Plan: `.plan/22-desktop-studio.md` (Architecture, The
bridge). The shell is thin on purpose: screens belong in `apps/web`, never here.

## Map

| File                            | Does                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/bridge.ts`                 | The contract, version 1: call names, argument and result types, safe-name rules. No imports |
| `src/config.ts`                 | Production URL, dev URL, allowed origins. The one place to change the production host       |
| `src/ipc.ts`                    | Typed handler registry and the gate every call passes: top frame, allowed origin, zod args  |
| `src/handlers.ts`               | The handlers: `info`, `store.*`                                                             |
| `src/store.ts`                  | Session files: `{userData}/sessions/{uid}/{sessionId}/…`, atomic writes, names checked      |
| `src/navigation.ts`             | Window stays on Gurukul; other links to the system browser; permissions                     |
| `src/window.ts`                 | Window options (isolation, sandbox, no Node) and retry when the page cannot load            |
| `src/app.ts`                    | Start-up over injected adapters (app, ipc, shell, session, window factory, timers)          |
| `src/preloadApi.ts`             | Builds `window.gurukulDesktop` from `CALLS`; exposes it to the allowed top frame only       |
| `src/main.ts`, `src/preload.ts` | Electron glue only: hand the real objects to `app.ts` / `preloadApi.ts`                     |
| `src/log.ts`                    | The main-process `log` helper; the only file here that may call `console.*`                 |

## Rules

- **Only `main.ts` and `preload.ts` import `electron`.** Everything else takes adapters, so it is a
  plain function tested in Vitest at 100%. A new Electron feature adds an adapter interface, not
  logic in the glue.
- **Adding a bridge call** (`agent.*`, `auth.googleSignIn`, `sources.*`, `app.*`): add it to
  `BridgeCalls`, `CALLS` and `GurukulDesktop` in `bridge.ts`, then a handler with a zod schema in
  `handlers.ts`. Compile-time checks in `bridge.ts` and the `Handlers` type fail until all agree.
  Raise `BRIDGE_VERSION` only for a change that breaks a site written for an older shell.
- **Never widen the origins** beyond `config.ts`, and never from an environment variable: that
  would hand the bridge to another site. `localhost:5173` is allowed only when `app.isPackaged` is
  false.
- **The web app imports the bridge's types** from `@gurukul/desktop/bridge` (`src/bridge.ts`,
  type-only plus constants; no Electron). Only `apps/web/src/desktop/bridge.ts` may read
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
