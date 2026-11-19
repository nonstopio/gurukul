import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_TIMEOUT_MS,
  INIT_TIMEOUT_MS,
  createAgentManager,
  isSignedIn,
} from '../../src/agent/manager';
import type { AgentPlatform, SpawnFn } from '../../src/agent/platform';
import type { AgentStartRequest } from '../../src/bridge';
import { createLogger } from '../../src/log';
import { fakeChild, fakeClock, fakePlatform } from './fakes';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul-agent-manager-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const request = (overrides: Partial<AgentStartRequest> = {}): AgentStartRequest => ({
  uid: 'u1',
  sessionId: 's1',
  systemPrompt: 'Prompt',
  skills: [],
  tools: [],
  resumeId: null,
  ...overrides,
});

type Fake = ReturnType<typeof fakeChild>;

/**
 * A platform where `claude` is `/bin/claude`, answers `--version` and `auth status` as told, and
 * every other start is a fake session process the test drives.
 */
function setup({
  version = '2.1.328 (Claude Code)\n',
  versionCode = 0 as number | null,
  auth = '{"loggedIn": true}',
  sources = null as string | null,
  platform = {} as Partial<AgentPlatform>,
} = {}) {
  const time = fakeClock();
  const sessions: Fake[] = [];
  const spawn = vi.fn<SpawnFn>((_file, args) => {
    const fake = fakeChild();
    if (args[0] === '--version' || args[0] === 'auth') {
      queueMicrotask(() => {
        if (versionCode === null && args[0] === '--version') {
          fake.fail(new Error('ENOENT'));
          return;
        }
        fake.printRaw(args[0] === '--version' ? version : auth);
        fake.close(args[0] === '--version' ? versionCode : 0);
      });
    } else {
      sessions.push(fake);
    }
    return fake.child;
  });
  const closeEndpoint = vi.fn(async () => undefined);
  const sink = vi.fn();
  const send = vi.fn(() => true);
  const p = fakePlatform({
    env: { PATH: '/bin', ANTHROPIC_API_KEY: 'x' },
    isExecutable: vi.fn(async (f: string) => f === '/bin/claude'),
    spawn,
    clock: time.clock,
    listen: vi.fn(async () => ({ port: 4000, close: closeEndpoint })),
    ...platform,
  });
  const sourcesFolder = vi.fn(async () => sources);
  const manager = createAgentManager({
    platform: p,
    sessionsRoot: path.join(root, 'sessions'),
    events: { send },
    sourcesFolder,
    log: createLogger({ sink }),
  });
  /** Answers the newest session's initialize. */
  const answerInit = async (tokenSource = 'claude.ai', count = 1) => {
    await vi.waitFor(() => {
      const fake = sessions[count - 1];
      const init = fake?.messages().find((m) => m.type === 'control_request');
      if (!fake || !init) throw new Error('not started yet');
      fake.print({
        type: 'control_response',
        response: { request_id: init.request_id, response: { account: { tokenSource } } },
      });
    });
    return sessions[count - 1] as Fake;
  };
  return { manager, spawn, sessions, time, sink, send, closeEndpoint, sourcesFolder, answerInit };
}

describe('isSignedIn', () => {
  it('reads loggedIn from auth status', () => {
    expect(isSignedIn('{"loggedIn": true, "email": "meera@example.com"}')).toBe(true);
    expect(isSignedIn('{"loggedIn": false}')).toBe(false);
    expect(isSignedIn('Logged in')).toBe(false);
  });
});

describe('status', () => {
  it('is ready, with the allow-listed environment and the home folder', async () => {
    const { manager, spawn } = setup();
    await expect(manager.status()).resolves.toEqual({ state: 'ready', version: '2.1.328' });
    expect(spawn).toHaveBeenCalledWith('/bin/claude', ['auth', 'status'], {
      cwd: '/home/meera',
      env: { PATH: '/bin' },
    });
  });

  it('is not installed when there is no claude, or it will not run', async () => {
    await expect(
      setup({ platform: { isExecutable: async () => false } }).manager.status(),
    ).resolves.toEqual({ state: 'not_installed' });
    await expect(setup({ versionCode: 1 }).manager.status()).resolves.toEqual({
      state: 'not_installed',
    });
    await expect(setup({ versionCode: null }).manager.status()).resolves.toEqual({
      state: 'not_installed',
    });
  });

  it('is too old below the minimum, or when it prints no version', async () => {
    await expect(setup({ version: '2.0.5 (Claude Code)' }).manager.status()).resolves.toEqual({
      state: 'too_old',
      version: '2.0.5',
      minimumVersion: '2.1.328',
    });
    await expect(setup({ version: 'Claude Code' }).manager.status()).resolves.toEqual({
      state: 'too_old',
      version: 'unknown',
      minimumVersion: '2.1.328',
    });
  });

  it('is not signed in when auth status says so, or does not answer', async () => {
    await expect(setup({ auth: '{"loggedIn": false}' }).manager.status()).resolves.toEqual({
      state: 'not_signed_in',
      version: '2.1.328',
    });
    const slow = setup({
      platform: {
        spawn: vi.fn<SpawnFn>((_f, args) => {
          const fake = fakeChild();
          if (args[0] === '--version') {
            queueMicrotask(() => {
              fake.printRaw('2.1.328');
              fake.close(0);
            });
          }
          return fake.child;
        }),
      },
    });
    const status = slow.manager.status();
    await vi.waitFor(() => expect(slow.time.pending()).toBe(1));
    slow.time.advance(COMMAND_TIMEOUT_MS);
    await expect(status).resolves.toEqual({ state: 'not_signed_in', version: '2.1.328' });
  });
});

describe('start', () => {
  it('refuses with the reason when claude cannot run, starting nothing', async () => {
    const { manager, sink } = setup({ version: '1.0.0' });
    await expect(manager.start(request())).resolves.toEqual({
      ok: false,
      error: { code: 'too_old', version: '1.0.0', minimumVersion: '2.1.328' },
    });
    expect(sink).toHaveBeenCalledWith('warn', 'Agent not started', { reason: 'too_old' });
  });

  it('starts once per session: a second start, during or after, answers the same', async () => {
    const { manager, spawn, answerInit, sink } = setup();
    const first = manager.start(request());
    const during = manager.start(request());
    await answerInit();
    const id = '00000000-0000-4000-8000-000000000001';
    await expect(first).resolves.toEqual({ ok: true, agentSessionId: id });
    await expect(during).resolves.toEqual({ ok: true, agentSessionId: id });
    await expect(manager.start(request())).resolves.toEqual({ ok: true, agentSessionId: id });
    expect(spawn.mock.calls.filter(([, a]) => a[0] === '-p')).toHaveLength(1);
    expect(sink).toHaveBeenCalledWith('info', 'Agent started', { sessionId: 's1', resumed: false });
  });

  it('resumes with the id it is given, in the chosen Sources folder', async () => {
    const { manager, spawn, answerInit, sourcesFolder } = setup({ sources: root });
    const resumeId = '0b6e4f3e-6b7a-4c1e-9d55-2f1a3c4b5d6e';
    const started = manager.start(request({ resumeId }));
    await answerInit();
    await expect(started).resolves.toEqual({ ok: true, agentSessionId: resumeId });
    const [, args, options] = spawn.mock.calls.find(([, a]) => a[0] === '-p') ?? [];
    expect(args?.slice(-2)).toEqual(['--resume', resumeId]);
    expect(options).toEqual({
      cwd: root,
      env: { PATH: '/bin', GURUKUL_BRIDGE_TOKEN: 'a'.repeat(64) },
    });
    expect(sourcesFolder).toHaveBeenCalledWith({ uid: 'u1', sessionId: 's1' });
  });

  it('works in the empty folder when no Sources folder can be chosen yet', async () => {
    const { spawn } = setup();
    const manager = createAgentManager({
      platform: fakePlatform({
        isExecutable: async () => true,
        spawn,
        listen: async () => ({ port: 4000, close: async () => undefined }),
      }),
      sessionsRoot: path.join(root, 'sessions'),
      events: { send: () => true },
      log: createLogger({ sink: vi.fn() }),
    });
    void manager.start(request());
    await vi.waitFor(() =>
      expect(spawn.mock.calls.find(([, a]) => a[0] === '-p')?.[2].cwd).toBe(
        path.join(root, 'sessions', 'u1', 's1', 'workdir'),
      ),
    );
  });

  it('works in the empty folder when the chosen Sources folder has gone', async () => {
    const { manager, spawn, answerInit } = setup({ sources: path.join(root, 'gone') });
    const started = manager.start(request());
    await answerInit();
    await started;
    const [, , options] = spawn.mock.calls.find(([, a]) => a[0] === '-p') ?? [];
    expect(options?.cwd).toBe(path.join(root, 'sessions', 'u1', 's1', 'workdir'));
  });

  it('says not signed in, ends the process and closes the endpoint', async () => {
    const { manager, answerInit, closeEndpoint, sink } = setup();
    const started = manager.start(request());
    const fake = await answerInit('none');
    await vi.waitFor(() => expect(fake.child.stdin.end).toHaveBeenCalled());
    fake.close(0);
    await expect(started).resolves.toEqual({ ok: false, error: { code: 'not_signed_in' } });
    expect(closeEndpoint).toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('warn', 'Agent not started', { reason: 'not_signed_in' });
    expect(() => manager.send('s1', 'Hello')).toThrow('Not running');
  });

  it('says crashed when claude does not answer initialize in time', async () => {
    const { manager, sessions, time } = setup();
    const started = manager.start(request());
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    time.advance(INIT_TIMEOUT_MS);
    sessions[0]?.close(null, 'SIGTERM');
    await expect(started).resolves.toEqual({
      ok: false,
      error: { code: 'crashed', exitCode: null },
    });
  });

  it('closes the endpoint and fails when the session files cannot be written', async () => {
    await writeFile(path.join(root, 'sessions'), 'a file where a folder should be');
    const { manager, closeEndpoint } = setup();
    await expect(manager.start(request())).rejects.toMatchObject({ code: 'ENOTDIR' });
    expect(closeEndpoint).toHaveBeenCalled();
    // A failed start can be tried again.
    await expect(manager.start(request())).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});

describe('a running session', () => {
  async function running() {
    const s = setup();
    const started = s.manager.start(request());
    const fake = await s.answerInit();
    await started;
    return { ...s, fake };
  }

  it('takes messages, stops and closes; ends with its process', async () => {
    const { manager, fake, closeEndpoint } = await running();
    manager.send('s1', 'Hello');
    manager.stop('s1');
    expect(fake.messages().map((m) => m.type)).toEqual([
      'control_request',
      'user',
      'control_request',
    ]);
    const closed = manager.close('s1');
    fake.close(0);
    await closed;
    expect(closeEndpoint).toHaveBeenCalled();
    expect(() => manager.send('s1', 'Hello')).toThrow('Not running');
  });

  it('does nothing for a session it is not running', async () => {
    const { manager } = setup();
    manager.stop('nope');
    await expect(manager.close('nope')).resolves.toBeUndefined();
  });

  it('forwards a tool result, and logs one nobody is waiting for', async () => {
    const { manager, sink } = await running();
    manager.toolResult('s1', 'unknown', { text: 'late' });
    manager.toolResult('nope', 'c1', { text: 'x' });
    expect(sink.mock.calls.filter(([, e]) => e === 'Agent tool result ignored')).toEqual([
      ['warn', 'Agent tool result ignored', { sessionId: 's1', reason: 'no such call' }],
      ['warn', 'Agent tool result ignored', { sessionId: 'nope', reason: 'no such call' }],
    ]);
  });

  it('starts a new process after the old one crashed', async () => {
    const { manager, fake, answerInit, sessions } = await running();
    fake.close(1);
    const again = manager.start(request());
    await answerInit('claude.ai', 2);
    await expect(again).resolves.toMatchObject({ ok: true });
    expect(sessions).toHaveLength(2);
  });

  it('ends every process when the app quits', async () => {
    const { manager, fake, time } = await running();
    manager.closeAll();
    expect(fake.child.stdin.end).toHaveBeenCalled();
    time.advance(0);
    expect(fake.child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('forget', () => {
  it('removes the chat from CLAUDE_CONFIG_DIR and logs the count only', async () => {
    const id = '0b6e4f3e-6b7a-4c1e-9d55-2f1a3c4b5d6e';
    const { manager, sink } = setup({
      platform: { env: { CLAUDE_CONFIG_DIR: path.join(root, 'cfg') } },
    });
    await manager.forget(id);
    expect(sink).toHaveBeenCalledWith('info', 'Agent transcript removed', { count: 0 });
  });
});
