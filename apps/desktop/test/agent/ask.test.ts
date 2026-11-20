import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASK_KILL_GRACE_MS, ASK_TIMEOUT_MS, runAsk } from '../../src/agent/ask';
import { askArgs } from '../../src/agent/launch';
import { createAgentManager, type AgentManager } from '../../src/agent/manager';
import { nodeAgentPlatform } from '../../src/agent/node';
import type { AgentPlatform, SpawnFn } from '../../src/agent/platform';
import { MAX_ASK_REPLY_LENGTH } from '../../src/bridge';
import { createLogger } from '../../src/log';
import { fakeClaudeHome, type FakeClaudeScenario } from './fakeClaude';
import { fakeChild, fakeClock, fakePlatform } from './fakes';

/**
 * `agent.ask` (`DSK-18`): one question to a one-shot `claude` with no tools. The unit tests drive a
 * fake child and clock; the last block runs the real spawn against the fake `claude` in
 * `test/fixtures/`. Nothing here starts the real one.
 */

const text = (words: string) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text: words }] },
});
const done = (isError = false) => ({
  type: 'result',
  subtype: 'success',
  is_error: isError,
  session_id: 'x',
});

function start(timeoutMs?: number) {
  const fake = fakeChild();
  const time = fakeClock();
  const run = runAsk({
    child: fake.child,
    prompt: 'Which option is right?',
    clock: time.clock,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { fake, time, run };
}

describe('runAsk', () => {
  it('sends the prompt as one message, closes the input and answers the reply’s words', async () => {
    const { fake, time, run } = start();
    expect(fake.messages()).toEqual([
      {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: [{ type: 'text', text: 'Which option is right?' }] },
      },
    ]);
    expect(fake.child.stdin.end).toHaveBeenCalled();
    fake.print({ type: 'system', subtype: 'init', session_id: 'x' });
    fake.print(text('{"correct": '));
    fake.print(text('["B"]}'));
    fake.print(done());
    await expect(run.result).resolves.toEqual({ ok: true, text: '{"correct": \n["B"]}' });
    expect(fake.child.kill).not.toHaveBeenCalled();
    expect(time.pending()).toBe(0);
    fake.close(0);
  });

  it('ignores an error writing to a process that has already gone', async () => {
    const { fake, run } = start();
    fake.stdinError(new Error('EPIPE'));
    fake.close(1);
    await expect(run.result).resolves.toEqual({ ok: false, error: { code: 'failed' } });
  });

  it.each([
    ['a failed result', [text('Partly'), done(true)]],
    ['a result with no words', [done()]],
  ])('fails on %s and ends the process', async (_label, lines) => {
    const { fake, time, run } = start();
    for (const line of lines) fake.print(line);
    await expect(run.result).resolves.toEqual({ ok: false, error: { code: 'failed' } });
    expect(fake.child.kill).toHaveBeenCalledWith('SIGTERM');
    time.advance(ASK_KILL_GRACE_MS);
    expect(fake.child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('fails on a reply longer than the limit', async () => {
    const { fake, run } = start();
    fake.print(text('x'.repeat(MAX_ASK_REPLY_LENGTH)));
    fake.print(text('y'));
    fake.print(done());
    await expect(run.result).resolves.toEqual({ ok: false, error: { code: 'failed' } });
  });

  it('says not signed in at the first sign of it, and ends the process', async () => {
    const { fake, time, run } = start();
    fake.print({ ...text('Not logged in · Please run /login'), error: 'authentication_failed' });
    await expect(run.result).resolves.toEqual({ ok: false, error: { code: 'not_signed_in' } });
    expect(fake.child.kill).toHaveBeenCalledWith('SIGTERM');
    // It closes within the grace period: no SIGKILL follows.
    fake.close(143);
    time.advance(ASK_KILL_GRACE_MS);
    expect(fake.child.kill).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('says the plan limit is reached, with its reset time when given', async () => {
    const first = start();
    first.fake.print({ type: 'system', subtype: 'api_retry', error: 'rate_limit', attempt: 1 });
    await expect(first.run.result).resolves.toEqual({
      ok: false,
      error: { code: 'plan_limit', resetsAt: null },
    });
    const second = start();
    second.fake.print({
      type: 'rate_limit_event',
      rate_limit_info: { status: 'rejected', resetsAt: 1_700_000_000 },
    });
    await expect(second.run.result).resolves.toEqual({
      ok: false,
      error: { code: 'plan_limit', resetsAt: '2023-11-14T22:13:20.000Z' },
    });
  });

  it('fails when the process ends without a result, or cannot start', async () => {
    const ended = start();
    ended.fake.print(text('Half an answer'));
    ended.fake.close(1);
    await expect(ended.run.result).resolves.toEqual({ ok: false, error: { code: 'failed' } });
    expect(ended.fake.child.kill).not.toHaveBeenCalled();
    const broken = start();
    broken.fake.fail(new Error('ENOENT'));
    await expect(broken.run.result).resolves.toEqual({ ok: false, error: { code: 'failed' } });
  });

  it('times out after the limit, or the default one', async () => {
    const own = start(1000);
    own.time.advance(999);
    own.time.advance(1);
    await expect(own.run.result).resolves.toEqual({ ok: false, error: { code: 'timeout' } });
    expect(own.fake.child.kill).toHaveBeenCalledWith('SIGTERM');
    const plain = start();
    plain.time.advance(ASK_TIMEOUT_MS);
    await expect(plain.run.result).resolves.toEqual({ ok: false, error: { code: 'timeout' } });
  });

  it('is cancelled by cancel, which does nothing once it has answered', async () => {
    const { fake, run } = start();
    run.cancel();
    await expect(run.result).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    expect(fake.child.kill).toHaveBeenCalledTimes(1);
    run.cancel();
    fake.print(done());
    expect(fake.child.kill).toHaveBeenCalledTimes(1);
  });
});

// ---- the manager ----

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul-agent-ask-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function managerSetup({
  version = '2.1.328 (Claude Code)\n',
  platform = {} as Partial<AgentPlatform>,
  askDir = undefined as string | undefined,
} = {}) {
  const time = fakeClock();
  const asks: ReturnType<typeof fakeChild>[] = [];
  const spawn = vi.fn<SpawnFn>((_file, args) => {
    const fake = fakeChild();
    if (args[0] === '--version') {
      queueMicrotask(() => {
        fake.printRaw(version);
        fake.close(0);
      });
    } else {
      asks.push(fake);
    }
    return fake.child;
  });
  const sink = vi.fn();
  const manager = createAgentManager({
    platform: fakePlatform({
      env: { PATH: '/bin', ANTHROPIC_BASE_URL: 'http://elsewhere' },
      isExecutable: vi.fn(async (f: string) => f === '/bin/claude'),
      spawn,
      clock: time.clock,
      ...platform,
    }),
    sessionsRoot: path.join(root, 'userData', 'sessions'),
    events: { send: vi.fn(() => true) },
    ...(askDir === undefined ? {} : { askDir }),
    log: createLogger({ sink }),
  });
  /** Waits until the ask's process has been started (after `--version`). */
  const started = async (count: number) => {
    await vi.waitFor(() => {
      if (asks.length < count) throw new Error('not started yet');
    });
    return asks[count - 1] as ReturnType<typeof fakeChild>;
  };
  /** Waits until the process asked `prompt` has been started: two asks start in either order. */
  const startedFor = async (prompt: string) => {
    let found: ReturnType<typeof fakeChild> | undefined;
    await vi.waitFor(() => {
      found = asks.find((a) => JSON.stringify(a.messages()).includes(`"text":"${prompt}"`));
      if (found === undefined) throw new Error('not started yet');
    });
    return found as ReturnType<typeof fakeChild>;
  };
  return { manager, spawn, asks, started, startedFor, time, sink };
}

describe('the agent manager’s ask', () => {
  it('runs claude with the pinned one-shot flags, in an empty folder, with the allow-list', async () => {
    const { manager, spawn, started, sink } = managerSetup();
    const answer = manager.ask({ askId: 'a1', prompt: 'Course text and a question' });
    const fake = await started(1);
    expect(spawn).toHaveBeenLastCalledWith('/bin/claude', askArgs(), {
      cwd: path.join(root, 'userData', 'ask'),
      env: { PATH: '/bin' },
    });
    expect(existsSync(path.join(root, 'userData', 'ask'))).toBe(true);
    fake.print(text('{"correct":["A"]}'));
    fake.print(done());
    await expect(answer).resolves.toEqual({ ok: true, text: '{"correct":["A"]}' });
    const logged = JSON.stringify(sink.mock.calls);
    expect(logged).toContain('Agent ask ended');
    expect(logged).toContain('answered');
    expect(logged).not.toContain('Course text');
    expect(logged).not.toContain('correct');
  });

  it('runs in the folder it is given', async () => {
    const askDir = path.join(root, 'elsewhere');
    const { manager, spawn, started } = managerSetup({ askDir });
    const answer = manager.ask({ askId: 'a1', prompt: 'Q' });
    const fake = await started(1);
    expect(spawn.mock.lastCall?.[2].cwd).toBe(askDir);
    fake.close(1);
    await expect(answer).resolves.toEqual({ ok: false, error: { code: 'failed' } });
  });

  it('answers not installed or too old before starting anything', async () => {
    const missing = managerSetup({ platform: { isExecutable: vi.fn(async () => false) } });
    await expect(missing.manager.ask({ askId: 'a', prompt: 'Q' })).resolves.toEqual({
      ok: false,
      error: { code: 'not_installed' },
    });
    const old = managerSetup({ version: '2.0.1 (Claude Code)\n' });
    await expect(old.manager.ask({ askId: 'a', prompt: 'Q' })).resolves.toEqual({
      ok: false,
      error: { code: 'too_old', version: '2.0.1', minimumVersion: '2.1.328' },
    });
    expect(old.asks).toHaveLength(0);
  });

  it('runs two at a time: a third, or the same id again, is busy', async () => {
    const { manager, startedFor } = managerSetup();
    const one = manager.ask({ askId: 'a1', prompt: 'Q1' });
    const two = manager.ask({ askId: 'a2', prompt: 'Q2' });
    await expect(manager.ask({ askId: 'a3', prompt: 'Q3' })).resolves.toEqual({
      ok: false,
      error: { code: 'busy' },
    });
    await expect(manager.ask({ askId: 'a1', prompt: 'Q1' })).resolves.toEqual({
      ok: false,
      error: { code: 'busy' },
    });
    const first = await startedFor('Q1');
    const second = await startedFor('Q2');
    first.print(text('{}'));
    first.print(done());
    await expect(one).resolves.toEqual({ ok: true, text: '{}' });
    // A place is free again.
    const three = manager.ask({ askId: 'a3', prompt: 'Q3' });
    second.close(1);
    await expect(two).resolves.toEqual({ ok: false, error: { code: 'failed' } });
    const third = await startedFor('Q3');
    third.close(1);
    await expect(three).resolves.toEqual({ ok: false, error: { code: 'failed' } });
  });

  it('cancels a running ask, and one still finding claude before it starts', async () => {
    const { manager, started, asks } = managerSetup();
    const running = manager.ask({ askId: 'a1', prompt: 'Q' });
    const fake = await started(1);
    manager.cancelAsk('a1');
    await expect(running).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    expect(fake.child.kill).toHaveBeenCalledWith('SIGTERM');

    const early = manager.ask({ askId: 'a2', prompt: 'Q' });
    manager.cancelAsk('a2');
    await expect(early).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    expect(asks).toHaveLength(1);
    // An ask not running is no error.
    manager.cancelAsk('nothing');
  });

  it('ends every ask, and only the asks, when the page that asked is gone', async () => {
    const { manager, startedFor } = managerSetup();
    const one = manager.ask({ askId: 'a1', prompt: 'Q1' });
    const two = manager.ask({ askId: 'a2', prompt: 'Q2' });
    const first = await startedFor('Q1');
    await startedFor('Q2');
    manager.cancelAsks();
    await expect(one).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    await expect(two).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    expect(first.child.kill).toHaveBeenCalledWith('SIGTERM');
    // Both places are free for the next page's asks.
    const next = manager.ask({ askId: 'a3', prompt: 'Q3' });
    const third = await startedFor('Q3');
    third.print(text('{}'));
    third.print(done());
    await expect(next).resolves.toEqual({ ok: true, text: '{}' });
  });

  it('ends every ask when the app quits', async () => {
    const { manager, startedFor, asks } = managerSetup();
    // One still finding claude: it never starts.
    const early = manager.ask({ askId: 'a0', prompt: 'Q0' });
    manager.closeAll();
    await expect(early).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    expect(asks).toHaveLength(0);
    // One running: its process is ended.
    const running = manager.ask({ askId: 'a1', prompt: 'Q1' });
    const fake = await startedFor('Q1');
    manager.closeAll();
    await expect(running).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
    expect(fake.child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('fails when the program cannot be started', async () => {
    const { manager } = managerSetup({
      platform: {
        spawn: vi.fn<SpawnFn>((_file, args) => {
          if (args[0] !== '--version') throw new Error('EMFILE');
          const fake = fakeChild();
          queueMicrotask(() => {
            fake.printRaw('2.1.328 (Claude Code)\n');
            fake.close(0);
          });
          return fake.child;
        }),
      },
    });
    await expect(manager.ask({ askId: 'a', prompt: 'Q' })).resolves.toEqual({
      ok: false,
      error: { code: 'failed' },
    });
  });

  it('rejects, and frees its place, when its folder cannot be made', async () => {
    const blocked = path.join(root, 'blocked');
    await writeFile(blocked, 'a file where the folder should be');
    const { manager } = managerSetup({ askDir: path.join(blocked, 'ask') });
    await expect(manager.ask({ askId: 'a', prompt: 'Q' })).rejects.toThrow();
    // Not busy: the same id runs again (and fails the same way).
    await expect(manager.ask({ askId: 'a', prompt: 'Q' })).rejects.toThrow();
  });
});

// ---- the real process, against the fake claude ----

const homes: Awaited<ReturnType<typeof fakeClaudeHome>>[] = [];
const managers: AgentManager[] = [];
afterEach(async () => {
  for (const m of managers.splice(0)) m.closeAll();
  await Promise.all(homes.splice(0).map((h) => h.remove()));
});

async function realSetup(scenario: FakeClaudeScenario) {
  const home = await fakeClaudeHome(scenario);
  homes.push(home);
  const manager = createAgentManager({
    platform: nodeAgentPlatform(
      'linux',
      { ...home.env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9/elsewhere' },
      home.home,
    ),
    sessionsRoot: home.sessions,
    events: { send: () => true },
    log: createLogger({ sink: vi.fn() }),
  });
  managers.push(manager);
  return { home, manager };
}

describe('agent.ask over a real process', () => {
  it('gets the reply of a one-shot claude that kept no chat and had no tools', async () => {
    const { home, manager } = await realSetup({
      turns: [[{ listTools: true }, { echoPrompt: true }]],
    });
    const prompt = 'Lesson text\n\nQuestion: which is right? A. merge B. rebase';
    await expect(manager.ask({ askId: 'a1', prompt })).resolves.toEqual({
      ok: true,
      // No MCP server, so no tool names, then the prompt said back.
      text: `none\n${prompt}`,
    });
    const [run] = await home.runs();
    expect(run?.argv).toEqual(askArgs());
    expect(run?.argv.join(' ')).not.toContain('rebase');
    expect(run?.env).not.toContain('ANTHROPIC_BASE_URL');
    expect(run?.cwd).toBe(path.join(path.dirname(home.sessions), 'ask'));
    // No transcript kept in Claude Code's folder.
    const projects = path.join(home.config, 'projects');
    expect(existsSync(projects) ? await readdir(projects) : []).toEqual([]);
  });

  it('says not signed in from the turn itself', async () => {
    const { manager } = await realSetup({ loggedIn: false });
    await expect(manager.ask({ askId: 'a1', prompt: 'Q' })).resolves.toEqual({
      ok: false,
      error: { code: 'not_signed_in' },
    });
  });

  it('cancels a claude that does not answer', async () => {
    const { manager } = await realSetup({ turns: [[{ hang: true }]] });
    const { home } = { home: homes[homes.length - 1] as (typeof homes)[number] };
    const answer = manager.ask({ askId: 'a1', prompt: 'Q' });
    await vi.waitFor(async () => {
      if ((await home.runs()).length === 0) throw new Error('not started yet');
    });
    manager.cancelAsk('a1');
    await expect(answer).resolves.toEqual({ ok: false, error: { code: 'cancelled' } });
  });
});
