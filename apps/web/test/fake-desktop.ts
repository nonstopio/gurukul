import { vi } from 'vitest';
import { isAgentSessionFile } from '../src/desktop/bridge';
import type {
  AgentAskRequest,
  AgentAskResult,
  AgentEvent,
  AgentStartResult,
  AgentStatus,
  AgentToolCall,
  AgentToolResult,
  DesktopInfo,
  GurukulDesktop,
  SourcesFolder,
} from '../src/desktop/bridge';

export const DESKTOP_INFO: DesktopInfo = {
  bridgeVersion: 5,
  appVersion: '0.1.0',
  platform: 'darwin',
};

const NOT_AVAILABLE = () =>
  Promise.reject(new Error('Error invoking remote method: Error: Not available in this version'));

/** The folder `sources.ensure` makes in the fake: two notes in `~/Material`. */
export const SOURCES_FOLDER: SourcesFolder = {
  path: '~/Material',
  files: [
    { name: 'Rebase notes.md', bytes: 120 },
    { name: 'transcript.txt', bytes: 4000 },
  ],
};

/**
 * The desktop bridge in memory: `store.*` keeps files in a map keyed `uid/sessionId/path`, as the
 * shell's store does on disk, and refuses the agent's own files as it does; `sources.*` keeps the
 * folder made per session (`ensure` makes `SOURCES_FOLDER`, `read` answers a listed name);
 * `agent.forget` resolves; the rest refuse as an unbuilt call does.
 */
export function fakeDesktop(
  init: {
    files?: Record<string, string>;
    info?: () => Promise<DesktopInfo>;
    /**
     * No session has a Sources folder until `ensure` makes one: `list` answers null before it, and
     * the runtime defers the agent of a session with no chat. Left out, `list` answers
     * `SOURCES_FOLDER` for every session, as for one opened before, and the agent starts on open.
     */
    noSources?: boolean;
  } = {},
) {
  const files = new Map(Object.entries(init.files ?? {}));
  const key = (uid: string, sessionId: string, path: string) => `${uid}/${sessionId}/${path}`;
  const refuse = vi.fn(NOT_AVAILABLE);
  const chosen = new Map<string, SourcesFolder>();
  const session = ({ uid, sessionId }: { uid: string; sessionId: string }) => `${uid}/${sessionId}`;
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
      ask: refuse,
      cancelAsk: refuse,
      onEvent: vi.fn(() => () => undefined),
      onToolCall: vi.fn(() => () => undefined),
    },
    sources: {
      ensure: vi.fn(
        async (ref: { uid: string; sessionId: string; suggestedName?: string | undefined }) => {
          const folder = chosen.get(session(ref)) ?? SOURCES_FOLDER;
          chosen.set(session(ref), folder);
          return folder;
        },
      ),
      list: vi.fn(
        async (ref: { uid: string; sessionId: string }) =>
          chosen.get(session(ref)) ?? (init.noSources ? null : SOURCES_FOLDER),
      ),
      reveal: vi.fn(async () => undefined),
      read: vi.fn(async (ref: { uid: string; sessionId: string }, name: string) =>
        chosen.get(session(ref))?.files.some((f) => f.name === name) ? `Text of ${name}` : null,
      ),
      readImage: vi.fn(async (ref: { uid: string; sessionId: string }, name: string) =>
        chosen.get(session(ref))?.files.some((f) => f.name === name)
          ? { data: 'AQID', mimeType: 'image/png' as const }
          : null,
      ),
      // Keeps what was added in the folder, as the shell does (without renaming a clash).
      add: vi.fn(
        async (
          ref: { uid: string; sessionId: string },
          files: { name: string; bytes: Uint8Array }[],
        ) => {
          const folder = chosen.get(session(ref)) ?? SOURCES_FOLDER;
          const added = files.map((f) => f.name);
          const next = {
            ...folder,
            files: [
              ...folder.files,
              ...files.map((f) => ({ name: f.name, bytes: f.bytes.length })),
            ],
          };
          chosen.set(session(ref), next);
          return { added, folder: next };
        },
      ),
    },
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
    // The one-shot ask (`DSK-18`) is the test's own: `fakeAsk` plays it.
    ask: desktop.agent.ask,
    cancelAsk: desktop.agent.cancelAsk,
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

/**
 * Plays the shell's `agent.ask` (`DSK-18`) without any `claude`: each ask waits until the test
 * answers it (`answer`, `reply`, `reject`), and `cancelAsk` ends a waiting one as `cancelled`, as
 * the shell does. `waiting()` lists the prompts still unanswered, oldest first.
 */
export function fakeAsk(desktop: GurukulDesktop) {
  const open: {
    request: AgentAskRequest;
    resolve: (result: AgentAskResult) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const take = (text: string) => {
    const at = open.findIndex((o) => o.request.prompt.includes(text));
    if (at < 0) throw new Error('No such ask is waiting');
    return open.splice(at, 1)[0] as (typeof open)[number];
  };
  const ask = vi.fn(
    (request: AgentAskRequest) =>
      new Promise<AgentAskResult>((resolve, reject) => open.push({ request, resolve, reject })),
  );
  const cancelAsk = vi.fn(async (askId: string) => {
    const at = open.findIndex((o) => o.request.askId === askId);
    if (at >= 0) open.splice(at, 1)[0]?.resolve({ ok: false, error: { code: 'cancelled' } });
  });
  desktop.agent.ask = ask;
  desktop.agent.cancelAsk = cancelAsk;
  return {
    ask,
    cancelAsk,
    waiting: () => open.map((o) => o.request.prompt),
    /** Answers the oldest waiting ask whose prompt contains `text` (the oldest of all, without). */
    answer(result: AgentAskResult, text = '') {
      take(text).resolve(result);
    },
    /** A reply in the shape the prompt asks for: `{"correct": [...], "reason": ...}`. */
    reply(correct: string[], text = '', reason = 'The lesson says so.') {
      take(text).resolve({ ok: true, text: JSON.stringify({ correct, reason }) });
    },
    reject(error: unknown, text = '') {
      take(text).reject(error);
    },
  };
}

/** Lets every promise already settled run its callbacks: a macrotask after the microtasks. */
export const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
