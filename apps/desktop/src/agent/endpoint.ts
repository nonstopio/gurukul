import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { AgentTool, AgentToolResult } from '../bridge';
import type { Logger } from '../log';
import type { ListenFn } from './platform';

/**
 * The agent's one MCP server, `gurukul`, served by the main process over HTTP on `127.0.0.1` for one
 * `claude` process (`.plan/22-desktop-studio.md`, Starting Claude Code). It lists only the tools the
 * window gave `agent.start` and hands every call to the window; it runs nothing itself.
 *
 * A request is refused unless it carries `Authorization: Bearer {token}`, the token minted for that
 * one process and kept only in its environment and here; and refused if it has an `Origin` header
 * (a web page is never the caller) or another `Host` (DNS rebinding). Stateless: each request gets
 * its own server and transport, as the spike proved with Claude Code.
 */

export interface ToolEndpoint {
  /** `http://127.0.0.1:{port}/mcp`, for `mcp.json`. */
  readonly url: string;
  close(): Promise<void>;
}

export interface EndpointOptions {
  listen: ListenFn;
  token: string;
  tools: readonly AgentTool[];
  /** Runs one call in the window. Resolves with the window's answer, or an error sentence. */
  call(name: string, input: unknown): Promise<AgentToolResult>;
  log: Logger;
}

/** The path the endpoint answers on. */
export const ENDPOINT_PATH = '/mcp';

export type RefusalReason = 'origin' | 'host' | 'token' | 'path';

/** Why a request may not reach the server, or null when it may. Pure, for the tests. */
export function refusal(
  headers: IncomingMessage['headers'],
  url: string | undefined,
  token: string,
  port: number,
): RefusalReason | null {
  if (headers.origin !== undefined) return 'origin';
  if (headers.host !== `127.0.0.1:${port}`) return 'host';
  if (!bearerMatches(headers.authorization, token)) return 'token';
  if (new URL(url ?? '/', 'http://127.0.0.1').pathname !== ENDPOINT_PATH) return 'path';
  return null;
}

const STATUS: Record<RefusalReason, number> = { origin: 403, host: 403, token: 401, path: 404 };

/** Compares the header with the token in constant time. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The MCP answer for a window's result. */
export function toolCallResult(result: AgentToolResult): CallToolResult {
  if (!('text' in result))
    return { content: [{ type: 'text', text: result.error }], isError: true };
  // Pictures follow the text as MCP `image` content, which Claude Code hands to the model.
  const images = (result.images ?? []).map((i) => ({ type: 'image' as const, ...i }));
  return { content: [{ type: 'text', text: result.text }, ...images] };
}

/** One server for one request: lists the window's tools and forwards each call. */
export function toolServer(tools: readonly AgentTool[], call: EndpointOptions['call']): Server {
  const server = new Server({ name: 'gurukul', version: '1.0.0' }, { capabilities: { tools: {} } });
  const names = new Set(tools.map((t) => t.name));
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: { type: 'object' as const, ...t.inputSchema },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: input } = request.params;
    if (!names.has(name)) return toolCallResult({ error: 'There is no tool with that name.' });
    return toolCallResult(await call(name, input ?? {}));
  });
  return server;
}

function refuse(res: ServerResponse, status: number): void {
  res.writeHead(status, { 'content-type': 'text/plain' }).end();
}

export async function startToolEndpoint(options: EndpointOptions): Promise<ToolEndpoint> {
  const { token, tools, call, log } = options;
  let port = 0;

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const reason = refusal(req.headers, req.url, token, port);
    if (reason !== null) {
      log.warn('Agent tool request refused', { reason });
      refuse(res, STATUS[reason]);
      return;
    }
    const server = toolServer(tools, call);
    // No `sessionIdGenerator`: stateless, one transport per request.
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      log.error('Agent tool request failed', error);
      if (!res.headersSent) refuse(res, 500);
    }
  };

  const listener = await options.listen((req, res) => void handle(req, res));
  port = listener.port;
  return { url: `http://127.0.0.1:${port}${ENDPOINT_PATH}`, close: () => listener.close() };
}
