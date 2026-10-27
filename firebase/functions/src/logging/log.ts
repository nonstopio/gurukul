import * as logger from 'firebase-functions/logger';
import { maskFields, maskLine } from '@gurukul/schema';
import type { LogLevel, MaskOptions } from '@gurukul/schema';
import { currentTrace } from '../api/trace.js';

/** Structured context for one log line. Field names are masked automatically (`maskFields`). */
export type Fields = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** `LOG_LEVEL` (debug, info, warn, error); anything else, or nothing, is `info`. Read on every call. */
function threshold(): LogLevel {
  const wanted = process.env['LOG_LEVEL']?.toLowerCase();
  return wanted === 'debug' || wanted === 'info' || wanted === 'warn' || wanted === 'error'
    ? wanted
    : 'info';
}

function write(level: LogLevel, event: string, fields: Fields, err?: unknown): void {
  if (ORDER[level] < ORDER[threshold()]) return;
  const options: MaskOptions = { level, maskDebug: process.env['LOG_MASK_DEBUG'] === 'true' };
  const traceId = currentTrace()?.traceId;
  const payload: Fields = {
    ...(maskFields(fields, options) as Fields),
    ...(traceId === undefined ? {} : { traceId }),
    ...(err === undefined ? {} : { err: serialise(err, options) }),
  };
  logger[level](event, payload);
}

/** An `Error` as `{ name, message, stack }` with both texts swept for secrets and addresses. */
function serialise(err: unknown, options: MaskOptions): Fields {
  if (err instanceof Error) {
    // The stack's first line repeats the message, so it is swept the same way.
    const { stack } = err;
    return {
      name: err.name,
      message: maskLine(err.message, options),
      stack: stack === undefined ? undefined : maskLine(stack, options),
    };
  }
  return { name: 'NonError', message: maskLine(String(err), options) };
}

/**
 * The only way Cloud Functions log (`.plan/17-logging.md`). A constant event phrase and a fields
 * object; never a value inside the sentence. `error` always takes the `Error` and is called once,
 * by the API wrapper or a trigger's runner.
 */
export const log = {
  debug: (event: string, fields: Fields = {}): void => write('debug', event, fields),
  info: (event: string, fields: Fields = {}): void => write('info', event, fields),
  warn: (event: string, fields: Fields = {}): void => write('warn', event, fields),
  error: (event: string, error: unknown, fields: Fields = {}): void =>
    write('error', event, fields, error),
};
