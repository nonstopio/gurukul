import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bearerMatches,
  refusal,
  startToolEndpoint,
  toolCallResult,
  type ToolEndpoint,
} from '../../src/agent/endpoint';
import { nodeAgentPlatform } from '../../src/agent/node';
import { createLogger } from '../../src/log';

const TOKEN = 'f'.repeat(64);
const TOOLS = [
  {
    name: 'get_course',
    description: 'Reads the course.',
    inputSchema: { properties: { depth: { type: 'number' } } },
  },
];

const open: ToolEndpoint[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(open.splice(0).map((e) => e.close()));
});

async function setup(call = vi.fn(async () => ({ text: 'course ok' }))) {
  const sink = vi.fn();
  const endpoint = await startToolEndpoint({
    listen: nodeAgentPlatform('linux', {}, '/').listen,
    token: TOKEN,
    tools: TOOLS,
    call,
    log: createLogger({ sink }),
  });
  open.push(endpoint);
  return { endpoint, call, sink };
}

async function client(url: string, token = TOKEN) {
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return c;
}

describe('refusal', () => {
  const ok = { host: '127.0.0.1:4000', authorization: `Bearer ${TOKEN}` };

  it('lets the token holder reach /mcp', () => {
    expect(refusal(ok, '/mcp', TOKEN, 4000)).toBeNull();
    expect(refusal(ok, '/mcp?x=1', TOKEN, 4000)).toBeNull();
  });

  it('refuses a web page, another host, a wrong token and another path', () => {
    expect(refusal({ ...ok, origin: 'https://evil.example' }, '/mcp', TOKEN, 4000)).toBe('origin');
    expect(refusal({ ...ok, host: 'localhost:4000' }, '/mcp', TOKEN, 4000)).toBe('host');
    expect(refusal({ ...ok, authorization: 'Bearer nope' }, '/mcp', TOKEN, 4000)).toBe('token');
    expect(refusal({ host: ok.host }, '/mcp', TOKEN, 4000)).toBe('token');
    expect(refusal(ok, '/other', TOKEN, 4000)).toBe('path');
    expect(refusal(ok, undefined, TOKEN, 4000)).toBe('path');
  });

  it('compares the whole header', () => {
    expect(bearerMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(bearerMatches(`Bearer ${TOKEN.slice(1)}x`, TOKEN)).toBe(false);
    expect(bearerMatches(TOKEN, TOKEN)).toBe(false);
    expect(bearerMatches(undefined, TOKEN)).toBe(false);
  });
});

describe('toolCallResult', () => {
  it('gives text, or the window’s sentence as an error', () => {
    expect(toolCallResult({ text: 'ok' })).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(toolCallResult({ error: 'No.' })).toEqual({
      content: [{ type: 'text', text: 'No.' }],
      isError: true,
    });
  });
});

describe('startToolEndpoint', () => {
  it('serves on 127.0.0.1 and lists the window’s tools only', async () => {
    const { endpoint } = await setup();
    expect(endpoint.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const c = await client(endpoint.url);
    expect((await c.listTools()).tools).toEqual([
      {
        name: 'get_course',
        description: 'Reads the course.',
        inputSchema: { type: 'object', properties: { depth: { type: 'number' } } },
      },
    ]);
    await c.close();
  });

  it('hands a call to the window and its answer back; refuses a tool it does not list', async () => {
    const { endpoint, call } = await setup();
    const c = await client(endpoint.url);
    await expect(c.callTool({ name: 'get_course', arguments: { depth: 1 } })).resolves.toEqual({
      content: [{ type: 'text', text: 'course ok' }],
    });
    await expect(c.callTool({ name: 'get_course' })).resolves.toMatchObject({
      content: [{ text: 'course ok' }],
    });
    expect(call.mock.calls).toEqual([
      ['get_course', { depth: 1 }],
      ['get_course', {}],
    ]);
    await expect(c.callTool({ name: 'publish_course', arguments: {} })).resolves.toEqual({
      content: [{ type: 'text', text: 'There is no tool with that name.' }],
      isError: true,
    });
    expect(call).toHaveBeenCalledTimes(2);
    await c.close();
  });

  it.each([
    ['no token', {}, 401, 'token'],
    ['a wrong token', { Authorization: 'Bearer wrong' }, 401, 'token'],
    [
      'an Origin',
      { Authorization: `Bearer ${TOKEN}`, Origin: 'https://evil.example' },
      403,
      'origin',
    ],
  ])('refuses a request with %s, logging the reason only', async (_l, headers, status, reason) => {
    const { endpoint, sink } = await setup();
    const res = await fetch(endpoint.url, { method: 'POST', headers, body: '{}' });
    expect(res.status).toBe(status);
    expect(sink).toHaveBeenCalledWith('warn', 'Agent tool request refused', { reason });
    expect(JSON.stringify(sink.mock.calls)).not.toContain(TOKEN);
  });

  it('refuses another path', async () => {
    const { endpoint } = await setup();
    const res = await fetch(endpoint.url.replace('/mcp', '/other'), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
  });

  it('answers 500 when the transport fails, logging the error', async () => {
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest').mockRejectedValue(
      new Error('boom'),
    );
    const { endpoint, sink } = await setup();
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: '{}',
    });
    expect(res.status).toBe(500);
    expect(sink).toHaveBeenCalledWith('error', 'Agent tool request failed', {
      error: { name: 'Error' },
    });
  });

  it('does not answer twice when the transport fails after answering', async () => {
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest').mockImplementation(
      async (_req, res) => {
        res.writeHead(202).end();
        throw new Error('late');
      },
    );
    const { endpoint } = await setup();
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: '{}',
    });
    expect(res.status).toBe(202);
  });
});
