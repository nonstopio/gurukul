import path from 'node:path';
import { createAgentManager } from './agent/manager';
import type { AgentPlatform } from './agent/platform';
import { BRIDGE_VERSION } from './bridge';
import { TEST_URL_VARIABLE, allowedOrigins, startUrl, testUrl } from './config';
import { createEventSender, type EventSender } from './events';
import type { GoogleClient } from './googleClient';
import { createGoogleSignIn, type FetchLike } from './googleSignIn';
import { createHandlers } from './handlers';
import { registerHandlers, type IpcLike } from './ipc';
import type { Logger } from './log';
import { menuTemplate, type MenuItem } from './menu';
import { allowPermission, guardContents, type ContentsLike, type ShellLike } from './navigation';
import { createSources, type FolderDialogLike, type FolderOpenerLike } from './sources';
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
  getPath(name: 'userData' | 'documents' | 'home'): string;
  requestSingleInstanceLock(): boolean;
  quit(): void;
  whenReady(): Promise<unknown>;
  on(
    event: 'second-instance' | 'activate' | 'window-all-closed' | 'will-quit',
    listener: () => void,
  ): unknown;
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
  /** Electron's `shell`: links to the system browser, a Sources folder to Finder or Explorer. */
  shell: ShellLike & FolderOpenerLike;
  /** Electron's `dialog`: the folder picker for `sources.choose`. */
  dialog: FolderDialogLike;
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
  /** For Google's token endpoint: Electron's `net.fetch`, which follows the system's proxy. */
  fetch: FetchLike;
  /** The Google Desktop OAuth client this build was given (`googleClient.ts`), or null. */
  googleClient: GoogleClient | null;
  /** What the agent bridge starts Claude Code with (`agent/node.ts` in the app). */
  agent: AgentPlatform;
  /**
   * `GURUKUL_DESKTOP_TEST_URL` as the environment has it: the end-to-end tests' app (`DSK-24`).
   * Only a development build opens it (`testUrl` in `config.ts`); a packaged one ignores it.
   */
  testUrl: string | undefined;
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
  const test = testUrl(dev, deps.testUrl);
  if (deps.testUrl !== undefined && test === null) {
    // Never the value: it is not ours to log, and a packaged build must not act on it at all.
    log.warn('Test page ignored', { variable: TEST_URL_VARIABLE, dev });
  }
  const origins = allowedOrigins(dev, test);
  let current: WindowLike | null = null;
  // Set once the agent bridge exists: what a window's page going away ends (`agent.cancelAsks`).
  let pageGone: () => void = () => undefined;

  const open = () => {
    const win = openWindow(
      (options) => deps.createWindow(options),
      windowOptions(deps.preloadPath, origins),
      startUrl(dev, test),
      deps.timers,
      log,
    );
    win.on('closed', () => {
      if (current === win) current = null;
      pageGone();
    });
    // A reload (or any new page) leaves the old page's one-shot asks unheard: end them, so they
    // do not hold the shell's places from the new page's (`DSK-18`).
    win.webContents.on('did-navigate', () => pageGone());
    // The Educator chose Update ready and the web found nothing unsaved; a page that still asks to
    // stay would leave the restart hanging (Electron cancels the quit without a word) and, on
    // Windows, the installer already running beside the open app. Studio's draft keeps a copy on
    // this device on the way out either way.
    win.webContents.on('will-prevent-unload', (event) => {
      if (!updates.isInstalling()) return;
      log.info('Page left for an update', {});
      event.preventDefault();
    });
    current = win;
  };

  app.on('web-contents-created', (_event, contents) =>
    guardContents(contents, origins, deps.shell, log),
  );
  const show = () => {
    if (current === null) return;
    if (current.isMinimized()) current.restore();
    current.focus();
  };
  app.on('second-instance', show);
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

  const sessionsRoot = path.join(app.getPath('userData'), 'sessions');
  const store = createSessionStore(sessionsRoot);
  const sources = createSources({
    dataDir: app.getPath('userData'),
    sessionsRoot,
    documentsDir: app.getPath('documents'),
    homeDir: app.getPath('home'),
    dialog: deps.dialog,
    opener: deps.shell,
    log,
  });
  // A start dialog closed after choosing leaves a choice with no session: forget it now.
  await sources.prune();
  const agent = createAgentManager({
    platform: deps.agent,
    sessionsRoot,
    events,
    // The session's Sources folder is `claude`'s working directory; without one, an empty folder.
    sourcesFolder: sources.folderOf,
    log,
  });
  // Quitting ends every session's `claude` rather than leaving it to finish a turn unheard.
  app.on('will-quit', () => agent.closeAll());
  pageGone = () => agent.cancelAsks();
  registerHandlers(
    deps.ipc,
    createHandlers({
      appVersion: app.getVersion(),
      platform: deps.platform,
      store,
      agent,
      sources,
      updates,
      // After the browser, the window comes back to the front.
      googleSignIn: createGoogleSignIn({
        client: deps.googleClient,
        openExternal: (url) => deps.shell.openExternal(url),
        fetch: deps.fetch,
        log,
        onSettled: show,
      }),
    }),
    origins,
    log,
  );

  open();
  updates.start();
  log.info('Desktop shell started', { dev, test: test !== null, bridgeVersion: BRIDGE_VERSION });
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
