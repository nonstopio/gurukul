import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_TOKEN_ENV, isAllowedEnvName } from '../../src/agent/launch';
import { createAgentManager, type AgentManager } from '../../src/agent/manager';
import { nodeAgentPlatform } from '../../src/agent/node';
import type {
  AgentEvent,
  AgentStartRequest,
  AgentToolCall,
  BridgeEvents,
  EventName,
} from '../../src/bridge';
import type { EventSender } from '../../src/events';
import { createLogger } from '../../src/log';
import { fakeClaudeHome, PLATFORM, WRAPPER_ENV, type FakeClaudeScenario } from './fakeClaude';

/**
 * The real process path: Node's spawn (through cross-spawn), the real HTTP endpoint, the real
 * session files, against the fake `claude` in `test/fixtures/`. Nothing here starts the real one.
 * Every path has a space in it, and on Windows the fake is `claude.cmd`, started through `cmd.exe`
 * (CI's Windows job runs this file there).
 */

const homes: Awaited<ReturnType<typeof fakeClaudeHome>>[] = [];
const managers: AgentManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => Promise.all(['s1'].map((id) => m.close(id)))));
  await Promise.all(homes.splice(0).map((h) => h.remove()));
});

const TOOLS = [
  { name: 'get_course', description: 'Reads the course.', inputSchema: { type: 'object' } },
  { name: 'add_block', description: 'Adds a block.', inputSchema: { type: 'object' } },
];

function request(overrides: Partial<AgentStartRequest> = {}): AgentStartRequest {
  return {
    uid: 'u1',
    sessionId: 's1',
    systemPrompt: 'You help an Educator write a course.',
    skills: [{ name: 'humanize', files: [{ path: 'SKILL.md', text: '# Humanize' }] }],
    tools: TOOLS,
    resumeId: null,
    ...overrides,
  };
}

async function setup(
  scenario: FakeClaudeScenario = {},
  answer: (call: AgentToolCall) => { text: string } | { error: string } | null = () => ({
    text: 'course ok',
  }),
) {
  const home = await fakeClaudeHome(scenario);
  homes.push(home);
  const events: AgentEvent[] = [];
  const calls: AgentToolCall[] = [];
  const sink = vi.fn();
  let manager: AgentManager | null = null;
  const sender: EventSender = {
    send<E extends EventName>(name: E, payload: BridgeEvents[E]) {
      if (name === 'agent.onEvent') events.push(payload as AgentEvent);
      if (name === 'agent.onToolCall') {
        const call = payload as AgentToolCall;
        calls.push(call);
        const result = answer(call);
        if (result !== null)
          setTimeout(() => manager?.toolResult(call.sessionId, call.callId, result));
      }
      return true;
    },
  };
  const platform = nodeAgentPlatform(
    PLATFORM,
    {
      ...home.env,
      LC_ALL: 'C',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9/elsewhere',
      ANTHROPIC_API_KEY: 'sk-not-the-educators',
      CLAUDE_CODE_OAUTH_TOKEN: 'not-this-either',
      NODE_OPTIONS: '--require /tmp/x.js',
      ELECTRON_RUN_AS_NODE: '1',
      [BRIDGE_TOKEN_ENV]: 'a stale token',
    },
    home.home,
  );
  manager = createAgentManager({
    platform,
    sessionsRoot: home.sessions,
    events: sender,
    sourcesFolder: async () => null,
    log: createLogger({ sink }),
  });
  managers.push(manager);
  const turnEnd = (n: number) =>
    vi.waitFor(
      () => {
        const ends = events.filter((e) => e.type === 'turn_end');
        if (ends.length < n) throw new Error('waiting');
        return ends[n - 1] as Extract<AgentEvent, { type: 'turn_end' }>;
      },
      { timeout: 10_000, interval: 20 },
    );
  const texts = () => events.flatMap((e) => (e.type === 'text' ? [e.text] : []));
  return { home, manager, events, calls, sink, turnEnd, texts };
}

describe('agent.status against a fake claude', () => {
  it('is ready when installed, new enough and signed in', async () => {
    const { manager } = await setup();
    await expect(manager.status()).resolves.toEqual({ state: 'ready', version: '2.1.328' });
  });

  it('is not signed in when auth status says so', async () => {
    const { manager } = await setup({ loggedIn: false });
    await expect(manager.status()).resolves.toEqual({
      state: 'not_signed_in',
      version: '2.1.328',
    });
  });

  it('is too old below the pinned version', async () => {
    const { manager } = await setup({ version: '2.1.0' });
    await expect(manager.status()).resolves.toEqual({
      state: 'too_old',
      version: '2.1.0',
      minimumVersion: '2.1.328',
    });
  });
});

describe('a session against a fake claude', () => {
  it('starts with the pinned flags, the allow-listed environment and its own files', async () => {
    const { manager, home, turnEnd } = await setup();
    const started = await manager.start(request());
    expect(started).toEqual({ ok: true, agentSessionId: expect.any(String) });
    const id = (started as { agentSessionId: string }).agentSessionId;
    manager.send('s1', 'Hello');
    await turnEnd(1);

    const [run] = await home.runs();
    const folder = path.join(home.sessions, 'u1', 's1');
    expect(run?.argv).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--append-system-prompt-file',
      path.join(folder, 'prompt.md'),
      '--plugin-dir',
      path.join(folder, 'skills'),
      '--mcp-config',
      path.join(folder, 'mcp.json'),
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--tools',
      'Skill',
      '--allowedTools',
      'mcp__gurukul__*',
      '--permission-mode',
      'dontAsk',
      '--system-prompt-snapshot',
      'off',
      '--session-id',
      id,
    ]);
    expect(run?.cwd).toBe(path.join(folder, 'workdir'));
    // Only allow-listed names reach claude, plus the token; the token never as an argument.
    // (`WRAPPER_ENV` is set by the wrapper that stands in for the program, not by the bridge.)
    const extra = (name: string) =>
      !isAllowedEnvName(name, PLATFORM) && name !== BRIDGE_TOKEN_ENV && !WRAPPER_ENV.includes(name);
    expect(run?.env.filter(extra)).toEqual([]);
    expect(run?.env).toContain(BRIDGE_TOKEN_ENV);
    expect(run?.env).not.toContain('ANTHROPIC_BASE_URL');

    const mcp = await readFile(path.join(folder, 'mcp.json'), 'utf8');
    expect(mcp).toContain('Bearer ${GURUKUL_BRIDGE_TOKEN}');
    expect(await readFile(path.join(folder, 'prompt.md'), 'utf8')).toBe(
      'You help an Educator write a course.',
    );
    expect(
      await readFile(path.join(folder, 'skills', 'skills', 'humanize', 'SKILL.md'), 'utf8'),
    ).toBe('# Humanize');
    expect(
      JSON.parse(
        await readFile(path.join(folder, 'skills', '.claude-plugin', 'plugin.json'), 'utf8'),
      ),
    ).toMatchObject({ name: 'gurukul' });
  });

  it('streams a turn: text, activity, a tool call through the endpoint and the window, the end', async () => {
    const { manager, events, calls, turnEnd, texts } = await setup({
      turns: [
        [
          { thinking: true },
          { skill: 'humanize' },
          { listTools: true },
          { tool: 'get_course', input: { depth: 1 } },
          { text: 'I read the course.' },
        ],
      ],
    });
    const started = await manager.start(request());
    manager.send('s1', 'Read the course');
    const end = await turnEnd(1);
    expect(end).toEqual({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: (started as { agentSessionId: string }).agentSessionId,
      outcome: 'done',
    });
    expect(events.filter((e) => e.type === 'activity').map((e) => e.text)).toEqual([
      'Thinking',
      'Loading the humanize skill',
    ]);
    // The endpoint offers the window's tools and nothing else.
    expect(texts()).toEqual(['get_course,add_block', 'tool: course ok', 'I read the course.']);
    expect(calls).toEqual([
      { sessionId: 's1', callId: expect.any(String), name: 'get_course', input: { depth: 1 } },
    ]);
    expect(events).toContainEqual({
      type: 'tool_call',
      sessionId: 's1',
      callId: calls[0]?.callId,
      name: 'get_course',
    });
  });

  it('hands the model the window’s refusal as a tool error', async () => {
    const { manager, turnEnd, texts } = await setup(
      { turns: [[{ tool: 'add_block' }, { tool: 'publish_course' }]] },
      () => ({ error: 'A lesson holds at most 60 blocks.' }),
    );
    await manager.start(request());
    manager.send('s1', 'Add a block');
    await turnEnd(1);
    expect(texts()).toEqual([
      'tool error: A lesson holds at most 60 blocks.',
      'tool error: There is no tool with that name.',
    ]);
  });

  it('stops a turn with an interrupt and keeps the process for the next message', async () => {
    const { manager, turnEnd, texts, home } = await setup({
      turns: [[{ text: 'Working on it.' }, { waitForInterrupt: true }], [{ text: 'Again.' }]],
    });
    await manager.start(request());
    manager.send('s1', 'Rewrite everything');
    await vi.waitFor(() => expect(texts()).toEqual(['Working on it.']), { timeout: 10_000 });
    manager.stop('s1');
    expect((await turnEnd(1)).outcome).toBe('stopped');
    manager.send('s1', 'Just one lesson');
    expect((await turnEnd(2)).outcome).toBe('done');
    expect(texts()).toEqual(['Working on it.', 'Again.']);
    expect(await home.runs()).toHaveLength(1);
  });

  it('reports a plan limit on the first retry and ends the turn', async () => {
    const { manager, events, turnEnd } = await setup({ turns: [[{ apiRetry: 'rate_limit' }]] });
    await manager.start(request());
    manager.send('s1', 'Hello');
    expect((await turnEnd(1)).outcome).toBe('failed');
    expect(events.filter((e) => e.type === 'error')).toEqual([
      { type: 'error', sessionId: 's1', error: { code: 'plan_limit', resetsAt: null } },
    ]);
  });

  it('reports a rejected rate limit event with its reset time', async () => {
    const { manager, events, turnEnd } = await setup({
      turns: [[{ rateLimitEvent: { status: 'rejected', resetsAt: 1_800_000_000 } }]],
    });
    await manager.start(request());
    manager.send('s1', 'Hello');
    expect((await turnEnd(1)).outcome).toBe('failed');
    expect(events).toContainEqual({
      type: 'error',
      sessionId: 's1',
      error: { code: 'plan_limit', resetsAt: '2027-01-15T08:00:00.000Z' },
    });
  });

  it('refuses a control request from claude', async () => {
    const { manager, turnEnd, texts } = await setup({ turns: [[{ controlRequest: true }]] });
    await manager.start(request());
    manager.send('s1', 'Hello');
    await turnEnd(1);
    expect(texts()).toEqual(['control: error']);
  });

  it('says not signed in before the first message when initialize reports no sign-in', async () => {
    const { manager, home } = await setup({ loggedIn: false });
    await expect(manager.start(request())).resolves.toEqual({
      ok: false,
      error: { code: 'not_signed_in' },
    });
    expect(await home.runs()).toHaveLength(1);
    expect(() => manager.send('s1', 'Hello')).toThrow('Not running');
  });

  it('reports a crash, ending the turn', async () => {
    const { manager, events, turnEnd } = await setup({ turns: [[{ exit: 3 }]] });
    await manager.start(request());
    manager.send('s1', 'Hello');
    expect((await turnEnd(1)).outcome).toBe('failed');
    await vi.waitFor(() =>
      expect(events).toContainEqual({
        type: 'error',
        sessionId: 's1',
        error: { code: 'crashed', exitCode: 3 },
      }),
    );
  });

  it('closes, resumes the same chat later, and forgets it', async () => {
    const { manager, home, turnEnd, events } = await setup();
    const first = (await manager.start(request())) as { agentSessionId: string };
    manager.send('s1', 'Hello');
    await turnEnd(1);
    await manager.close('s1');
    expect(events.filter((e) => e.type === 'error')).toEqual([]);

    // Same Claude session again with --session-id is refused by claude; --resume works.
    const again = await manager.start(request({ resumeId: first.agentSessionId }));
    expect(again).toEqual({ ok: true, agentSessionId: first.agentSessionId });
    manager.send('s1', 'Hello again');
    expect((await turnEnd(2)).agentSessionId).toBe(first.agentSessionId);
    const runs = await home.runs();
    expect(runs[1]?.argv.slice(-2)).toEqual(['--resume', first.agentSessionId]);
    await manager.close('s1');

    const projects = path.join(home.config, 'projects');
    const [project] = await readdir(projects);
    const transcript = path.join(projects, project as string, `${first.agentSessionId}.jsonl`);
    expect(existsSync(transcript)).toBe(true);
    await manager.forget(first.agentSessionId);
    expect(existsSync(transcript)).toBe(false);
    expect(existsSync(path.join(projects, project as string, 'memory'))).toBe(true);
  });
});
