import { z } from 'zod';
import { BRIDGE_VERSION, MAX_FILE_BYTES, MAX_SEGMENT_LENGTH, MAX_PATH_SEGMENTS } from './bridge';
import type { Handlers } from './ipc';
import type { SessionStore } from './store';

/**
 * The handlers of bridge version 1: `info` and `store.*`. Later items add theirs here (`agent.*`,
 * `auth.googleSignIn`, `sources.*`, `app.*`), each with a zod schema for its arguments. The schemas
 * check shape and length only; `store.ts` decides which names are safe, so the rule lives in one
 * place.
 */

const id = z.string().min(1).max(MAX_SEGMENT_LENGTH);
const relativePath = z
  .string()
  .min(1)
  .max((MAX_SEGMENT_LENGTH + 1) * MAX_PATH_SEGMENTS);
const file = z.object({ uid: id, sessionId: id, path: relativePath }).strict();
// A string with more characters than the limit has bytes is refused here; `store.ts` then measures
// the UTF-8 bytes exactly.
const data = z.string().max(MAX_FILE_BYTES);

export interface HandlerDeps {
  appVersion: string;
  platform: string;
  store: SessionStore;
}

export function createHandlers({ appVersion, platform, store }: HandlerDeps): Handlers {
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
