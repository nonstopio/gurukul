import { useEffect, useState } from 'react';
import type {
  AGENT_SESSION_NAMES as SHELL_AGENT_SESSION_NAMES,
  BridgeErrors,
  DesktopInfo,
  GurukulDesktop,
  MAX_ASKS_RUNNING as SHELL_MAX_ASKS_RUNNING,
} from '@gurukul/desktop/bridge';
import { log } from '../log';

/*
 * The one reader of `window.gurukulDesktop`, the bridge the Gurukul Studio desktop app puts in the
 * page (`.plan/22-desktop-studio.md`, "The bridge"). Everything else in the web app goes through
 * here: ESLint refuses the name anywhere else in `src/`, the way `analytics/` keeps
 * `firebase/analytics` to one file. In a browser there is no bridge and `desktopBridge()` is null,
 * so session code is never loaded there.
 *
 * The contract's types come from the shell with `import type` only (`@gurukul/desktop/bridge`), so
 * no code of the desktop package reaches this bundle; the few constants the web app needs are
 * repeated here and held to the shell's by their types.
 */

export type * from '@gurukul/desktop/bridge';

/**
 * The bridge version this web app is written for. A shell that reports less gets "Update the app".
 * Raise it with the shell's `BRIDGE_VERSION`, only when this site starts using what an older shell
 * does not have. 2: `sources.ensure` (the fixed default Sources folder) replaced `sources.choose`;
 * every page that needs a session shows "Update the app" on a shell that has only `choose`.
 */
export const REQUIRED_BRIDGE_VERSION = 2;

/** The shell's refusal messages; the type makes them equal to the shell's own. */
const ERRORS: BridgeErrors = {
  refused: 'Not allowed',
  invalid: 'Invalid arguments',
  notAvailable: 'Not available in this version',
};

/**
 * The session files only the shell writes (what `agent.start` hands Claude Code): `store.write` and
 * `store.remove` refuse a path under one of them, in any case. They go only with the whole session
 * folder. The type makes the list equal to the shell's own.
 */
export const AGENT_SESSION_NAMES: typeof SHELL_AGENT_SESSION_NAMES = [
  'prompt.md',
  'skills',
  'mcp.json',
  'workdir',
];

/** True for a session file path the window may read but never write or remove. */
export function isAgentSessionFile(path: string): boolean {
  const first = (path.split('/')[0] as string).toLowerCase();
  return (AGENT_SESSION_NAMES as readonly string[]).includes(first);
}

/** The shell's `MAX_ASKS_RUNNING`: most `agent.ask` calls at once. The type makes it equal. */
export const MAX_ASKS_RUNNING: typeof SHELL_MAX_ASKS_RUNNING = 2;

/**
 * True when this shell answers `agent.ask` (`DSK-18`). The call came after the first shells
 * shipped and breaks nothing an older site does, so it did not raise `BRIDGE_VERSION`: a shell without it
 * simply has no such function, and the answer check asks for the update instead.
 */
export function canAsk(desktop: GurukulDesktop): boolean {
  return typeof (desktop.agent as { ask?: unknown }).ask === 'function';
}

/** Where the page stands with the desktop app. */
export type DesktopState =
  /** A normal browser: no bridge. Session pages show the "not the desktop app" card. */
  | { status: 'browser' }
  /** Inside the app, asking it for its version (`useDesktop` only, for a moment). */
  | { status: 'checking' }
  /**
   * Inside an app whose bridge is older than this site needs: "Update the app". `desktop` is there
   * for `app.checkForUpdate` and `app.installUpdate` only, which every shell since version 1 has.
   */
  | { status: 'needs_update'; info: DesktopInfo; desktop: GurukulDesktop }
  | { status: 'ready'; info: DesktopInfo; desktop: GurukulDesktop }
  /** Inside the app, but it did not answer `info()`. */
  | { status: 'failed' };

/** The bridge, or null in a browser (or when something else sits at that name). */
export function desktopBridge(): GurukulDesktop | null {
  const candidate: unknown = (window as { gurukulDesktop?: unknown }).gurukulDesktop;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return typeof (candidate as { info?: unknown }).info === 'function'
    ? (candidate as GurukulDesktop)
    : null;
}

/** True inside the desktop app. Synchronous: decides whether session code is loaded at all. */
export function isDesktop(): boolean {
  return desktopBridge() !== null;
}

/** True when a shell reporting `info` can serve this site. */
export function isSupported(info: DesktopInfo): boolean {
  return info.bridgeVersion >= REQUIRED_BRIDGE_VERSION;
}

/** Asks the app for its version and says whether this site can use it. */
export async function connectDesktop(
  desktop: GurukulDesktop | null = desktopBridge(),
): Promise<DesktopState> {
  if (desktop === null) return { status: 'browser' };
  try {
    const info = await desktop.info();
    if (!isSupported(info)) {
      log.warn('Desktop app needs update', {
        bridgeVersion: info.bridgeVersion,
        required: REQUIRED_BRIDGE_VERSION,
      });
      return { status: 'needs_update', info, desktop };
    }
    return { status: 'ready', info, desktop };
  } catch (error) {
    log.error('Desktop app did not answer', error);
    return { status: 'failed' };
  }
}

/** `connectDesktop` for a component: `browser` at once outside the app, else `checking` first. */
export function useDesktop(): DesktopState {
  const [state, setState] = useState<DesktopState>(() =>
    isDesktop() ? { status: 'checking' } : { status: 'browser' },
  );
  useEffect(() => {
    if (state.status !== 'checking') return;
    let live = true;
    void connectDesktop().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [state.status]);
  return state;
}

/** What kind of failure a rejected bridge call was. */
export type BridgeFailure = 'refused' | 'invalid' | 'not_available' | 'failed';

/**
 * Reads a rejected bridge call. Electron puts its own words before the shell's message ("Error
 * invoking remote method 'gurukul:agent.start': Error: Not available in this version"), so the end
 * of the message decides. `not_available` means this app is too old for the call: offer the update.
 */
export function bridgeFailure(error: unknown): BridgeFailure {
  const message = error instanceof Error ? error.message : '';
  if (message.endsWith(ERRORS.notAvailable)) return 'not_available';
  if (message.endsWith(ERRORS.refused)) return 'refused';
  if (message.endsWith(ERRORS.invalid)) return 'invalid';
  return 'failed';
}
