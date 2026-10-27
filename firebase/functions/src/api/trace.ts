import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

/** The per-request context the logger reads, so every line of one call carries the same `traceId`. */
export interface TraceContext {
  traceId: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

/** A fresh 16-hex-character id; it goes in the response's `errors[].traceId` and in every log line. */
export const newTraceId = (): string => randomBytes(8).toString('hex');

/** Runs `fn` (and everything it awaits) with `context` as the current trace. */
export const runWithTrace = <T>(context: TraceContext, fn: () => T): T => storage.run(context, fn);

/** The trace of the call in progress, or undefined outside one. */
export const currentTrace = (): TraceContext | undefined => storage.getStore();
