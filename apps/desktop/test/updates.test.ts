import { describe, expect, it, vi } from 'vitest';
import type { UpdateCheck } from '../src/bridge';
import { createLogger } from '../src/log';
import {
  CHECK_EVERY_MS,
  INSTALL_WAIT_MS,
  createUpdates,
  menuMessage,
  type UpdaterLike,
} from '../src/updates';

/*
 * Morph's `scripts/check-updates.cjs` cases, ported: the update decisions without downloading a
 * release or restarting Electron.
 */

type Result = Awaited<ReturnType<UpdaterLike['checkForUpdates']>>;

function harness({ supported = true } = {}) {
  const listeners: Record<string, (arg: unknown) => void> = {};
  const updater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: undefined as unknown,
    on: vi.fn((event: string, listener: (arg: unknown) => void) => {
      listeners[event] = listener;
    }),
    checkForUpdates: vi.fn(async (): Promise<Result> => ({
      isUpdateAvailable: false,
      updateInfo: { version: '0.1.0' },
    })),
    quitAndInstall: vi.fn(),
  } satisfies UpdaterLike;
  const send = vi.fn(() => true);
  const showMessage = vi.fn(async () => undefined);
  const setInterval = vi.fn();
  const timeouts: { callback: () => void; ms: number }[] = [];
  const setTimeout = vi.fn((callback: () => void, ms: number) => timeouts.push({ callback, ms }));
  const sink = vi.fn();
  const updates = createUpdates({
    updater,
    supported,
    appVersion: '0.1.0',
    events: { send },
    showMessage,
    timers: { setInterval, setTimeout },
    log: createLogger({ sink }),
  });
  const emit = (event: string, arg: unknown) => listeners[event]?.(arg);
  const downloaded = (version: string) => emit('update-downloaded', { version });
  /** Runs every timeout that has come due. */
  const elapse = () => timeouts.splice(0).forEach(({ callback }) => callback());
  return {
    updates,
    updater,
    send,
    showMessage,
    setInterval,
    timeouts,
    sink,
    emit,
    downloaded,
    elapse,
  };
}

/** A check that finds `version` and a download that finishes when `finish` is called. */
function pendingDownload(h: ReturnType<typeof harness>, version = '0.2.0') {
  let finish!: (ok: boolean) => void;
  const downloadPromise = new Promise<unknown>((resolve, reject) => {
    finish = (ok) => (ok ? resolve([]) : reject(new Error('download failed')));
  });
  h.updater.checkForUpdates.mockResolvedValueOnce({
    isUpdateAvailable: true,
    updateInfo: { version },
    downloadPromise,
  });
  return async (ok = true) => {
    finish(ok);
    await settle();
  };
}

/** Lets every pending promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('updates', () => {
  it('never check when unsupported (development build, Linux)', async () => {
    const h = harness({ supported: false });
    h.updates.start();
    await expect(h.updates.check()).resolves.toEqual({ state: 'unsupported' });
    await expect(h.updates.install()).resolves.toBeUndefined();
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.updater.on).not.toHaveBeenCalled();
    expect(h.setInterval).not.toHaveBeenCalled();
  });

  it('start once: download silently, install on Quit, check now and every six hours', async () => {
    const h = harness();
    h.updates.start();
    h.updates.start();
    expect(h.updater.autoDownload).toBe(true);
    expect(h.updater.autoInstallOnAppQuit).toBe(true);
    expect(h.updater.logger).toBeNull();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.setInterval).toHaveBeenCalledTimes(1);
    expect(h.setInterval).toHaveBeenCalledWith(expect.any(Function), CHECK_EVERY_MS);
    expect(CHECK_EVERY_MS).toBe(6 * 60 * 60 * 1000);
    await settle();
    await expect(h.updates.check()).resolves.toEqual({ state: 'up_to_date' });
    const tick = h.setInterval.mock.calls[0]?.[0] as () => void;
    tick();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(3);
    expect(h.showMessage).not.toHaveBeenCalled();
  });

  it('report a download, then tell the window when it is ready, without a dialog', async () => {
    const h = harness();
    h.updates.start();
    await settle();
    const finish = pendingDownload(h);
    await expect(h.updates.check()).resolves.toEqual({ state: 'downloading', version: '0.2.0' });
    // While it downloads, asking again does not start a second check.
    await expect(h.updates.check()).resolves.toEqual({ state: 'downloading', version: '0.2.0' });
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(2);
    h.downloaded('0.2.0');
    await finish();
    expect(h.send).toHaveBeenCalledWith('app.onUpdateReady', { version: '0.2.0' });
    await expect(h.updates.check()).resolves.toEqual({ state: 'ready', version: '0.2.0' });
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(h.showMessage).not.toHaveBeenCalled();
    expect(h.sink).toHaveBeenCalledWith('info', 'Update ready', { version: '0.2.0' });
  });

  it('say “checking” while a check has not answered yet', async () => {
    const h = harness();
    let answer!: (r: Result) => void;
    h.updater.checkForUpdates.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const first = h.updates.check();
    await expect(h.updates.check()).resolves.toEqual({ state: 'checking' });
    answer(null);
    await expect(first).resolves.toEqual({ state: 'up_to_date' });
  });

  it('treat an update found without a download as up to date', async () => {
    const h = harness();
    h.updater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: true,
      updateInfo: { version: '0.2.0' },
      downloadPromise: null,
    });
    await expect(h.updates.check()).resolves.toEqual({ state: 'up_to_date' });
  });

  it('check again after a failed download', async () => {
    const h = harness();
    h.updates.start();
    await settle();
    const finish = pendingDownload(h);
    await h.updates.check();
    await finish(false);
    await expect(h.updates.check()).resolves.toEqual({ state: 'up_to_date' });
  });

  it('stay quiet when a check fails, and log only its code', async () => {
    const h = harness();
    h.updater.checkForUpdates.mockRejectedValueOnce(
      Object.assign(new Error('https://github.com/… 404'), { code: 'ERR_UPDATER_NOT_FOUND' }),
    );
    await expect(h.updates.check()).resolves.toEqual({ state: 'failed' });
    expect(h.sink).toHaveBeenCalledWith('warn', 'Update check failed', {
      code: 'ERR_UPDATER_NOT_FOUND',
    });
    h.updater.checkForUpdates.mockRejectedValueOnce('offline');
    await expect(h.updates.check()).resolves.toEqual({ state: 'failed' });
    expect(h.sink).toHaveBeenLastCalledWith('warn', 'Update check failed', {});
    expect(h.showMessage).not.toHaveBeenCalled();
  });

  it('install nothing before a download', async () => {
    const h = harness();
    h.updates.start();
    await expect(h.updates.install()).resolves.toBeUndefined();
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('install once, restarting into the new version', async () => {
    const h = harness();
    h.updates.start();
    h.downloaded('0.2.0');
    const first = h.updates.install();
    const second = h.updates.install();
    expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(h.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    // The app quits: neither promise settles.
    const settled = vi.fn();
    void first.then(settled);
    void second.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });

  it('keep the app open when the install fails, and try again at the next check', async () => {
    const h = harness();
    h.updates.start();
    h.downloaded('0.2.0');
    const install = h.updates.install();
    h.emit('error', Object.assign(new Error('not signed'), { code: 'ERR_SIGNATURE' }));
    await expect(install).resolves.toBeUndefined();
    expect(h.sink).toHaveBeenCalledWith('error', 'Update install failed', {
      error: { name: 'Error', code: 'ERR_SIGNATURE' },
    });
    // The item is gone: nothing is ready until the next check downloads it again.
    await expect(h.updates.check()).resolves.toEqual({ state: 'up_to_date' });
    h.downloaded('0.2.0');
    await expect(h.updates.check()).resolves.toEqual({ state: 'ready', version: '0.2.0' });
  });

  it('count an install the page kept from quitting as failed after the wait', async () => {
    // A page asking to stay cancels the quit without an updater error: `quitAndInstall` returns and
    // nothing else happens. Without the wait the item would spin until the Educator quit.
    const h = harness();
    h.updates.start();
    h.downloaded('0.2.0');
    const install = h.updates.install();
    expect(h.updates.isInstalling()).toBe(true);
    expect(h.timeouts.map(({ ms }) => ms)).toEqual([INSTALL_WAIT_MS]);
    expect(INSTALL_WAIT_MS).toBe(30_000);
    const settled = vi.fn();
    void install.then(settled);
    await settle();
    expect(settled).not.toHaveBeenCalled();
    h.elapse();
    await expect(install).resolves.toBeUndefined();
    expect(h.updates.isInstalling()).toBe(false);
    expect(h.sink).toHaveBeenCalledWith('warn', 'Update install timed out', {
      waitedMs: INSTALL_WAIT_MS,
    });
    // The item is gone; the next download offers it again and a click tries again.
    await expect(h.updates.check()).resolves.toEqual({ state: 'up_to_date' });
    h.downloaded('0.2.0');
    void h.updates.install();
    expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it('leave a later install alone when an earlier one’s wait comes due', async () => {
    const h = harness();
    h.updates.start();
    h.downloaded('0.2.0');
    const first = h.updates.install();
    h.emit('error', new Error('not signed'));
    await expect(first).resolves.toBeUndefined();
    h.downloaded('0.2.1');
    void h.updates.install();
    // Only the second install's own wait may end it.
    h.timeouts.shift()?.callback();
    expect(h.updates.isInstalling()).toBe(true);
    h.elapse();
    expect(h.updates.isInstalling()).toBe(false);
    expect(
      h.sink.mock.calls.filter(([, event]) => event === 'Update install timed out'),
    ).toHaveLength(1);
  });

  it('take the same path when quitAndInstall throws outright', async () => {
    const h = harness();
    h.updates.start();
    h.downloaded('0.2.0');
    h.updater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('not signed');
    });
    await expect(h.updates.install()).resolves.toBeUndefined();
    h.downloaded('0.2.1');
    await expect(h.updates.check()).resolves.toEqual({ state: 'ready', version: '0.2.1' });
  });

  it('keep a waiting update through a background error', async () => {
    const h = harness();
    h.updates.start();
    h.downloaded('0.2.0');
    h.emit('error', new Error('feed hiccup'));
    expect(h.sink).toHaveBeenCalledWith('warn', 'Updater error', {});
    await expect(h.updates.check()).resolves.toEqual({ state: 'ready', version: '0.2.0' });
  });

  it('answer the menu in a message box, pointing at the sidebar item when one is ready', async () => {
    const h = harness();
    await h.updates.checkFromMenu();
    expect(h.showMessage).toHaveBeenLastCalledWith(menuMessage({ state: 'up_to_date' }, '0.1.0'));
    h.updates.start();
    h.downloaded('0.2.0');
    await h.updates.checkFromMenu();
    expect(h.showMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Gurukul Studio 0.2.0 is ready to install.' }),
    );
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe('menuMessage', () => {
  const cases: [UpdateCheck, string][] = [
    [{ state: 'up_to_date' }, 'Gurukul Studio is up to date.'],
    [{ state: 'checking' }, 'Gurukul Studio is already checking for an update.'],
    [{ state: 'downloading', version: '0.2.0' }, 'Gurukul Studio 0.2.0 is downloading.'],
    [{ state: 'ready', version: '0.2.0' }, 'Gurukul Studio 0.2.0 is ready to install.'],
    [{ state: 'unsupported' }, 'This copy of Gurukul Studio does not update itself.'],
    [{ state: 'failed' }, 'Gurukul Studio could not check for updates.'],
  ];

  it.each(cases)('says what %j means', (result, message) => {
    const shown = menuMessage(result, '0.1.0');
    expect(shown.message).toBe(message);
    expect(shown.type).toBe(result.state === 'failed' ? 'warning' : 'info');
    expect(shown.detail.length).toBeGreaterThan(0);
  });

  it('points at the sidebar item for a ready update', () => {
    expect(menuMessage({ state: 'ready', version: '0.2.0' }, '0.1.0').detail).toMatch(
      /Update ready in the sidebar/,
    );
  });
});
