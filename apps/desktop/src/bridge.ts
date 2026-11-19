/**
 * The contract between the desktop shell and the web app: `window.gurukulDesktop`, version 1.
 *
 * Shared by both sides, so it imports nothing: no Electron, no Node, no zod. The web app imports
 * it as `@gurukul/desktop/bridge` (with `import type` only, so nothing here reaches its bundle) and
 * the shell builds its IPC handlers (`ipc.ts`), its window events (`events.ts`) and its preload
 * (`preloadApi.ts`) from it. Plan: `.plan/22-desktop-studio.md`, "The bridge".
 *
 * Two directions:
 *
 * - **Calls**, window → main: `BridgeCalls`, listed in `CALLS`. Each is a function returning a
 *   promise; the main process checks the sender and the arguments (zod) before its handler runs.
 * - **Events**, main → window: `BridgeEvents`, listed in `EVENTS`. The window subscribes with a
 *   handler and gets back a function that unsubscribes. The main process sends an event only to the
 *   top frame of an allowed origin; the preload hands the handler the payload alone (plain data,
 *   never Electron's event object).
 *
 * Adding a call: add it to `BridgeCalls`, `CALLS` and `GurukulDesktop`, then give it a handler (an
 * `*Calls.ts` file). Adding an event: `BridgeEvents`, `EVENTS` and `GurukulDesktop`. The type checks
 * at the end of this file fail until all agree.
 */

/** Raised only when a change breaks a site written for an older shell. */
export const BRIDGE_VERSION = 1;

/**
 * The messages a refused call rejects with. Electron prefixes them ("Error invoking remote method
 * 'gurukul:agent.start': Error: Not allowed"), so the web app matches the end of the message.
 */
export const BRIDGE_ERRORS = {
  /** The sender is not the top frame of an allowed origin. */
  refused: 'Not allowed',
  /** The arguments did not pass the call's schema. */
  invalid: 'Invalid arguments',
  /** The call is in the contract but this shell does not do it yet. */
  notAvailable: 'Not available in this version',
} as const;
export type BridgeErrors = typeof BRIDGE_ERRORS;

// ---- info ----

/** What `info()` answers: enough for the site to say "Update the app" to an old shell. */
export interface DesktopInfo {
  bridgeVersion: number;
  /** The shell's version: `0.0.0` in development, stamped from the `desktop-v*` tag in a release. */
  appVersion: string;
  /** Node's `process.platform`: `darwin`, `win32`, `linux`. */
  platform: string;
}

// ---- store ----

/** One session of one signed-in person: `sessions/{uid}/{sessionId}/` under the app's data folder. */
export interface SessionRef {
  uid: string;
  sessionId: string;
}

/** One file of one session: `sessions/{uid}/{sessionId}/{path}` under the app's data folder. */
export interface SessionFileRef extends SessionRef {
  /**
   * Relative, `/`-separated, at most `MAX_PATH_SEGMENTS` deep: `session.json`, `checkpoints/t4.json`.
   * `store.write` and `store.remove` refuse a path under one of `AGENT_SESSION_NAMES`, in any case.
   */
  path: string;
}

/**
 * The names in a session folder that only the shell writes: what `agent.start` hands Claude Code
 * (`prompt.md`, the `skills` plugin folder, `mcp.json`) and the empty working folder used when no
 * Sources folder was chosen. The window can read them but never write or remove one: a plugin
 * folder can carry hooks and `mcp.json` can name a program, so a page that could write them could
 * make Claude Code run a command. Removing the whole session still removes them.
 */
export const AGENT_SESSION_NAMES = ['prompt.md', 'skills', 'mcp.json', 'workdir'] as const;

/** `{ uid }` lists that person's session ids; `{ uid, sessionId }` lists the session's files. */
export interface SessionListRef {
  uid: string;
  sessionId?: string | undefined;
}

/** `{ uid, sessionId, path }` removes one file; without `path`, the whole session folder. */
export interface SessionRemoveRef extends SessionRef {
  path?: string | undefined;
}

// ---- agent ----

/** Whether Claude Code can run a session on this computer. Asked before a session starts. */
export type AgentStatus =
  /** Installed, new enough, and `claude auth status` reports a sign-in. */
  | { state: 'ready'; version: string }
  /** No `claude` program found. */
  | { state: 'not_installed' }
  /** Older than the version the launch flags were checked on. */
  | { state: 'too_old'; version: string; minimumVersion: string }
  /** Installed but signed out: "Open a terminal, run `claude` and sign in, then try again". */
  | { state: 'not_signed_in'; version: string };

/** One file of a skill, inside the skill's folder: `SKILL.md`, `references/words.md`. */
export interface AgentSkillFile {
  /** Safe relative path (`isSafePath`), at most `MAX_SKILL_PATH_SEGMENTS` deep. */
  path: string;
  text: string;
}

/** A skill the web app ships (`DSK-17`). The agent sees it as `gurukul:{name}`. */
export interface AgentSkill {
  /** A safe name (`isSafeSegment`): `humanize`. */
  name: string;
  /** `SKILL.md` and anything it refers to. The shell writes the plugin folder around them. */
  files: AgentSkillFile[];
}

/** One tool the agent may call, as the MCP server lists it (`toolList()` in the web app). */
export interface AgentTool {
  /** `snake_case`: `add_block`. The agent sees it as `mcp__gurukul__add_block`. */
  name: string;
  description: string;
  /** JSON Schema of the input, without `$schema`. */
  inputSchema: Record<string, unknown>;
}

/** What `agent.start` needs. Everything the agent knows comes from the web app (decision 4). */
export interface AgentStartRequest extends SessionRef {
  /** Written to the session's `prompt.md` and passed with `--append-system-prompt-file`. */
  systemPrompt: string;
  skills: AgentSkill[];
  tools: AgentTool[];
  /**
   * The Claude session id from an earlier start (`--resume`), or null for the first start (the
   * shell then makes one, `--session-id`). The working folder is the session's Sources folder when
   * one was chosen (`sources.choose`); the web app never passes a path.
   */
  resumeId: string | null;
}

/** Why the agent cannot run, or stopped running. */
export type AgentError =
  | { code: 'not_installed' }
  | { code: 'too_old'; version: string; minimumVersion: string }
  | { code: 'not_signed_in' }
  /** The Educator's Claude plan is used up for now. `resetsAt` is ISO-8601 when Claude Code says. */
  | { code: 'plan_limit'; resetsAt: string | null }
  /** The `claude` process ended on its own. `exitCode` is null when a signal ended it. */
  | { code: 'crashed'; exitCode: number | null };

export type AgentErrorCode = AgentError['code'];

/** `agent.start`'s answer. A failure that can be foreseen is a result, not a rejection. */
export type AgentStartResult =
  /** Started, or already running for this session. */
  { ok: true; agentSessionId: string } | { ok: false; error: AgentError };

/** How a turn ended. */
export type TurnOutcome = 'done' | 'stopped' | 'failed';

/**
 * What the agent is doing, streamed to the window with `agent.onEvent`. Every event names the
 * Gurukul session it belongs to. None carries a credential; text and activity are shown, never
 * logged.
 */
export type AgentEvent =
  /** A piece of the agent's reply, to append to the message being written. */
  | { type: 'text'; sessionId: string; text: string }
  /** What it is doing, in plain words for the chat: "Loading the humanize skill". */
  | { type: 'activity'; sessionId: string; text: string }
  /**
   * The agent called one of the course tools: for the chat's activity line only. The call to run,
   * with its input, arrives through `agent.onToolCall`; this event carries no input.
   */
  | { type: 'tool_call'; sessionId: string; callId: string; name: string }
  /** The turn is over. `agentSessionId` is the id to keep for `resumeId` and `agent.forget`. */
  | { type: 'turn_end'; sessionId: string; agentSessionId: string; outcome: TurnOutcome }
  /** The agent cannot go on. A turn in progress also ends (`turn_end`, `failed`) when it can. */
  | { type: 'error'; sessionId: string; error: AgentError };

export type AgentEventType = AgentEvent['type'];

/** A tool call to run in the window. Answer it once with `agent.toolResult`. */
export interface AgentToolCall {
  sessionId: string;
  /** The shell's id for this call: give it back with the result. */
  callId: string;
  /** The tool's own name, without `mcp__gurukul__`: `add_block`. */
  name: string;
  /** As the model sent it: unchecked JSON. `runTool` parses it with the tool's schema. */
  input: unknown;
}

/** The answer to a tool call: the text for the model, or one sentence saying why not. */
export type AgentToolResult = { text: string } | { error: string };

// ---- sources ----

/** A file in a session's Sources folder: a plain name, never a path. */
export interface SourceFile {
  name: string;
  bytes: number;
}

/** A session's Sources folder as the window sees it. */
export interface SourcesFolder {
  /** For display only, with the home folder as `~`: `~/Documents/Gurukul Studio/git-basics/sources`. */
  path: string;
  /** The plain files directly in it, sorted by name. Empty when the folder has gone. */
  files: SourceFile[];
}

/** `sources.choose`: whose folder, and the name to suggest for a new one. */
export interface SourcesChoice extends SessionRef {
  /**
   * A safe name (`isSafeSegment`), usually the course slug: the dialog starts in
   * `Documents/Gurukul Studio/{suggestedName}/sources`, created if missing.
   */
  suggestedName?: string | undefined;
}

// ---- auth ----

/**
 * `auth.googleSignIn`: an ID token for `signInWithCredential`, or why there is none. A second call
 * while one is waiting replaces it: the first answers `cancelled`.
 */
export type GoogleSignInResult =
  { ok: true; idToken: string } | { ok: false; reason: GoogleSignInFailure };

/**
 * `cancelled`: the person refused in the browser, or signed in again from the app; `timeout`: no
 * answer from the browser in time; `not_configured`: this build has no Google client id (a
 * development build without `GURUKUL_DESKTOP_GOOGLE_CLIENT_ID`); `failed`: anything else.
 */
export type GoogleSignInFailure = 'cancelled' | 'timeout' | 'not_configured' | 'failed';

// ---- app ----

/** `app.checkForUpdate`: what the menu item and the "Update the app" card say. */
export type UpdateCheck =
  | { state: 'up_to_date' }
  /** A check was already running. */
  | { state: 'checking' }
  | { state: 'downloading'; version: string }
  /** Downloaded: the sidebar's "Update ready" item installs it. */
  | { state: 'ready'; version: string }
  /** Development builds and Linux never update. */
  | { state: 'unsupported' }
  | { state: 'failed' };

/** `app.onUpdateReady`: a new shell has been downloaded. */
export interface UpdateReady {
  version: string;
}

// ---- calls ----

/**
 * Every call the window can make, by name, as the main process answers it. The window gets each one
 * as a function returning a promise of the same (`BridgeFn`).
 */
export interface BridgeCalls {
  info(): DesktopInfo;
  'store.read'(file: SessionFileRef): string | null;
  'store.write'(file: SessionFileRef, data: string): void;
  'store.list'(ref: SessionListRef): string[];
  'store.remove'(ref: SessionRemoveRef): void;
  'agent.status'(): AgentStatus;
  'agent.start'(request: AgentStartRequest): AgentStartResult;
  'agent.send'(sessionId: string, message: string): void;
  'agent.stop'(sessionId: string): void;
  'agent.close'(sessionId: string): void;
  'agent.forget'(agentSessionId: string): void;
  'agent.toolResult'(sessionId: string, callId: string, result: AgentToolResult): void;
  'sources.choose'(choice: SourcesChoice): SourcesFolder | null;
  'sources.list'(ref: SessionRef): SourcesFolder | null;
  'sources.reveal'(ref: SessionRef): void;
  'sources.read'(ref: SessionRef, name: string): string | null;
  'auth.googleSignIn'(): GoogleSignInResult;
  'app.checkForUpdate'(): UpdateCheck;
  'app.installUpdate'(): void;
}

export type CallName = keyof BridgeCalls;
export type CallArgs<N extends CallName> = Parameters<BridgeCalls[N]>;
export type CallResult<N extends CallName> = ReturnType<BridgeCalls[N]>;

/** The calls in a fixed order: the preload builds the object from it, the shell registers it. */
export const CALLS = [
  'info',
  'store.read',
  'store.write',
  'store.list',
  'store.remove',
  'agent.status',
  'agent.start',
  'agent.send',
  'agent.stop',
  'agent.close',
  'agent.forget',
  'agent.toolResult',
  'sources.choose',
  'sources.list',
  'sources.reveal',
  'sources.read',
  'auth.googleSignIn',
  'app.checkForUpdate',
  'app.installUpdate',
] as const;

/** The IPC channel of a call. Namespaced so nothing else in Electron can collide with it. */
export function channel(name: CallName): string {
  return `gurukul:${name}`;
}

/** A call as the window sees it: always asynchronous, because it crosses to the main process. */
export type BridgeFn<N extends CallName> = (...args: CallArgs<N>) => Promise<CallResult<N>>;

// ---- events ----

/** Every event the main process sends the window, by the name of its subscribe function. */
export interface BridgeEvents {
  'agent.onEvent': AgentEvent;
  'agent.onToolCall': AgentToolCall;
  'app.onUpdateReady': UpdateReady;
}

export type EventName = keyof BridgeEvents;

/** The events in a fixed order: the preload builds the subscribe functions from it. */
export const EVENTS = ['agent.onEvent', 'agent.onToolCall', 'app.onUpdateReady'] as const;

/** The IPC channel of an event. Cannot collide with a call's: no call name contains a `:`. */
export function eventChannel(name: EventName): string {
  return `gurukul-event:${name}`;
}

/** Stops a subscription. Calling it again does nothing. */
export type Unsubscribe = () => void;

/** A subscription as the window sees it: a handler in, a function to stop it out. */
export type Subscribe<E extends EventName> = (
  handler: (payload: BridgeEvents[E]) => void,
) => Unsubscribe;

// ---- the object ----

/** `window.gurukulDesktop`. Present only inside the desktop app, in the top frame of Gurukul. */
export interface GurukulDesktop {
  info: BridgeFn<'info'>;
  store: {
    /** The file's text, or `null` when it does not exist. */
    read: BridgeFn<'store.read'>;
    /** Replaces the file in one step (a temporary file, then a rename), creating folders. */
    write: BridgeFn<'store.write'>;
    /** Sorted names; an empty list when the person or session has no folder yet. */
    list: BridgeFn<'store.list'>;
    /** Removing what is not there is not an error. */
    remove: BridgeFn<'store.remove'>;
  };
  agent: {
    /** Is Claude Code installed, which version, is it new enough, is the Educator signed in. */
    status: BridgeFn<'agent.status'>;
    /** Starts one long-lived `claude` for the session; a second start while it runs is a no-op. */
    start: BridgeFn<'agent.start'>;
    /** A message from the Educator. Resolves once handed to `claude`, not when the turn ends. */
    send: BridgeFn<'agent.send'>;
    /** Stops the current turn (an `interrupt` request); the process stays for the next message. */
    stop: BridgeFn<'agent.stop'>;
    /** Ends the session's process (closes its input; a signal after a grace period). */
    close: BridgeFn<'agent.close'>;
    /**
     * Deletes Claude Code's own copy of a chat (`{config}/projects/*\/{id}.jsonl`), for the 30-day
     * clean-up. Removing what is not there is not an error.
     */
    forget: BridgeFn<'agent.forget'>;
    /** Answers one `onToolCall`. An unanswered call times out in the shell. */
    toolResult: BridgeFn<'agent.toolResult'>;
    onEvent: Subscribe<'agent.onEvent'>;
    onToolCall: Subscribe<'agent.onToolCall'>;
  };
  sources: {
    /** Opens the system folder picker. Null when the Educator cancels. */
    choose: BridgeFn<'sources.choose'>;
    /** The session's chosen folder and its files, or null when none was chosen. */
    list: BridgeFn<'sources.list'>;
    /** Shows the folder in Finder or Explorer. */
    reveal: BridgeFn<'sources.reveal'>;
    /**
     * The text of one listed file, by its plain name (`isPlainFileName`); null when there is no such
     * file. Never resolves a name outside the folder.
     */
    read: BridgeFn<'sources.read'>;
  };
  auth: {
    /** Google sign-in in the system browser (OAuth with PKCE, loopback redirect). */
    googleSignIn: BridgeFn<'auth.googleSignIn'>;
  };
  app: {
    checkForUpdate: BridgeFn<'app.checkForUpdate'>;
    onUpdateReady: Subscribe<'app.onUpdateReady'>;
    /** Restarts into the downloaded shell. Resolves only if the install did not happen. */
    installUpdate: BridgeFn<'app.installUpdate'>;
  };
}

// ---- limits and names ----

/** Longest name of one folder or file; also the longest `uid` or `sessionId`. */
export const MAX_SEGMENT_LENGTH = 128;
/** Deepest `path` inside a session: `skills/humanize/references/words.md`. */
export const MAX_PATH_SEGMENTS = 4;
/** Largest file `store.write` accepts, in bytes of UTF-8. A course is at most 900 KB. */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
/** Deepest path inside one skill: the session keeps it under `skills/{name}/`. */
export const MAX_SKILL_PATH_SEGMENTS = MAX_PATH_SEGMENTS - 2;
/** Longest system prompt, skill file or tool description, in characters. */
export const MAX_AGENT_TEXT_LENGTH = 256 * 1024;
/** Longest message from the Educator, in characters. */
export const MAX_MESSAGE_LENGTH = 64 * 1024;
/** Longest tool result, in characters: a whole course read back fits with room to spare. */
export const MAX_TOOL_RESULT_LENGTH = 4 * 1024 * 1024;
/** Most skills, files per skill and tools in one `agent.start`. */
export const MAX_SKILLS = 32;
export const MAX_SKILL_FILES = 32;
export const MAX_TOOLS = 128;
/** Longest name of a file in a Sources folder (most systems allow 255). */
export const MAX_SOURCE_NAME_LENGTH = 255;

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
/** Names Windows reserves for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * True for a name that can only ever be one plain folder or file name on every system: letters,
 * digits, `.`, `_` and `-`; not starting with a dot (so never `.` or `..`); not ending with one
 * (Windows drops it); not a Windows device name. No separator or drive letter can get through, so
 * a path built from these names cannot leave the session folder.
 */
export function isSafeSegment(name: string): boolean {
  return (
    name.length <= MAX_SEGMENT_LENGTH &&
    SEGMENT.test(name) &&
    !name.endsWith('.') &&
    !RESERVED.test(name)
  );
}

/** True for a `/`-separated relative path of 1 to `MAX_PATH_SEGMENTS` safe names. */
export function isSafePath(path: string): boolean {
  const parts = path.split('/');
  return parts.length <= MAX_PATH_SEGMENTS && parts.every(isSafeSegment);
}

/**
 * True for a name `sources.read` may be asked for: one file name as the Educator wrote it (spaces
 * and other letters allowed), never a path. No `/`, `\` or NUL, not `.` or `..`, not empty. The
 * shell still reads only a name its own listing of the folder gives.
 */
export function isPlainFileName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_SOURCE_NAME_LENGTH &&
    name !== '.' &&
    name !== '..' &&
    !/[/\\\0]/.test(name)
  );
}

// ---- Compile-time checks: `BridgeCalls`, `BridgeEvents`, the lists and `GurukulDesktop` agree ----

type Assert<T extends true> = T;
type At<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? At<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** Fails to compile when a call in `BridgeCalls` is missing from `CALLS`. */
export type EveryCallListed = Assert<
  [Exclude<CallName, (typeof CALLS)[number]>] extends [never] ? true : false
>;
/** Fails to compile when `GurukulDesktop` lacks a call, or types one differently. */
export type EveryCallExposed = Assert<
  { [N in CallName]: [At<GurukulDesktop, N>] extends [BridgeFn<N>] ? true : false }[CallName]
>;
/** Fails to compile when an event in `BridgeEvents` is missing from `EVENTS`. */
export type EveryEventListed = Assert<
  [Exclude<EventName, (typeof EVENTS)[number]>] extends [never] ? true : false
>;
/** Fails to compile when `GurukulDesktop` lacks a subscription, or types one differently. */
export type EveryEventExposed = Assert<
  { [E in EventName]: [At<GurukulDesktop, E>] extends [Subscribe<E>] ? true : false }[EventName]
>;
