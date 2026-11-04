import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VERSION_CHECK_MS, checkForNewBuild, updateFor } from '../src/boot';
import { log } from '../src/log';

// A stand-in window: visibility and onLine cannot be set on jsdom's.
// `null` stands for no build id at all (a default parameter would swallow `undefined`).
function fakeWindow(live: () => Promise<unknown>, buildId: string | null = 'release-a') {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = {
    document,
    navigator: { onLine: true },
    location: { pathname: '/courses/c1', reload: vi.fn() },
    fetch: vi.fn(() => live().then((body) => ({ json: () => Promise.resolve(body) }))),
  };
  const onUpdate = vi.fn();
  checkForNewBuild(buildId ?? undefined, 1, onUpdate, win as unknown as Window);
  const show = async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  };
  return { win, show, onUpdate };
}

const serves = (body: unknown) => () => Promise.resolve(body);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('updateFor', () => {
  it('is nothing when the live build is this one', () => {
    expect(updateFor('a', 1, { id: 'a', required: 1 })).toBeNull();
  });

  it('is soft when another build is live with the same required number', () => {
    expect(updateFor('a', 1, { id: 'b', required: 1 })).toEqual({ kind: 'soft', id: 'b' });
  });

  it('is hard when the live required number is above this build’s', () => {
    expect(updateFor('a', 1, { id: 'b', required: 2 })).toEqual({ kind: 'hard', id: 'b' });
  });

  it('reads a version file without a required number as 0', () => {
    expect(updateFor('a', 0, { id: 'b' })).toEqual({ kind: 'soft', id: 'b' });
    expect(updateFor('a', 1, { id: 'b' })).toEqual({ kind: 'soft', id: 'b' });
    expect(updateFor('a', 0, { id: 'b', required: '1' })).toEqual({ kind: 'soft', id: 'b' });
  });

  it('ignores a file without a string id', () => {
    expect(updateFor('a', 0, { id: 7, required: 9 })).toBeNull();
    expect(updateFor('a', 0, null)).toBeNull();
  });
});

describe('checkForNewBuild', () => {
  it('reports a newer build when the tab comes back, asking past every cache, and never reloads', async () => {
    const { win, show, onUpdate } = fakeWindow(serves({ id: 'release-b', required: 1 }));
    await show();
    expect(win.fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    expect(onUpdate).toHaveBeenCalledWith({ kind: 'soft', id: 'release-b' });
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('checks every ten minutes while the tab stays open', async () => {
    const { win, onUpdate } = fakeWindow(serves({ id: 'release-b' }));
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS - 1);
    expect(win.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onUpdate).toHaveBeenCalledOnce();
    // A soft update keeps checking, so a later required one still arrives.
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('stops checking after a hard update', async () => {
    const { win, show, onUpdate } = fakeWindow(serves({ id: 'release-b', required: 2 }));
    await show();
    expect(onUpdate).toHaveBeenCalledWith({ kind: 'hard', id: 'release-b' });
    await show();
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
    expect(win.fetch).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('says nothing when the live build is this one', async () => {
    const { win, show, onUpdate } = fakeWindow(serves({ id: 'release-a', required: 1 }));
    await show();
    expect(win.fetch).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('checks a hidden tab too, so a required update stops a tab left in the background', async () => {
    const { win, onUpdate } = fakeWindow(serves({ id: 'release-b', required: 2 }));
    win.document.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
    expect(win.fetch).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({ kind: 'hard', id: 'release-b' });
  });

  it('waits while offline, then reports once back online', async () => {
    const { win, show, onUpdate } = fakeWindow(serves({ id: 'release-b' }));
    win.navigator.onLine = false;
    await show();
    expect(win.fetch).not.toHaveBeenCalled();
    win.navigator.onLine = true;
    await show();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it.each(['/courses/c1/quiz/q1', '/studio/courses/c1/lessons/l1'])(
    'checks on %s too: nothing reloads unasked, and a required update must reach every page',
    async (busy) => {
      const { win, show, onUpdate } = fakeWindow(serves({ id: 'release-b', required: 2 }));
      win.location.pathname = busy;
      await show();
      expect(onUpdate).toHaveBeenCalledWith({ kind: 'hard', id: 'release-b' });
    },
  );

  it('does nothing on a failed fetch or bad JSON, and warns only once', async () => {
    const warn = vi.spyOn(log, 'warn');
    const { win, show, onUpdate } = fakeWindow(() => Promise.reject(new Error('offline')));
    await show();
    await show();
    expect(win.fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
    const bad = fakeWindow(serves(null));
    await bad.show();
    expect(bad.onUpdate).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it.each(['dev', null])('is off when the build id is %s (dev server, tests)', async (id) => {
    const { win, show } = fakeWindow(serves({ id: 'release-b' }), id);
    await show();
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_MS);
    expect(win.fetch).not.toHaveBeenCalled();
  });
});
