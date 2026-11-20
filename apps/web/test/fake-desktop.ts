import { vi } from 'vitest';
import { isAgentSessionFile } from '../src/desktop/bridge';
import type { DesktopInfo, GurukulDesktop, SourcesFolder } from '../src/desktop/bridge';

export const DESKTOP_INFO: DesktopInfo = {
  bridgeVersion: 1,
  appVersion: '0.1.0',
  platform: 'darwin',
};

const NOT_AVAILABLE = () =>
  Promise.reject(new Error('Error invoking remote method: Error: Not available in this version'));

/** The folder `sources.choose` picks in the fake: two notes in `~/Material`. */
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
 * folder chosen per session (`choose` picks `SOURCES_FOLDER`, `read` answers a listed name);
 * `agent.forget` resolves; the rest refuse as an unbuilt call does.
 */
export function fakeDesktop(
  init: { files?: Record<string, string>; info?: () => Promise<DesktopInfo> } = {},
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
      onEvent: vi.fn(() => () => undefined),
      onToolCall: vi.fn(() => () => undefined),
    },
    sources: {
      choose: vi.fn(async (ref: { uid: string; sessionId: string }) => {
        chosen.set(session(ref), SOURCES_FOLDER);
        return SOURCES_FOLDER as SourcesFolder | null;
      }),
      list: vi.fn(
        async (ref: { uid: string; sessionId: string }) => chosen.get(session(ref)) ?? null,
      ),
      reveal: vi.fn(async () => undefined),
      read: vi.fn(async (ref: { uid: string; sessionId: string }, name: string) =>
        chosen.get(session(ref))?.files.some((f) => f.name === name) ? `Text of ${name}` : null,
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

/** Puts the bridge where the desktop app's preload puts it; `uninstall` in `afterEach`. */
export function installDesktop(desktop: GurukulDesktop) {
  (window as { gurukulDesktop?: unknown }).gurukulDesktop = desktop;
}

export function uninstallDesktop() {
  delete (window as { gurukulDesktop?: unknown }).gurukulDesktop;
}
