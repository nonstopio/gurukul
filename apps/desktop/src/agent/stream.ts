/**
 * Claude Code's stream-json, both ways: the lines the bridge writes to `claude` and what each line
 * it prints means. Pure: no process, no events, no logging. Shapes are the ones the spike recorded
 * on Claude Code 2.1.328 (`.plan/22-desktop-studio.md`, Spike findings); the reader takes only the
 * fields it needs and ignores the rest, so a line it does not know is no error.
 *
 * Nothing here keeps a credential: an `initialize` answer names the account, and only its
 * `tokenSource` is read; `mcp_status` answers echo the endpoint's token, and are never read.
 */

/** A message from the Educator. */
export function userMessageLine(text: string): string {
  return line({
    type: 'user',
    session_id: '',
    parent_tool_use_id: null,
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
}

/** A control request to `claude`: `initialize` (asks for the account) or `interrupt` (Stop). */
export function controlRequestLine(requestId: string, subtype: 'initialize' | 'interrupt'): string {
  return line({ type: 'control_request', request_id: requestId, request: { subtype } });
}

/** The answer to a control request `claude` sent the bridge: none is supported. */
export function controlRefusalLine(requestId: string): string {
  return line({
    type: 'control_response',
    response: { subtype: 'error', request_id: requestId, error: 'Not supported' },
  });
}

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/** What one line of output means to the bridge. */
export type StreamItem =
  /** `system`/`init`, at the start of every turn. */
  | { kind: 'init'; agentSessionId: string | null }
  /** Words of the reply. */
  | { kind: 'text'; text: string }
  /** What it is doing, in plain words. */
  | { kind: 'activity'; text: string }
  /** The sign-in is missing or was refused. */
  | { kind: 'not_signed_in' }
  /** The plan's limit is reached. */
  | { kind: 'plan_limit'; resetsAt: string | null }
  /** The turn is over. `aborted` when an `interrupt` ended it. */
  | { kind: 'result'; failed: boolean; aborted: boolean; agentSessionId: string | null }
  /** The answer to one of the bridge's control requests. */
  | { kind: 'control_response'; requestId: string; tokenSource: string | null }
  /** A control request from `claude`, which the bridge must answer. */
  | { kind: 'control_request'; requestId: string };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The Skill tool's name for one of ours is `gurukul:{name}`. */
function skillActivity(input: unknown): string {
  const skill = isObject(input) ? str(input.skill) : null;
  const ours = skill?.startsWith('gurukul:') ? skill.slice('gurukul:'.length) : null;
  return ours ? `Loading the ${ours} skill` : 'Loading a skill';
}

/** An error code from Claude Code, as the bridge reports it; null for one it does not report. */
function errorItem(error: unknown, resetsAt: string | null): StreamItem | null {
  if (error === 'authentication_failed') return { kind: 'not_signed_in' };
  if (error === 'rate_limit') return { kind: 'plan_limit', resetsAt };
  return null;
}

/** Seconds since 1970, or a date string, as ISO-8601; null for anything else or out of range. */
function isoTime(value: unknown): string | null {
  const ms =
    typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function assistantItems(msg: Json): StreamItem[] {
  // A failed request comes back as an assistant message with `error` and canned words ("Not
  // logged in · Please run /login"): the bridge reports the error and drops the words.
  if (msg.error !== undefined) {
    const item = errorItem(msg.error, null);
    return item === null ? [] : [item];
  }
  const message = isObject(msg.message) ? msg.message : {};
  const content = Array.isArray(message.content) ? message.content : [];
  const items: StreamItem[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
      items.push({ kind: 'text', text: block.text });
    } else if (block.type === 'thinking') {
      items.push({ kind: 'activity', text: 'Thinking' });
    } else if (block.type === 'tool_use' && block.name === 'Skill') {
      items.push({ kind: 'activity', text: skillActivity(block.input) });
    }
    // Course tools are reported by the endpoint when the call arrives (`tool_call`); anything else
    // is a tool the session does not have, refused by `dontAsk`.
  }
  return items;
}

function systemItems(msg: Json): StreamItem[] {
  if (msg.subtype === 'init') return [{ kind: 'init', agentSessionId: str(msg.session_id) }];
  if (msg.subtype === 'api_retry') {
    const item = errorItem(msg.error, null);
    return [item ?? { kind: 'activity', text: 'Waiting to try again' }];
  }
  return [];
}

/** Everything one line of `claude`'s output means; empty for a line the bridge has no use for. */
export function readLine(text: string): StreamItem[] {
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(msg)) return [];
  switch (msg.type) {
    case 'assistant':
      return assistantItems(msg);
    case 'system':
      return systemItems(msg);
    case 'rate_limit_event': {
      // Not seen signed in yet (`DSK-26`): read as the Agent SDK documents it.
      const info = isObject(msg.rate_limit_info) ? msg.rate_limit_info : {};
      return info.status === 'rejected'
        ? [{ kind: 'plan_limit', resetsAt: isoTime(info.resetsAt) }]
        : [];
    }
    case 'result':
      return [
        {
          kind: 'result',
          failed: msg.is_error === true || msg.subtype !== 'success',
          aborted: msg.terminal_reason === 'aborted_streaming',
          agentSessionId: str(msg.session_id),
        },
      ];
    case 'control_response': {
      const response = isObject(msg.response) ? msg.response : {};
      const requestId = str(response.request_id);
      if (requestId === null) return [];
      const answer = isObject(response.response) ? response.response : {};
      const account = isObject(answer.account) ? answer.account : {};
      return [{ kind: 'control_response', requestId, tokenSource: str(account.tokenSource) }];
    }
    case 'control_request': {
      const requestId = str(msg.request_id);
      return requestId === null ? [] : [{ kind: 'control_request', requestId }];
    }
    default:
      return [];
  }
}

/** The longest line kept while waiting for its end: a whole course read back fits easily. */
export const MAX_LINE_LENGTH = 32 * 1024 * 1024;

/**
 * Splits output into lines as chunks arrive. A line longer than `MAX_LINE_LENGTH` is dropped whole,
 * so a runaway line cannot fill the memory.
 */
export function createLineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = '';
  let dropping = false;
  return (chunk) => {
    const parts = (buffer + chunk).split('\n');
    buffer = parts.pop() as string;
    for (const part of parts) {
      if (!dropping && part.trim() !== '') onLine(part);
      dropping = false;
    }
    if (buffer.length > MAX_LINE_LENGTH) {
      buffer = '';
      dropping = true;
    }
  };
}
