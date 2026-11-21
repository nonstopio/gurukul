import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const windows: { opts: unknown }[] = [];
  return {
    listeners,
    windows,
    app: {
      isPackaged: true,
      getVersion: () => '0.1.0',
      getPath: () => '/tmp/gurukul-main-test',
      getAppPath: () => '/app',
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      whenReady: vi.fn(async () => undefined),
      on: (name: string, listener: (...args: unknown[]) => void) => listeners.set(name, listener),
    },
    handle: vi.fn(),
    openExternal: vi.fn<(url: string) => Promise<void>>(async () => undefined),
    netFetch: vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id_token: 'a.b.c' }),
    })),
    defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
    menu: { template: [] as { label?: string; click?: () => void; submenu?: unknown[] }[] },
    setApplicationMenu: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: 0 })),
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      logger: undefined as unknown,
      on: vi.fn(),
      checkForUpdates: vi.fn(async () => null),
      quitAndInstall: vi.fn(),
    },
  };
});

vi.mock('../src/agent/shellPath', () => ({
  withUserPath: async (_p: string, env: unknown) => env,
}));

vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }));

vi.mock('electron', () => {
  class BrowserWindow {
    static getAllWindows = () => mocks.windows;
    webContents = { on: vi.fn() };
    loadURL = vi.fn(async () => undefined);
    isDestroyed = () => false;
    isMinimized = () => false;
    restore = vi.fn();
    focus = vi.fn();
    on = vi.fn();
    constructor(public opts: unknown) {
      mocks.windows.push(this);
    }
  }
  return {
    app: mocks.app,
    BrowserWindow,
    ipcMain: { handle: mocks.handle },
    Menu: {
      buildFromTemplate: (template: typeof mocks.menu.template) => {
        mocks.menu.template = template;
        return template;
      },
      setApplicationMenu: mocks.setApplicationMenu,
    },
    dialog: { showMessageBox: mocks.showMessageBox },
    session: { defaultSession: mocks.defaultSession },
    shell: { openExternal: mocks.openExternal },
    net: { fetch: mocks.netFetch },
  };
});

describe('main', () => {
  it('starts the shell with Electron’s real objects', async () => {
    vi.useFakeTimers();
    // An installed Mac build, so the updater starts.
    const platform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await import('../src/main');
    Object.defineProperty(process, 'platform', platform);
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(1));
    const opts = mocks.windows[0]?.opts as { webPreferences: { preload: string } };
    expect(opts.webPreferences.preload).toBe('/app/dist/preload.cjs');
    expect(mocks.handle).toHaveBeenCalledWith('gurukul:info', expect.any(Function));
    expect(mocks.defaultSession.setPermissionRequestHandler).toHaveBeenCalled();

    // The updater checks at launch and on a six-hour timer; the menu's check answers in a dialog.
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(mocks.setApplicationMenu).toHaveBeenCalledWith(mocks.menu.template);
    const check = (
      mocks.menu.template[0]?.submenu as { label?: string; click?: () => void }[]
    ).find((item) => item.label === 'Check for updates…');
    check?.click?.();
    await vi.waitFor(() =>
      expect(mocks.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Gurukul Studio is up to date.' }),
      ),
    );
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(3);

    // The adapters main.ts builds: the Dock re-opens a window, and a failed load retries on a timer.
    mocks.windows.length = 0;
    mocks.listeners.get('activate')?.();
    expect(mocks.windows).toHaveLength(1);
    const win = mocks.windows[0] as unknown as {
      webContents: { on: ReturnType<typeof vi.fn> };
      loadURL: ReturnType<typeof vi.fn>;
    };
    const failLoad = win.webContents.on.mock.calls[0]?.[1] as (...a: unknown[]) => void;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    failLoad({}, -106, 'ERR_INTERNET_DISCONNECTED', '', true);
    vi.runOnlyPendingTimers();
    expect(win.loadURL).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('signs in to Google with the build’s client, through Electron’s shell and net', async () => {
    // Unbundled, main.ts reads the variables the bundle would have written in as literals.
    vi.stubEnv('GURUKUL_DESKTOP_GOOGLE_CLIENT_ID', 'desktop-client');
    vi.stubEnv('GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET', '');
    vi.resetModules();
    mocks.handle.mockClear();
    await import('../src/main');
    await vi.waitFor(() =>
      expect(mocks.handle).toHaveBeenCalledWith('gurukul:auth.googleSignIn', expect.any(Function)),
    );
    const signIn = mocks.handle.mock.calls.find(
      ([name]) => name === 'gurukul:auth.googleSignIn',
    )?.[1] as (event: unknown) => Promise<unknown>;
    const result = signIn({
      senderFrame: { origin: 'https://gurukul.nonstopio.com', parent: null },
    });
    await vi.waitFor(() => expect(mocks.openExternal).toHaveBeenCalled());
    const consent = new URL(String(mocks.openExternal.mock.calls[0]?.[0]));
    expect(consent.searchParams.get('client_id')).toBe('desktop-client');
    const back = new URL(String(consent.searchParams.get('redirect_uri')));
    back.searchParams.set('state', String(consent.searchParams.get('state')));
    back.searchParams.set('code', 'c');
    await fetch(back);
    await expect(result).resolves.toEqual({ ok: true, idToken: 'a.b.c' });
    expect(mocks.netFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.any(Object),
    );
    vi.unstubAllEnvs();
  });
});
