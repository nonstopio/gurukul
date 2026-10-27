import { maskFields, maskLine } from '@gurukul/schema';
import type { LogLevel } from '@gurukul/schema';

/**
 * The browser logger: `log.info('Constant event', { courseId })`. It writes only to the console of
 * the person's own browser — there is no remote telemetry. Masking is by field name
 * (`@gurukul/schema`), never log a payload. The only file allowed to call `console.*` (ESLint).
 * Standard: `.plan/17-logging.md`, skill `writing-logs`.
 */

export type LogFields = Record<string, unknown>;
export type LogSink = (level: LogLevel, event: string, fields: LogFields) => void;

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** `debug` while developing, `warn` in a production build. */
export function defaultLevel(dev: boolean): LogLevel {
  return dev ? 'debug' : 'warn';
}

const consoleSink: LogSink = (level, event, fields) => console[level](event, fields);

/** Name and masked message of an error, plus its `code` and `traceId` when it carries them. */
function describeError(error: unknown): LogFields {
  const e = error instanceof Error ? error : new Error(String(error));
  const out: LogFields = { name: e.name, message: e.message };
  const { code, traceId } = e as { code?: unknown; traceId?: unknown };
  if (typeof code === 'string') out.code = code;
  if (typeof traceId === 'string') out.traceId = traceId;
  return out;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, error: unknown, fields?: LogFields): void;
}

export function createLogger(options: { level?: LogLevel; sink?: LogSink } = {}): Logger {
  const threshold = ORDER[options.level ?? defaultLevel(import.meta.env.DEV)];
  const sink = options.sink ?? consoleSink;
  const write = (level: LogLevel, event: string, fields: LogFields) => {
    if (ORDER[level] < threshold) return;
    sink(level, event, maskFields(fields, { level }) as LogFields);
  };
  return {
    debug: (event, fields = {}) => write('debug', event, fields),
    info: (event, fields = {}) => write('info', event, fields),
    warn: (event, fields = {}) => write('warn', event, fields),
    error: (event, error, fields = {}) => {
      const described = describeError(error);
      described.message = maskLine(String(described.message), { level: 'error' });
      write('error', event, { ...fields, error: described });
    },
  };
}

export const log = createLogger();
