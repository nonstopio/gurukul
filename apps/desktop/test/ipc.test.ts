import { describe, expect, it, vi } from 'vitest';
import { CALLS, channel } from '../src/bridge';
import { createHandlers } from '../src/handlers';
import {
  INVALID,
  REFUSED,
  checkSender,
  notAvailable,
  registerHandlers,
  type InvokeEventLike,
  type IpcLike,
} from '../src/ipc';
import { createLogger } from '../src/log';
import type { AgentManager } from '../src/agent/manager';
import { AgentNotRunningError } from '../src/agent/run';
import { SourcesError, type SourcesManager } from '../src/sources';
import { SessionFileError, type SessionStore } from '../src/store';
import type { Updates } from '../src/updates';

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

const signedIn = { ok: true, idToken: 'header.payload.signature' } as const;

function fakeUpdates(): Updates {
  return {
    start: vi.fn(),
    check: vi.fn(async () => ({ state: 'ready', version: '0.2.0' }) as const),
    checkFromMenu: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
    isInstalling: vi.fn(() => false),
  };
}

function fakeAgent(overrides: Partial<AgentManager> = {}): AgentManager {
  return {
    status: vi.fn(async () => ({ state: 'not_installed' as const })),
    start: vi.fn(async () => ({ ok: true as const, agentSessionId: 'a1' })),
    send: vi.fn(),
    stop: vi.fn(),
    close: vi.fn(async () => undefined),
    forget: vi.fn(async () => undefined),
    toolResult: vi.fn(),
    ask: vi.fn(async () => ({ ok: true as const, text: '{"correct":["A"]}' })),
    cancelAsk: vi.fn(),
    closeAll: vi.fn(),
    cancelAsks: vi.fn(),
    ...overrides,
  };
}

const upload = (name: string) => ({ name, bytes: new Uint8Array([1]) });

function fakeSources(overrides: Partial<SourcesManager> = {}): SourcesManager {
  return {
    ensure: vi.fn(async () => ({ path: '~/Material', files: [] })),
    list: vi.fn(async () => null),
    reveal: vi.fn(async () => undefined),
    read: vi.fn(async () => 'notes'),
    add: vi.fn(async () => ({ added: ['a.docx'], folder: { path: '~/Material', files: [] } })),
    folderOf: vi.fn(async () => null),
    forget: vi.fn(async () => undefined),
    prune: vi.fn(async () => 0),
    ...overrides,
  };
}

function setup(
  store = fakeStore(),
  agent = fakeAgent(),
  googleSignIn = vi.fn(async () => signedIn),
  updates = fakeUpdates(),
  sources = fakeSources(),
) {
  const listeners = new Map<string, (event: InvokeEventLike, ...args: unknown[]) => unknown>();
  const ipc: IpcLike = { handle: (name, listener) => void listeners.set(name, listener) };
  const sink = vi.fn();
  registerHandlers(
    ipc,
    createHandlers({
      appVersion: '1.2.3',
      platform: 'darwin',
      store,
      agent,
      sources,
      googleSignIn,
      updates,
    }),
    ORIGINS,
    createLogger({ sink }),
  );
  const call = (name: string, event: InvokeEventLike, ...args: unknown[]) => {
    const listener = listeners.get(channel(name as (typeof CALLS)[number]));
    if (!listener) throw new Error('no listener');
    return listener(event, ...args) as Promise<unknown>;
  };
  return { listeners, call, sink, store, agent, googleSignIn, updates, sources };
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
      bridgeVersion: 4,
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

  it('forgets the Sources choice of a whole session it removes, not of one file', async () => {
    const { call, sources } = setup();
    await call('store.remove', top(), { uid: 'u1', sessionId: 's1', path: 'session.json' });
    expect(sources.forget).not.toHaveBeenCalled();
    await call('store.remove', top(), { uid: 'u1', sessionId: 's1' });
    expect(sources.forget).toHaveBeenCalledWith({ uid: 'u1', sessionId: 's1' });
  });

  it('answers auth.googleSignIn with what the sign-in gave, and refuses arguments to it', async () => {
    const { call, googleSignIn } = setup();
    await expect(call('auth.googleSignIn', top())).resolves.toEqual(signedIn);
    expect(googleSignIn).toHaveBeenCalledTimes(1);
    await expect(call('auth.googleSignIn', top(), 'client')).rejects.toThrow(INVALID);
    await expect(call('auth.googleSignIn', top('https://evil.example'))).rejects.toThrow(REFUSED);
    expect(googleSignIn).toHaveBeenCalledTimes(1);
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

describe('app calls', () => {
  it('ask the updater, and refuse arguments', async () => {
    const { call, updates } = setup();
    await expect(call('app.checkForUpdate', top())).resolves.toEqual({
      state: 'ready',
      version: '0.2.0',
    });
    await expect(call('app.installUpdate', top())).resolves.toBeUndefined();
    expect(updates.install).toHaveBeenCalledTimes(1);
    await expect(call('app.installUpdate', top(), 'now')).rejects.toThrow(INVALID);
    await expect(call('app.checkForUpdate', top('https://evil.example'))).rejects.toThrow(REFUSED);
  });
});

describe('calls a later item builds', () => {
  const ref = { uid: 'u1', sessionId: 's1' };
  const uuid = '0b6e4f3e-6b7a-4c1e-9d55-2f1a3c4b5d6e';
  const start = {
    uid: 'u1',
    sessionId: 's1',
    systemPrompt: 'You help an Educator.',
    skills: [
      {
        name: 'humanize',
        files: [
          { path: 'SKILL.md', text: '# Humanize' },
          { path: 'references/words.md', text: 'words' },
        ],
      },
    ],
    tools: [
      { name: 'get_course', description: 'Reads the course.', inputSchema: { type: 'object' } },
    ],
    resumeId: null,
  };

  const agentCalls: [string, unknown[], keyof AgentManager][] = [
    ['agent.status', [], 'status'],
    ['agent.start', [start], 'start'],
    ['agent.start', [{ ...start, resumeId: uuid }], 'start'],
    ['agent.start', [{ ...start, model: 'opus', effort: 'low' }], 'start'],
    ['agent.send', ['s1', 'Simplify the rebase chapter'], 'send'],
    ['agent.stop', ['s1'], 'stop'],
    ['agent.close', ['s1'], 'close'],
    ['agent.forget', [uuid], 'forget'],
    ['agent.toolResult', ['s1', 'call-1', { text: '{}' }], 'toolResult'],
    [
      'agent.toolResult',
      ['s1', 'call-1', { error: 'A lesson holds at most 60 blocks.' }],
      'toolResult',
    ],
    ['agent.ask', [{ askId: 'ask-1', prompt: 'Answer this question.' }], 'ask'],
    ['agent.cancelAsk', ['ask-1'], 'cancelAsk'],
  ];

  it.each(agentCalls)('passes %s through to the agent bridge', async (name, args, method) => {
    const { call, agent } = setup();
    await call(name, top(), ...args);
    expect(agent[method]).toHaveBeenCalledWith(...args);
  });

  it('answers agent.start and agent.status with the agent bridge’s result', async () => {
    const { call } = setup();
    await expect(call('agent.start', top(), start)).resolves.toEqual({
      ok: true,
      agentSessionId: 'a1',
    });
    await expect(call('agent.status', top())).resolves.toEqual({ state: 'not_installed' });
    await expect(call('agent.ask', top(), { askId: 'a', prompt: 'p' })).resolves.toEqual({
      ok: true,
      text: '{"correct":["A"]}',
    });
  });

  it('says agent.send failed (not_running) for a session with no process', async () => {
    const agent = fakeAgent({
      send: vi.fn(() => {
        throw new AgentNotRunningError('Not running');
      }),
    });
    const { call } = setup(fakeStore(), agent);
    await expect(call('agent.send', top(), 's1', 'Hello')).rejects.toThrow(
      /^agent\.send failed \(not_running\)$/,
    );
  });

  const sourcesCalls: [string, unknown[], keyof SourcesManager][] = [
    ['sources.ensure', [ref], 'ensure'],
    ['sources.ensure', [{ ...ref, suggestedName: 'git-basics' }], 'ensure'],
    ['sources.list', [ref], 'list'],
    ['sources.reveal', [ref], 'reveal'],
    ['sources.read', [ref, 'Rebase notes.md'], 'read'],
    ['sources.add', [ref, [{ name: 'Plan.docx', bytes: new Uint8Array([1, 2]) }]], 'add'],
  ];

  it.each(sourcesCalls)('passes %s through to the Sources folder', async (name, args, method) => {
    const { call, sources } = setup();
    await call(name, top(), ...args);
    expect(sources[method]).toHaveBeenCalledWith(...args);
  });

  it('answers sources calls with what the Sources folder gives', async () => {
    const { call } = setup();
    await expect(call('sources.ensure', top(), ref)).resolves.toEqual({
      path: '~/Material',
      files: [],
    });
    await expect(call('sources.list', top(), ref)).resolves.toBeNull();
    await expect(call('sources.read', top(), ref, 'a.md')).resolves.toBe('notes');
  });

  it('passes a Sources refusal on as its sentence, logging the reason only', async () => {
    const sources = fakeSources({
      read: vi.fn(async () => {
        throw new SourcesError('notText', 'This file is not plain text.');
      }),
    });
    const { call, sink } = setup(fakeStore(), fakeAgent(), undefined, undefined, sources);
    await expect(call('sources.read', top(), ref, 'slides.pdf')).rejects.toThrow(
      /^This file is not plain text\.$/,
    );
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge call refused', {
      call: 'sources.read',
      reason: 'notText',
    });
  });

  it('builds every call of the contract', () => {
    const built = CALLS.filter(
      (n) =>
        n !== 'info' &&
        !n.startsWith('store.') &&
        n !== 'auth.googleSignIn' &&
        !n.startsWith('app.'),
    );
    expect(new Set([...agentCalls, ...sourcesCalls].map(([n]) => n))).toEqual(new Set(built));
  });

  it.each([
    [
      'a skill name that climbs out',
      'agent.start',
      [{ ...start, skills: [{ name: '..', files: start.skills[0]?.files }] }],
    ],
    [
      'a skill file too deep',
      'agent.start',
      [{ ...start, skills: [{ name: 'h', files: [{ path: 'a/b/c.md', text: '' }] }] }],
    ],
    ['a skill with no files', 'agent.start', [{ ...start, skills: [{ name: 'h', files: [] }] }]],
    ['an empty prompt', 'agent.start', [{ ...start, systemPrompt: '' }]],
    [
      'a tool name with capitals',
      'agent.start',
      [{ ...start, tools: [{ ...start.tools[0], name: 'GetCourse' }] }],
    ],
    ['a resume id that is a path', 'agent.start', [{ ...start, resumeId: '../../x' }]],
    [
      'a model that is a flag',
      'agent.start',
      [{ ...start, model: '--dangerously-skip-permissions' }],
    ],
    ['an effort the list lacks', 'agent.start', [{ ...start, effort: 'max' }]],
    ['a Sources path', 'agent.start', [{ ...start, sourcesDir: '/Users/x' }]],
    ['an empty message', 'agent.send', ['s1', '']],
    ['a message without a session', 'agent.send', ['Hello']],
    ['a Claude session id that is a path', 'agent.forget', ['../projects']],
    [
      'a tool result with both text and error',
      'agent.toolResult',
      ['s1', 'c', { text: 'a', error: 'b' }],
    ],
    ['a tool result that is a string', 'agent.toolResult', ['s1', 'c', 'ok']],
    ['an empty ask', 'agent.ask', [{ askId: 'a', prompt: '' }]],
    ['an ask longer than the limit', 'agent.ask', [{ askId: 'a', prompt: 'x'.repeat(65_537) }]],
    ['an ask with a schema', 'agent.ask', [{ askId: 'a', prompt: 'p', schema: {} }]],
    ['an ask without an id', 'agent.ask', [{ prompt: 'p' }]],
    ['a cancel without an id', 'agent.cancelAsk', ['']],
    ['a suggested folder name with a slash', 'sources.ensure', [{ ...ref, suggestedName: 'a/b' }]],
    ['a Sources folder path', 'sources.list', [{ ...ref, path: '/etc' }]],
    ['a source name with a slash', 'sources.read', [ref, '../secret.md']],
    ['a source name of ..', 'sources.read', [ref, '..']],
    ['no files to add', 'sources.add', [ref, []]],
    ['too many files to add', 'sources.add', [ref, Array(11).fill(upload('a.docx'))]],
    ['a file name with a slash', 'sources.add', [ref, [upload('../a.docx')]]],
    ['a hidden file name', 'sources.add', [ref, [upload('.env')]]],
    [
      'a file of 25 MB and a byte',
      'sources.add',
      [ref, [{ name: 'a.pdf', bytes: new Uint8Array(26_214_401) }]],
    ],
    ['file bytes that are text', 'sources.add', [ref, [{ name: 'a.txt', bytes: 'text' }]]],
    ['a file with a path', 'sources.add', [ref, [{ ...upload('a.txt'), path: '/etc/a' }]]],
    ['arguments to googleSignIn', 'auth.googleSignIn', ['client']],
  ])('refuses %s', async (_label, name, args) => {
    const { call } = setup();
    await expect(call(name, top(), ...args)).rejects.toThrow(INVALID);
  });

  it('checks the sender before saying a call is not available', async () => {
    const { call } = setup();
    await expect(call('agent.status', top('https://evil.example'))).rejects.toThrow(REFUSED);
  });

  it('checks a call not built yet, then refuses it as not available', async () => {
    // Every version-1 call is built; a later one starts as `notAvailable(schema)`.
    const listeners = new Map<string, (event: InvokeEventLike, ...args: unknown[]) => unknown>();
    const sink = vi.fn();
    const handlers = createHandlers({
      appVersion: '1.2.3',
      platform: 'darwin',
      store: fakeStore(),
      agent: fakeAgent(),
      sources: fakeSources(),
      googleSignIn: vi.fn(async () => signedIn),
      updates: fakeUpdates(),
    });
    registerHandlers(
      { handle: (name, listener) => void listeners.set(name, listener) },
      { ...handlers, 'sources.list': notAvailable(handlers['sources.list'].args) },
      ORIGINS,
      createLogger({ sink }),
    );
    const list = listeners.get(channel('sources.list'));
    await expect(list?.(top(), ref)).rejects.toThrow(/^Not available in this version$/);
    await expect(list?.(top(), { ...ref, path: '/etc' })).rejects.toThrow(INVALID);
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge call refused', {
      call: 'sources.list',
      reason: 'not available',
    });
  });
});
