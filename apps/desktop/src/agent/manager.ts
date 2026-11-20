import path from 'node:path';
import {
  MAX_ASKS_RUNNING,
  type AgentAskRequest,
  type AgentAskResult,
  type AgentError,
  type AgentStartRequest,
  type AgentStartResult,
  type AgentStatus,
  type AgentToolResult,
  type SessionRef,
} from '../bridge';
import type { EventSender } from '../events';
import type { Logger } from '../log';
import { runAsk, type AskRun } from './ask';
import { startToolEndpoint } from './endpoint';
import {
  claudeConfigDir,
  ensureFolder,
  forgetTranscript,
  isFolder,
  writeSessionFiles,
} from './files';
import { findClaude, runCommand } from './find';
import {
  MIN_CLAUDE_VERSION,
  askArgs,
  childEnv,
  claudeArgs,
  isAtLeast,
  parseVersion,
} from './launch';
import type { AgentPlatform } from './platform';
import { AgentNotRunningError, createRun, type AgentRun } from './run';

/**
 * `agent.*` in the main process (`DSK-10`): find Claude Code, start one `claude` per open session
 * with the pinned flags and the allow-listed environment, stream its events to the window, forward
 * its tool calls to the window and back, and remove its own copy of a chat when asked. Never reads
 * or stores a Claude credential: the sign-in is Claude Code's own, and the bridge only asks whether
 * there is one (`auth status`, `initialize`).
 */

/** How long `claude --version` and `claude auth status` may take. */
export const COMMAND_TIMEOUT_MS = 15_000;
/** How long a started `claude` may take to answer `initialize`. */
export const INIT_TIMEOUT_MS = 30_000;

export interface AgentManagerOptions {
  platform: AgentPlatform;
  /** `{userData}/sessions`: the session folders `store.ts` keeps. */
  sessionsRoot: string;
  events: EventSender;
  /**
   * The Sources folder the Educator chose for a session (`sources.choose`, `DSK-20`), or null.
   * Without it, every session works in an empty folder of its own.
   */
  sourcesFolder?: (ref: SessionRef) => Promise<string | null>;
  /**
   * The empty folder a one-shot `agent.ask` runs in (`DSK-18`): `{userData}/ask` by default, beside
   * the session folders and in none of them. Nothing is written to it.
   */
  askDir?: string;
  log: Logger;
}

export interface AgentManager {
  status(): Promise<AgentStatus>;
  start(request: AgentStartRequest): Promise<AgentStartResult>;
  send(sessionId: string, message: string): void;
  stop(sessionId: string): void;
  close(sessionId: string): Promise<void>;
  forget(agentSessionId: string): Promise<void>;
  toolResult(sessionId: string, callId: string, result: AgentToolResult): void;
  /** One question to a one-shot `claude` with no tools (`askArgs`), at most `MAX_ASKS_RUNNING` at once. */
  ask(request: AgentAskRequest): Promise<AgentAskResult>;
  /** Ends a running ask; it answers `cancelled`. */
  cancelAsk(askId: string): void;
  /** Ends every session's process and every ask now, a starting one too: the app is quitting. */
  closeAll(): void;
}

type Found =
  | { ok: true; file: string; version: string }
  | { ok: false; error: Extract<AgentError, { code: 'not_installed' | 'too_old' }> };

/** True when `claude auth status` printed JSON saying it is signed in. */
export function isSignedIn(stdout: string): boolean {
  try {
    return (JSON.parse(stdout) as { loggedIn?: unknown }).loggedIn === true;
  } catch {
    return false;
  }
}

export function createAgentManager(options: AgentManagerOptions): AgentManager {
  const { platform, events, log } = options;
  const sourcesFolder = options.sourcesFolder ?? (() => Promise.resolve(null));
  const runs = new Map<string, AgentRun>();
  // Every process not yet ended, including one still answering `initialize`: what quitting kills.
  const processes = new Set<AgentRun>();
  const starting = new Map<string, Promise<AgentStartResult>>();
  // Every ask from the moment it is taken, its process once started: what `cancelAsk` ends.
  const asks = new Map<string, { cancelled: boolean; run: AskRun | null }>();
  const askDir = options.askDir ?? path.join(path.dirname(options.sessionsRoot), 'ask');
  // Short commands get the allow-listed environment too, so they see what a session would.
  const commandOptions = () => ({
    cwd: platform.homeDir,
    env: childEnv(platform.env, platform.platform),
  });

  const find = async (): Promise<Found> => {
    const file = await findClaude(platform.env, platform.platform, platform.isExecutable);
    if (file === null) return { ok: false, error: { code: 'not_installed' } };
    const out = await runCommand(
      platform.spawn,
      platform.clock,
      file,
      ['--version'],
      commandOptions(),
      COMMAND_TIMEOUT_MS,
    );
    if (out === null || out.code !== 0) return { ok: false, error: { code: 'not_installed' } };
    const version = parseVersion(out.stdout) ?? 'unknown';
    if (version === 'unknown' || !isAtLeast(version, MIN_CLAUDE_VERSION)) {
      return {
        ok: false,
        error: { code: 'too_old', version, minimumVersion: MIN_CLAUDE_VERSION },
      };
    }
    return { ok: true, file, version };
  };

  const launch = async (request: AgentStartRequest): Promise<AgentStartResult> => {
    const found = await find();
    if (!found.ok) {
      log.warn('Agent not started', { reason: found.error.code });
      return found;
    }
    const { uid, sessionId, resumeId } = request;
    const token = platform.randomToken();
    const agentSessionId = resumeId ?? platform.randomId();
    // A call needs the token, which only the process started below has: `run` is set by then.
    const target: { run?: AgentRun } = {};
    const endpoint = await startToolEndpoint({
      listen: platform.listen,
      token,
      tools: request.tools,
      call: (name, input) => (target.run as AgentRun).callTool(name, input),
      log,
    });
    let child;
    try {
      const files = await writeSessionFiles({
        sessionsRoot: options.sessionsRoot,
        uid,
        sessionId,
        systemPrompt: request.systemPrompt,
        skills: request.skills,
        endpointUrl: endpoint.url,
      });
      const sources = await sourcesFolder({ uid, sessionId });
      const cwd = sources !== null && (await isFolder(sources)) ? sources : files.emptyDir;
      child = platform.spawn(
        found.file,
        claudeArgs(files, resumeId === null ? { sessionId: agentSessionId } : { resumeId }),
        { cwd, env: childEnv(platform.env, platform.platform, token) },
      );
    } catch (error) {
      await endpoint.close();
      throw error;
    }
    const started = createRun({
      sessionId,
      agentSessionId,
      child,
      clock: platform.clock,
      randomId: () => platform.randomId(),
      events,
      log,
      onEnd: () => {
        processes.delete(started);
        if (runs.get(sessionId) === started) runs.delete(sessionId);
        void endpoint.close();
      },
    });
    target.run = started;
    processes.add(started);
    const init = await started.initialize(INIT_TIMEOUT_MS);
    if (!init.ok) {
      started.kill();
      await started.ended;
      log.warn('Agent not started', { reason: init.error.code });
      return init;
    }
    started.markLive();
    runs.set(sessionId, started);
    log.info('Agent started', { sessionId, resumed: resumeId !== null });
    return { ok: true, agentSessionId };
  };

  const ask = async (
    request: AgentAskRequest,
    slot: { cancelled: boolean; run: AskRun | null },
  ) => {
    const found = await find();
    if (!found.ok) return found;
    await ensureFolder(askDir);
    if (slot.cancelled) return { ok: false, error: { code: 'cancelled' } } as const;
    let child;
    try {
      child = platform.spawn(found.file, askArgs(), {
        cwd: askDir,
        env: childEnv(platform.env, platform.platform),
      });
    } catch {
      return { ok: false, error: { code: 'failed' } } as const;
    }
    slot.run = runAsk({ child, prompt: request.prompt, clock: platform.clock });
    return slot.run.result;
  };

  return {
    async ask(request) {
      if (asks.size >= MAX_ASKS_RUNNING || asks.has(request.askId)) {
        return { ok: false, error: { code: 'busy' } };
      }
      const slot = { cancelled: false, run: null as AskRun | null };
      asks.set(request.askId, slot);
      let result: AgentAskResult;
      try {
        result = await ask(request, slot);
      } finally {
        asks.delete(request.askId);
      }
      // The outcome only: the prompt and the reply hold course text.
      log.info('Agent ask ended', { outcome: result.ok ? 'answered' : result.error.code });
      return result;
    },

    cancelAsk(askId) {
      const slot = asks.get(askId);
      if (slot === undefined) return;
      slot.cancelled = true;
      slot.run?.cancel();
    },

    async status() {
      const found = await find();
      if (!found.ok) {
        return found.error.code === 'too_old'
          ? { state: 'too_old', version: found.error.version, minimumVersion: MIN_CLAUDE_VERSION }
          : { state: 'not_installed' };
      }
      const auth = await runCommand(
        platform.spawn,
        platform.clock,
        found.file,
        ['auth', 'status'],
        commandOptions(),
        COMMAND_TIMEOUT_MS,
      );
      return auth !== null && isSignedIn(auth.stdout)
        ? { state: 'ready', version: found.version }
        : { state: 'not_signed_in', version: found.version };
    },

    start(request) {
      const running = runs.get(request.sessionId);
      if (running !== undefined) {
        return Promise.resolve({ ok: true, agentSessionId: running.agentSessionId });
      }
      const pending = starting.get(request.sessionId);
      if (pending !== undefined) return pending;
      const next = launch(request).finally(() => starting.delete(request.sessionId));
      starting.set(request.sessionId, next);
      return next;
    },

    send(sessionId, message) {
      const run = runs.get(sessionId);
      if (run === undefined) throw new AgentNotRunningError('Not running');
      run.send(message);
    },

    stop(sessionId) {
      runs.get(sessionId)?.stop();
    },

    async close(sessionId) {
      await runs.get(sessionId)?.close();
    },

    async forget(agentSessionId) {
      const count = await forgetTranscript(
        claudeConfigDir(platform.env, platform.platform, platform.homeDir),
        agentSessionId,
      );
      log.info('Agent transcript removed', { count });
    },

    toolResult(sessionId, callId, result) {
      if (runs.get(sessionId)?.toolResult(callId, result) !== true) {
        log.warn('Agent tool result ignored', { sessionId, reason: 'no such call' });
      }
    },

    closeAll() {
      for (const run of processes) run.kill();
      for (const slot of asks.values()) {
        slot.cancelled = true;
        slot.run?.cancel();
      }
    },
  };
}
