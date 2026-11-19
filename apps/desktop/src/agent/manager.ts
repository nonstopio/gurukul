import type {
  AgentError,
  AgentStartRequest,
  AgentStartResult,
  AgentStatus,
  AgentToolResult,
  SessionRef,
} from '../bridge';
import type { EventSender } from '../events';
import type { Logger } from '../log';
import { startToolEndpoint } from './endpoint';
import { claudeConfigDir, forgetTranscript, isFolder, writeSessionFiles } from './files';
import { findClaude, runCommand } from './find';
import { MIN_CLAUDE_VERSION, childEnv, claudeArgs, isAtLeast, parseVersion } from './launch';
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
  /** Ends every session's process now: the app is quitting. */
  closeAll(): void;
}

type Found = { ok: true; file: string; version: string } | { ok: false; error: AgentError };

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
  const starting = new Map<string, Promise<AgentStartResult>>();
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
        if (runs.get(sessionId) === started) runs.delete(sessionId);
        void endpoint.close();
      },
    });
    target.run = started;
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

  return {
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
      for (const run of runs.values()) run.kill();
    },
  };
}
