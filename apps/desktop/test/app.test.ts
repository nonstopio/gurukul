import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, startApp, type ShellDeps } from '../src/app';
import { channel } from '../src/bridge';
import { DEV_URL, PRODUCTION_URL } from '../src/config';
import type { InvokeEventLike } from '../src/ipc';
import type { MenuItem } from '../src/menu';
import { createLogger } from '../src/log';
import type { ContentsLike } from '../src/navigation';
import type { WindowLike, WindowOptions } from '../src/window';

let userData: string;

beforeEach(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'gurukul-app-'));
});

afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
});

function fakeWindow() {
  const listeners = new Map<string, () => void>();
  const contentsListeners = new Map<string, (...args: never[]) => void>();
  const mainFrame = { origin: 'http://localhost:5173', parent: null, send: vi.fn() };
  return {
    loadURL: vi.fn(async () => undefined),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
    on: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
    webContents: {
      mainFrame,
      on: vi.fn((name: string, listener: (...args: never[]) => void) =>
        contentsListeners.set(name, listener),
      ),
    },
    close: () => listeners.get('closed')?.(),
    /** The page asks to stay; true when the shell let it go anyway. */
    vetoUnload: () => {
      const event = { preventDefault: vi.fn() };
      contentsListeners.get('will-prevent-unload')?.(event as never);
      return event.preventDefault.mock.calls.length > 0;
    },
  } satisfies WindowLike & { close(): void; vetoUnload(): boolean };
}

function setup({ packaged = false, lock = true, platform = 'linux' } = {}) {
  const appListeners = new Map<string, (...args: unknown[]) => void>();
  const handlers = new Map<string, (event: InvokeEventLike, ...args: unknown[]) => unknown>();
  const windows: ReturnType<typeof fakeWindow>[] = [];
  const permission = { request: undefined as unknown, check: undefined as unknown };
  const sink = vi.fn();
  const deps = {
    app: {
      isPackaged: packaged,
      getVersion: () => '0.1.0',
      getPath: () => userData,
      requestSingleInstanceLock: () => lock,
      quit: vi.fn(),
      whenReady: vi.fn(async () => undefined),
      on: vi.fn((name: string, listener: (...args: unknown[]) => void) =>
        appListeners.set(name, listener),
      ),
    },
    ipc: { handle: (name, listener) => void handlers.set(name, listener) },
    shell: { openExternal: vi.fn(async () => undefined) },
    session: () => ({
      setPermissionRequestHandler: (h: unknown) => {
        permission.request = h;
      },
      setPermissionCheckHandler: (h: unknown) => {
        permission.check = h;
      },
    }),
    createWindow: vi.fn<(options: WindowOptions) => ReturnType<typeof fakeWindow>>(() => {
      const win = fakeWindow();
      windows.push(win);
      return win;
    }),
    windowCount: vi.fn(() => windows.length),
    preloadPath: '/app/dist/preload.cjs',
    platform,
    timers: { setTimeout: vi.fn(), setInterval: vi.fn() },
    updater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      logger: undefined as unknown,
      on: vi.fn(),
      checkForUpdates: vi.fn(async () => null),
      quitAndInstall: vi.fn(),
    },
    showMessage: vi.fn(async () => undefined),
    setMenu: vi.fn<(template: MenuItem[]) => void>(),
    log: createLogger({ sink }),
  } satisfies ShellDeps;
  const emit = (name: string, ...args: unknown[]) => appListeners.get(name)?.(...args);
  return { deps, emit, handlers, windows, permission, sink };
}

const topFrame = (origin: string): InvokeEventLike => ({ senderFrame: { origin, parent: null } });

describe('startApp', () => {
  it('quits when another copy is already running, and touches nothing else', async () => {
    const { deps } = setup({ lock: false });
    await expect(startApp(deps)).resolves.toBeNull();
    expect(deps.app.quit).toHaveBeenCalled();
    expect(deps.app.whenReady).not.toHaveBeenCalled();
    expect(deps.createWindow).not.toHaveBeenCalled();
  });

  it('opens the dev server in a development build', async () => {
    const { deps, windows, sink } = setup();
    await startApp(deps);
    expect(windows[0]?.loadURL).toHaveBeenCalledWith(DEV_URL);
    expect(deps.createWindow.mock.calls[0]?.[0].webPreferences.additionalArguments).toEqual([
      '--gurukul-origins=http://localhost:5173,https://gurukul.nonstopio.com',
    ]);
    expect(sink).toHaveBeenCalledWith('info', 'Desktop shell started', {
      dev: true,
      bridgeVersion: 1,
    });
  });

  it('opens production, and lets only production call, in a packaged build', async () => {
    const { deps, windows, handlers } = setup({ packaged: true });
    await startApp(deps);
    expect(windows[0]?.loadURL).toHaveBeenCalledWith(PRODUCTION_URL);
    const info = handlers.get(channel('info'));
    await expect(info?.(topFrame('https://gurukul.nonstopio.com'))).resolves.toEqual({
      bridgeVersion: 1,
      appVersion: '0.1.0',
      platform: 'linux',
    });
    await expect(info?.(topFrame('http://localhost:5173'))).rejects.toThrow('Not allowed');
  });

  it('keeps session files under the app data folder', async () => {
    const { deps, handlers } = setup();
    await startApp(deps);
    const event = topFrame('http://localhost:5173');
    const f = { uid: 'u1', sessionId: 's1', path: 'session.json' };
    await handlers.get(channel('store.write'))?.(event, f, '{}');
    await expect(handlers.get(channel('store.read'))?.(event, f)).resolves.toBe('{}');
    await expect(handlers.get(channel('store.list'))?.(event, { uid: 'u1' })).resolves.toEqual([
      's1',
    ]);
  });

  it('guards every web contents the app creates', async () => {
    const { deps, emit } = setup();
    await startApp(deps);
    const on = vi.fn();
    const setWindowOpenHandler = vi.fn();
    emit('web-contents-created', {}, { on, setWindowOpenHandler } as unknown as ContentsLike);
    expect(on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    expect(setWindowOpenHandler).toHaveBeenCalled();
  });

  it('answers permission requests and checks', async () => {
    const { deps, permission } = setup({ packaged: true });
    await startApp(deps);
    const callback = vi.fn();
    (permission.request as (...a: unknown[]) => void)({}, 'clipboard-sanitized-write', callback, {
      requestingUrl: 'https://gurukul.nonstopio.com/studio',
    });
    (permission.request as (...a: unknown[]) => void)({}, 'media', callback, {
      requestingUrl: 'https://gurukul.nonstopio.com/studio',
    });
    expect(callback.mock.calls).toEqual([[true], [false]]);
    const check = permission.check as (...a: unknown[]) => boolean;
    expect(check({}, 'clipboard-sanitized-write', 'https://gurukul.nonstopio.com')).toBe(true);
    expect(check({}, 'clipboard-sanitized-write', '')).toBe(false);
  });

  it('brings the window forward when the app is started again', async () => {
    const { deps, emit, windows } = setup();
    await startApp(deps);
    const win = windows[0] as ReturnType<typeof fakeWindow>;
    emit('second-instance');
    expect(win.restore).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalledTimes(1);
    win.isMinimized.mockReturnValue(true);
    emit('second-instance');
    expect(win.restore).toHaveBeenCalled();
    win.close();
    emit('second-instance');
    expect(win.focus).toHaveBeenCalledTimes(2);
  });

  it('opens a new window from the Dock only when none is open', async () => {
    const { deps, emit, windows } = setup({ platform: 'darwin' });
    await startApp(deps);
    emit('activate');
    expect(windows).toHaveLength(1);
    deps.windowCount.mockReturnValue(0);
    emit('activate');
    expect(windows).toHaveLength(2);
    // The first window's late `closed` does not forget the second one.
    windows[0]?.close();
    emit('second-instance');
    expect(windows[1]?.focus).toHaveBeenCalled();
  });

  it('quits when the last window closes, except on macOS', async () => {
    const linux = setup();
    await startApp(linux.deps);
    linux.emit('window-all-closed');
    expect(linux.deps.app.quit).toHaveBeenCalled();

    const mac = setup({ platform: 'darwin' });
    await startApp(mac.deps);
    mac.emit('window-all-closed');
    expect(mac.deps.app.quit).not.toHaveBeenCalled();
  });
});

describe('updates', () => {
  const menuCheck = (template: MenuItem[] | undefined) =>
    template
      ?.flatMap((item) => item.submenu ?? [])
      .find((item) => item.label === 'Check for updates…')?.click;

  it('check at launch and every six hours in an installed Mac or Windows build', async () => {
    for (const platform of ['darwin', 'win32']) {
      const { deps, handlers } = setup({ packaged: true, platform });
      await startApp(deps);
      expect(deps.updater.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(deps.timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 21_600_000);
      await expect(
        handlers.get(channel('app.checkForUpdate'))?.(topFrame('https://gurukul.nonstopio.com')),
      ).resolves.toEqual({ state: 'up_to_date' });
    }
  });

  it('never check in a development build or on Linux', async () => {
    for (const options of [{ platform: 'darwin' }, { packaged: true, platform: 'linux' }]) {
      const { deps, handlers } = setup(options);
      await startApp(deps);
      expect(deps.updater.checkForUpdates).not.toHaveBeenCalled();
      const origin = options.packaged ? 'https://gurukul.nonstopio.com' : 'http://localhost:5173';
      await expect(
        handlers.get(channel('app.checkForUpdate'))?.(topFrame(origin)),
      ).resolves.toEqual({ state: 'unsupported' });
      await expect(
        handlers.get(channel('app.installUpdate'))?.(topFrame(origin)),
      ).resolves.toBeUndefined();
    }
  });

  it('let a page that asks to stay go only while an update installs', async () => {
    const { deps, windows, handlers, sink } = setup({ packaged: true, platform: 'win32' });
    await startApp(deps);
    const win = windows[0] as ReturnType<typeof fakeWindow>;
    // Outside an install the page's question stands (Electron's default: the close is cancelled).
    expect(win.vetoUnload()).toBe(false);
    const downloaded = deps.updater.on.mock.calls.find(([name]) => name === 'update-downloaded');
    (downloaded?.[1] as (info: { version: string }) => void)({ version: '0.2.0' });
    void handlers.get(channel('app.installUpdate'))?.(topFrame('https://gurukul.nonstopio.com'));
    expect(deps.updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(win.vetoUnload()).toBe(true);
    expect(sink).toHaveBeenCalledWith('info', 'Page left for an update', {});
  });

  it('answer “Check for updates…” in the menu with a message box', async () => {
    const { deps } = setup({ packaged: true, platform: 'darwin' });
    await startApp(deps);
    const click = menuCheck(deps.setMenu.mock.calls[0]?.[0]);
    click?.();
    await vi.waitFor(() =>
      expect(deps.showMessage).toHaveBeenCalledWith({
        type: 'info',
        message: 'Gurukul Studio is up to date.',
        detail: 'You have version 0.1.0, the newest.',
      }),
    );
  });
});

describe('bridge events', () => {
  const event = { type: 'text', sessionId: 's1', text: 'Hello' } as const;

  it('go to the current window’s top frame on its event channel', async () => {
    const { deps, windows } = setup();
    const shell = await startApp(deps);
    expect(shell?.events.send('agent.onEvent', event)).toBe(true);
    expect(windows[0]?.webContents.mainFrame.send).toHaveBeenCalledWith(
      'gurukul-event:agent.onEvent',
      event,
    );
  });

  it('are not sent when the window is closed or destroyed, or the frame left Gurukul', async () => {
    const { deps, windows, sink } = setup({ packaged: true });
    const shell = await startApp(deps);
    const win = windows[0] as ReturnType<typeof fakeWindow>;
    // A packaged build allows only production; this window's frame is on the dev server.
    expect(shell?.events.send('agent.onEvent', event)).toBe(false);
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge event not sent', {
      event: 'agent.onEvent',
      reason: 'origin',
    });
    win.isDestroyed.mockReturnValue(true);
    expect(shell?.events.send('agent.onEvent', event)).toBe(false);
    win.close();
    expect(shell?.events.send('app.onUpdateReady', { version: '1.0.0' })).toBe(false);
    expect(win.webContents.mainFrame.send).not.toHaveBeenCalled();
  });
});

describe('main', () => {
  it('starts the app', async () => {
    const { deps, windows } = setup();
    await expect(main(deps)).resolves.toEqual({ events: expect.any(Object) });
    expect(windows).toHaveLength(1);
  });

  it('logs and quits when start-up fails', async () => {
    const { deps, sink } = setup();
    deps.app.whenReady.mockRejectedValue(new Error('no display'));
    await expect(main(deps)).resolves.toBeNull();
    expect(sink).toHaveBeenCalledWith('error', 'Desktop shell failed to start', {
      error: { name: 'Error' },
    });
    expect(deps.app.quit).toHaveBeenCalled();
  });
});
