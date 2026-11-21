import { z } from 'zod';
import { sessionRef, sourceName, sourcesChoice } from './args';
import type { AreaHandlers } from './ipc';
import type { SourcesManager } from './sources';

/**
 * `sources.*`: the session's Sources folder (`DSK-20`), kept by `sources.ts`. The window names a
 * session, never a path: the shell makes the folder and remembers it, outside the session files the
 * window can write, so the agent can read one folder and nothing else.
 * A file `read` will not read rejects with one of `SOURCE_REFUSALS`, a sentence for the agent.
 */
export function sourcesCalls(sources: SourcesManager): AreaHandlers<'sources'> {
  return {
    'sources.ensure': { args: z.tuple([sourcesChoice]), run: (choice) => sources.ensure(choice) },
    'sources.list': { args: z.tuple([sessionRef]), run: (ref) => sources.list(ref) },
    'sources.reveal': { args: z.tuple([sessionRef]), run: (ref) => sources.reveal(ref) },
    'sources.read': {
      args: z.tuple([sessionRef, sourceName]),
      run: (ref, name) => sources.read(ref, name),
    },
  };
}
