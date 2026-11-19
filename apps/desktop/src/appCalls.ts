import { z } from 'zod';
import { notAvailable, type AreaHandlers } from './ipc';

/**
 * `app.*`: the updater (`DSK-21`, `updates.ts`). `app.onUpdateReady` goes out through `events.ts`.
 * Refused as not available in this version until then.
 */
export function appCalls(): AreaHandlers<'app'> {
  return {
    'app.checkForUpdate': notAvailable(z.tuple([])),
    'app.installUpdate': notAvailable(z.tuple([])),
  };
}
