# 22 · Desktop Studio: build a course by chatting

A downloadable app in which an Educator builds or edits a course by talking to an AI agent. The
agent is the Claude Code already installed on the Educator's laptop, signed in with the
Educator's own Claude plan. Everything the agent changes stays on the laptop until the Educator
reviews it as one set, the way a pull request is reviewed, and saves it to the draft in one step.
Publishing stays the manual step it is today.

Decided with the maintainer on 2026-11-18: build the desktop app directly (no plugin-only first
step), and review a whole session at once instead of accepting each change.

The web app does not change for anyone who does not install the desktop app.

## The idea in one example

Meera, an Educator, opens the desktop app and starts a session on "Git, the NonStop Way".

1. She writes the goal: "The rebase chapter is too heavy. Simplify it and add a Quiz."
2. She and the agent go back and forth for forty minutes. The agent rewrites three lessons, adds a
   Quiz with six questions and reorders two lessons. **Nothing is saved to Firestore.** The
   preview on the right shows the course as a learner would see it, drawn from the copy on her
   laptop.
3. She opens **Review**. It lists 11 changes against the draft she started from: what was added,
   changed, removed and moved, with the old and new words side by side.
4. She asks for two more fixes from the review screen, then presses **Save to draft** once.
5. The draft now holds all 11 changes. She publishes from the course editor when she is ready,
   exactly as she does today.

If she closes the app at step 2, the session is still there tomorrow. If she discards it, the
draft was never touched.

## Vocabulary

| Word | Meaning | Pull request equivalent |
|---|---|---|
| Session | One piece of authoring work on one course, with a goal, a chat and a local working copy | A branch with its pull request |
| Base | The stored draft (and its `rev`) the session started from. Empty for a new course | The commit the branch started from |
| Working copy | The course and answer keys as the session has changed them, kept on the laptop | The branch |
| Turn | One message to the agent and everything it did in reply; a checkpoint is taken after each | A commit |
| Review | The screen that shows every difference between base and working copy | Files changed |
| Save to draft | Writes the working copy to `courses/{id}/drafts/current` in one write | Merge |
| Publish | Unchanged: the Educator presses Publish in Studio | Deploy |

Screens say Session, Review and Save to draft. They never say branch, commit or merge.

## What Anthropic allows

The design follows Anthropic's published rules for Claude Code
(`code.claude.com/docs/en/legal-and-compliance`, read on 2026-11-18):

- **Allowed:** an app that runs the unmodified Claude Code program, where each person signs in
  to Claude Code with their own Claude plan, API key or cloud provider, through Anthropic's own
  sign-in.
- **Not allowed:** offering Claude.ai login inside another app; collecting, storing or passing on
  anyone's Claude tokens; paying for or reselling Claude usage for users; using "Claude Code" in a
  product name or logo.
- **Conditions:** the publisher agrees to Anthropic's Commercial Terms; plan limits assume
  ordinary, individual use.

So the desktop app **never sees a Claude credential**. It starts the `claude` program and reads
its output. The app is called Gurukul Studio; its screens may say "runs Claude Code" in plain
text and nothing more. Written confirmation from Anthropic is a maintainer item (`DSK-01`) and is
required before the app is offered to Educators (the download card, `DSK-25`), not before
building or releasing early versions.

## Architecture

```
On the Educator's laptop
┌──────────────────────────────────────────────────────────────────────────────┐
│ Gurukul Studio (Electron)                                                    │
│                                                                              │
│  Window: loads the live web app            Main process                      │
│  ┌───────────────────────────────┐  IPC   ┌──────────────────────────────┐  │
│  │ Studio pages (unchanged)      │◄──────►│ Agent bridge                 │  │
│  │ Session workspace (new)       │        │ Session files on disk        │  │
│  │ Working copy, tools, review   │        │ Google sign-in (browser)     │  │
│  └───────────────┬───────────────┘        └──────────────┬───────────────┘  │
│                  │                                        │ starts, stdin/out │
│                  │                          ┌─────────────▼───────────────┐  │
│                  │                          │ Claude Code (unmodified,    │  │
│                  │                          │ Educator's own sign-in)     │  │
│                  │                          └─────────────┬───────────────┘  │
└──────────────────┼────────────────────────────────────────┼──────────────────┘
                   │ one draft write at Save                 │ on the Educator's plan
                   ▼                                         ▼
        Firebase (unchanged rules,                      Anthropic
        same draft document, same publishCourse)
```

Four decisions shape it:

1. **Thin shell.** The window loads the deployed web app (`gurukul.nonstopio.com`; the Vite dev
   server in development). The session screens are part of `apps/web`, in a chunk loaded only
   when the desktop bridge is present. Studio fixes reach the desktop app with every normal web
   deploy, and there is one Studio to test. Cost: no offline use, and the shell and the site must
   agree on a numbered bridge.
2. **The working copy lives in the window, not in Firestore.** The agent's tools change a course
   object in memory; the bridge writes it to a file after each turn so a restart loses nothing.
   Firestore is written once, at Save to draft.
3. **The agent gets course tools, not files or a shell.** Every tool call is run by the web app,
   as the signed-in Educator, through Studio's existing edit helpers, and its result must pass the
   zod course schema. The agent cannot run commands, write files, publish or read learner data.
4. **Tools, prompts and skills ship with the web app.** The shell is a generic proxy: the web app
   hands it the system prompt, the skill files and the tool list when a session starts. Improving
   the agent does not need a new installer.

### Workspaces and folders

| Path | What | New |
|---|---|---|
| `apps/desktop/` (`@gurukul/desktop`) | Electron main process, preload bridge, the agent's MCP endpoint, installer config | yes |
| `apps/web/src/desktop/` | The one facade over `window.gurukulDesktop`; nothing else touches it (the pattern `analytics/` uses for `firebase/analytics`) | yes |
| `apps/web/src/studio/session/` | Session store, course tools, chat panel, workspace, review screen, prompts and skills | yes |
| `packages/schema/src/session.ts` | The session shape (zod) | yes |
| `packages/schema/src/changes.ts` | The change engine: what differs between two working copies, down to the field. Imported as `@gurukul/schema/changes`, not from the package index, so its `diff` dependency stays out of the chunk every learner loads | yes |
| `packages/schema/src/merge.ts` | Three-way merge of working copies, built on the change engine's alignment and rows. Imported as `@gurukul/schema/merge`, for the same reason | yes |
| `packages/schema/src/writingLint.ts` | The writing lint (pure, no AI) | yes |
| `apps/web/src/studio/` editors, preview, publish dialog | Reused as they are | no |

Dependencies to add, all MIT-compatible: `electron` (MIT), `electron-builder` (MIT),
`electron-updater` (MIT), `@modelcontextprotocol/sdk` (MIT), `diff` (BSD-3-Clause, word and line
differences). Check each licence again when adding it (`.claude/rules/open-source.md`).

### The bridge (`window.gurukulDesktop`, version 1)

Exposed by the preload script with `contextIsolation` on, `sandbox` on and `nodeIntegration` off,
and only to the top frame of an allowed origin (production host; `localhost:5173` in development
builds only). The window cannot navigate anywhere else; other links open in the system browser.

| Call | Does |
|---|---|
| `info()` | Bridge version, app version, platform. An old shell with a new site shows "Update the app" |
| `agent.status()` | Is Claude Code installed, which version, is it new enough, is the Educator signed in |
| `agent.start({ uid, sessionId, systemPrompt, skills, tools, resumeId })` | Starts Claude Code for a session; answers the Claude session id, or why it cannot start |
| `agent.send(sessionId, message)` / `agent.stop(sessionId)` / `agent.close(sessionId)` | A message in; stop the current turn; end the session's process |
| `agent.forget(agentSessionId)` | Deletes Claude Code's own copy of a chat, for the 30-day clean-up |
| `agent.onEvent(handler)` | Streamed text, activity in plain words, tool activity, turn end with the Claude session id, errors (not installed, too old, not signed in, plan limit reached, crashed) |
| `agent.onToolCall(handler)` / `agent.toolResult(sessionId, callId, result)` | A tool call from the agent; the web app runs it and answers with the result |
| `store.read / write / list / remove` | Session files under the app's data folder, per signed-in person |
| `sources.choose / list / reveal / read` | The session's Sources folder; `read` takes one plain file name the listing gives |
| `auth.googleSignIn()` | Google sign-in in the system browser; returns an ID token |
| `app.checkForUpdate()` / `app.onUpdateReady(handler)` / `app.installUpdate()` | Asks the updater; hears that a new shell is downloaded; restarts into it |

The web app reads the bridge only through `apps/web/src/desktop/bridge.ts`. In a browser that
facade reports "not the desktop app" and every session page shows a card that says so, with the
download link.

As built in `DSK-08` (`apps/desktop/CLAUDE.md` has the file map):

- **Types live in the shell, importable without Electron.** `apps/desktop/src/bridge.ts` holds the
  call names, argument and result types and the safe-name rule, and imports nothing; the web app
  imports it as `@gurukul/desktop/bridge`. Not in `packages/schema`: these are not Firestore
  shapes, and the schema package is in every learner's chunk.
- **Every call returns a promise**, `info()` included: each one crosses to the main process.
- **The whole version-1 contract exists from the start.** A call whose item is not built yet checks
  its arguments, then refuses with "Not available in this version", so a site that calls it early
  shows a message instead of crashing. Each area's handlers live in their own file
  (`agentCalls.ts`, `sourcesCalls.ts`, `authCalls.ts`, `appCalls.ts`).
- **Events (`on…`) go one way, main to window**, only to the window's top frame while it is on an
  allowed origin. A subscription returns a function that ends it; the page's handler gets plain
  data, never Electron's event object, and there is no way to listen on any other channel.
- **The window names a session, never a path.** `sources.*` and `agent.start` take
  `{ uid, sessionId }`: the shell remembers which folder the Educator picked for that session,
  outside the session files the window can write, so a compromised page still reaches only the one
  chosen folder. An expected failure (`agent.start` when Claude Code is missing, Google sign-in
  cancelled) is a result, not a rejection.
- **The web app takes the types only** (`import type`, enforced by ESLint), so no shell code reaches
  its bundle; `REQUIRED_BRIDGE_VERSION` in `apps/web/src/desktop/bridge.ts` decides "Update the
  app".
- **One gate for every call.** The main process registers a typed handler per call; before any
  runs it checks that the sender is a top frame (no parent) on an allowed origin and that the
  arguments pass the handler's zod schema. The preload also exposes the object only to the top
  frame of an allowed origin, which reaches the sandboxed preload as a command-line flag.
- **`store.*` takes `{ uid, sessionId, path }`.** `path` is relative and `/`-separated, at most four
  names deep (`checkpoints/t4.json`). Every name is letters, digits, `.`, `_` or `-`, does not start
  or end with a dot and is not a Windows device name, so no path can leave the session folder.
  Writes go to a temporary file and are renamed into place; a file is at most 16 MB. `list({ uid })`
  gives the person's session ids, `list({ uid, sessionId })` the session's files;
  `remove` without `path` removes the whole session.
- **Errors say little.** A refused call reaches the window as "Not allowed" or "Invalid
  arguments"; a disk failure as `store.write failed (EACCES)`. Node's own messages are not passed
  on or logged, because they hold home-folder paths.
- **Permissions:** full screen (a lesson's video) and clipboard writes from Gurukul; everything
  else (camera, microphone, location, notifications) is refused.
- **The window** opens `/studio`, tries the page again every two seconds when it cannot load
  (no network, dev server not started), and is single-instance: starting the app again focuses it.

### Starting Claude Code

One long-lived process per open session:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
  --append-system-prompt-file <session>/prompt.md \
  --plugin-dir               <session>/skills/ \
  --mcp-config               <session>/mcp.json \
  --strict-mcp-config \
  --setting-sources          "" \
  --tools                    Skill \
  --allowedTools             "mcp__gurukul__*" \
  --permission-mode          dontAsk \
  --system-prompt-snapshot   off \
  --session-id               <new UUID, first start>  |  --resume <same UUID, every later start>
```

Started with `GURUKUL_BRIDGE_TOKEN` in its environment. `mcp.json` holds only the reference
`${GURUKUL_BRIDGE_TOKEN}`, which Claude Code expands, so the token is never written to a file or
put on a command line.

- **The environment is an allow-list, not the app's own.** Claude Code obeys environment
  variables that the flags above do not touch: `ANTHROPIC_BASE_URL` sends every request, with
  course text and answer keys, to another server (the spike steered `claude` that way itself);
  `ANTHROPIC_API_KEY` or `CLAUDE_CODE_USE_BEDROCK` bills a key or a cloud account instead of the
  Educator's plan; `ANTHROPIC_MODEL` changes the model. On Windows a user variable reaches every
  app, so the bridge passes only: `PATH`, `HOME`, `USER`/`LOGNAME`, `USERPROFILE`, `APPDATA`,
  `LOCALAPPDATA`, `SystemRoot`, `ComSpec`, `PATHEXT`, `TEMP`/`TMP`/`TMPDIR`, `LANG` and `LC_*`,
  `CLAUDE_CONFIG_DIR` (an Educator who moved their Claude Code folder keeps their sign-in there),
  `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` and `NODE_EXTRA_CA_CERTS` (company networks), and
  `GURUKUL_BRIDGE_TOKEN`. Everything else is dropped, `ANTHROPIC_*`, `CLAUDE_CODE_*`
  (`CLAUDE_CODE_OAUTH_TOKEN` included: that Educator signs in with `claude` instead), `AWS_*`,
  `NODE_OPTIONS` and `ELECTRON_*` among them. The allow-list is a constant in the bridge, tested.
- **`--system-prompt-snapshot off`.** Claude Code 2.1.328 records the system prompt at a
  conversation's first request and, by default (`on`), sends that record on every resume even
  when `prompt.md` has changed. The web app hands over the prompt at every start (decision 4), so
  a prompt fix must reach an open session after a restart: `off` renders it fresh each time.
  Seen in the spike's review: a resume with a changed `prompt.md` sent the old prompt under the
  default and the new one with `off`. The help says the default differs under `--bare`, so the
  flag is pinned, not left to the default.
- The working directory is the session's Sources folder. `--tools Skill` leaves the agent no
  built-in tool but the one that loads skills, so it reads sources only through `read_source`.
  `dontAsk` refuses anything not allowed instead of asking.
- `--setting-sources ""` and `--strict-mcp-config` keep the Educator's own settings, hooks,
  skills, notes (`CLAUDE.md`) and MCP servers out, and a `CLAUDE.md`, `.mcp.json` or
  `.claude/settings.json` dropped into Sources too.
- `mcp.json` names an HTTP MCP endpoint the main process serves on `127.0.0.1`, with the header
  `Authorization: Bearer ${GURUKUL_BRIDGE_TOKEN}` and a token minted for that one `claude`
  process. The main process forwards each tool call to the window and returns the answer. No
  proxy process, so the packaged app keeps Electron's `RunAsNode` fuse off (Privacy and
  security). The fallback, if the signed-in check (`DSK-26`) finds the HTTP endpoint wanting, is
  the stdio proxy the spike also proved, which needs that fuse on.
- Stop sends a stream-json `interrupt` control request: the turn ends, the process stays. A plan
  limit or a missing sign-in arrives as an event and the chat says what to do in plain words
  ("Open a terminal, run `claude` and sign in, then try again").
- No model picker in v1: Claude Code's own default is used.

As built in `DSK-10` (`apps/desktop/src/agent/`, map in `apps/desktop/CLAUDE.md`):

- **`agent.status()`** finds `claude` on `PATH` (`claude.exe`, then `claude.cmd`, on Windows),
  reads `claude --version` against `MIN_CLAUDE_VERSION` (2.1.328, what the flags were checked on)
  and `claude auth status` for `loggedIn`, each with the allow-listed environment and a 15-second
  limit. A `claude` that will not run is "not installed"; one that prints no version is "too old".
  Nothing else `auth status` prints (it names the account) is kept.
- **`agent.start()`** checks the same, mints the token, starts the endpoint, writes `prompt.md`,
  the `skills/` plugin (replaced whole each time) and `mcp.json`, starts `claude`, then sends the
  `initialize` control request: `tokenSource: "none"` ends the process and answers
  `not_signed_in` before any message is sent; no answer within 30 seconds, or an exit first (an
  unknown `--resume` id), answers `crashed`. A second start of a running session answers its id.
- **The session folder's agent files are the shell's.** `prompt.md`, `skills/`, `mcp.json` and the
  empty working folder `workdir/` (used until `DSK-20` gives a Sources folder, or when the chosen
  one has gone) are `AGENT_SESSION_NAMES` in `bridge.ts`: `store.write` and `store.remove` refuse
  them, because a plugin folder can carry hooks and `mcp.json` can name a program to run.
- **Events.** Without `--include-partial-messages` (not pinned) text arrives a whole assistant
  text block at a time, each a `text` event. Thinking and the `Skill` tool become `activity`
  ("Thinking", "Loading the humanize skill"); a course tool's `tool_call` event comes from the
  endpoint when the call arrives, with the same `callId` as `agent.onToolCall`. An assistant
  `error`, an `api_retry` with `authentication_failed` or `rate_limit`, or a `rate_limit_event`
  with `status: "rejected"` (its `resetsAt` becomes the plan limit's reset time; the shape is the
  Agent SDK's, unconfirmed until `DSK-26`) is reported once per turn and the turn interrupted;
  that turn ends `failed`. A turn ended by Stop ends `stopped`. A process that ends unasked ends
  its turn `failed`, then reports `crashed` with its exit code.
- **Tool calls** wait 120 seconds for `agent.toolResult`; then, or when no window is open, the
  model gets a sentence saying so. Only the tools `agent.start` listed are offered or run. The SDK's
  stateless transport answers with its default (SSE), as in the spike.
- **Closing** closes `claude`'s input, SIGTERM after 5 seconds, SIGKILL 5 seconds later. Quitting
  the app closes every session at once.
- **`agent.forget(id)`** deletes `projects/*/{id}.jsonl` and a `{id}` folder beside it under
  `CLAUDE_CONFIG_DIR` (else `~/.claude`), reading no other file there.
- **Windows** is started through `cross-spawn` (MIT), which runs `claude.cmd` via `cmd.exe` with
  every argument quoted; Node's own `spawn` refuses `.cmd` files without a shell. Untested on
  Windows until `DSK-22`/`DSK-26`.
- **Tests** never start the real `claude`: `apps/desktop/test/fixtures/fake-claude.mjs` speaks the
  stream-json above, checks the flags as strictly as 2.1.328 does, keeps a transcript where Claude
  Code would, and makes its tool calls over the real endpoint with the SDK's client. `DSK-24`
  reuses it.

The flags are pinned to what the spike saw on Claude Code 2.1.328 and are re-tested on each new
Claude Code release: the documentation says `--bare` will become the default for scripted runs,
and `--bare` never reads the subscription sign-in. What the spike settled, and what still needs a
signed-in macOS and Windows machine, is below.

#### Spike findings (Linux, 2026-11-19)

`DSK-04`, run in a Linux container with Claude Code 2.1.328, Electron 45.2.3 and
`@modelcontextprotocol/sdk` 1.32.2. No Claude credential was read or printed and no usage was
spent. Every `claude` ran as an unprivileged user, with an empty environment, an empty `HOME` and
`CLAUDE_CONFIG_DIR`, inside a network namespace with no route out. Unsetting the four
`ANTHROPIC_*`/`CLAUDE_CODE_OAUTH_TOKEN` variables was not enough there: the container's host
supplies a sign-in by another route, and `claude auth status` still said `loggedIn: true`. Where a
model reply was needed, `claude` was pointed with `ANTHROPIC_BASE_URL` and a dummy key at a local
stand-in for the Messages API that returns a scripted tool call (no model, nothing leaves the
machine). That stand-in proves the plumbing, not Anthropic's real replies.

**Flags.** All of the plan's flags exist. `--append-system-prompt-file` (and
`--system-prompt-file`) work but are not in `claude --help`; a missing file fails at start
(exit 1, `Error: Append system prompt file not found`). `--output-format stream-json` with `-p`
refuses to start without `--verbose`. Unknown flags fail at start with exit 1.

| Flag | What it did | Use |
|---|---|---|
| (the plan's original flags only) | The Educator's `CLAUDE.md`, a `CLAUDE.md` in Sources, their personal skill, their hooks *and hooks from `Sources/.claude/settings.json`* all reached the session | Not enough |
| `--strict-mcp-config` | Only `mcp.json`'s server started; user and Sources `.mcp.json` servers did not | Pin |
| `--setting-sources ""` | Kept out every `CLAUDE.md`, personal skills, user and project hooks; `--plugin-dir` skills and `--mcp-config` still load | Pin |
| `--tools Skill` | Built-in tools gone (no Bash, Read, Write, Edit, WebFetch, Agent); skills still load; MCP tools still offered | Pin |
| `--tools ""` | As above, but skills cannot load (no `Skill` tool) | Only if skills move into the prompt |
| `--disable-slash-commands` | Removes every skill, ours included | No |
| `--safe-mode` | Also drops `--mcp-config` servers and `--plugin-dir` skills | No |
| `--restricted` | Keeps Write, Edit and Read; ignores settings files | No |
| `--bare` | Keeps everything personal out, but its help says OAuth and keychain are never read: no subscription | No |
| `--permission-mode dontAsk` | A Bash call the model made anyway was refused and listed in the result's `permission_denials`; the `Skill` tool runs without being in `--allowedTools` | Pin |
| `--session-id <uuid>` | Sets the Claude session id on the first start; reusing it on a later start fails (`Session ID … is already in use`, exit 1) | Pin, first start |
| `--resume <uuid>` | Reloads the history and keeps the same `session_id`; worked from a different working folder too | Pin, later starts |
| `--system-prompt-snapshot off` | Default `on` resent the first start's prompt on `--resume`, ignoring a changed `prompt.md`; `off` sent the new one (found in review of this spike) | Pin |

With `--tools Skill` the model still sees Claude Code's built-in skills (`deep-research`,
`design-sync` and the like) next to ours; without tools they can do nothing. Skills from
`--plugin-dir` are plugin-shaped (`.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`) and
named `gurukul:<name>`; a folder of plugins loads each child (per `--help`, not tried).

**Not signed in, without spending usage.** Three signals, in the order the bridge uses them:

1. Before starting a session: `claude auth status` (JSON by default). Signed out: exit 1,
   `"loggedIn": false`, `"authMethod": "none"`. With a credential: exit 0 and `"loggedIn": true`
   (seen for an OAuth sign-in supplied by the container's host and for an API key). It works
   with no network and does not check the credential is still valid: a dummy API key also
   reports `loggedIn: true`.
2. Once started, before the first message: the stream-json `initialize` control request
   (`{"type":"control_request","request_id":"…","request":{"subtype":"initialize"}}`) answers at
   once with `account.tokenSource` (`"none"` signed out) and, for a key, `account.apiKeySource`.
3. In a turn: signed out, the turn ends within a second with an `assistant` event carrying
   `"error": "authentication_failed"` and the text `Not logged in · Please run /login`, then a
   `result` with `"is_error": true` and `"terminal_reason": "api_error"` (its `subtype` is still
   `success`). `total_cost_usd` is 0. A rejected credential (HTTP 401) and a rate limit (429)
   instead arrive as `system` events with `subtype: "api_retry"` and `error:
   "authentication_failed"` or `"rate_limit"`, `attempt`, `retry_delay_ms` and `max_retries: 10`,
   with growing delays (seven retries in the first 40 seconds) before the turn would fail; the
   bridge shows the message on the first one and stops the turn.

Nothing is printed to stderr in any of these cases; exit codes only say how the process ended.

**Stream input and output.** No `system`/`init` event comes until the first message; then one
comes at the start of every turn, carrying `session_id`, `tools`, `mcp_servers` (with `status`:
`connected`, `failed`), `plugins`, `skills`, `apiKeySource` and `claude_code_version`. Every
message event carries `session_id`. A turn ends with exactly one `result`. Messages written
before `init` are queued, and the process stays up between turns. `claude --version` prints
`2.1.328 (Claude Code)`.

**Stopping.**

| Action | During a turn | While idle |
|---|---|---|
| `interrupt` control request | The turn ends (`[Request interrupted by user]`, then `result` with `subtype: "error_during_execution"`, `terminal_reason: "aborted_streaming"`); the process stays and takes the next message | Answers `success`, nothing else |
| SIGINT | The same turn end, then the process exits 0 | Exits 0 |
| SIGTERM | — | Exits 143 |
| SIGHUP | — | Exits 129 |
| Close stdin | Waits for the turn to finish, then exits | Exits 0, or 1 if the last turn failed |

So Stop is the control request, closing a session is closing stdin (SIGTERM after a grace
period), and SIGINT is not used.

**The MCP round trip.** Two transports were proved; the bridge uses the first.

*HTTP endpoint in the parent (chosen).* The parent served MCP over HTTP on `127.0.0.1` (the SDK's
`StreamableHTTPServerTransport`, stateless) and refused any request without
`Authorization: Bearer <token>`. `mcp.json` gave `"type": "http"`, the URL and
`"headers": { "Authorization": "Bearer ${GURUKUL_BRIDGE_TOKEN}" }`, and the token was only in
`claude`'s environment. Signed out, with the pinned flags and no message sent, `mcp_status`
showed the server `connected` with its tools; with a wrong token it showed `failed`, `Server
rejected the configured Authorization header (HTTP 401)`, and Claude Code does not fall back to
OAuth when that header is set. With the stand-in API, a `mcp__gurukul__get_course` call reached
the parent and its answer came back as a `tool_result`; the turn ended `success`. One catch:
`mcp_status` echoes the header with the token expanded, so the bridge never logs control
responses. No proxy process, no socket path, no named pipe and no `RunAsNode`.

*Stdio proxy (fallback).* A stdio proxy built on the SDK's low-level `Server` forwards
`tools/list` and `tools/call` over a Unix socket (mode 0600) to the parent, which answered from a
fixed tool list. Driven by the SDK's own client: list, a call and an unknown tool (returned as
`isError`) round-trip in about 150 ms, and a wrong or reused token is refused. Started by
`claude` through `--mcp-config`, the proxy connects and lists its tools even signed out, and with
the stand-in API a `mcp__gurukul__get_course` call travelled claude → proxy → parent and back
into the next request as a `tool_result`. Findings that hold for either transport, and for the
proxy:

- The token is for one `claude` process, not one connection attempt: a resumed process given
  the previous token was refused and its server showed `"status": "failed"`. Each start mints a
  new token; it dies with the process.
- Put the token in the `claude` process's environment. `mcp.json`'s `env`, `${VAR}` references
  and plain inheritance all work, but the `mcp_status` control request echoes `mcp.json`'s
  `args` back, so the token must never be an argument.
- The proxy runs under the app's own binary: `command` is Electron's executable with
  `ELECTRON_RUN_AS_NODE=1` in `env`. That needs Electron's `RunAsNode` fuse left on in the
  packaged build, which lets any local program run code as the signed app (Privacy and
  security). This is why the HTTP endpoint is chosen.

**Electron.** From an Electron 45.2.3 main process under `xvfb-run`, with a hidden sandboxed
window: `child_process.spawn` of `claude` with piped stdio; `initialize`; one message; a tool call
through the proxy; an interrupted turn; the next message on the same process; SIGINT during a
turn; a restart with `--resume`; close stdin. All behaved as above. One trap: an ESM main file
that does a top-level `await app.whenReady()` never becomes ready (the ready event waits for the
entry module to finish evaluating); start from `app.whenReady().then(main)`.

**Where Claude Code keeps the chat.** Under the Educator's own Claude config folder
(`CLAUDE_CONFIG_DIR`, else `~/.claude`): `projects/<Sources path, every non-alphanumeric character
a dash>/<session id>.jsonl`, mode 0600, with every message and tool result, so course text and
answer keys. It also lists the session in their own `claude --resume`. `--no-session-persistence`
is no answer: such a session cannot be resumed. The 30-day clean-up removes it (Where it is
kept). `claude purge <Sources path>` deletes every session of that Sources folder, an open one
included, so the bridge deletes the one file instead. An empty `projects/<…>/memory/` folder is
created too.

**Still needs a signed-in macOS and Windows machine** (none of it could be done here):

- A real model round trip with the pinned flags and the HTTP endpoint: one message, one
  `gurukul` tool call, a skill loaded, Stop, resume.
- The subscription sign-in with `--setting-sources ""` and the allow-listed environment: that a
  Claude plan sign-in (keychain on macOS, the credentials file on Windows) still works, and what
  `auth status` and `initialize` report for it. An Educator whose sign-in comes from their settings (`apiKeyHelper`, or a cloud
  provider set in `settings.json`) loses it under `--setting-sources ""`; what to tell them is
  open.
- What a real plan limit looks like in the stream (the `rate_limit_event` event, `api_retry` with
  `rate_limit`, or both) and its reset time.
- Windows: spawning `claude.exe` (native install) and `claude.cmd` (npm install, which Node
  starts only through a shell), stopping without POSIX signals (the control request and closing
  stdin should suffice), paths with spaces, and where the transcript lands.
- macOS: the packaged, hardened, notarised app with its fuses set serving the HTTP endpoint; that
  no firewall prompt appears for a `127.0.0.1` listener.
- Only if the stdio proxy is needed after all: the named pipe on Windows; on macOS a socket path
  under 104 bytes (a short temporary folder, not `Application Support`) and the hardened runtime
  with `ELECTRON_RUN_AS_NODE`.

These are `DSK-26`.

### Signing in to Gurukul

Google refuses sign-in inside embedded windows, so `signInWithPopup` and `signInWithRedirect` do
not work in the shell. The desktop app opens the system browser (OAuth with PKCE and a loopback
redirect, a "Desktop" OAuth client), receives an ID token, and the web app calls
`signInWithCredential`. The `@nonstopio.com` check stays where it is, in the security rules. The
OAuth client is a maintainer item (`DSK-02`); how its client id reaches the build without
tripping the secret guard is open question 22.

## Sessions

### Shape

`packages/schema/src/session.ts` (`authoringSessionSchema`, zod):

```ts
interface AuthoringSession {
  schemaVersion: 1;
  id: string;
  uid: string;
  kind: 'new' | 'edit';
  courseId: string | null; // null until a new course is created at the first save
  title: string; // "Simplify the rebase chapter"
  goals: { text: string; done: boolean }[]; // what the Educator asked for, ticked by the agent
  summary: string; // what the session did, written by the agent, editable in Review
  status: 'open' | 'saved' | 'discarded';
  base: { rev: number; savedAt: string | null; work: WorkingCopy } | null; // null until a stored draft exists
  work: WorkingCopy; // course + answer keys, as changed
  turns: Turn[]; // id, at, by (agent or educator), one-line summary, checkpoint file, changes (row count)
  todos: SessionTodo[]; // things left for the Educator ("add a screenshot of the diff view"), done or not
  viewed: string[]; // keys of the Review rows ticked as viewed (`lesson:l2`)
  agentSessionId: string | null; // for --resume
  createdAt: string; // ISO-8601: a local file, not a Firestore document
  updatedAt: string;
}
```

`WorkingCopy` (`workingSchema`) has the same shape as Studio's existing working copy (`course`,
`answers`, `answersChanged`), so one is handed to the other without conversion. Goals are objects,
not strings, because Review ticks each one and `set_summary` sets "goals with done or not".

The schema also holds the rules a file must keep: an edit session has a course and a base; a base
always belongs to a known course, and a new-course session gains both together at its first save
(keeping `kind: 'new'`); the working course's id and the base's are the session's `courseId`;
checkpoints are plain file names, so a session file cannot point outside its folder; turn and
to-do ids are unique.

### Where it is kept

On the laptop, under the app's data folder, per signed-in person:
`sessions/{uid}/{sessionId}/` with `session.json`, `checkpoints/{turnId}.json` (a full working
copy after each turn, the newest 30 kept), `transcript.jsonl` (the chat), and the agent's own
`prompt.md`, `skills/`, `mcp.json` and empty `workdir/`, which only the main process writes. Source material lives where the Educator can see it:
`Documents/Gurukul Studio/{course slug}/sources/`.

These files hold answer keys. They sit on the laptop of an Educator who may already read those
keys; they are never uploaded, never logged, and removed 30 days after a session is saved or
discarded (the title, summary and counts are kept as history).

Claude Code keeps a second copy of the chat, tool results and so answer keys included, in the
Educator's own Claude config folder: `projects/<Sources path>/<Claude session id>.jsonl`
(Starting Claude Code, Spike findings). The same 30-day clean-up removes it: the main process
deletes the one file named by the session's Claude session id (and a folder of that name beside
it, if any), found by that id under `projects/*/`, because the folder name is Claude Code's own
encoding of the path. It does not use `claude purge <Sources path>`, which would also delete a
newer session of the same course.

### Rules

- **One open session per course per person.** Starting a second offers to open the first.
- A session never writes Firestore until Save to draft. Starting one costs one draft read.
- Closing the app, signing out or losing the network keeps the session.
- **Discard** needs a typed confirmation of the course title when the session has more than five
  changes; the stored draft is untouched.
- A session can be saved more than once: after Save to draft it stays open with the new draft as
  its base ("Saved 11 changes. Keep working, or close the session"). Closing marks it `saved`.
- The agent never publishes, never changes who can open a course, never deletes a course.

### Starting a session

From the Studio course list in the desktop app: **New course with AI** and, on each course the
person may edit, **Edit with AI**. The start dialog asks for the goal in one free-text box and
offers the Sources folder. For a new course it asks nothing else; title and slug are settled at
the first save, when the content exists.

## The session workspace

Route `/studio/sessions/:sessionId` (classified in `navigation/areas/`; offered by global search
only inside the desktop app).

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Courses   Simplify the rebase chapter           11 changes · ✓ checks   [Review]  [⋯]   │
├───────────────────────────────┬──────────────────────────────────────────────────────────┤
│ Chat                          │  [ Preview ]  [ Outline ]                                 │
│                               │                                                          │
│ You: The rebase chapter is    │  3.2 · Rebase before you raise a pull request            │
│ too heavy. Simplify it and    │  ┌────────────────────────────────────────────────────┐  │
│ add a Quiz.                   │  │ Text · changed                                     │  │
│                               │  │ Rebase before you open a pull request. It replays… │  │
│ Agent: I rewrote lessons 3.1  │  └────────────────────────────────────────────────────┘  │
│ to 3.3 and added a Quiz with  │  ┌────────────────────────────────────────────────────┐  │
│ six questions.                │  │ Code                                               │  │
│  ▸ Turn 4 · 4 changes  [Undo] │  │ git fetch origin                                   │  │
│                               │  └────────────────────────────────────────────────────┘  │
│ ┌───────────────────────────┐ │                                                          │
│ │ Ask for a change…         │ │                                                          │
│ └───────────────────────────┘ │                                                          │
└───────────────────────────────┴──────────────────────────────────────────────────────────┘
```

- **Chat.** Streams the agent's reply. While it works, a line says what it is doing in plain words
  ("Rewriting lesson 3.2", "Checking the Quiz"), never tool names. Stop ends the turn; whatever
  the turn had already changed stays and becomes its checkpoint.
- **Turn chips.** Each finished turn shows "Turn 4 · 4 changes". Clicking it opens Review
  filtered to that turn. **Undo** on the newest turn restores the checkpoint before it; older
  turns are undone newest first.
- **Preview** is the real learner player drawing the working copy (the player that
  `PreviewPage` uses), with a marker on every changed block. **Outline** is the chapter tree with
  Added, Changed, Removed and Moved badges.
- **Click a block** in the preview to attach it to the next message ("make this shorter" needs no
  explanation of which block). `DSK-20`.
- **Edit by hand.** "Open in editor" on any lesson or Quiz opens Studio's usual editor bound to
  the session's working copy instead of the stored draft (a second source behind the `DraftApi`
  the editors already use). Hand edits become a turn of their own, by the Educator. `DSK-19`.
- **Width.** From 1024px the two panes sit side by side. From 640px to 1023px the chat is a
  drawer over the preview. Below 640px the page says it needs a wider window, like the rest of
  Studio.
- The header count and checks update after every turn. **Review** is always available.

## Review: the whole session at once

The **Review** tab of the session route. This is the screen the feature stands on.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Review · Simplify the rebase chapter                    compared with Draft v4, 18 Nov    │
│                                                                                          │
│ Summary (written by the agent, editable)                                                 │
│  Goals   ✓ Simplify chapter 3   ✓ Add a Quiz   ○ Screenshot of the diff view (left to you)│
│  Rewrote lessons 3.1 to 3.3 in shorter sentences, added "Rebase check" with 6 questions… │
├──────────────────────────┬───────────────────────────────────────────────────────────────┤
│ 11 changes · 7 viewed    │  3.2 · Rebase before you raise a pull request        Changed  │
│ [All] [Turn 4] [Turn 5]  │  [Side by side] [Inline] [As a learner]      ☐ Viewed   [⋯]   │
│                          │  ┌──────────────────────────┬──────────────────────────────┐  │
│ Course details        C  │  │ Before                   │ After                        │  │
│ Landing page          C  │  │ Text                     │ Text                         │  │
│ ▾ 3 · Keeping history    │  │ In today's fast-paced    │ Rebase before you open a     │  │
│     3.1 Why rebase    C  │  │ development landscape, ~ │ pull request. It replays… +  │  │
│   ▸ 3.2 Rebase before C  │  ├──────────────────────────┼──────────────────────────────┤  │
│     3.3 Conflicts     M  │  │ 2 unchanged blocks                                      │  │
│     Rebase check      A  │  ├──────────────────────────┼──────────────────────────────┤  │
│ ▾ 4 · Review             │  │                          │ + Check: Your branch is two  │  │
│     4.2 Old checklist R  │  │                          │   days behind main. What…    │  │
│                          │  └──────────────────────────┴──────────────────────────────┘  │
│ Checks                   │                                                               │
│  ✓ Course is valid       │                                                               │
│  ✓ Size 212 KB of 900 KB │                                                               │
│  ! Writing: 2 notes      │                                                               │
│  ! Answers: 1 to check   │                                                               │
│  ○ Not ready to publish  │                                                               │
│  ✓ Draft is up to date   │                                                               │
├──────────────────────────┴───────────────────────────────────────────────────────────────┤
│ Left for you: 1                                  [Keep working]   [Save 11 changes to draft]│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### What counts as a change

One row per thing an Educator thinks of as a unit:

| Row | Statuses | Detail shown |
|---|---|---|
| Course details | Changed | Field table: title, summary, level, pass mark, cover, learning rules, each as before → after |
| Landing page | Changed | Description as a word difference; outcomes added, removed, reworded |
| Chapter | Added, Removed, Renamed, Moved | Title difference; "moved from position 2 to 4" |
| Lesson | Added, Changed, Removed, Moved | Settings table, then its blocks |
| Quiz | Added, Changed, Removed, Moved | Settings table, then its questions |

Moved means the same id in a different chapter, or out of order among the entries both copies
share; a moved and edited item shows both badges. "Out of order" is decided by the longest run of
shared ids that keeps its order (longest common subsequence), not by index, so inserting a lesson
at the top of a chapter marks only that lesson Added, not every lesson after it Moved. The same
rule applies to chapters, blocks, questions and options. The header count is the number of rows.
Rows are grouped under their chapter in course order, with removed items shown where they used to
be: right after the nearest entry before them in the base that is still there and not moved.

`courseChanges(base, work)` (`packages/schema/src/changes.ts`) computes all of this, pure and
without I/O; Review, the turn chips' counts and the outline badges read it. Found while building
it:

- Outcomes and a check block's options have no ids, so they are matched on exact text: a reworded
  entry between two unchanged ones is Changed with a word difference, and a reordered one shows
  as removed and added. They are never Moved.
- A changed answer key is compared as a set (reordering the same correct options is no change)
  and is listed on its own (`answerChanges`) as well as on its question. A check block's answer
  is compared by the text of its correct option, so reordering its options is no change either;
  check blocks are listed in `answerChanges` too. A new question shows its key, but only questions
  and check blocks on both sides count as a changed answer.
- Every row has a `key` (`lesson:l2`), unique within the result; Viewed ticks store it. A lesson
  turned into a Quiz under the same id is two rows (`lesson:l2` removed, `quiz:l2` added). A
  question moved from one Quiz to another shows as removed from one and added to the other.
- Ids repeated by mistake (the schema allows them; publishing refuses them) are paired in order
  of occurrence, so an unchanged copy never shows a change.
- Word and line differences give up after 1,000 edits and show the text as all removed, all added:
  rewriting a 20,000-character block then costs about 60 ms instead of over a second, and every
  turn's change count runs this.

### How each kind of content is compared

| Content | Difference shown |
|---|---|
| Titles, summaries, captions, alt text, options | Word-level: removed words struck through, added words underlined, both also tinted |
| Text and callout blocks (markdown) | Word-level on the source, with **Rendered** to see before and after as a learner would |
| Code blocks | Line-level, monospace, with `−` and `+` in the gutter |
| Image, video, embed, file blocks | Before and after thumbnails or link cards, plus a table of changed fields |
| Check blocks and Quiz questions | Prompt difference; options listed with added, removed, reworded marks; explanation difference |
| **Correct answer** | Its own line in the warning tone: "Correct answer changed: B → C". Never folded into a general "changed" |
| Settings and numbers | "Pass mark 70% → 80%", "Shown 5 → 6 questions" |
| Blocks and questions in a list | Added, removed, moved, changed; unchanged runs collapse to "3 unchanged blocks" (expandable) |

Difference is never shown by colour alone: every mark has a sign or text decoration and a label
for screen readers ("removed: …", "added: …"). Tints come from role tokens; a new semantic pair
for "removed" and "added" grounds is added to `tokens.css` if the existing danger and accent soft
grounds do not reach 4.5:1 with body text in both themes (`gurukul-design` skill).

### Views

- **Side by side** (from 1024px): before on the left, after on the right, rows aligned block by
  block. **Inline**: one column, removed above added; the only layout below 1024px.
- **As a learner**: the item in the real player, with a Before / After switch.
- An **Added** item has no before: it opens As a learner. A **Removed** item shows what is going,
  with the number of learners who completed it (the count query Studio's delete dialog already
  makes, run when the row is opened).

### Acting on a row

Reviewing is one decision at the end, not one per row. A row offers only:

- **Viewed**: a tick to keep your place, like GitHub's. "7 of 11 viewed". Never required.
- **Ask for a change**: opens the chat with this item attached; the reply is a new turn and the
  review refreshes.
- **Open in editor**: edit by hand (`DSK-19`).
- **Undo this item**: puts the item back as it is in the base. Behind the row's menu and behind a
  confirmation, because it throws away work.

### Checks

Like the checks on a pull request. Two can stop a save; the rest inform.

| Check | Source | Stops Save |
|---|---|---|
| Course is valid | `courseSchema` on the working copy | Yes |
| Size | `courseBytes` against `COURSE_BYTES_LIMIT` (warning from `COURSE_BYTES_WARN`) | Yes, over the limit |
| Draft is up to date | Stored draft's `rev` against the base `rev` | Yes, until brought up to date (below) |
| Writing | `writingLint` findings on changed text | No |
| Answers | The second-opinion pass on changed questions | No |
| Ready to publish | `validateForPublish`; a draft may be saved unfinished | No |
| Left for you | The session's to-do list | No |

Each finding links to its row. Writing and Answers offer "Ask the agent to fix these".

### Save to draft

**Edit session.** The button says "Save 11 changes to draft". Its confirmation says: "This
replaces Draft v4 with this session's version. Learners see nothing until you publish." It then
writes `courses/{id}/drafts/current` once, through the same save Studio's autosave uses (same
`rev` check in a transaction, same `answersChanged` marking, same rules). On success the page
shows what was saved and two links: **Open the course editor** and **Publish…** (the existing
publish dialog, which shows its own draft-against-live difference).

**New course.** Everything is Added, so Review opens on Outline and As a learner instead of a
difference. The button says "Create course and save draft" and asks for the title and the slug
(suggested from the title, with the existing warning that it can never change). It calls
`createCourse`, then saves the draft. If the course is created and the save fails, the session
becomes an edit session on the new course and offers the save again; nothing is created twice.

**When the draft moved underneath.** Someone else, or the Educator in the browser, saved the
draft after the session started. This is checked when a session is opened and again at Save. The
page says: "The draft was saved by Arjun at 14:10, after this session started." and offers
**Bring in their changes**, which runs a three-way merge (`mergeWorking(base, mine, theirs)`):

- Items, chapters and course fields changed on one side only are taken from that side.
- An item changed on both sides is a conflict: the Educator picks **Keep this session's** or
  **Keep theirs** per item, seeing both.
- Chapter and item order changed on both sides: the session's order wins and the page says so.
- Answer keys travel with their question.

The stored draft becomes the new base, Review is drawn again against it, and Save is offered
again. Nothing is overwritten silently, and there is no "save anyway".

`mergeWorking` and `resolveConflicts(result, choices)` (`packages/schema/src/merge.ts`, imported
as `@gurukul/schema/merge`) do this, pure and without I/O. They match things the way Review does
(`changes.ts`: chapters by id, lessons and Quizzes by type and id, repeated ids in order) and take
"changed" from `courseChanges`, so a merge never disagrees with the rows the Educator reviewed.
Found while building it:

- The unit is the Review row. Course details and landing page fields merge one by one (the
  outcomes list is one field: it has no ids). A lesson or Quiz is taken whole from one side, never
  merged block by block or question by question, so a Quiz always arrives with its own keys. Both
  sides making the same change, or adding the same item, is no conflict.
- Conflict keys follow the row keys (`lesson:l2`, `chapter:p3`, and `field:rules.passMark` for a
  field), so the screen can show both rows. `resolveConflicts` refuses while any conflict has no
  choice.
- A change and a move are separate: one side's new words and the other side's new place both land.
  Removed on one side and only moved or untouched on the other: removed. Removed on one side and
  changed on the other: a conflict.
- A chapter removed on one side takes along the items still in it on the other side, and is one
  conflict (not one per lesson) when that side renamed it or added, changed or moved in a lesson
  there. Keeping it keeps it as that side has it; removing it sends a lesson moved into it back to
  where the other side has it, and drops one that was only ever there.
- An item moved on both sides goes where the session put it; a list reordered on both sides takes
  the session's order. Either way `orderKept` names the list so the page can say so. An item one
  side added goes right after the entry before it on that side.
- The course's own fields that Studio and publishing keep (id, version, status, `publishedAt`,
  Educators) come from the stored draft. `answersChanged` is set as Studio's save sets it: when
  the stored draft carries it or the merged keys differ from the stored draft's.
- Items are matched by type and id, so a lesson on one side and a Quiz on the other under one id
  (one turned into the other, or both added) are two rows, and the schema would accept a course
  holding both. The merge never keeps both: when both could stay they are one conflict, keyed by
  the session's row, and choosing a side keeps only that side's item (and, for a Quiz, its keys).
- Two copies each within the limits can merge into one over them (31 chapters, 61 lessons in a
  chapter, over `COURSE_BYTES_LIMIT`). The merged copy goes through Review's checks like any
  working copy, so "Course is valid" or Size stops that save.

## The agent's tools

One MCP server, `gurukul`. The tool list is built in `apps/web/src/studio/session/tools/` and run
in the window against the working copy. Ids for new chapters, items, blocks, questions and
options are made by the app (`ids.ts`), never by the model.

| Group | Tools |
|---|---|
| Read | `get_course` (details and outline, no block text), `get_item`, `get_base_item` (as it was at the start), `search_course`, `list_changes`, `list_sources`, `read_source` |
| Course | `set_course_details`, `set_landing` |
| Structure | `add_chapter`, `update_chapter`, `move_chapter`, `remove_chapter`, `add_lesson`, `add_quiz`, `update_item`, `move_item`, `remove_item` |
| Lesson blocks | `add_block`, `update_block`, `move_block`, `remove_block`, `set_blocks` (replace a lesson's blocks in one call) |
| Quiz | `update_quiz_settings`, `add_question`, `update_question` (prompt, options, correct options, explanation, lesson it revisits), `move_question`, `remove_question` |
| Checks | `check_course` (schema, size, publish issues), `lint_writing` |
| Session | `set_summary` (title, goals with done or not, summary), `add_todo`, `resolve_todo` |

Rules every tool follows:

- The result is applied to a copy, validated with the course schema and the size limit, and only
  then becomes the working copy. A refusal returns a sentence the model can act on ("A lesson
  holds at most 60 blocks").
- Write tools use Studio's edit helpers (`courseEdit.ts`, `lessonEdit.ts`, `questionEdit.ts`), so
  the agent and the editors cannot disagree about what a valid edit is.
- **The agent never invents a media address.** For a picture, video or file it calls `add_todo`
  ("Screenshot of the rebase conflict screen, after block 3"). To-dos show in Review as
  "Left for you" and the Educator adds the media by hand. Markdown text is held to the same rule:
  a change that adds a picture (`![…](…)`, a reference picture, or raw media HTML) to a text or
  callout block, the course description, a check or a Quiz question is refused, read with the
  parser the player uses (`mdast-util-from-markdown`). A picture the Educator already wrote stays,
  so the agent can still edit the words around it.
- There is no tool for publishing, access, roles, assignments, learners, progress, attempts,
  teams, the question bank of other people, or any other course.

Each tool is `{ name, description, input (zod), run(state, input, ctx) }`, pure: no React,
Firestore or bridge. `runTool(state, name, input, ctx)` parses the input, runs the tool and checks
the result; `toolList()` gives the MCP server each input as JSON Schema (zod's `toJSONSchema`).
The writing lint and the Sources folder come in through `ctx` (`ctx.lintWriting`,
`ctx.sources`), with the clock and the randomness for ids. Found while building it:

- **A draft that is already invalid does not block the agent.** An Educator's draft may hold an
  untitled chapter or an empty Quiz (Studio saves drafts unfinished). A change is refused only for
  schema problems it adds, matched by the ids on their path, so moving a broken chapter is not a
  new problem; and for size, only when it grows a course past the limit. Refusals name the place in
  words: "In chapter "Basics" (p1) › lesson "Branches" (l2), title cannot be empty."
- `runTool` also refuses any change to the course's id, Educators, status, version or publish
  date, and keeps the base as it was, whatever a tool returns.
- `add_quiz` takes its questions in the same call: the course schema requires at least one, so an
  empty Quiz would be refused. `questionsShown` defaults to all of them. `remove_question` refuses
  the last question and points at `remove_item`.
- Right answers are indexes from 0 into the options given (`correct`); a True or False question
  always has the answers True and False. Changing a multiple-choice question to single choice
  without saying which answer is right is refused, never trimmed to the first; so is turning a
  question into True or False without `correct`, since its old answers become True and False.
- `add_block` and `set_blocks` write only text, code, callout and check blocks. `update_block`
  changes only the words of a media block (alt, caption, title, label), never an address or an
  upload. `set_blocks` takes `{ "keep": id }` to keep a block as it is (the only way to keep
  media), a block with an existing `id` to rewrite it in place (so Review shows Changed, not
  Removed and Added; every field the block needs is given, as for a new one, and `update_block`
  is for changing a few), or a block without one to add it.
- `update_question` keeps answers by id (`{ id, text }`) so a reworded answer stays the same
  answer, and keeps the right answers marked when `correct` is left out.
- `read_source` reads only a plain file name that the Sources folder lists: a name with `/` or
  `\`, `.` or `..`, or one `list` does not give is refused before the bridge is asked. The bridge's
  read takes that name and never resolves it outside the folder.

## Writing quality: the humanizer

Three layers, because a prompt alone drifts in a long session.

**1. Style in the system prompt (always on).** The reader is a NonStop engineer for whom English
is a working language. Second person. One idea per sentence. A concrete example from real work
before the rule. British spelling, as in the app. Short paragraphs. No filler openings, no hype,
no summary that repeats the lesson. Headings in sentence case. Code in code blocks, never in
running text.

**2. The humanize skill.** A step the agent must run on every text field before it writes it:
lesson text, callouts, course description, outcomes, Quiz questions, options and explanations.
It rewrites, then calls `lint_writing` and fixes what the lint reports. Other skills: `outline`
(chapters and lessons first, agreed before any lesson is written), `lesson` (one lesson: what the
learner can do afterwards, example, steps, one check), `quiz` (questions only from lessons already
written, each naming the lesson it revisits).

**3. The writing lint (code, not AI).** `packages/schema/src/writingLint.ts`, pure and fully
tested. It runs on every changed text and feeds the Writing check, so the agent cannot talk its
way past it. First rules:

- A list of worn phrases ("in today's fast-paced", "delve", "leverage", "seamlessly", "it is
  crucial to", "let's dive in", "unlock", "robust", and the rest of the list kept in the file).
- A sentence over 30 words; a paragraph over 5 sentences; more than one exclamation mark in a
  lesson; a heading in Title Case.
- Quiz: "all of the above" or "none of the above"; the longest option more than twice the median
  length (the long one is usually the right one); an explanation that is empty or only says the
  option "is correct"; an explanation that names an option by letter, number or position
  ("Option B", "B is correct", "the second one"), which means nothing once options are shuffled; a negative question ("Which is NOT…") without
  the negative marked. The Quiz rules apply to a lesson's check blocks too.

Markdown code (fenced and inline), link targets and addresses are never linted, and spelling is
not linted. A heading may capitalise names: Gurukul's own terms and a short list of common tool
names are kept in the file, and acronyms and mixed-case names (GitHub) pass by their shape.
`lintText(text, field)` lints one text for `lint_writing`; `lintCourse(work, scope?)` lints a
course, limited by `scope` to the ids of `courseChanges` rows (`course`, `landing`, a chapter, a
lesson or Quiz) for the Writing check. Exclamation marks are counted over a whole lesson there,
and the finding sits on the text holding the first one too many.

Example of what the layers are for:

| | Before | After |
|---|---|---|
| Lesson text | In today's fast-paced development landscape, it is crucial to leverage Git's powerful rebasing capabilities to seamlessly maintain a clean commit history. | Rebase before you open a pull request. It replays your commits on top of the latest main, so the reviewer sees only your changes. |
| Explanation | Option B is correct because rebasing is the best practice in this scenario. | Rebase puts your commits after the newest ones on main. Merge also works, but it adds a merge commit the reviewer has to read past. |

**Answers get a second opinion.** When Review opens, each question added or changed in the
session is answered again by a separate one-shot Claude Code run that is given the lesson text and
the question but **not the key**. The app compares its answer with the key; a disagreement shows
"Check this answer" on the row. It runs once per changed question and again only if that question
changes. It uses the Educator's plan, so Review also has "Skip answer check".

The humanizer makes text plain. It does not make facts true: technical accuracy is the
Educator's, which is why nothing is saved without Review.

## Privacy and security

- Course text, source files and answer keys in a session are sent to Anthropic under the
  Educator's own account. The start dialog and the Sources folder say so, and say not to add
  client names or internal documents (`.claude/rules/open-source.md` covers the repository; this
  covers what Educators send).
- No learner data can reach the agent: there is no tool for it.
- Logs follow `17-logging.md` in the window and in the main process: constant event names,
  counts and ids only. Never chat text, course text, source file names or answer keys.
- Analytics (`20-product-analytics.md`) gains `session_started`, `session_saved`,
  `session_discarded` with counts only (changes, turns, kind). No text.
- The bridge is exposed to the Gurukul origin only. If that origin were compromised, an attacker
  could set the agent's prompt and tools, but the agent still has no shell, no file writes and
  read access to one Sources folder.
- The shell stores no Claude credential and no Google refresh token of its own; Firebase Auth
  keeps its session as it does in the browser.
- `claude` starts with an allow-listed environment (Starting Claude Code), so a variable set for
  something else cannot send a session's course text to another server or bill another account.
- The agent's tool endpoint listens on `127.0.0.1` only, with a fresh random 256-bit token per
  `claude` process, and refuses a request without it or with an `Origin` header (a web page is
  never the caller). The token lives only in that process's environment and the main process's
  memory; control responses that echo it are never logged.
- **Electron fuses.** The packaged build (`DSK-21`) turns off `RunAsNode`,
  `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`, and turns on
  `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`. With `RunAsNode` on, any
  program on the laptop could run JavaScript as the signed, notarised Gurukul Studio and inherit
  its identity and macOS permissions; Electron's security guidance says to turn it off. That is
  why the agent's tools are served over HTTP by the main process rather than through a proxy
  process run by the app's binary. If `DSK-26` forces the stdio proxy, `RunAsNode` stays on and
  this bullet records that trade-off and its reason before it ships.

## Cost

- **Firebase: less than today for the same work.** A session reads the draft once and writes it
  once, where forty minutes of hand editing autosaves dozens of times. No new collection, no new
  function, no Storage. `11-deployment-and-cost.md` is unaffected.
- **AI: nothing for NonStop.** Each Educator uses their own Claude plan. When a plan's limit is
  reached the chat says so and the session waits.
- **Installers:** Apple's developer programme is $99 a year (`DSK-03`). Windows ships unsigned at
  first, as Morph does, which shows a SmartScreen warning; a certificate is a separate yearly cost
  to be quoted (`DSK-22`). Builds and update files are hosted free on GitHub Releases.

## Releases, versions and updates: from the first build

The shell is versioned, released and self-updating from its first merged pull request, not at the
end. The pipeline is the one already running in the maintainer's Morph app
(`github.com/ProjectAJ14/Morph`: `.github/workflows/release.yml`, `electron-builder.yml`,
`electron/updates.ts`, `docs/release-setup.md`, `docs/index.html`), read on 2026-11-18 and
adapted to this monorepo. Morph has no licence file; the maintainer owns it and brings the code
across under this repository's MIT licence.

### Versions: nobody types one

- **Git tags are the version.** `apps/desktop/package.json` holds a placeholder (`0.0.0`); CI
  stamps the real version into the build and never commits it back. Same rule as Morph.
- **The bump comes from commit subjects** since the last desktop tag: a `!` after the type or a
  `BREAKING CHANGE:` line is major, `feat` is minor, anything else is patch. Pull requests are
  squash-merged, so the subject is the PR title the `pr-title` check already enforces.
- **Monorepo differences from Morph.** Tags are `desktop-vMAJOR.MINOR.PATCH`, so they never
  collide with the web app's `release-*` tags (the last one is found with
  `git describe --tags --match 'desktop-v*'`). Only commits that touch `apps/desktop/` are read
  for the bump, and only a push to `main` that touches `apps/desktop/` releases. A web-only change
  ships through `deploy.yml` as today and reaches the desktop app with no new installer, which is
  the point of the thin shell.
- First release: `desktop-v0.1.0`. The app shows its version in Settings and reports it through
  `info()`.

### The release workflow (`.github/workflows/desktop-release.yml`)

Runs after CI has passed on that commit on `main`, the way `deploy.yml` waits for CI. Pull
requests never build installers; `npm run check` in CI covers the workspace.

| Job | Does | From Morph |
|---|---|---|
| Next version | Computes `desktop-vX.Y.Z` as above | Same script, with the tag prefix and path filter added |
| Build (macOS) | `electron-builder --mac --arm64 --x64`: DMG and ZIP, signed, notarised, hardened runtime, `forceCodeSigning` so an unsigned Mac build cannot ship. Fails early, naming the secret, if one of the five is missing | Same |
| Build (Windows) | `electron-builder --win --x64`: NSIS installer, one click, per user | Same; unsigned until `DSK-22` |
| Create release | One GitHub Release per version with the installers, `latest-mac.yml`, `latest.yml` and blockmaps, notes generated from the merged pull requests | Same |

Differences kept on purpose: `npm ci` with the committed lockfile (Morph deletes its lockfile and
reinstalls), Node 22 from `.nvmrc`, one release at a time through a concurrency group.

Secrets, in GitHub Actions only: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (`DSK-03`). `docs/desktop-release-setup.md` is
Morph's step-by-step guide with the names changed.

Installer names: `Gurukul-Studio-{version}-{arch}.dmg`, `.zip`, and
`Gurukul-Studio-Setup-{version}.exe`. App id `com.nonstopio.gurukul.studio`.

### Updates (`apps/desktop/src/updates.ts`, from Morph's `electron/updates.ts`)

- Packaged macOS and Windows builds only; development builds never check.
- Checks at launch and every six hours, downloads in the background, **never opens a dialog on
  its own**.
- When a download finishes the shell tells the window (`app.onUpdateReady(version)`) and Studio's
  sidebar shows an "Update ready" item. Clicking it restarts and installs; a normal Quit installs
  it too. If the install fails the app stays open, the item goes away and the next check tries
  again.
- **Check for updates…** in the app menu checks on demand and says "up to date", "already
  checking", or points at the sidebar item.
- An open session is safe across the restart: it is written to disk after every turn.
- Two kinds of "out of date" stay separate. A new **shell** arrives through this updater. A new
  **web app** arrives with a normal deploy; if it needs a newer bridge than the installed shell
  has, the page says "Update the app" and offers Check for updates.
- Changes from Morph: the `log` helper instead of `console.warn`, wording in Gurukul's voice, and
  the logic tested in Vitest at 100% with the updater, dialog and timer injected (Morph's
  `scripts/check-updates.cjs` cases, ported).
- The updater reads GitHub Releases of this repository. The web app pushes tags but creates no
  GitHub Releases, so "latest release" is always a desktop one; that must stay true. To confirm
  when building: that `electron-updater`'s GitHub provider accepts the `desktop-v` tag prefix. If
  it does not, use its generic provider pointed at
  `github.com/nonstopio/gurukul/releases/latest/download/`.

### Download

Morph's landing page asks GitHub for the latest release, picks the installer for the visitor's
system and falls back to the releases page. Gurukul does the same inside Studio:

- The Studio course list in the browser shows a card, "Build a course by chatting". It reads
  `api.github.com/repos/nonstopio/gurukul/releases/latest` (public, no key), finds the Apple
  Silicon DMG, the Intel DMG and the Windows installer by file name, puts the visitor's own system
  first, shows the version and the three install steps for that system, and links to all
  releases. If the request fails it links to the releases page.
- In the desktop app the same place shows the session buttons instead. One feature tip points at
  the card (`adding-feature-tips`).
- The card is the announcement to Educators, so it waits for Anthropic's answer (`DSK-01`). The
  pipeline and the updater do not: early releases are on GitHub for the people building the app.

### Housekeeping

- Commit scope `desktop` is added to `commitlint.config.mjs`, the PR-title check and the
  commit-message skill's table together.
- Each piece a person would notice gets a changelog entry in its own pull request. Desktop
  versions do not appear in `/changelog`; that page keeps deriving releases from `release-*` tags.
- Upgrade testing needs two signed releases: install the older, release the newer, confirm the
  sidebar item, restart, and check the version and an open session survive. On Apple Silicon,
  Intel and Windows.

## Testing

- 100% coverage in every workspace, including `@gurukul/desktop`. The Electron glue is kept to a
  few lines over injected adapters (process spawn, sockets, file system, dialogs) so the logic is
  plain functions.
- The change engine, merge and lint are pure and tested with table cases: every block type, every
  status, moves, a changed answer key, conflicts on both sides.
- End to end: Playwright's Electron support drives the built shell against the emulators with a
  **fake Claude Code** (a script that replays recorded stream output and tool calls), covering:
  start a session, a turn that changes a lesson, Review, Save to draft, the draft holds the
  change; a new course; a stale draft and a merge. No test calls Anthropic.
- Screens are checked at 1280px, 1024px and 640px, in both themes, by keyboard.

## Phases

Estimates are judgment for one developer at this repository's bar, not measurements.

| Phase | Items | Roughly |
|---|---|---|
| A · Foundations | Spike, session shape, change engine, merge, writing lint | 1.5 weeks |
| B · The shell | Window and bridge, release pipeline with versions and updates, Google sign-in, agent bridge | 2.5 weeks |
| C · Sessions | Session store and start, course tools, workspace, prompts and skills | 2.5 weeks |
| D · Review and save | Review screen, Save to draft with merge, new course, answer check | 2 weeks |
| E · Finish and ship | Hand edits, click a block, Sources, download card, Windows signing, docs, end-to-end | 1.5 weeks |

**Exit:** an Educator installs the app, builds a course of at least three chapters by chatting,
reviews it on one screen, saves it to the draft with one button and publishes it from Studio,
with no Firestore write before the save and a Firebase bill of $0.

Item by item: tracker section **Desktop Studio** (`DSK-01` to `DSK-25`).

## Not in v1

- Offline use. Review of a session by a second person (sessions are local; a shared session
  would need a Firestore collection and rules, and a cost review).
- The agent in the browser. A model picker. Agents other than Claude Code.
- Generating images, video or voice. Uploading media by the agent.
- Linux installers (the shell runs there; nobody has asked).

## Open questions

Collected in `13-open-questions.md` as 18 to 23.
