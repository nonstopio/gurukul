import type { UpdateCheck } from './bridge';
import type { EventSender } from './events';
import type { Logger } from './log';

/**
 * Self-update, adapted from Morph's `electron/updates.ts` (`.plan/22-desktop-studio.md`, Updates).
 *
 * Installed macOS and Windows builds check GitHub Releases at launch and every six hours and
 * download a new shell in the background. Nothing here opens a dialog on its own: a finished
 * download is told to the window (`app.onUpdateReady`), whose sidebar shows "Update ready", and a
 * normal Quit installs it too. Only the menu's "Check for updates…" answers in a dialog, because the
 * Educator asked.
 *
 * The restart must not hang on a page that asks before it is left (Studio's unsaved draft, the
 * console's unsaved form): the web asks its own page first and installs only when nothing would be
 * lost, the shell lets the page go while an install runs (`isInstalling`, read by `app.ts` on
 * `will-prevent-unload`), and an install that has not quit the app after `INSTALL_WAIT_MS` counts
 * as failed.
 *
 * Over adapters (`electron-updater`'s `autoUpdater`, a message box, timers), so it runs in Vitest.
 */

/** How often a running app looks for a new shell. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * How long an install may take to quit the app before it counts as failed. Long enough for
 * Squirrel.Mac to finish taking the download from electron-updater, which it does before it quits.
 */
export const INSTALL_WAIT_MS = 30 * 1000;

/** The parts of `electron-updater`'s `autoUpdater` used here. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  /** Its own logger; set to null (silent) because its lines hold URLs and paths. */
  logger: unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean;
    updateInfo: { version: string };
    downloadPromise?: Promise<unknown> | null;
  } | null>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

/** A message box the Educator asked for (Electron's `dialog.showMessageBox` options). */
export interface UpdateMessage {
  type: 'info' | 'warning';
  message: string;
  detail: string;
}

export interface UpdateDeps {
  updater: UpdaterLike;
  /** Packaged, and macOS or Windows: development builds and Linux never check. */
  supported: boolean;
  appVersion: string;
  events: EventSender;
  showMessage(message: UpdateMessage): Promise<unknown>;
  timers: {
    setInterval(callback: () => void, ms: number): unknown;
    setTimeout(callback: () => void, ms: number): unknown;
  };
  log: Logger;
}

export interface Updates {
  /** Starts the checks: one now, then every six hours. Once; nothing when unsupported. */
  start(): void;
  /** `app.checkForUpdate`: asks for a new shell unless one is downloading or downloaded. */
  check(): Promise<UpdateCheck>;
  /** The menu's "Check for updates…": `check`, then a message box saying what it found. */
  checkFromMenu(): Promise<void>;
  /**
   * `app.installUpdate`: restarts into the downloaded shell. Resolves only when that did not
   * happen (nothing downloaded, or the install failed or timed out and the app stays open).
   */
  install(): Promise<void>;
  /** An install is running: the window lets its page go instead of asking to stay. */
  isInstalling(): boolean;
}

/** The `code` of an updater error (`ERR_UPDATER_…`, `ENOTFOUND`); its message holds URLs. */
function errorCode(error: unknown): string | undefined {
  const code = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}

/** What the menu's message box says for each answer. Plain words, Gurukul's voice. */
export function menuMessage(result: UpdateCheck, appVersion: string): UpdateMessage {
  switch (result.state) {
    case 'up_to_date':
      return {
        type: 'info',
        message: 'Gurukul Studio is up to date.',
        detail: `You have version ${appVersion}, the newest.`,
      };
    case 'checking':
      return {
        type: 'info',
        message: 'Gurukul Studio is already checking for an update.',
        detail: 'If there is one, Update ready appears in the sidebar once it has downloaded.',
      };
    case 'downloading':
      return {
        type: 'info',
        message: `Gurukul Studio ${result.version} is downloading.`,
        detail: 'Update ready appears in the sidebar once it has downloaded.',
      };
    case 'ready':
      return {
        type: 'info',
        message: `Gurukul Studio ${result.version} is ready to install.`,
        detail:
          'Choose Update ready in the sidebar to restart now, or it installs when you quit Gurukul Studio.',
      };
    case 'unsupported':
      return {
        type: 'info',
        message: 'This copy of Gurukul Studio does not update itself.',
        detail: 'The installed app on macOS and Windows updates itself. Download it from GitHub.',
      };
    case 'failed':
      return {
        type: 'warning',
        message: 'Gurukul Studio could not check for updates.',
        detail: 'Check your internet connection and try again later.',
      };
  }
}

export function createUpdates(deps: UpdateDeps): Updates {
  const { updater, log } = deps;
  let started = false;
  /** A check, or the download it found, is running. */
  let checking = false;
  /** The version being downloaded, once a check found one. */
  let downloading: string | null = null;
  /** The version downloaded and waiting to install. */
  let ready: string | null = null;
  /** The running install: resolves if it is abandoned. */
  let installing: { promise: Promise<void>; resolve: () => void } | null = null;

  // The install never happened: the app stays open, the sidebar item goes (the window hears it from
  // `install` resolving) and the next check downloads it again.
  const abortInstall = () => {
    const current = installing as { resolve: () => void };
    installing = null;
    ready = null;
    current.resolve();
  };
  const failInstall = (error: unknown) => {
    log.error('Update install failed', error);
    abortInstall();
  };

  const check = async (): Promise<UpdateCheck> => {
    if (!deps.supported) return { state: 'unsupported' };
    if (ready !== null) return { state: 'ready', version: ready };
    if (checking) {
      return downloading === null
        ? { state: 'checking' }
        : { state: 'downloading', version: downloading };
    }
    checking = true;
    try {
      const result = await updater.checkForUpdates();
      if (result?.isUpdateAvailable && result.downloadPromise) {
        const version = result.updateInfo.version;
        downloading = version;
        log.info('Update downloading', { version });
        // A failed download also reaches the updater's `error` event, which logs it.
        void result.downloadPromise
          .catch(() => undefined)
          .finally(() => {
            checking = false;
            downloading = null;
          });
        return { state: 'downloading', version };
      }
      checking = false;
      return { state: 'up_to_date' };
    } catch (error) {
      checking = false;
      log.warn('Update check failed', { code: errorCode(error) });
      return { state: 'failed' };
    }
  };

  return {
    start() {
      if (started || !deps.supported) return;
      started = true;
      updater.autoDownload = true;
      // A downloaded update also installs on a normal Quit.
      updater.autoInstallOnAppQuit = true;
      updater.logger = null;
      updater.on('error', (error) => {
        if (installing !== null) failInstall(error);
        else log.warn('Updater error', { code: errorCode(error) });
      });
      updater.on('update-downloaded', (info) => {
        // No dialog: the sidebar's Update ready item installs on click.
        ready = info.version;
        log.info('Update ready', { version: info.version });
        deps.events.send('app.onUpdateReady', { version: info.version });
      });
      void check();
      deps.timers.setInterval(() => void check(), CHECK_EVERY_MS);
    },
    check,
    async checkFromMenu() {
      await deps.showMessage(menuMessage(await check(), deps.appVersion));
    },
    install() {
      if (installing !== null) return installing.promise;
      if (ready === null) return Promise.resolve();
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      const current = { promise, resolve };
      installing = current;
      log.info('Update installing', { version: ready });
      // Nothing says the quit was refused (a page that will not be left, an installer that never
      // quits the app): an install still running after the wait has failed.
      deps.timers.setTimeout(() => {
        if (installing !== current) return;
        log.warn('Update install timed out', { waitedMs: INSTALL_WAIT_MS });
        abortInstall();
      }, INSTALL_WAIT_MS);
      try {
        updater.quitAndInstall(false, true);
      } catch (error) {
        failInstall(error);
      }
      return promise;
    },
    isInstalling: () => installing !== null,
  };
}
