import type { z } from 'zod';
import {
  BRIDGE_ERRORS,
  CALLS,
  channel,
  type CallArgs,
  type CallName,
  type CallResult,
} from './bridge';
import type { Logger } from './log';
import { SourcesError } from './sources';
import { SessionFileError } from './store';

/**
 * The main-process side of the bridge: one typed registry of handlers, one gate in front of all of
 * them. Every call is checked before its handler runs:
 *
 *   1. the sender is a top frame (`parent === null`), so an embedded video or page cannot call;
 *   2. that frame's origin is an allowed one (`config.ts`);
 *   3. its arguments pass the handler's zod schema.
 *
 * A refusal or a failure reaches the window as an error with a short constant message; the log line
 * holds the call name and a reason or error code, never an argument.
 */

/** The parts of a frame the gate reads (Electron's `WebFrameMain`). */
export interface FrameLike {
  readonly origin: string;
  readonly parent: unknown;
}

/** The parts of an invoke event the gate reads (Electron's `IpcMainInvokeEvent`). */
export interface InvokeEventLike {
  readonly senderFrame: FrameLike | null;
}

/** Electron's `ipcMain`, as far as the bridge uses it. */
export interface IpcLike {
  handle(channel: string, listener: (event: InvokeEventLike, ...args: unknown[]) => unknown): void;
}

export interface Handler<N extends CallName> {
  /** The arguments as one tuple; anything else is refused before `run`. */
  args: z.ZodType<CallArgs<N>>;
  run(...args: CallArgs<N>): CallResult<N> | Promise<CallResult<N>>;
}

/** A handler for every call: adding a call to `BridgeCalls` without one fails to compile. */
export type Handlers = { [N in CallName]: Handler<N> };

/** The calls of one area: `CallsIn<'agent'>` is `agent.status`, `agent.start`, … */
export type CallsIn<P extends string> = Extract<CallName, `${P}.${string}`>;

/** The handlers of one area, as an `*Calls.ts` file gives them to `createHandlers`. */
export type AreaHandlers<P extends string> = { [N in CallsIn<P>]: Handler<N> };

/** Thrown by a call this shell has in its contract but does not do yet. */
export class NotAvailableError extends Error {
  override name = 'NotAvailableError';
}

/**
 * A handler for a call a later item implements: the arguments are checked as they will be, then the
 * call is refused with `BRIDGE_ERRORS.notAvailable`, so a site that calls it early gets an answer it
 * can show instead of a crash. The item that builds the call replaces `notAvailable(…)` with a
 * handler and keeps the schema.
 */
export function notAvailable<N extends CallName>(args: z.ZodType<CallArgs<N>>): Handler<N> {
  return {
    args,
    run: () => {
      throw new NotAvailableError(BRIDGE_ERRORS.notAvailable);
    },
  };
}

export type SenderCheck = { ok: true } | { ok: false; reason: 'no frame' | 'subframe' | 'origin' };

export function checkSender(event: InvokeEventLike, origins: readonly string[]): SenderCheck {
  const frame = event.senderFrame;
  if (frame === null) return { ok: false, reason: 'no frame' };
  if (frame.parent !== null) return { ok: false, reason: 'subframe' };
  if (!origins.includes(frame.origin)) return { ok: false, reason: 'origin' };
  return { ok: true };
}

/** What the window sees when a call is refused or fails. Constant: no path, no argument. */
export const REFUSED = BRIDGE_ERRORS.refused;
export const INVALID = BRIDGE_ERRORS.invalid;

/** A failure the window can act on: the call and the system error code (`EACCES`), no path. */
function failure(name: CallName, error: unknown): Error {
  const code = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  return new Error(typeof code === 'string' ? `${name} failed (${code})` : `${name} failed`);
}

export function registerHandlers(
  ipc: IpcLike,
  handlers: Handlers,
  origins: readonly string[],
  log: Logger,
): void {
  for (const name of CALLS) {
    const handler = handlers[name] as unknown as Handler<CallName>;
    ipc.handle(channel(name), async (event, ...raw) => {
      const sender = checkSender(event, origins);
      if (!sender.ok) {
        log.warn('Bridge call refused', { call: name, reason: sender.reason });
        throw new Error(REFUSED);
      }
      const parsed = handler.args.safeParse(raw);
      if (!parsed.success) {
        log.warn('Bridge call refused', { call: name, reason: 'arguments' });
        throw new Error(INVALID);
      }
      try {
        return await (handler.run as (...a: unknown[]) => unknown)(...parsed.data);
      } catch (error) {
        if (error instanceof NotAvailableError) {
          log.warn('Bridge call refused', { call: name, reason: 'not available' });
          throw new Error(BRIDGE_ERRORS.notAvailable);
        }
        if (error instanceof SessionFileError) {
          log.warn('Bridge call refused', { call: name, reason: error.message });
          throw new Error(error.message);
        }
        if (error instanceof SourcesError) {
          log.warn('Bridge call refused', { call: name, reason: error.reason });
          throw new Error(error.message);
        }
        log.error('Bridge call failed', error, { call: name });
        throw failure(name, error);
      }
    });
  }
}
