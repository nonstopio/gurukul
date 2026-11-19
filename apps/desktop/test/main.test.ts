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
    openExternal: vi.fn(),
    defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
  };
});

vi.mock('electron', () => {
  class BrowserWindow {
    static getAllWindows = () => mocks.windows;
    webContents = { on: vi.fn() };
    loadURL = vi.fn(async () => undefined);
    on = vi.fn();
    constructor(public opts: unknown) {
      mocks.windows.push(this);
    }
  }
  return {
    app: mocks.app,
    BrowserWindow,
    ipcMain: { handle: mocks.handle },
    session: { defaultSession: mocks.defaultSession },
    shell: { openExternal: mocks.openExternal },
  };
});

describe('main', () => {
  it('starts the shell with Electron’s real objects', async () => {
    vi.useFakeTimers();
    await import('../src/main');
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(1));
    const opts = mocks.windows[0]?.opts as { webPreferences: { preload: string } };
    expect(opts.webPreferences.preload).toBe('/app/dist/preload.cjs');
    expect(mocks.handle).toHaveBeenCalledWith('gurukul:info', expect.any(Function));
    expect(mocks.defaultSession.setPermissionRequestHandler).toHaveBeenCalled();

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
});
