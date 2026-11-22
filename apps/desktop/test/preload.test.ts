import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALLS, EVENTS, type GurukulDesktop } from '../src/bridge';
import {
  buildBridge,
  listenVia,
  originsFromArgv,
  shouldExpose,
  type Listen,
} from '../src/preloadApi';

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

/** A fake `ipcRenderer` for events: `emit` delivers as Electron would, event object first. */
function fakeRenderer() {
  const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  return {
    on: vi.fn((name: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(listener);
    }),
    removeListener: vi.fn(
      (name: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        listeners.get(name)?.delete(listener);
      },
    ),
    emit: (name: string, ...args: unknown[]) => {
      for (const listener of listeners.get(name) ?? [])
        listener({ sender: 'ipcRenderer' }, ...args);
    },
    count: (name: string) => listeners.get(name)?.size ?? 0,
  };
}

const noListen: Listen = () => () => undefined;

describe('buildBridge', () => {
  it('makes one function per call, each invoking its channel', async () => {
    const invoke = vi.fn(async (...args: unknown[]) => args);
    const bridge = buildBridge(invoke, noListen);
    const f = { uid: 'u', sessionId: 's', path: 'session.json' };
    await bridge.info();
    await bridge.store.read(f);
    await bridge.store.write(f, '{}');
    await bridge.store.list({ uid: 'u' });
    await bridge.store.remove({ uid: 'u', sessionId: 's' });
    await bridge.agent.send('s', 'Hello');
    await bridge.agent.toolResult('s', 'c1', { text: 'ok' });
    await bridge.agent.ask({ askId: 'a1', prompt: 'Answer it.' });
    await bridge.agent.cancelAsk('a1');
    await bridge.sources.read({ uid: 'u', sessionId: 's' }, 'notes.md');
    const bytes = new Uint8Array([1]);
    await bridge.sources.add({ uid: 'u', sessionId: 's' }, [{ name: 'a.docx', bytes }]);
    await bridge.auth.googleSignIn();
    await bridge.app.installUpdate();
    expect(invoke.mock.calls).toEqual([
      ['gurukul:info'],
      ['gurukul:store.read', f],
      ['gurukul:store.write', f, '{}'],
      ['gurukul:store.list', { uid: 'u' }],
      ['gurukul:store.remove', { uid: 'u', sessionId: 's' }],
      ['gurukul:agent.send', 's', 'Hello'],
      ['gurukul:agent.toolResult', 's', 'c1', { text: 'ok' }],
      ['gurukul:agent.ask', { askId: 'a1', prompt: 'Answer it.' }],
      ['gurukul:agent.cancelAsk', 'a1'],
      ['gurukul:sources.read', { uid: 'u', sessionId: 's' }, 'notes.md'],
      ['gurukul:sources.add', { uid: 'u', sessionId: 's' }, [{ name: 'a.docx', bytes }]],
      ['gurukul:auth.googleSignIn'],
      ['gurukul:app.installUpdate'],
    ]);
    expect(Object.keys(bridge).sort()).toEqual([
      'agent',
      'app',
      'auth',
      'info',
      'sources',
      'store',
    ]);
  });

  it('exposes exactly the calls and subscriptions of the contract', () => {
    const bridge = buildBridge(vi.fn(), noListen) as unknown as Record<string, unknown>;
    const names: string[] = [];
    for (const [key, value] of Object.entries(bridge)) {
      if (typeof value === 'function') names.push(key);
      else for (const leaf of Object.keys(value as object)) names.push(`${key}.${leaf}`);
    }
    expect(names.sort()).toEqual([...CALLS, ...EVENTS].sort());
  });

  it('subscribes on the event channel and hands the handler the payload alone', () => {
    const ipc = fakeRenderer();
    const bridge = buildBridge(vi.fn(), listenVia(ipc));
    const onEvent = vi.fn();
    const onToolCall = vi.fn();
    const onUpdate = vi.fn();
    const stop = bridge.agent.onEvent(onEvent);
    bridge.agent.onToolCall(onToolCall);
    bridge.app.onUpdateReady(onUpdate);
    const text = { type: 'text', sessionId: 's', text: 'Hi' };
    ipc.emit('gurukul-event:agent.onEvent', text, 'extra');
    ipc.emit('gurukul-event:agent.onToolCall', { sessionId: 's', callId: 'c', name: 'get_course' });
    ipc.emit('gurukul-event:app.onUpdateReady', { version: '0.2.0' });
    expect(onEvent.mock.calls).toEqual([[text]]);
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ version: '0.2.0' });

    stop();
    stop();
    expect(ipc.removeListener).toHaveBeenCalledTimes(1);
    ipc.emit('gurukul-event:agent.onEvent', text);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(ipc.count('gurukul-event:agent.onEvent')).toBe(0);
  });

  it('keeps each subscription separate', () => {
    const ipc = fakeRenderer();
    const bridge = buildBridge(vi.fn(), listenVia(ipc));
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = bridge.agent.onEvent(first);
    bridge.agent.onEvent(second);
    stopFirst();
    ipc.emit('gurukul-event:agent.onEvent', { type: 'text', sessionId: 's', text: 'x' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('refuses a subscription without a handler function', () => {
    const listen = vi.fn(noListen);
    const bridge = buildBridge(vi.fn(), listen);
    expect(() => bridge.agent.onEvent('not a function' as never)).toThrow(TypeError);
    expect(listen).not.toHaveBeenCalled();
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
    const ipc = fakeRenderer();
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke, on: ipc.on, removeListener: ipc.removeListener },
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
    return { exposeInMainWorld, invoke, ipc };
  }

  it('exposes window.gurukulDesktop on the allowed origin, calling through ipcRenderer', async () => {
    const { exposeInMainWorld, invoke, ipc } = await load(ORIGINS[0] as string);
    expect(exposeInMainWorld).toHaveBeenCalledWith('gurukulDesktop', expect.any(Object));
    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as GurukulDesktop;
    await expect(bridge.info()).resolves.toBe('answer');
    expect(invoke).toHaveBeenCalledWith('gurukul:info');
    const handler = vi.fn();
    bridge.app.onUpdateReady(handler);
    ipc.emit('gurukul-event:app.onUpdateReady', { version: '0.2.0' });
    expect(handler).toHaveBeenCalledWith({ version: '0.2.0' });
  });

  it('exposes nothing on another origin', async () => {
    const { exposeInMainWorld } = await load('https://evil.example');
    expect(exposeInMainWorld).not.toHaveBeenCalled();
  });
});
