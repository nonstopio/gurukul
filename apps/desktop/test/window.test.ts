import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/log';
import { RETRY_MS, openWindow, windowOptions, type WindowLike } from '../src/window';

type FailLoad = (
  event: unknown,
  code: number,
  description: string,
  url: string,
  isMainFrame: boolean,
) => void;

function fakeWindow(loadURL = vi.fn(async () => undefined)) {
  let failLoad: FailLoad = () => undefined;
  const win = {
    loadURL,
    isMinimized: () => false,
    restore: vi.fn(),
    focus: vi.fn(),
    on: vi.fn(),
    webContents: {
      on: (_name: string, listener: FailLoad) => {
        failLoad = listener;
      },
    },
  } satisfies WindowLike;
  return { win, failLoad: (...args: Parameters<FailLoad>) => failLoad(...args) };
}

describe('windowOptions', () => {
  it('turns on context isolation and the sandbox, and Node off everywhere', () => {
    const options = windowOptions('/app/dist/preload.cjs', ['https://gurukul.nonstopio.com']);
    expect(options.webPreferences).toEqual({
      preload: '/app/dist/preload.cjs',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: ['--gurukul-origins=https://gurukul.nonstopio.com'],
    });
    expect(options.title).toBe('Gurukul Studio');
  });
});

describe('openWindow', () => {
  const options = windowOptions('/p', []);

  it('creates the window and loads the page', () => {
    const { win } = fakeWindow();
    const create = vi.fn(() => win);
    const timers = { setTimeout: vi.fn() };
    expect(openWindow(create, options, 'https://x.example/', timers, createLogger())).toBe(win);
    expect(create).toHaveBeenCalledWith(options);
    expect(win.loadURL).toHaveBeenCalledWith('https://x.example/');
    expect(timers.setTimeout).not.toHaveBeenCalled();
  });

  it('tries again when the page fails to load, and swallows the rejected load', async () => {
    const { win, failLoad } = fakeWindow(vi.fn(async () => Promise.reject(new Error('refused'))));
    const timers = { setTimeout: vi.fn() };
    const sink = vi.fn();
    openWindow(() => win, options, 'http://localhost:5173/', timers, createLogger({ sink }));
    failLoad({}, -102, 'ERR_CONNECTION_REFUSED', 'http://localhost:5173/', true);
    expect(sink).toHaveBeenCalledWith('warn', 'Page failed to load', {
      code: -102,
      retryMs: RETRY_MS,
    });
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), RETRY_MS);
    (timers.setTimeout.mock.calls[0]?.[0] as () => void)();
    expect(win.loadURL).toHaveBeenCalledTimes(2);
  });

  it('ignores a subframe that fails and a load that was replaced', () => {
    const { win, failLoad } = fakeWindow();
    const timers = { setTimeout: vi.fn() };
    openWindow(() => win, options, 'https://x.example/', timers, createLogger());
    failLoad({}, -102, 'refused', 'https://www.youtube.com/embed/x', false);
    failLoad({}, -3, 'ERR_ABORTED', 'https://x.example/', true);
    expect(timers.setTimeout).not.toHaveBeenCalled();
  });
});
