import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_BRIDGE_VERSION,
  bridgeFailure,
  connectDesktop,
  desktopBridge,
  isDesktop,
  isSupported,
  useDesktop,
  type DesktopInfo,
  type GurukulDesktop,
} from '../src/desktop/bridge';

const INFO: DesktopInfo = { bridgeVersion: 5, appVersion: '0.1.0', platform: 'darwin' };

/** A stand-in for the bridge: only `info` is called by the facade. */
function fakeDesktop(info: () => Promise<DesktopInfo> = async () => INFO): GurukulDesktop {
  return { info: vi.fn(info) } as unknown as GurukulDesktop;
}

function install(value: unknown) {
  (window as { gurukulDesktop?: unknown }).gurukulDesktop = value;
}

afterEach(() => {
  delete (window as { gurukulDesktop?: unknown }).gurukulDesktop;
  vi.restoreAllMocks();
});

describe('desktopBridge', () => {
  it('is null in a browser', () => {
    expect(desktopBridge()).toBeNull();
    expect(isDesktop()).toBe(false);
  });

  it('is the bridge inside the desktop app', () => {
    const desktop = fakeDesktop();
    install(desktop);
    expect(desktopBridge()).toBe(desktop);
    expect(isDesktop()).toBe(true);
  });

  it.each([
    ['a string', 'gurukul'],
    ['null', null],
    ['an object without info', { store: {} }],
    ['an object whose info is not a function', { info: 1 }],
  ])('ignores %s at that name', (_label, value) => {
    install(value);
    expect(desktopBridge()).toBeNull();
  });
});

describe('connectDesktop', () => {
  it('says browser without a bridge', async () => {
    await expect(connectDesktop()).resolves.toEqual({ status: 'browser' });
  });

  it('is ready when the shell’s bridge is new enough', async () => {
    const desktop = fakeDesktop(async () => ({
      ...INFO,
      bridgeVersion: REQUIRED_BRIDGE_VERSION + 1,
    }));
    install(desktop);
    await expect(connectDesktop()).resolves.toEqual({
      status: 'ready',
      info: { ...INFO, bridgeVersion: REQUIRED_BRIDGE_VERSION + 1 },
      desktop,
    });
  });

  it('asks for an update when the shell’s bridge is older than this site needs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const old = { ...INFO, bridgeVersion: REQUIRED_BRIDGE_VERSION - 1 };
    const desktop = fakeDesktop(async () => old);
    await expect(connectDesktop(desktop)).resolves.toEqual({
      status: 'needs_update',
      info: old,
      desktop,
    });
    expect(warn).toHaveBeenCalledWith('Desktop app needs update', {
      bridgeVersion: REQUIRED_BRIDGE_VERSION - 1,
      required: REQUIRED_BRIDGE_VERSION,
    });
  });

  it('fails when the shell does not answer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const desktop = fakeDesktop(async () => {
      throw new Error('gone');
    });
    await expect(connectDesktop(desktop)).resolves.toEqual({ status: 'failed' });
    expect(error).toHaveBeenCalledWith('Desktop app did not answer', expect.any(Object));
  });

  it('compares versions with at least, not equal', () => {
    expect(isSupported({ ...INFO, bridgeVersion: REQUIRED_BRIDGE_VERSION })).toBe(true);
    expect(isSupported({ ...INFO, bridgeVersion: REQUIRED_BRIDGE_VERSION - 1 })).toBe(false);
  });
});

describe('useDesktop', () => {
  it('says browser at once, and never asks', () => {
    const { result } = renderHook(() => useDesktop());
    expect(result.current).toEqual({ status: 'browser' });
  });

  it('checks, then is ready, inside the app', async () => {
    const desktop = fakeDesktop();
    install(desktop);
    const { result } = renderHook(() => useDesktop());
    expect(result.current).toEqual({ status: 'checking' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(desktop.info).toHaveBeenCalledTimes(1);
  });

  it('drops a late answer after it unmounts', async () => {
    let answer: (info: DesktopInfo) => void = () => undefined;
    const desktop = fakeDesktop(() => new Promise<DesktopInfo>((resolve) => (answer = resolve)));
    install(desktop);
    const { result, unmount } = renderHook(() => useDesktop());
    unmount();
    await act(async () => answer(INFO));
    expect(result.current).toEqual({ status: 'checking' });
  });
});

describe('bridgeFailure', () => {
  const remote = (message: string) =>
    new Error(`Error invoking remote method 'gurukul:agent.start': Error: ${message}`);

  it.each([
    [remote('Not available in this version'), 'not_available'],
    [remote('Not allowed'), 'refused'],
    [remote('Invalid arguments'), 'invalid'],
    [remote('store.write failed (EACCES)'), 'failed'],
    ['not an error', 'failed'],
  ])('reads %s as %s', (error, kind) => {
    expect(bridgeFailure(error)).toBe(kind);
  });
});
