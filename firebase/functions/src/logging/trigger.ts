import { newTraceId, runWithTrace } from '../api/trace.js';
import { log } from './log.js';
import type { Fields } from './log.js';

/** What to say about a trigger run that finished; `level` defaults to `info`. */
export interface Summary {
  level?: 'debug' | 'info';
  fields?: Fields;
}

/**
 * Runs a trigger or schedule body with a trace, logs one summary line (`events.done`, with
 * `durationMs`) and, if it throws, one error line (`events.failed`) before rethrowing. Triggers
 * have no caller to answer, so they log and throw; they never build a response.
 */
export async function runLogged<T>(
  events: { done: string; failed: string },
  fields: Fields,
  body: () => Promise<T>,
  summarize: (result: T) => Summary = () => ({}),
): Promise<T> {
  return runWithTrace({ traceId: newTraceId() }, async () => {
    const started = Date.now();
    try {
      const result = await body();
      const summary = summarize(result);
      log[summary.level ?? 'info'](events.done, {
        ...fields,
        ...summary.fields,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (e) {
      log.error(events.failed, e, { ...fields, durationMs: Date.now() - started });
      throw e;
    }
  });
}
