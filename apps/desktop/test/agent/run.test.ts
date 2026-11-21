import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CONTEXT_WINDOW,
  AgentNotRunningError,
  CLOSE_GRACE_MS,
  TOOL_CALL_TIMEOUT_MS,
  TOOL_ERRORS,
  createRun,
} from '../../src/agent/run';
import type { AgentEvent, AgentToolCall } from '../../src/bridge';
import type { EventSender } from '../../src/events';
import { createLogger } from '../../src/log';
import { fakeChild, fakeClock } from './fakes';

function setup({ windowOpen = true } = {}) {
  const fake = fakeChild();
  const time = fakeClock();
  const events: AgentEvent[] = [];
  const toolCalls: AgentToolCall[] = [];
  const sender: EventSender = {
    send: vi.fn((name, payload) => {
      if (name === 'agent.onEvent') events.push(payload as AgentEvent);
      if (name === 'agent.onToolCall') {
        toolCalls.push(payload as AgentToolCall);
        return windowOpen;
      }
      return true;
    }),
  };
  const sink = vi.fn();
  const onEnd = vi.fn();
  let n = 0;
  const run = createRun({
    sessionId: 's1',
    agentSessionId: 'claude-1',
    child: fake.child,
    clock: time.clock,
    randomId: () => `id-${(n += 1)}`,
    events: sender,
    log: createLogger({ sink }),
    onEnd,
  });
  const result = (extra: Record<string, unknown> = {}) =>
    fake.print({ type: 'result', subtype: 'success', is_error: false, ...extra });
  return { fake, time, events, toolCalls, sink, onEnd, run, result };
}

async function live() {
  const s = setup();
  const init = s.run.initialize(1000);
  s.fake.print({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: 'id-1',
      response: { account: { tokenSource: 'x' } },
    },
  });
  await expect(init).resolves.toEqual({ ok: true });
  s.run.markLive();
  s.fake.written.length = 0;
  return s;
}

describe('initialize', () => {
  it('asks for the account and is ready when there is a sign-in', async () => {
    await live();
  });

  it('says not signed in when the token source is none', async () => {
    const { fake, run } = setup();
    const init = run.initialize(1000);
    expect(fake.messages()).toEqual([
      { type: 'control_request', request_id: 'id-1', request: { subtype: 'initialize' } },
    ]);
    fake.print({
      type: 'control_response',
      response: { request_id: 'id-1', response: { account: { tokenSource: 'none' } } },
    });
    await expect(init).resolves.toEqual({ ok: false, error: { code: 'not_signed_in' } });
  });

  it('says crashed when claude ends first (a resume id it does not know), without events', async () => {
    const { fake, run, events, onEnd } = setup();
    const init = run.initialize(1000);
    fake.close(1);
    await expect(init).resolves.toEqual({ ok: false, error: { code: 'crashed', exitCode: 1 } });
    expect(events).toEqual([]);
    expect(onEnd).toHaveBeenCalledOnce();
    await expect(run.initialize(1000)).resolves.toEqual({
      ok: false,
      error: { code: 'crashed', exitCode: null },
    });
  });

  it('says crashed when there is no answer in time', async () => {
    const { time, run } = setup();
    const init = run.initialize(1000);
    time.advance(1000);
    await expect(init).resolves.toEqual({ ok: false, error: { code: 'crashed', exitCode: null } });
  });

  it('ignores an answer to a request it is not waiting for', async () => {
    const { fake, run } = setup();
    void run.initialize(1000);
    fake.print({ type: 'control_response', response: { request_id: 'other' } });
    expect(fake.messages()).toHaveLength(1);
  });
});

describe('a turn', () => {
  it('sends the message and streams text, activity and the end with the Claude session id', async () => {
    const { fake, run, events, result } = await live();
    run.send('Hello');
    expect(fake.messages()).toEqual([
      {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
    ]);
    fake.print({ type: 'system', subtype: 'init', session_id: 'claude-2' });
    fake.print({ type: 'system', subtype: 'init' });
    fake.print({ type: 'assistant', message: { content: [{ type: 'thinking' }] } });
    // A character split across chunks arrives whole.
    const bytes = Buffer.from(
      `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Namasté' }] } })}\n`,
    );
    fake.printRaw(bytes.subarray(0, bytes.length - 6));
    fake.printRaw(bytes.subarray(bytes.length - 6));
    result();
    expect(events).toEqual([
      { type: 'activity', sessionId: 's1', text: 'Thinking' },
      { type: 'text', sessionId: 's1', text: 'Namasté' },
      { type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-2', outcome: 'done' },
    ]);
    expect(run.agentSessionId).toBe('claude-2');
  });

  it('says how full the context is after a turn: the last request against the window', async () => {
    const { fake, run, result, events } = await live();
    run.send('Hello');
    const usage = (input: number) =>
      fake.print({
        type: 'assistant',
        message: { content: [], usage: { input_tokens: input, cache_read_input_tokens: 1000 } },
      });
    usage(10);
    usage(50);
    result();
    run.send('Again');
    result({ modelUsage: { m: { contextWindow: 1_000_000 } } });
    expect(events.map((e) => (e as { context?: unknown }).context)).toEqual([
      { used: 1050, window: DEFAULT_CONTEXT_WINDOW },
      { used: 1050, window: 1_000_000 },
    ]);
  });

  it('takes the Claude session id from the result too', async () => {
    const { run, result, events } = await live();
    run.send('Hello');
    result({ session_id: 'claude-3' });
    expect(events).toEqual([
      { type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-3', outcome: 'done' },
    ]);
  });

  it('ends failed when the result is an error', async () => {
    const { run, result, events } = await live();
    run.send('Hello');
    result({ is_error: true });
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', outcome: 'failed' });
  });

  it('stops with an interrupt, and ends stopped when the turn was aborted', async () => {
    const { fake, run, result, events } = await live();
    run.stop(); // no turn: nothing to stop
    expect(fake.written).toEqual([]);
    run.send('Hello');
    run.stop();
    expect(fake.messages()[1]).toEqual({
      type: 'control_request',
      request_id: 'id-2',
      request: { subtype: 'interrupt' },
    });
    result({
      subtype: 'error_during_execution',
      is_error: true,
      terminal_reason: 'aborted_streaming',
    });
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', outcome: 'stopped' });
  });

  it('ends done when the turn finished before the stop arrived', async () => {
    const { run, result, events } = await live();
    run.send('Hello');
    run.stop();
    result();
    expect(events.at(-1)).toMatchObject({ outcome: 'done' });
    // The next turn starts clean.
    run.send('Again');
    result({ is_error: true });
    expect(events.at(-1)).toMatchObject({ outcome: 'failed' });
  });

  it('reports a plan limit once, interrupts, and ends the turn failed', async () => {
    const { fake, run, result, events, sink } = await live();
    run.send('Hello');
    const retry = { type: 'system', subtype: 'api_retry', error: 'rate_limit' };
    fake.print(retry);
    fake.print(retry);
    expect(fake.messages().filter((m) => m.type === 'control_request')).toHaveLength(1);
    result({
      subtype: 'error_during_execution',
      is_error: true,
      terminal_reason: 'aborted_streaming',
    });
    expect(events).toEqual([
      { type: 'error', sessionId: 's1', error: { code: 'plan_limit', resetsAt: null } },
      { type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-1', outcome: 'failed' },
    ]);
    expect(sink).toHaveBeenCalledWith('warn', 'Agent error', {
      sessionId: 's1',
      code: 'plan_limit',
    });
  });

  it('reports a missing sign-in in a turn', async () => {
    const { fake, run, result, events } = await live();
    run.send('Hello');
    fake.print({
      type: 'assistant',
      error: 'authentication_failed',
      message: { content: [{ type: 'text', text: 'Not logged in · Please run /login' }] },
    });
    result({ is_error: true, terminal_reason: 'api_error' });
    expect(events).toEqual([
      { type: 'error', sessionId: 's1', error: { code: 'not_signed_in' } },
      { type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-1', outcome: 'failed' },
    ]);
  });

  it('reports an error outside a turn without interrupting', async () => {
    const { fake, events } = await live();
    fake.print({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } });
    expect(events).toEqual([
      { type: 'error', sessionId: 's1', error: { code: 'plan_limit', resetsAt: null } },
    ]);
    expect(fake.written).toEqual([]);
  });

  it('refuses a control request from claude', async () => {
    const { fake } = await live();
    fake.print({ type: 'control_request', request_id: 'q1', request: { subtype: 'can_use_tool' } });
    expect(fake.messages()).toEqual([
      {
        type: 'control_response',
        response: { subtype: 'error', request_id: 'q1', error: 'Not supported' },
      },
    ]);
  });

  it('never logs what claude prints', async () => {
    const { fake, run, result, sink } = await live();
    run.send('secret message');
    fake.print({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'secret reply' }] },
    });
    result();
    expect(JSON.stringify(sink.mock.calls)).not.toContain('secret');
  });
});

describe('tool calls', () => {
  it('go to the window as an event and a call, and come back with its answer', async () => {
    const { run, events, toolCalls } = await live();
    const answer = run.callTool('get_course', { depth: 1 });
    expect(events).toEqual([
      { type: 'tool_call', sessionId: 's1', callId: 'id-2', name: 'get_course' },
    ]);
    expect(toolCalls).toEqual([
      { sessionId: 's1', callId: 'id-2', name: 'get_course', input: { depth: 1 } },
    ]);
    expect(run.toolResult('id-2', { text: 'ok' })).toBe(true);
    await expect(answer).resolves.toEqual({ text: 'ok' });
    expect(run.toolResult('id-2', { text: 'again' })).toBe(false);
  });

  it('tell the model when the window does not answer in time', async () => {
    const { run, time, sink } = await live();
    const answer = run.callTool('get_course', {});
    time.advance(TOOL_CALL_TIMEOUT_MS);
    await expect(answer).resolves.toEqual({ error: TOOL_ERRORS.timeout });
    expect(sink).toHaveBeenCalledWith('warn', 'Agent tool call timed out', { sessionId: 's1' });
  });

  it('tell the model when there is no window to ask', async () => {
    const s = setup({ windowOpen: false });
    s.run.markLive();
    await expect(s.run.callTool('get_course', {})).resolves.toEqual({
      error: TOOL_ERRORS.noWindow,
    });
    expect(s.time.pending()).toBe(0);
  });

  it('are answered as ended when the process goes, or has gone', async () => {
    const { run, fake } = await live();
    const answer = run.callTool('get_course', {});
    fake.close(0);
    await expect(answer).resolves.toEqual({ error: TOOL_ERRORS.ended });
    await expect(run.callTool('get_course', {})).resolves.toEqual({ error: TOOL_ERRORS.ended });
  });
});

describe('the end', () => {
  it('reports an unexpected exit as crashed, ending the turn in progress', async () => {
    const { fake, run, events, onEnd } = await live();
    run.send('Hello');
    fake.close(3);
    expect(events).toEqual([
      { type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-1', outcome: 'failed' },
      { type: 'error', sessionId: 's1', error: { code: 'crashed', exitCode: 3 } },
    ]);
    expect(onEnd).toHaveBeenCalledOnce();
    fake.close(3);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(() => run.send('Again')).toThrow(AgentNotRunningError);
    // Output after the end is read but answers nothing.
    fake.print({ type: 'control_request', request_id: 'late', request: {} });
    expect(fake.written).toHaveLength(1);
    run.stop();
    run.kill();
    await run.close();
  });

  it('reports a process error as a crash with no exit code', async () => {
    const { fake, events, sink } = await live();
    fake.fail(new Error('EPERM'));
    expect(events).toEqual([
      { type: 'error', sessionId: 's1', error: { code: 'crashed', exitCode: null } },
    ]);
    expect(sink).toHaveBeenCalledWith('error', 'Agent process failed', {
      sessionId: 's1',
      error: { name: 'Error' },
    });
  });

  it('closes by closing input, then SIGTERM and SIGKILL after grace periods; no crash reported', async () => {
    const { fake, run, time, events } = await live();
    const closed = run.close();
    expect(fake.child.stdin.end).toHaveBeenCalled();
    expect(() => run.send('Hello')).toThrow('Not running');
    time.advance(CLOSE_GRACE_MS);
    expect(fake.child.kill).toHaveBeenCalledWith('SIGTERM');
    time.advance(CLOSE_GRACE_MS);
    expect(fake.child.kill).toHaveBeenCalledWith('SIGKILL');
    fake.close(null, 'SIGKILL');
    await closed;
    expect(events).toEqual([]);
    await expect(run.close()).resolves.toBeUndefined();
  });

  it('clears its timers when claude exits within the grace period', async () => {
    const { fake, run, time } = await live();
    const closed = run.close();
    const again = run.close();
    fake.close(0);
    await Promise.all([closed, again]);
    expect(time.pending()).toBe(0);
    expect(fake.child.kill).not.toHaveBeenCalled();
  });

  it('kills at once: input closed and SIGTERM in the same call, with no timer run', async () => {
    // The app is quitting and no timer outlives it; a claude mid-turn ignores its input closing.
    const { fake, run, time, events } = await live();
    run.send('Hello');
    run.kill();
    expect(fake.child.stdin.end).toHaveBeenCalledOnce();
    expect(fake.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    run.kill();
    expect(fake.child.kill).toHaveBeenCalledOnce();
    time.advance(CLOSE_GRACE_MS);
    expect(fake.child.kill).toHaveBeenLastCalledWith('SIGKILL');
    fake.stdinError(new Error('EPIPE'));
    fake.close(null, 'SIGKILL');
    expect(time.pending()).toBe(0);
    expect(events).toEqual([]);
    run.stop();
  });

  it('kills at once during a close’s grace period, without closing its input again', async () => {
    const { fake, run, time } = await live();
    const closed = run.close();
    run.kill();
    expect(fake.child.stdin.end).toHaveBeenCalledOnce();
    expect(fake.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    fake.close(143, 'SIGTERM');
    await closed;
    expect(time.pending()).toBe(0);
  });
});
