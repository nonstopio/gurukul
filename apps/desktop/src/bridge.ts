/**
 * The contract between the desktop shell and the web app: `window.gurukulDesktop`, version 1.
 *
 * Shared by both sides, so it imports nothing: no Electron, no Node, no zod. The web app imports
 * it as `@gurukul/desktop/bridge` (types and these few constants only) and the shell builds its IPC
 * handlers (`ipc.ts`) and its preload (`preloadApi.ts`) from it. Plan: `.plan/22-desktop-studio.md`,
 * "The bridge".
 *
 * Adding a call (`agent.start`, `auth.googleSignIn`, `sources.choose`, `app.checkForUpdate`, …):
 * add it to `BridgeCalls`, `CALLS` and `GurukulDesktop`, then give it a handler in `handlers.ts`.
 * The type checks below fail until all four agree.
 */

/** Raised only when a change breaks a site written for an older shell. */
export const BRIDGE_VERSION = 1;

/** What `info()` answers: enough for the site to say "Update the app" to an old shell. */
export interface DesktopInfo {
  bridgeVersion: number;
  /** The shell's version: `0.0.0` in development, stamped from the `desktop-v*` tag in a release. */
  appVersion: string;
  /** Node's `process.platform`: `darwin`, `win32`, `linux`. */
  platform: string;
}

/** One file of one session: `sessions/{uid}/{sessionId}/{path}` under the app's data folder. */
export interface SessionFileRef {
  uid: string;
  sessionId: string;
  /** Relative, `/`-separated, at most `MAX_PATH_SEGMENTS` deep: `session.json`, `checkpoints/t4.json`. */
  path: string;
}

/** `{ uid }` lists that person's session ids; `{ uid, sessionId }` lists the session's files. */
export interface SessionListRef {
  uid: string;
  sessionId?: string | undefined;
}

/** `{ uid, sessionId, path }` removes one file; without `path`, the whole session folder. */
export interface SessionRemoveRef {
  uid: string;
  sessionId: string;
  path?: string | undefined;
}

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
}

export type CallArgs<N extends CallName> = Parameters<BridgeCalls[N]>;
export type CallResult<N extends CallName> = ReturnType<BridgeCalls[N]>;

export type CallName = keyof BridgeCalls;

/** The calls in a fixed order: the preload builds the object from it, the shell registers it. */
export const CALLS = ['info', 'store.read', 'store.write', 'store.list', 'store.remove'] as const;

/** The IPC channel of a call. Namespaced so nothing else in Electron can collide with it. */
export function channel(name: CallName): string {
  return `gurukul:${name}`;
}

/** A call as the window sees it: always asynchronous, because it crosses to the main process. */
export type BridgeFn<N extends CallName> = (...args: CallArgs<N>) => Promise<CallResult<N>>;

/** `window.gurukulDesktop`. Present only inside the desktop app, on the Gurukul origin. */
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
}

/** Longest name of one folder or file; also the longest `uid` or `sessionId`. */
export const MAX_SEGMENT_LENGTH = 128;
/** Deepest `path` inside a session: `skills/humanize/references/words.md`. */
export const MAX_PATH_SEGMENTS = 4;
/** Largest file `store.write` accepts, in bytes of UTF-8. A course is at most 900 KB. */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;

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

// ---- Compile-time checks: `BridgeCalls`, `CALLS` and `GurukulDesktop` describe the same calls ----

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
