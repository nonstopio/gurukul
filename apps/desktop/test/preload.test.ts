import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBridge, originsFromArgv, shouldExpose } from '../src/preloadApi';

const ORIGINS = ['https://gurukul.nonstopio.com'];

describe('originsFromArgv', () => {
  it('reads the origins flag', () => {
    expect(
      originsFromArgv(['electron', '--gurukul-origins=http://localhost:5173,https://a.example']),
    ).toEqual(['http://localhost:5173', 'https://a.example']);
  });

  it('reads no origins when the flag is missing or empty', () => {
    expect(originsFromArgv(['electron'])).toEqual([]);
    expect(originsFromArgv(['--gurukul-origins='])).toEqual([]);
  });
});

describe('shouldExpose', () => {
  it('exposes the bridge to the top frame of an allowed origin only', () => {
    const top = { location: { origin: ORIGINS[0] as string } } as {
      top?: unknown;
      location: { origin: string };
    };
    top.top = top;
    expect(shouldExpose(top as { top: unknown; location: { origin: string } }, ORIGINS)).toBe(true);
    expect(shouldExpose({ top: {}, location: { origin: ORIGINS[0] as string } }, ORIGINS)).toBe(
      false,
    );
    const other = { location: { origin: 'https://evil.example' } } as {
      top?: unknown;
      location: { origin: string };
    };
    other.top = other;
    expect(shouldExpose(other as { top: unknown; location: { origin: string } }, ORIGINS)).toBe(
      false,
    );
  });
});

describe('buildBridge', () => {
  it('makes one function per call, each invoking its channel', async () => {
    const invoke = vi.fn(async (...args: unknown[]) => args);
    const bridge = buildBridge(invoke);
    const f = { uid: 'u', sessionId: 's', path: 'session.json' };
    await bridge.info();
    await bridge.store.read(f);
    await bridge.store.write(f, '{}');
    await bridge.store.list({ uid: 'u' });
    await bridge.store.remove({ uid: 'u', sessionId: 's' });
    expect(invoke.mock.calls).toEqual([
      ['gurukul:info'],
      ['gurukul:store.read', f],
      ['gurukul:store.write', f, '{}'],
      ['gurukul:store.list', { uid: 'u' }],
      ['gurukul:store.remove', { uid: 'u', sessionId: 's' }],
    ]);
    expect(Object.keys(bridge).sort()).toEqual(['info', 'store']);
  });
});

describe('preload', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.doUnmock('electron');
  });

  async function load(origin: string) {
    const exposeInMainWorld = vi.fn();
    const invoke = vi.fn(async () => 'answer');
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke },
    }));
    const win = { location: { origin } } as { top?: unknown; location: { origin: string } };
    win.top = win;
    vi.stubGlobal('window', win);
    const argv = process.argv;
    process.argv = [...argv, `--gurukul-origins=${ORIGINS.join(',')}`];
    try {
      await import('../src/preload');
    } finally {
      process.argv = argv;
    }
    return { exposeInMainWorld, invoke };
  }

  it('exposes window.gurukulDesktop on the allowed origin, calling through ipcRenderer', async () => {
    const { exposeInMainWorld, invoke } = await load(ORIGINS[0] as string);
    expect(exposeInMainWorld).toHaveBeenCalledWith('gurukulDesktop', expect.any(Object));
    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as { info(): Promise<unknown> };
    await expect(bridge.info()).resolves.toBe('answer');
    expect(invoke).toHaveBeenCalledWith('gurukul:info');
  });

  it('exposes nothing on another origin', async () => {
    const { exposeInMainWorld } = await load('https://evil.example');
    expect(exposeInMainWorld).not.toHaveBeenCalled();
  });
});
