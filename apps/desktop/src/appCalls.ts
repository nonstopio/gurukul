import { z } from 'zod';
import type { AreaHandlers } from './ipc';
import type { Updates } from './updates';

/**
 * `app.*`: the updater (`updates.ts`). `app.onUpdateReady` goes out through `events.ts`, sent by
 * `updates.ts` when a download finishes.
 */
export function appCalls(updates: Updates): AreaHandlers<'app'> {
  return {
    'app.checkForUpdate': { args: z.tuple([]), run: () => updates.check() },
    'app.installUpdate': { args: z.tuple([]), run: () => updates.install() },
  };
}
