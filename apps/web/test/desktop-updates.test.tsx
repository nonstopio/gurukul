import { ToastProvider } from '@gurukul/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopUpdateItem } from '../src/desktop/DesktopUpdateItem';
import {
  REQUIRED_BRIDGE_VERSION,
  type DesktopInfo,
  type GurukulDesktop,
  type UpdateCheck,
  type UpdateReady,
} from '../src/desktop/bridge';
import { checkMessage, watchUpdates } from '../src/desktop/updates';
import { axeViolations } from './axe';

const INFO: DesktopInfo = { bridgeVersion: 4, appVersion: '0.1.0', platform: 'darwin' };

/** A stand-in for the bridge: `info` and the `app` area, which is all the update item uses. */
function fakeDesktop({
  info = INFO,
  check = async (): Promise<UpdateCheck> => ({ state: 'up_to_date' }),
  install = async () => undefined,
}: {
  info?: DesktopInfo;
  check?: () => Promise<UpdateCheck>;
  install?: () => Promise<void>;
} = {}) {
  const handlers: ((payload: UpdateReady) => void)[] = [];
  const desktop = {
    info: vi.fn(async () => info),
    app: {
      checkForUpdate: vi.fn(check),
      installUpdate: vi.fn(install),
      onUpdateReady: vi.fn((handler: (payload: UpdateReady) => void) => {
        handlers.push(handler);
        return () => undefined;
      }),
    },
  };
  const downloaded = (version: string) => act(() => handlers.forEach((h) => h({ version })));
  return { desktop, downloaded };
}

function show(desktop: unknown) {
  (window as { gurukulDesktop?: unknown }).gurukulDesktop = desktop;
  return render(
    <ToastProvider>
      <DesktopUpdateItem />
    </ToastProvider>,
  );
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  delete (window as { gurukulDesktop?: unknown }).gurukulDesktop;
  vi.restoreAllMocks();
});

describe('DesktopUpdateItem', () => {
  it('draws nothing in a browser', () => {
    const { container } = render(
      <ToastProvider>
        <DesktopUpdateItem />
      </ToastProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('draws nothing in the app until an update has downloaded, then offers it', async () => {
    const { desktop, downloaded } = fakeDesktop();
    const { container } = show(desktop);
    await waitFor(() => expect(desktop.app.checkForUpdate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button')).toBeNull();
    downloaded('0.2.0');
    const button = await screen.findByRole('button', {
      name: 'Update ready',
      description: 'Restart to install 0.2.0',
    });
    expect(screen.getByRole('group', { name: 'Gurukul Studio' })).toBeTruthy();
    expect(button).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows an update that downloaded before the page loaded', async () => {
    const { desktop } = fakeDesktop({ check: async () => ({ state: 'ready', version: '0.3.0' }) });
    show(desktop);
    expect(
      await screen.findByRole('button', { description: 'Restart to install 0.3.0' }),
    ).toBeTruthy();
  });

  it('restarts into the update on click', async () => {
    const { desktop } = fakeDesktop({
      check: async () => ({ state: 'ready', version: '0.2.0' }),
      // The app quits: the call never answers.
      install: () => new Promise(() => undefined),
    });
    show(desktop);
    fireEvent.click(await screen.findByRole('button', { name: 'Update ready' }));
    expect(desktop.app.installUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Update ready' }).getAttribute('aria-busy')).toBe(
        'true',
      ),
    );
  });

  it('stays open and drops the item when the install did not happen', async () => {
    const { desktop, downloaded } = fakeDesktop({
      check: async () => ({ state: 'ready', version: '0.2.0' }),
    });
    show(desktop);
    fireEvent.click(await screen.findByRole('button', { name: 'Update ready' }));
    expect(await screen.findByText('The update was not installed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update ready' })).toBeNull();
    expect(warn).toHaveBeenCalledWith('Desktop update not installed', {});
    // The next download brings it back.
    downloaded('0.2.0');
    expect(await screen.findByRole('button', { name: 'Update ready' })).toBeTruthy();
  });

  it('asks for the work to be saved first when the page holds unsaved work', async () => {
    const { desktop } = fakeDesktop({
      check: async () => ({ state: 'ready', version: '0.2.0' }),
    });
    // What Studio's draft and the console's unsaved forms do on the way out.
    const stay = (e: Event) => e.preventDefault();
    window.addEventListener('beforeunload', stay);
    try {
      show(desktop);
      fireEvent.click(await screen.findByRole('button', { name: 'Update ready' }));
      expect(await screen.findByText('Save your work first')).toBeTruthy();
      expect(desktop.app.installUpdate).not.toHaveBeenCalled();
      // The update still waits: once the work is saved, the same item installs it.
      window.removeEventListener('beforeunload', stay);
      const button = screen.getByRole('button', { name: 'Update ready' });
      await waitFor(() => expect(button.hasAttribute('aria-busy')).toBe(false));
      fireEvent.click(button);
      await waitFor(() => expect(desktop.app.installUpdate).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener('beforeunload', stay);
    }
  });

  it('says so when the install call fails', async () => {
    const { desktop } = fakeDesktop({
      check: async () => ({ state: 'ready', version: '0.2.0' }),
      install: async () => {
        throw new Error('Not allowed');
      },
    });
    show(desktop);
    fireEvent.click(await screen.findByRole('button', { name: 'Update ready' }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Desktop update install failed', expect.any(Object)),
    );
    expect(screen.queryByRole('button', { name: 'Update ready' })).toBeNull();
  });

  it('logs a failed first check without showing anything', async () => {
    const { desktop } = fakeDesktop({
      check: async () => {
        throw new Error("Error invoking remote method 'gurukul:app.checkForUpdate': Not allowed");
      },
    });
    show(desktop);
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Desktop update check failed', { reason: 'refused' }),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('DesktopUpdateItem in an app older than this site', () => {
  const old = { ...INFO, bridgeVersion: REQUIRED_BRIDGE_VERSION - 1 };

  it('offers Update the app, and says what the check found', async () => {
    const { desktop } = fakeDesktop({ info: old });
    const { container } = show(desktop);
    const button = await screen.findByRole('button', {
      name: 'Update the app',
      description: 'This page needs a newer version',
    });
    expect(desktop.app.checkForUpdate).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(button);
    expect(
      await screen.findByText('There is no newer Gurukul Studio yet. Try again later.'),
    ).toBeTruthy();
    expect(desktop.app.installUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(button.hasAttribute('aria-busy')).toBe(false));
  });

  it('installs the update once the check finds it downloaded', async () => {
    const { desktop } = fakeDesktop({
      info: old,
      check: async () => ({ state: 'ready', version: '0.2.0' }),
    });
    show(desktop);
    fireEvent.click(await screen.findByRole('button', { name: 'Update the app' }));
    await waitFor(() => expect(desktop.app.installUpdate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('The update was not installed')).toBeTruthy();
  });

  it('turns into Update ready once the update it asked for has downloaded', async () => {
    const { desktop, downloaded } = fakeDesktop({
      info: old,
      check: async () => ({ state: 'downloading', version: '0.2.0' }),
    });
    show(desktop);
    fireEvent.click(await screen.findByRole('button', { name: 'Update the app' }));
    expect(await screen.findByText(/Update ready appears here/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update the app' })).toBeTruthy();
    downloaded('0.2.0');
    const ready = await screen.findByRole('button', {
      name: 'Update ready',
      description: 'Restart to install 0.2.0',
    });
    expect(screen.queryByRole('button', { name: 'Update the app' })).toBeNull();
    fireEvent.click(ready);
    await waitFor(() => expect(desktop.app.installUpdate).toHaveBeenCalledTimes(1));
    // The install did not happen: back to Update the app, to ask again.
    expect(await screen.findByRole('button', { name: 'Update the app' })).toBeTruthy();
  });

  it('asks for unsaved work to be saved instead of restarting, and keeps the update', async () => {
    const { desktop } = fakeDesktop({
      info: old,
      check: async () => ({ state: 'ready', version: '0.2.0' }),
    });
    const stay = (e: Event) => e.preventDefault();
    window.addEventListener('beforeunload', stay);
    try {
      show(desktop);
      fireEvent.click(await screen.findByRole('button', { name: 'Update the app' }));
      expect(await screen.findByText('Save your work first')).toBeTruthy();
      expect(screen.queryByText('Gurukul Studio is restarting to update.')).toBeNull();
      expect(desktop.app.installUpdate).not.toHaveBeenCalled();
      expect(
        await screen.findByRole('button', { description: 'Restart to install 0.2.0' }),
      ).toBeTruthy();
    } finally {
      window.removeEventListener('beforeunload', stay);
    }
  });

  it('says so when the shell cannot check', async () => {
    const { desktop } = fakeDesktop({
      info: old,
      check: async () => {
        throw new Error('Not available in this version');
      },
    });
    show(desktop);
    fireEvent.click(await screen.findByRole('button', { name: 'Update the app' }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Desktop update check failed', expect.any(Object)),
    );
  });
});

describe('watchUpdates', () => {
  it('watches each bridge once, however often the sidebar is drawn', () => {
    const { desktop } = fakeDesktop();
    const bridge = desktop as unknown as GurukulDesktop;
    const first = watchUpdates(bridge);
    expect(watchUpdates(bridge)).toBe(first);
    expect(desktop.app.onUpdateReady).toHaveBeenCalledTimes(1);
    expect(desktop.app.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('stops telling a listener that unsubscribed', async () => {
    const { desktop, downloaded } = fakeDesktop();
    const watch = watchUpdates(desktop as unknown as GurukulDesktop);
    const listener = vi.fn();
    const stop = watch.subscribe(listener);
    downloaded('0.2.0');
    stop();
    watch.clear();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(watch.get()).toBeNull();
  });
});

describe('checkMessage', () => {
  it.each<[UpdateCheck, 'info' | 'warning', RegExp]>([
    [{ state: 'up_to_date' }, 'info', /no newer/],
    [{ state: 'checking' }, 'info', /downloading/],
    [{ state: 'downloading', version: '0.2.0' }, 'info', /Update ready appears here/],
    [{ state: 'ready', version: '0.2.0' }, 'info', /restarting/],
    [{ state: 'unsupported' }, 'warning', /GitHub/],
    [{ state: 'failed' }, 'warning', /could not check/],
  ])('words %j', (result, tone, text) => {
    const message = checkMessage(result);
    expect(message.tone).toBe(tone);
    expect(message.text).toMatch(text);
  });
});
