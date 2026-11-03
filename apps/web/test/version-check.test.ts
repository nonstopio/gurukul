import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_RELOAD_KEY, VERSION_CHECK_MS, checkForNewBuild } from '../src/boot';
import { log } from '../src/log';

// A stand-in window: jsdom's location.reload cannot be spied on, and visibility cannot be set.
// `null` stands for no build id at all (a default parameter would swallow `undefined`).
function fakeWindow(live: () => Promise<unknown>, buildId: string | null = 'release-a') {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = {
    document,
    navigator: { onLine: true },
    location: { pathname: '/courses/c1', reload: vi.fn() },
    sessionStorage,
    fetch: vi.fn(() => live().then((body) => ({ json: () => Promise.resolve(body) }))),
  };
  checkForNewBuild(buildId ?? undefined, win as unknown as Window);
  const show = async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  };
  return { win, show };
}

const serves = (body: unknown) => () => Promise.resolve(body);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('checkForNewBuild', () => {
  it('reloads when the tab comes back and a newer build is live, asking past every cache', async () => {
    const { win, show } = fakeWindow(serves({ id: 'release-b' }));
    await show();
    expect(win.fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    expect(win.location.reload).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(STALE_RELOAD_KEY)).toBe('1000000');
  });

  it('checks every ten minutes while the tab stays visible', async () => {
    const { win } = fakeWindow(serves({ id: 'release-b' }));
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS - 1);
    expect(win.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(win.location.reload).toHaveBeenCalledOnce();
  });

  it('does nothing when the live build is this one', async () => {
    const { win, show } = fakeWindow(serves({ id: 'release-a' }));
    await show();
    expect(win.fetch).toHaveBeenCalledOnce();
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('ignores a version file without a string id', async () => {
    const { win, show } = fakeWindow(serves({ id: 7 }));
    await show();
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('never asks from a hidden tab', async () => {
    const { win, show } = fakeWindow(serves({ id: 'release-b' }));
    win.document.visibilityState = 'hidden';
    await show();
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
    expect(win.fetch).not.toHaveBeenCalled();
  });

  it('waits while offline, then reloads once back online', async () => {
    const { win, show } = fakeWindow(serves({ id: 'release-b' }));
    win.navigator.onLine = false;
    await show();
    expect(win.fetch).not.toHaveBeenCalled();
    win.navigator.onLine = true;
    await show();
    expect(win.location.reload).toHaveBeenCalledOnce();
  });

  it.each(['/courses/c1/quiz/q1', '/studio/courses/c1/lessons/l1'])(
    'leaves %s alone and reloads on the next check after leaving it',
    async (busy) => {
      const { win, show } = fakeWindow(serves({ id: 'release-b' }));
      win.location.pathname = busy;
      await show();
      await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
      expect(win.location.reload).not.toHaveBeenCalled();
      win.location.pathname = '/courses/c1';
      await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
      expect(win.location.reload).toHaveBeenCalledOnce();
    },
  );

  it('does nothing on a failed fetch or bad JSON, and warns only once', async () => {
    const warn = vi.spyOn(log, 'warn');
    const { win, show } = fakeWindow(() => Promise.reject(new Error('offline')));
    await show();
    await show();
    expect(win.fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
    const bad = fakeWindow(serves(null));
    await bad.show();
    expect(bad.win.location.reload).not.toHaveBeenCalled();
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('reloads at most once in 30 seconds, so a version file that disagrees cannot loop', async () => {
    sessionStorage.setItem(STALE_RELOAD_KEY, String(1_000_000 - 29_999));
    const { win, show } = fakeWindow(serves({ id: 'release-b' }));
    await show();
    expect(win.location.reload).not.toHaveBeenCalled();
    vi.setSystemTime(1_000_001);
    await show();
    expect(win.location.reload).toHaveBeenCalledOnce();
  });

  it.each(['dev', null])('is off when the build id is %s (dev server, tests)', async (id) => {
    const { win, show } = fakeWindow(serves({ id: 'release-b' }), id);
    await show();
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
    expect(win.fetch).not.toHaveBeenCalled();
  });
});
