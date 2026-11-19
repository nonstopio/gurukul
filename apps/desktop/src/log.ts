import { maskFields } from '@gurukul/schema';
import type { LogLevel } from '@gurukul/schema';

/**
 * The main-process logger: `log.warn('Constant event', { call })`, the shell's twin of
 * `apps/web/src/log.ts`. It writes to the process's own stdout and stderr, nowhere else. The only
 * file in this workspace allowed to call `console.*` (ESLint). Never log chat text, course text,
 * file names inside a session, or answer keys (`.plan/17-logging.md`, `.plan/22-desktop-studio.md`).
 */

export type LogFields = Record<string, unknown>;
export type LogSink = (level: LogLevel, event: string, fields: LogFields) => void;

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const consoleSink: LogSink = (level, event, fields) => console[level](event, fields);

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  /** Only the error's name and `code`: a Node error's message often holds a path in the home folder. */
  error(event: string, error: unknown, fields?: LogFields): void;
}

export function createLogger(options: { level?: LogLevel; sink?: LogSink } = {}): Logger {
  const threshold = ORDER[options.level ?? 'info'];
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
      const e = error instanceof Error ? error : new Error(String(error));
      const described: LogFields = { name: e.name };
      const { code } = e as { code?: unknown };
      if (typeof code === 'string') described.code = code;
      write('error', event, { ...fields, error: described });
    },
  };
}

export const log = createLogger();
