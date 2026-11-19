import { z } from 'zod';
import type { AgentManager } from './agent/manager';
import { agentCalls } from './agentCalls';
import { appCalls } from './appCalls';
import { id, relativePath } from './args';
import { authCalls } from './authCalls';
import { BRIDGE_VERSION, MAX_FILE_BYTES, type GoogleSignInResult } from './bridge';
import type { AreaHandlers, Handlers } from './ipc';
import type { SessionStore } from './store';
import { sourcesCalls } from './sourcesCalls';
import type { Updates } from './updates';

/**
 * Every handler of bridge version 1, one area per file: `info` and `store.*` here, then
 * `agentCalls.ts` (over `agent/manager.ts`), `sourcesCalls.ts`, `authCalls.ts` and `appCalls.ts`;
 * a call whose item is not built yet is refused as not available. Each has a zod schema for its
 * arguments. The store's schemas check shape and length only; `store.ts` decides which names are
 * safe, so the rule lives in one place.
 */

const file = z.object({ uid: id, sessionId: id, path: relativePath }).strict();
// A string with more characters than the limit has bytes is refused here; `store.ts` then measures
// the UTF-8 bytes exactly.
const data = z.string().max(MAX_FILE_BYTES);

export interface HandlerDeps {
  appVersion: string;
  platform: string;
  store: SessionStore;
  agent: AgentManager;
  /** `auth.googleSignIn` (`googleSignIn.ts`). */
  googleSignIn: () => Promise<GoogleSignInResult>;
  updates: Updates;
}

type CoreHandlers = Pick<Handlers, 'info'> & AreaHandlers<'store'>;

function coreCalls({ appVersion, platform, store }: HandlerDeps): CoreHandlers {
  return {
    info: {
      args: z.tuple([]),
      run: () => ({ bridgeVersion: BRIDGE_VERSION, appVersion, platform }),
    },
    'store.read': { args: z.tuple([file]), run: (f) => store.read(f) },
    'store.write': { args: z.tuple([file, data]), run: (f, d) => store.write(f, d) },
    'store.list': {
      args: z.tuple([z.object({ uid: id, sessionId: id.optional() }).strict()]),
      run: (ref) => store.list(ref),
    },
    'store.remove': {
      args: z.tuple([z.object({ uid: id, sessionId: id, path: relativePath.optional() }).strict()]),
      run: (ref) => store.remove(ref),
    },
  };
}

export function createHandlers(deps: HandlerDeps): Handlers {
  return {
    ...coreCalls(deps),
    ...agentCalls(deps.agent),
    ...sourcesCalls(),
    ...authCalls(deps.googleSignIn),
    ...appCalls(deps.updates),
  };
}
