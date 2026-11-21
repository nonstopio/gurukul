import { describe, expect, it, vi } from 'vitest';
import {
  MAX_LINE_LENGTH,
  controlRefusalLine,
  controlRequestLine,
  createLineSplitter,
  readLine,
  userMessageLine,
} from '../../src/agent/stream';

const read = (value: unknown) => readLine(JSON.stringify(value));

describe('lines to claude', () => {
  it('writes a message, a control request and a refusal as one JSON line each', () => {
    expect(JSON.parse(userMessageLine('Hello'))).toEqual({
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });
    expect(controlRequestLine('r1', 'interrupt')).toBe(
      '{"type":"control_request","request_id":"r1","request":{"subtype":"interrupt"}}\n',
    );
    expect(JSON.parse(controlRefusalLine('r2'))).toEqual({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'r2', error: 'Not supported' },
    });
  });
});

describe('readLine', () => {
  it('ignores what is not a JSON object, and types it does not use', () => {
    expect(readLine('not json')).toEqual([]);
    expect(readLine('[1]')).toEqual([]);
    expect(readLine('null')).toEqual([]);
    expect(read({ type: 'user', message: {} })).toEqual([]);
    expect(read({ type: 'stream_event' })).toEqual([]);
  });

  it('reads init with the Claude session id', () => {
    expect(read({ type: 'system', subtype: 'init', session_id: 'abc' })).toEqual([
      { kind: 'init', agentSessionId: 'abc' },
    ]);
    expect(read({ type: 'system', subtype: 'init' })).toEqual([
      { kind: 'init', agentSessionId: null },
    ]);
    expect(read({ type: 'system', subtype: 'compact_boundary' })).toEqual([]);
  });

  it('reads an assistant message: text, thinking and skills; course tools and others say nothing', () => {
    expect(
      read({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: '' },
            { type: 'thinking', thinking: '…' },
            { type: 'tool_use', name: 'Skill', input: { skill: 'gurukul:humanize' } },
            { type: 'tool_use', name: 'Skill', input: { skill: 'deep-research' } },
            { type: 'tool_use', name: 'Skill', input: 'odd' },
            { type: 'tool_use', name: 'Skill', input: { skill: 'gurukul:' } },
            { type: 'tool_use', name: 'mcp__gurukul__get_course', input: {} },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
            'stray',
          ],
        },
      }),
    ).toEqual([
      { kind: 'text', text: 'Hello' },
      { kind: 'activity', text: 'Thinking' },
      { kind: 'activity', text: 'Loading the humanize skill' },
      { kind: 'activity', text: 'Loading a skill' },
      { kind: 'activity', text: 'Loading a skill' },
      { kind: 'activity', text: 'Loading a skill' },
    ]);
    expect(read({ type: 'assistant' })).toEqual([]);
    expect(read({ type: 'assistant', message: { content: 'x' } })).toEqual([]);
  });

  it('reads a failed request as its error, never its canned words', () => {
    const words = { content: [{ type: 'text', text: 'Not logged in · Please run /login' }] };
    expect(read({ type: 'assistant', error: 'authentication_failed', message: words })).toEqual([
      { kind: 'not_signed_in' },
    ]);
    expect(read({ type: 'assistant', error: 'rate_limit', message: words })).toEqual([
      { kind: 'plan_limit', resetsAt: null },
    ]);
    expect(read({ type: 'assistant', error: 'server_error', message: words })).toEqual([]);
  });

  it('reads api_retry: a sign-in or plan limit at once, anything else as waiting', () => {
    const retry = { type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 10 };
    expect(read({ ...retry, error: 'authentication_failed' })).toEqual([{ kind: 'not_signed_in' }]);
    expect(read({ ...retry, error: 'rate_limit' })).toEqual([
      { kind: 'plan_limit', resetsAt: null },
    ]);
    expect(read({ ...retry, error: 'overloaded' })).toEqual([
      { kind: 'activity', text: 'Waiting to try again' },
    ]);
  });

  it('reads a rejected rate limit event with its reset time', () => {
    const event = (info: unknown) => read({ type: 'rate_limit_event', rate_limit_info: info });
    expect(event({ status: 'rejected', resetsAt: 1_800_000_000 })).toEqual([
      { kind: 'plan_limit', resetsAt: '2027-01-15T08:00:00.000Z' },
    ]);
    expect(event({ status: 'rejected', resetsAt: '2027-01-15T08:00:00Z' })).toEqual([
      { kind: 'plan_limit', resetsAt: '2027-01-15T08:00:00.000Z' },
    ]);
    expect(event({ status: 'rejected', resetsAt: 'soon' })).toEqual([
      { kind: 'plan_limit', resetsAt: null },
    ]);
    expect(event({ status: 'rejected', resetsAt: 1e20 })).toEqual([
      { kind: 'plan_limit', resetsAt: null },
    ]);
    expect(event({ status: 'rejected' })).toEqual([{ kind: 'plan_limit', resetsAt: null }]);
    expect(event({ status: 'allowed_warning' })).toEqual([]);
    expect(event(undefined)).toEqual([]);
  });

  it('reads the tokens a request read: input and both caches, none when there are none', () => {
    const usage = (u: unknown) => read({ type: 'assistant', message: { content: [], usage: u } });
    expect(
      usage({
        input_tokens: 10,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 99,
      }),
    ).toEqual([{ kind: 'usage', tokens: 60 }]);
    expect(usage({ input_tokens: 5 })).toEqual([{ kind: 'usage', tokens: 5 }]);
    expect(usage({ input_tokens: 0, cache_read_input_tokens: 'x' })).toEqual([]);
    expect(usage('nope')).toEqual([]);
  });

  it('reads the largest context window a result names', () => {
    const window = (modelUsage: unknown) =>
      (
        read({ type: 'result', subtype: 'success', modelUsage }) as {
          contextWindow: number | null;
        }[]
      )[0]?.contextWindow;
    expect(window({ a: { contextWindow: 200000 }, b: { contextWindow: 1000000 } })).toBe(1000000);
    expect(window({ b: { contextWindow: 1000000 }, a: { contextWindow: 200000 } })).toBe(1000000);
    expect(window({ a: { contextWindow: 'big' }, b: 3 })).toBeNull();
    expect(window([])).toBeNull();
    expect(window(undefined)).toBeNull();
  });

  it('reads a result: done, failed, or aborted by an interrupt', () => {
    expect(read({ type: 'result', subtype: 'success', is_error: false, session_id: 'a' })).toEqual([
      { kind: 'result', failed: false, aborted: false, agentSessionId: 'a', contextWindow: null },
    ]);
    // Signed out: subtype still success, is_error true.
    expect(read({ type: 'result', subtype: 'success', is_error: true })).toEqual([
      { kind: 'result', failed: true, aborted: false, agentSessionId: null, contextWindow: null },
    ]);
    expect(
      read({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        terminal_reason: 'aborted_streaming',
      }),
    ).toEqual([
      { kind: 'result', failed: true, aborted: true, agentSessionId: null, contextWindow: null },
    ]);
  });

  it('reads a control response’s token source and nothing else of the account', () => {
    expect(
      read({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'r1',
          response: { account: { email: 'meera@example.com', tokenSource: 'none' } },
        },
      }),
    ).toEqual([{ kind: 'control_response', requestId: 'r1', tokenSource: 'none' }]);
    expect(
      read({ type: 'control_response', response: { subtype: 'success', request_id: 'r2' } }),
    ).toEqual([{ kind: 'control_response', requestId: 'r2', tokenSource: null }]);
    expect(
      read({
        type: 'control_response',
        response: { request_id: 'r3', response: { account: 'x' } },
      }),
    ).toEqual([{ kind: 'control_response', requestId: 'r3', tokenSource: null }]);
    expect(read({ type: 'control_response' })).toEqual([]);
  });

  it('reads a control request from claude by its id', () => {
    expect(read({ type: 'control_request', request_id: 'q1', request: {} })).toEqual([
      { kind: 'control_request', requestId: 'q1' },
    ]);
    expect(read({ type: 'control_request' })).toEqual([]);
  });
});

describe('createLineSplitter', () => {
  it('gives whole lines as chunks arrive, skipping blank ones', () => {
    const onLine = vi.fn();
    const split = createLineSplitter(onLine);
    split('{"a":');
    split('1}\n\n  \n{"b"');
    split(':2}\n');
    expect(onLine.mock.calls).toEqual([['{"a":1}'], ['{"b":2}']]);
  });

  it('drops a line longer than the limit, whole, and goes on', () => {
    const onLine = vi.fn();
    const split = createLineSplitter(onLine);
    split('x'.repeat(MAX_LINE_LENGTH + 1));
    split('more of it\nnext\n');
    expect(onLine.mock.calls).toEqual([['next']]);
  });
});
