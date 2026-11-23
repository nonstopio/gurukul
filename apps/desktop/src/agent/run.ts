import type { AgentError, AgentEvent, AgentToolResult, TurnOutcome } from '../bridge';
import type { EventSender } from '../events';
import type { Logger } from '../log';
import type { ChildLike, Clock } from './platform';
import {
  controlRefusalLine,
  controlRequestLine,
  createLineSplitter,
  readLine,
  userMessageLine,
  type StreamItem,
} from './stream';

/**
 * One long-lived `claude` for one session: messages in, events out, tool calls to the window and
 * back. Stop is the stream-json `interrupt` control request (the process stays); closing is closing
 * its input, then SIGTERM after a grace period (`.plan/22-desktop-studio.md`, Stopping). Never logs
 * what `claude` prints: chat text, course text and, in `mcp_status`, the endpoint's token.
 */

/** How long a closing `claude` may take to finish before SIGTERM, and again before SIGKILL. */
export const CLOSE_GRACE_MS = 5_000;
/** How long the window has to answer a tool call before the model is told it did not. */
export const TOOL_CALL_TIMEOUT_MS = 120_000;

/** Sentences the model reads when a tool call cannot be answered. */
export const TOOL_ERRORS = {
  ended: 'The Gurukul session has ended, so the tool did not run.',
  noWindow: 'The Gurukul window is not open, so the tool did not run.',
  timeout:
    'The Gurukul window did not answer in time. Read the course again before trying the change once more.',
} as const;

/** `agent.send` for a session whose `claude` is not running: `agent.send failed (not_running)`. */
export class AgentNotRunningError extends Error {
  override name = 'AgentNotRunningError';
  readonly code = 'not_running';
}

export type InitResult = { ok: true } | { ok: false; error: AgentError };

/**
 * The window of every model alias the Educator can pick (Opus, Sonnet, Haiku) unless Claude Code
 * names another in the turn's result (`modelUsage[...].contextWindow`, which a 1M-token model does).
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

export interface RunOptions {
  sessionId: string;
  agentSessionId: string;
  child: ChildLike;
  clock: Clock;
  randomId(): string;
  events: EventSender;
  log: Logger;
  /** Called once when the process has ended, for whatever reason. */
  onEnd(): void;
}

export interface AgentRun {
  readonly sessionId: string;
  /** The Claude session id, as `claude` last reported it. */
  readonly agentSessionId: string;
  /** Resolves when the process has ended. */
  readonly ended: Promise<void>;
  /** Asks for the account before the first message; `tokenSource: none` is "not signed in". */
  initialize(timeoutMs: number): Promise<InitResult>;
  /** From here on, an unexpected end is reported to the window as `crashed`. */
  markLive(): void;
  send(message: string): void;
  stop(): void;
  close(): Promise<void>;
  /**
   * Ends it now (the app is quitting, or the start failed): input closed and SIGTERM at once, in
   * the same call, then SIGKILL after a grace period if the process is still there.
   */
  kill(): void;
  callTool(name: string, input: unknown): Promise<AgentToolResult>;
  /** False when no call with that id is waiting (answered already, or timed out). */
  toolResult(callId: string, result: AgentToolResult): boolean;
}

export function createRun(options: RunOptions): AgentRun {
  const { sessionId, child, clock, events, log } = options;
  let agentSessionId = options.agentSessionId;
  let live = false;
  let ended = false;
  let closing = false;
  let killed = false;
  let turnsInFlight = 0;
  let stopRequested = false;
  let errorReported = false;
  // Tokens the newest request read: input and cache, which is how full the context is.
  let contextTokens: number | null = null;
  const timers: unknown[] = [];
  const controls = new Map<string, (tokenSource: string | null) => void>();
  const calls = new Map<string, (result: AgentToolResult) => void>();
  let resolveEnded!: () => void;
  const endedPromise = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  let endListeners: ((code: number | null) => void)[] = [];

  const emit = (event: AgentEvent) => events.send('agent.onEvent', event);
  const write = (text: string) => {
    if (!ended) child.stdin.write(text);
  };

  const reportError = (error: AgentError) => {
    if (errorReported) return;
    errorReported = true;
    log.warn('Agent error', { sessionId, code: error.code });
    emit({ type: 'error', sessionId, error });
    // The turn would retry for minutes on the Educator's plan; end it now and say why.
    if (turnsInFlight > 0) write(controlRequestLine(options.randomId(), 'interrupt'));
  };

  let contextWindow: number | null = null;
  const endTurn = (outcome: TurnOutcome) => {
    log.info('Agent turn ended', { sessionId, outcome });
    emit({
      type: 'turn_end',
      sessionId,
      agentSessionId,
      outcome,
      ...(contextTokens !== null && {
        context: { used: contextTokens, window: contextWindow ?? DEFAULT_CONTEXT_WINDOW },
      }),
    });
  };

  const handle = (item: StreamItem) => {
    switch (item.kind) {
      case 'init':
        if (item.agentSessionId !== null) agentSessionId = item.agentSessionId;
        return;
      case 'usage':
        contextTokens = item.tokens;
        return;
      case 'text':
      case 'activity':
        emit({ type: item.kind, sessionId, text: item.text });
        return;
      case 'not_signed_in':
        reportError({ code: 'not_signed_in' });
        return;
      case 'plan_limit':
        reportError({ code: 'plan_limit', resetsAt: item.resetsAt });
        return;
      case 'result': {
        if (item.agentSessionId !== null) agentSessionId = item.agentSessionId;
        if (item.contextWindow !== null) contextWindow = item.contextWindow;
        const outcome: TurnOutcome = errorReported
          ? 'failed'
          : stopRequested && item.aborted
            ? 'stopped'
            : item.failed
              ? 'failed'
              : 'done';
        turnsInFlight = Math.max(0, turnsInFlight - 1);
        stopRequested = false;
        errorReported = false;
        endTurn(outcome);
        return;
      }
      case 'control_response':
        controls.get(item.requestId)?.(item.tokenSource);
        controls.delete(item.requestId);
        return;
      case 'control_request':
        write(controlRefusalLine(item.requestId));
        return;
    }
  };

  const decoder = new TextDecoder();
  const split = createLineSplitter((line) => readLine(line).forEach(handle));
  child.stdout.on('data', (chunk) =>
    split(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })),
  );
  // A write after the process has gone fails here (EPIPE); its end is reported below.
  child.stdin.on('error', () => undefined);

  const end = (code: number | null, signal: string | null) => {
    if (ended) return;
    ended = true;
    timers.forEach((t) => clock.clearTimeout(t));
    for (const answer of [...calls.values()]) answer({ error: TOOL_ERRORS.ended });
    log.info('Agent exited', { sessionId, code, signal, expected: closing || !live });
    if (live && !closing) {
      if (turnsInFlight > 0) endTurn('failed');
      emit({ type: 'error', sessionId, error: { code: 'crashed', exitCode: code } });
    }
    endListeners.forEach((listener) => listener(code));
    endListeners = [];
    options.onEnd();
    resolveEnded();
  };
  child.on('close', end);
  child.on('error', (error) => {
    log.error('Agent process failed', error, { sessionId });
    end(null, null);
  });

  const closeInput = () => {
    if (closing) return;
    closing = true;
    child.stdin.end();
  };

  return {
    sessionId,
    get agentSessionId() {
      return agentSessionId;
    },
    ended: endedPromise,

    initialize(timeoutMs) {
      if (ended) return Promise.resolve({ ok: false, error: { code: 'crashed', exitCode: null } });
      return new Promise<InitResult>((resolve) => {
        const requestId = options.randomId();
        const timer = clock.setTimeout(() => {
          controls.delete(requestId);
          resolve({ ok: false, error: { code: 'crashed', exitCode: null } });
        }, timeoutMs);
        timers.push(timer);
        const settle = (result: InitResult) => {
          clock.clearTimeout(timer);
          resolve(result);
        };
        controls.set(requestId, (tokenSource) =>
          settle(
            tokenSource === 'none' ? { ok: false, error: { code: 'not_signed_in' } } : { ok: true },
          ),
        );
        endListeners.push((exitCode) =>
          settle({ ok: false, error: { code: 'crashed', exitCode } }),
        );
        write(controlRequestLine(requestId, 'initialize'));
      });
    },

    markLive() {
      live = true;
    },

    send(message) {
      if (ended || closing) throw new AgentNotRunningError('Not running');
      turnsInFlight += 1;
      write(userMessageLine(message));
    },

    stop() {
      if (ended || turnsInFlight === 0) return;
      stopRequested = true;
      write(controlRequestLine(options.randomId(), 'interrupt'));
    },

    close() {
      if (!ended && !closing) {
        closeInput();
        timers.push(clock.setTimeout(() => child.kill('SIGTERM'), CLOSE_GRACE_MS));
        timers.push(clock.setTimeout(() => child.kill('SIGKILL'), 2 * CLOSE_GRACE_MS));
      }
      return endedPromise;
    },

    kill() {
      if (ended || killed) return;
      killed = true;
      closeInput();
      // SIGTERM now, not on a timer: the app may be quitting, and no timer outlives it. A `claude`
      // left only with its input closed would finish its turn without anyone listening.
      child.kill('SIGTERM');
      timers.push(clock.setTimeout(() => child.kill('SIGKILL'), CLOSE_GRACE_MS));
    },

    callTool(name, input) {
      if (ended || closing) return Promise.resolve({ error: TOOL_ERRORS.ended });
      const callId = options.randomId();
      emit({ type: 'tool_call', sessionId, callId, name });
      return new Promise<AgentToolResult>((resolve) => {
        const answer = (result: AgentToolResult) => {
          clock.clearTimeout(timer);
          calls.delete(callId);
          resolve(result);
        };
        const timer = clock.setTimeout(() => {
          log.warn('Agent tool call timed out', { sessionId });
          answer({ error: TOOL_ERRORS.timeout });
        }, TOOL_CALL_TIMEOUT_MS);
        calls.set(callId, answer);
        if (!events.send('agent.onToolCall', { sessionId, callId, name, input })) {
          answer({ error: TOOL_ERRORS.noWindow });
        }
      });
    },

    toolResult(callId, result) {
      const answer = calls.get(callId);
      if (answer === undefined) return false;
      answer(result);
      return true;
    },
  };
}
