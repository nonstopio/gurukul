import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, startApp, type ShellDeps } from '../src/app';
import { channel } from '../src/bridge';
import { DEV_URL, PRODUCTION_URL } from '../src/config';
import type { InvokeEventLike } from '../src/ipc';
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
  return {
    loadURL: vi.fn(async () => undefined),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
    on: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
    webContents: { on: vi.fn() },
    close: () => listeners.get('closed')?.(),
  } satisfies WindowLike & { close(): void };
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
    timers: { setTimeout: vi.fn() },
    log: createLogger({ sink }),
  } satisfies ShellDeps;
  const emit = (name: string, ...args: unknown[]) => appListeners.get(name)?.(...args);
  return { deps, emit, handlers, windows, permission, sink };
}

const topFrame = (origin: string): InvokeEventLike => ({ senderFrame: { origin, parent: null } });

describe('startApp', () => {
  it('quits when another copy is already running, and touches nothing else', async () => {
    const { deps } = setup({ lock: false });
    await startApp(deps);
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

describe('main', () => {
  it('starts the app', async () => {
    const { deps, windows } = setup();
    await main(deps);
    expect(windows).toHaveLength(1);
  });

  it('logs and quits when start-up fails', async () => {
    const { deps, sink } = setup();
    deps.app.whenReady.mockRejectedValue(new Error('no display'));
    await main(deps);
    expect(sink).toHaveBeenCalledWith('error', 'Desktop shell failed to start', {
      error: { name: 'Error' },
    });
    expect(deps.app.quit).toHaveBeenCalled();
  });
});
