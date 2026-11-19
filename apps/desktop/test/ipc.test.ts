import { describe, expect, it, vi } from 'vitest';
import { CALLS, channel } from '../src/bridge';
import { createHandlers } from '../src/handlers';
import {
  INVALID,
  REFUSED,
  checkSender,
  registerHandlers,
  type InvokeEventLike,
  type IpcLike,
} from '../src/ipc';
import { createLogger } from '../src/log';
import { SessionFileError, type SessionStore } from '../src/store';

const ORIGINS = ['https://gurukul.nonstopio.com'];
const top = (origin = ORIGINS[0] as string): InvokeEventLike => ({
  senderFrame: { origin, parent: null },
});

function fakeStore(overrides: Partial<SessionStore> = {}): SessionStore {
  return {
    read: vi.fn(async () => 'text'),
    write: vi.fn(async () => undefined),
    list: vi.fn(async () => ['a']),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

function setup(store = fakeStore()) {
  const listeners = new Map<string, (event: InvokeEventLike, ...args: unknown[]) => unknown>();
  const ipc: IpcLike = { handle: (name, listener) => void listeners.set(name, listener) };
  const sink = vi.fn();
  registerHandlers(
    ipc,
    createHandlers({ appVersion: '1.2.3', platform: 'darwin', store }),
    ORIGINS,
    createLogger({ sink }),
  );
  const call = (name: string, event: InvokeEventLike, ...args: unknown[]) => {
    const listener = listeners.get(channel(name as (typeof CALLS)[number]));
    if (!listener) throw new Error('no listener');
    return listener(event, ...args) as Promise<unknown>;
  };
  return { listeners, call, sink, store };
}

describe('checkSender', () => {
  it('accepts the top frame of an allowed origin', () => {
    expect(checkSender(top(), ORIGINS)).toEqual({ ok: true });
  });

  it('refuses a destroyed frame, a subframe and another origin', () => {
    expect(checkSender({ senderFrame: null }, ORIGINS)).toEqual({ ok: false, reason: 'no frame' });
    expect(
      checkSender({ senderFrame: { origin: ORIGINS[0] as string, parent: {} } }, ORIGINS),
    ).toEqual({ ok: false, reason: 'subframe' });
    expect(checkSender(top('https://evil.example'), ORIGINS)).toEqual({
      ok: false,
      reason: 'origin',
    });
  });
});

describe('registerHandlers', () => {
  it('registers one channel per call', () => {
    expect([...setup().listeners.keys()]).toEqual(CALLS.map(channel));
  });

  it('answers info with the bridge version, app version and platform', async () => {
    await expect(setup().call('info', top())).resolves.toEqual({
      bridgeVersion: 1,
      appVersion: '1.2.3',
      platform: 'darwin',
    });
  });

  it('passes store calls through to the store', async () => {
    const { call, store } = setup();
    const f = { uid: 'u1', sessionId: 's1', path: 'session.json' };
    await expect(call('store.read', top(), f)).resolves.toBe('text');
    await call('store.write', top(), f, '{}');
    await expect(call('store.list', top(), { uid: 'u1' })).resolves.toEqual(['a']);
    await call('store.list', top(), { uid: 'u1', sessionId: 's1' });
    await call('store.remove', top(), { uid: 'u1', sessionId: 's1' });
    await call('store.remove', top(), f);
    expect(store.read).toHaveBeenCalledWith(f);
    expect(store.write).toHaveBeenCalledWith(f, '{}');
    expect(store.list).toHaveBeenCalledWith({ uid: 'u1', sessionId: 's1' });
    expect(store.remove).toHaveBeenCalledWith(f);
  });

  it('refuses a call from another origin before the handler runs, and logs no argument', async () => {
    const { call, store, sink } = setup();
    const f = { uid: 'u1', sessionId: 's1', path: 'secret.json' };
    await expect(call('store.read', top('https://evil.example'), f)).rejects.toThrow(REFUSED);
    expect(store.read).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge call refused', {
      call: 'store.read',
      reason: 'origin',
    });
  });

  it('refuses a call from a subframe of the allowed origin', async () => {
    const event = { senderFrame: { origin: ORIGINS[0] as string, parent: {} } };
    await expect(setup().call('info', event)).rejects.toThrow(REFUSED);
  });

  it.each([
    ['no arguments', 'store.read', []],
    ['an extra field', 'store.read', [{ uid: 'u', sessionId: 's', path: 'p', extra: 1 }]],
    ['a number for a name', 'store.read', [{ uid: 1, sessionId: 's', path: 'p' }]],
    ['no data', 'store.write', [{ uid: 'u', sessionId: 's', path: 'p' }]],
    ['an empty id', 'store.list', [{ uid: '' }]],
    ['arguments to info', 'info', ['x']],
  ])('refuses %s', async (_label, name, args) => {
    const { call, sink } = setup();
    await expect(call(name, top(), ...args)).rejects.toThrow(INVALID);
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge call refused', {
      call: name,
      reason: 'arguments',
    });
  });

  it('turns a refused name into a short message and a warning', async () => {
    const store = fakeStore({
      read: vi.fn(async () => {
        throw new SessionFileError('Invalid session file name');
      }),
    });
    const { call, sink } = setup(store);
    await expect(
      call('store.read', top(), { uid: 'u', sessionId: 's', path: 'p' }),
    ).rejects.toThrow(/^Invalid session file name$/);
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge call refused', {
      call: 'store.read',
      reason: 'Invalid session file name',
    });
  });

  it('turns a system error into the call name and code, without the path', async () => {
    const store = fakeStore({
      write: vi.fn(async () => {
        throw Object.assign(new Error("EACCES: open '/home/meera/x'"), { code: 'EACCES' });
      }),
    });
    const { call, sink } = setup(store);
    await expect(
      call('store.write', top(), { uid: 'u', sessionId: 's', path: 'p' }, 'x'),
    ).rejects.toThrow(/^store\.write failed \(EACCES\)$/);
    expect(sink).toHaveBeenCalledWith('error', 'Bridge call failed', {
      call: 'store.write',
      error: { name: 'Error', code: 'EACCES' },
    });
  });

  it('turns any other failure into the call name alone', async () => {
    const store = fakeStore({
      list: vi.fn(async () => {
        throw new Error('boom');
      }),
      remove: vi.fn(async () => {
        throw 'not an error';
      }),
    });
    const { call } = setup(store);
    await expect(call('store.list', top(), { uid: 'u' })).rejects.toThrow(/^store\.list failed$/);
    await expect(call('store.remove', top(), { uid: 'u', sessionId: 's' })).rejects.toThrow(
      /^store\.remove failed$/,
    );
  });
});
