import path from 'node:path';
import { BRIDGE_VERSION } from './bridge';
import { allowedOrigins, startUrl } from './config';
import { createEventSender, type EventSender } from './events';
import { createHandlers } from './handlers';
import { registerHandlers, type IpcLike } from './ipc';
import type { Logger } from './log';
import { menuTemplate, type MenuItem } from './menu';
import { allowPermission, guardContents, type ContentsLike, type ShellLike } from './navigation';
import { createSessionStore } from './store';
import { createUpdates, type UpdateMessage, type UpdaterLike } from './updates';
import { openWindow, windowOptions, type WindowLike, type WindowOptions } from './window';

/**
 * The shell's start-up, over adapters for everything Electron provides, so it runs in Vitest.
 * `main.ts` is the only file that imports Electron and hands the real objects in.
 */

/** The parts of Electron's `app` the shell uses. */
export interface AppLike {
  readonly isPackaged: boolean;
  getVersion(): string;
  getPath(name: 'userData'): string;
  requestSingleInstanceLock(): boolean;
  quit(): void;
  whenReady(): Promise<unknown>;
  on(event: 'second-instance' | 'activate' | 'window-all-closed', listener: () => void): unknown;
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: ContentsLike) => void,
  ): unknown;
}

/** The parts of Electron's `session.defaultSession` the shell uses. */
export interface SessionLike {
  setPermissionRequestHandler(
    handler: (
      contents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: { requestingUrl: string },
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (contents: unknown, permission: string, requestingOrigin: string) => boolean,
  ): void;
}

export interface ShellDeps {
  app: AppLike;
  ipc: IpcLike;
  shell: ShellLike;
  /** Called after `whenReady`: Electron's sessions do not exist before it. */
  session(): SessionLike;
  createWindow(options: WindowOptions): WindowLike;
  windowCount(): number;
  /** The built preload script (`dist/preload.cjs`). */
  preloadPath: string;
  platform: string;
  timers: {
    setTimeout(callback: () => void, ms: number): unknown;
    /** Must not keep the process alive on its own (Node's `unref`). */
    setInterval(callback: () => void, ms: number): unknown;
  };
  /** `electron-updater`'s `autoUpdater`. */
  updater: UpdaterLike;
  /** A message box, for "Check for updates…" only. */
  showMessage(message: UpdateMessage): Promise<unknown>;
  /** `Menu.setApplicationMenu(Menu.buildFromTemplate(template))`. */
  setMenu(template: MenuItem[]): void;
  log: Logger;
}

/** What a started shell hands back: the way to send the window bridge events. */
export interface Shell {
  events: EventSender;
}

/** Starts the shell; null when another copy is already running and this one quits. */
export async function startApp(deps: ShellDeps): Promise<Shell | null> {
  const { app, log } = deps;
  // A second copy would write the same session files: hand over to the first one instead.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }

  const dev = !app.isPackaged;
  const origins = allowedOrigins(dev);
  let current: WindowLike | null = null;

  const open = () => {
    const win = openWindow(
      (options) => deps.createWindow(options),
      windowOptions(deps.preloadPath, origins),
      startUrl(dev),
      deps.timers,
      log,
    );
    win.on('closed', () => {
      if (current === win) current = null;
    });
    current = win;
  };

  app.on('web-contents-created', (_event, contents) =>
    guardContents(contents, origins, deps.shell, log),
  );
  app.on('second-instance', () => {
    if (current === null) return;
    if (current.isMinimized()) current.restore();
    current.focus();
  });
  // macOS keeps an app running with no window; the Dock icon opens a new one.
  app.on('window-all-closed', () => {
    if (deps.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (deps.windowCount() === 0) open();
  });

  await app.whenReady();

  const session = deps.session();
  session.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(allowPermission(permission, details.requestingUrl, origins)),
  );
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    allowPermission(permission, requestingOrigin, origins),
  );

  // Events go to the current window's top frame, looked up on every send.
  const events = createEventSender(
    () => (current === null || current.isDestroyed() ? null : current.webContents.mainFrame),
    origins,
    log,
  );

  // Installed macOS and Windows builds only: a development build never asks GitHub.
  const updates = createUpdates({
    updater: deps.updater,
    supported: app.isPackaged && (deps.platform === 'darwin' || deps.platform === 'win32'),
    appVersion: app.getVersion(),
    events,
    showMessage: (message) => deps.showMessage(message),
    timers: deps.timers,
    log,
  });
  deps.setMenu(menuTemplate(deps.platform, () => void updates.checkFromMenu()));

  const store = createSessionStore(path.join(app.getPath('userData'), 'sessions'));
  registerHandlers(
    deps.ipc,
    createHandlers({ appVersion: app.getVersion(), platform: deps.platform, store, updates }),
    origins,
    log,
  );

  open();
  updates.start();
  log.info('Desktop shell started', { dev, bridgeVersion: BRIDGE_VERSION });
  return { events };
}

/** `startApp`, quitting with one log line if start-up throws. */
export function main(deps: ShellDeps): Promise<Shell | null> {
  return startApp(deps).catch((error: unknown) => {
    deps.log.error('Desktop shell failed to start', error);
    deps.app.quit();
    return null;
  });
}
