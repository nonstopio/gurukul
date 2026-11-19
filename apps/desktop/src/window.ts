import { originsArgument } from './config';
import type { EventFrameLike } from './events';
import type { Logger } from './log';

/**
 * The one window. Its web preferences are the security line the plan draws: the page runs with
 * context isolation and the sandbox on and Node off, and the only thing it gains is what the
 * preload exposes (`window.gurukulDesktop`).
 */

export interface WindowOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  title: string;
  backgroundColor: string;
  webPreferences: {
    preload: string;
    contextIsolation: true;
    sandbox: true;
    nodeIntegration: false;
    nodeIntegrationInSubFrames: false;
    nodeIntegrationInWorker: false;
    webviewTag: false;
    webSecurity: true;
    allowRunningInsecureContent: false;
    additionalArguments: string[];
  };
}

export function windowOptions(preload: string, origins: readonly string[]): WindowOptions {
  return {
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 480,
    title: 'Gurukul Studio',
    // Matches neither theme exactly; it only shows for the moment before the page paints.
    backgroundColor: '#808080',
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: [originsArgument(origins)],
    },
  };
}

/** Chromium's code for a load that was replaced by another one: not a failure. */
const ABORTED = -3;
/** How long to wait before trying the page again after it failed to load. */
export const RETRY_MS = 2000;

/** The parts of Electron's `BrowserWindow` the shell uses. */
export interface WindowLike {
  loadURL(url: string): Promise<void>;
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  on(event: 'closed', listener: () => void): unknown;
  webContents: {
    /** The top frame: where bridge events go (`events.ts`). */
    readonly mainFrame: EventFrameLike;
    on(
      event: 'did-fail-load',
      listener: (
        event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame: boolean,
      ) => void,
    ): unknown;
    /** The page asked to stay (`beforeunload`); `preventDefault` leaves it anyway. */
    on(
      event: 'will-prevent-unload',
      listener: (event: { preventDefault(): void }) => void,
    ): unknown;
  };
}

/**
 * Opens the window on `url`. When the page cannot load (no network, the dev server not started
 * yet) it tries again every `RETRY_MS` instead of leaving an empty window.
 */
export function openWindow(
  createWindow: (options: WindowOptions) => WindowLike,
  options: WindowOptions,
  url: string,
  timers: { setTimeout(callback: () => void, ms: number): unknown },
  log: Logger,
): WindowLike {
  const win = createWindow(options);
  const load = () => {
    // A retry can come due after the window closed (macOS keeps the app running with no window),
    // and a destroyed window's `loadURL` throws instead of rejecting.
    if (win.isDestroyed()) return;
    try {
      // A failed load also rejects this promise; `did-fail-load` below is what acts on it.
      win.loadURL(url).catch(() => undefined);
    } catch {
      // Nothing to load into: the next `did-fail-load`, if any, tries again.
    }
  };
  win.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === ABORTED) return;
    log.warn('Page failed to load', { code: errorCode, retryMs: RETRY_MS });
    timers.setTimeout(load, RETRY_MS);
  });
  load();
  return win;
}
