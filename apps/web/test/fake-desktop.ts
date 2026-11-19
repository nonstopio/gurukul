import { vi } from 'vitest';
import { isAgentSessionFile } from '../src/desktop/bridge';
import type {
  AgentEvent,
  AgentStartResult,
  AgentStatus,
  AgentToolCall,
  AgentToolResult,
  DesktopInfo,
  GurukulDesktop,
} from '../src/desktop/bridge';

export const DESKTOP_INFO: DesktopInfo = {
  bridgeVersion: 1,
  appVersion: '0.1.0',
  platform: 'darwin',
};

const NOT_AVAILABLE = () =>
  Promise.reject(new Error('Error invoking remote method: Error: Not available in this version'));

/**
 * The desktop bridge in memory: `store.*` keeps files in a map keyed `uid/sessionId/path`, as the
 * shell's store does on disk, and refuses the agent's own files as it does; `agent.forget` resolves; the rest refuse as an unbuilt call does.
 */
export function fakeDesktop(
  init: { files?: Record<string, string>; info?: () => Promise<DesktopInfo> } = {},
) {
  const files = new Map(Object.entries(init.files ?? {}));
  const key = (uid: string, sessionId: string, path: string) => `${uid}/${sessionId}/${path}`;
  const refuse = vi.fn(NOT_AVAILABLE);
  // The shell refuses to write or remove its agent files one by one, in any case.
  const writable = (path: string) => {
    if (isAgentSessionFile(path)) {
      throw new Error('Error invoking remote method: Error: Reserved session file name');
    }
  };
  const desktop = {
    info: vi.fn(init.info ?? (async () => DESKTOP_INFO)),
    store: {
      read: vi.fn(async ({ uid, sessionId, path }) => files.get(key(uid, sessionId, path)) ?? null),
      write: vi.fn(async ({ uid, sessionId, path }, data: string) => {
        writable(path);
        files.set(key(uid, sessionId, path), data);
      }),
      list: vi.fn(async ({ uid, sessionId }) => {
        const prefix = sessionId === undefined ? `${uid}/` : `${uid}/${sessionId}/`;
        const found = [...files.keys()].filter((k) => k.startsWith(prefix));
        const names = found.map((k) =>
          sessionId === undefined ? k.slice(prefix.length).split('/')[0] : k.slice(prefix.length),
        );
        return [...new Set(names)].sort() as string[];
      }),
      remove: vi.fn(async ({ uid, sessionId, path }) => {
        if (path !== undefined) writable(path);
        for (const k of [...files.keys()]) {
          if (
            path === undefined
              ? k.startsWith(`${uid}/${sessionId}/`)
              : k === key(uid, sessionId, path)
          )
            files.delete(k);
        }
      }),
    },
    agent: {
      status: refuse,
      start: refuse,
      send: refuse,
      stop: refuse,
      close: refuse,
      forget: vi.fn(async () => undefined),
      toolResult: refuse,
      onEvent: vi.fn(() => () => undefined),
      onToolCall: vi.fn(() => () => undefined),
    },
    sources: { choose: refuse, list: refuse, reveal: refuse, read: refuse },
    auth: { googleSignIn: refuse },
    app: {
      checkForUpdate: refuse,
      onUpdateReady: vi.fn(() => () => undefined),
      installUpdate: refuse,
    },
  } satisfies GurukulDesktop;
  return { desktop, files };
}

/** A Claude session id the fake agent answers `agent.start` with. */
export const AGENT_SESSION_ID = '0b0e3d5e-6a4b-4f43-9d7a-1c2a6f0e9b11';

/**
 * Makes a fake bridge's `agent.*` work like the shell's (`DSK-10`), without any `claude`: `status`
 * says ready, `start` answers `AGENT_SESSION_ID`, `send`, `stop` and `close` resolve. The test plays
 * the agent: `emit` sends an event to every `onEvent` handler, in order and at once; `call` sends a
 * tool call to every `onToolCall` handler and resolves with the window's `agent.toolResult` answer.
 * No timers: a test awaits `call`, or the session's `settled()`.
 */
export function fakeAgent(
  desktop: GurukulDesktop,
  init: { status?: AgentStatus; start?: AgentStartResult } = {},
) {
  const onEvent = new Set<(event: AgentEvent) => void>();
  const onToolCall = new Set<(call: AgentToolCall) => void>();
  const answers = new Map<string, (result: AgentToolResult) => void>();
  let calls = 0;
  const agent = {
    status: vi.fn(
      async (): Promise<AgentStatus> => init.status ?? { state: 'ready', version: '2.1.328' },
    ),
    start: vi.fn(
      async (): Promise<AgentStartResult> =>
        init.start ?? { ok: true, agentSessionId: AGENT_SESSION_ID },
    ),
    send: vi.fn(async (...args: [sessionId: string, message: string]) => void args),
    stop: vi.fn(async (...args: [sessionId: string]) => void args),
    close: vi.fn(async (...args: [sessionId: string]) => void args),
    forget: desktop.agent.forget,
    toolResult: vi.fn(async (_sessionId: string, callId: string, result: AgentToolResult) => {
      answers.get(callId)?.(result);
      answers.delete(callId);
    }),
    onEvent: vi.fn((handler: (event: AgentEvent) => void) => {
      onEvent.add(handler);
      return () => {
        onEvent.delete(handler);
      };
    }),
    onToolCall: vi.fn((handler: (call: AgentToolCall) => void) => {
      onToolCall.add(handler);
      return () => {
        onToolCall.delete(handler);
      };
    }),
  } satisfies GurukulDesktop['agent'];
  desktop.agent = agent;
  return {
    agent,
    /** How many pages listen to the agent's events and tool calls. */
    listening: () => onEvent.size + onToolCall.size,
    emit(event: AgentEvent) {
      for (const handler of [...onEvent]) handler(event);
    },
    call(name: string, input: unknown, sessionId = 's1'): Promise<AgentToolResult> {
      calls += 1;
      const callId = `call-${calls}`;
      const answer = new Promise<AgentToolResult>((resolve) => answers.set(callId, resolve));
      for (const handler of [...onToolCall]) handler({ sessionId, callId, name, input });
      return answer;
    },
  };
}

/** Puts the bridge where the desktop app's preload puts it; `uninstall` in `afterEach`. */
export function installDesktop(desktop: GurukulDesktop) {
  (window as { gurukulDesktop?: unknown }).gurukulDesktop = desktop;
}

export function uninstallDesktop() {
  delete (window as { gurukulDesktop?: unknown }).gurukulDesktop;
}
