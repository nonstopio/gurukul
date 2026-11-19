import { z } from 'zod';
import { sessionRef, sourceName, sourcesChoice } from './args';
import { notAvailable, type AreaHandlers } from './ipc';

/**
 * `sources.*`: the session's Sources folder (`DSK-20`). The window names a session, never a path:
 * the shell remembers which folder the Educator picked for it, outside the session files the window
 * can write, so the agent can read one chosen folder and nothing else. Refused as not available in
 * this version until then.
 */
export function sourcesCalls(): AreaHandlers<'sources'> {
  return {
    'sources.choose': notAvailable(z.tuple([sourcesChoice])),
    'sources.list': notAvailable(z.tuple([sessionRef])),
    'sources.reveal': notAvailable(z.tuple([sessionRef])),
    'sources.read': notAvailable(z.tuple([sessionRef, sourceName])),
  };
}
