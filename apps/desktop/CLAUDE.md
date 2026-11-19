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
| `src/agentCalls.ts`, `sourcesCalls.ts`, `authCalls.ts`, `appCalls.ts` | One area's handlers each; a later call starts as `notAvailable(schema)` until its item builds it         |
| `src/googleSignIn.ts`                                                 | `auth.googleSignIn`: PKCE, loopback listener, system browser, token exchange; answers the ID token only  |
| `src/googleClient.ts`, `scripts/bundle.ts`, `.env.example`            | The Google Desktop OAuth client: build-time variables the bundle writes into `main.cjs` as literals      |
| `src/agent/manager.ts`                                                | `agent.*`: status, one `claude` per open session, tool results, `forget`, `closeAll` on quit             |
| `src/agent/launch.ts`                                                 | The pinned flags, `MIN_CLAUDE_VERSION`, the allow-listed environment (`ALLOWED_ENV`)                     |
| `src/agent/run.ts`                                                    | One running `claude`: messages in, events out, Stop (`interrupt`), close, tool calls to the window       |
| `src/agent/stream.ts`                                                 | Stream-json both ways, pure: what each output line means                                                 |
| `src/agent/endpoint.ts`                                               | The `gurukul` MCP server on `127.0.0.1`: bearer token, no `Origin`, the window's tools only              |
| `src/agent/files.ts`                                                  | `prompt.md`, the `skills` plugin, `mcp.json`, `workdir/`; removing Claude Code's own transcript          |
| `src/agent/find.ts`, `platform.ts`, `node.ts`                         | Finding `claude` and short commands; the adapter interfaces; the real Node adapters (`cross-spawn`)      |
| `src/events.ts`                                                       | Main → window events: to the window's top frame on an allowed origin only, payload never logged          |
| `src/store.ts`                                                        | Session files: `{userData}/sessions/{uid}/{sessionId}/…`, atomic writes, names checked                   |
| `src/sources.ts`                                                      | `sources.*`: the chosen folder per session (`{userData}/sources/`), plain text files only, size cap      |
| `src/navigation.ts`                                                   | Window stays on Gurukul; other links to the system browser; permissions                                  |
| `src/window.ts`                                                       | Window options (isolation, sandbox, no Node) and retry when the page cannot load                         |
| `src/app.ts`                                                          | Start-up over injected adapters; returns the `Shell` (`events`) for what later sends events              |
| `src/preloadApi.ts`                                                   | Builds `window.gurukulDesktop` from `CALLS` and `EVENTS`; exposes it to the allowed top frame only       |
| `src/main.ts`, `src/preload.ts`                                       | Electron glue only: hand the real objects to `app.ts` / `preloadApi.ts`                                  |
| `src/log.ts`                                                          | The main-process `log` helper; the only file here that may call `console.*`                              |
| `src/updates.ts`                                                      | Self-update over `electron-updater`: launch and six-hourly checks, silent download, `app.*` answers      |
| `src/menu.ts`                                                         | The app menu as data: Check for updates… (app menu on macOS, Help elsewhere)                             |
| `electron-builder.yml`, `resources/`                                  | Installers: app id, fuses, hardened runtime, entitlements, icon, GitHub publish config                   |

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
  files the window can write (`{userData}/sources/`). `sources.read` reads only a name its own
  listing gives, of a text type, under `MAX_SOURCE_BYTES`; a refusal is one of `SOURCE_REFUSALS`.
  Never log a Sources path, file name or text.
- **Never widen the origins** beyond `config.ts`, and never from an environment variable: that
  would hand the bridge to another site. `localhost:5173` is allowed only when `app.isPackaged` is
  false.
- **The web app imports the bridge's types** from `@gurukul/desktop/bridge` with `import type`
  only (ESLint), so no code from here reaches its bundle; constants it needs are repeated there and
  held equal by their types (`BridgeErrors`). Only `apps/web/src/desktop/bridge.ts` may read
  `window.gurukulDesktop`.
- **Session files hold answer keys.** Never log a file name, chat text, course text or a key.
  Errors reach the window as `store.write failed (EACCES)`; Node's messages carry home-folder paths.
- **The agent's session files are the shell's.** `prompt.md`, `skills/`, `mcp.json` and `workdir/`
  (`AGENT_SESSION_NAMES`) are written by `agent/files.ts` at every start; `store.write` and
  `store.remove` refuse them in any case (macOS and Windows ignore it: `MCP.json` is `mcp.json`),
  because a plugin folder can carry hooks and `mcp.json` can name a program.
- **`claude` starts with the pinned flags and `childEnv`'s allow-list only** (`agent/launch.ts`,
  tested as constants). Changing either changes `.plan/22-desktop-studio.md` (Starting Claude Code)
  in the same commit. The endpoint's token is only in `claude`'s environment and in memory; never
  an argument, a file or a log field. Nothing `claude` prints is logged.
- **Tests never start the real `claude`.** `test/fixtures/fake-claude.mjs` speaks the spike's
  stream-json and calls the real endpoint; `test/agent/fakeClaude.ts` puts it on `PATH`.
- No UI, no credentials. The shell never sees a Claude credential and never says "Claude Code" in
  a product name. Google sign-in hands the window its ID token and keeps nothing: no token, code,
  verifier or client secret is stored or logged.
- **Build-time configuration comes in through `scripts/bundle.ts`'s `define`, never at run time.**
  The Google client id and secret (`GURUKUL_DESKTOP_GOOGLE_CLIENT_*`) are GitHub Actions secrets
  in a release build and `apps/desktop/.env` (gitignored, `.env.example`) in development; never
  commit a value. A test never calls Google: the token endpoint is an injected `fetch`.

## Commands

```bash
npm run dev -w @gurukul/web        # the Vite dev server, first
npm run dev -w @gurukul/desktop    # bundle and open the shell on http://localhost:5173/studio
npm run coverage -w @gurukul/desktop
npm run build -w @gurukul/desktop  # typecheck and bundle to dist/ (main.cjs, preload.cjs)
```

Electron 45 downloads its binary the first time it is launched, not at `npm ci`. On Linux as root
(a container) Chromium needs `--no-sandbox`: `npx electron --no-sandbox .`.

## Releases

`.github/workflows/desktop-release.yml` builds and publishes the installers after CI passes on a
push to `main` that touched this folder; the version comes from the commits
(`scripts/desktop-version.mjs`), never from `package.json` (`0.0.0` stays). Setup and the hand
upgrade check: `docs/desktop-release-setup.md`.

- **The app ships `dist/` and `package.json` only.** `electron-builder.yml` copies no
  `node_modules`, so anything the shell runs must be bundled by esbuild into `dist/main.cjs` (a
  package with native code or files it reads at run time would need the packaging changed first).
- **The updater never opens a dialog on its own**; only the menu's Check for updates… answers in one.
  `electron-updater`'s own logger stays off (URLs and paths); log through `log`.
- Check packaging on Linux without signing:
  `npm run bundle && npx electron-builder --linux dir --publish never` (output in `release/`,
  ignored), then `npx @electron/fuses read --app release/linux-unpacked/gurukul-studio`.
