import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, log } from '../src/log';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('desktop logger', () => {
  it('writes at info and above by default, and drops debug', () => {
    const sink = vi.fn();
    const logger = createLogger({ sink });
    logger.debug('Hidden');
    logger.info('Shown', { count: 1 });
    logger.warn('Warned');
    expect(sink.mock.calls).toEqual([
      ['info', 'Shown', { count: 1 }],
      ['warn', 'Warned', {}],
    ]);
  });

  it('writes debug when asked to', () => {
    const sink = vi.fn();
    createLogger({ level: 'debug', sink }).debug('Seen');
    expect(sink).toHaveBeenCalledWith('debug', 'Seen', {});
  });

  it('masks sensitive fields by name', () => {
    const sink = vi.fn();
    createLogger({ sink }).info('Signed in', { email: 'meera@example.com' });
    expect(sink.mock.calls[0]?.[2]).not.toEqual({ email: 'meera@example.com' });
  });

  it('logs only the name and code of an error, never its message', () => {
    const sink = vi.fn();
    const logger = createLogger({ sink });
    const fsError = Object.assign(new Error("EACCES: open '/home/meera/x'"), { code: 'EACCES' });
    logger.error('Failed', fsError, { call: 'store.write' });
    logger.error('Failed', 'a string');
    logger.error('Failed', Object.assign(new Error('x'), { code: 42 }));
    expect(sink.mock.calls).toEqual([
      ['error', 'Failed', { call: 'store.write', error: { name: 'Error', code: 'EACCES' } }],
      ['error', 'Failed', { error: { name: 'Error' } }],
      ['error', 'Failed', { error: { name: 'Error' } }],
    ]);
  });

  it('writes to the console by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    log.warn('Console line', { count: 2 });
    expect(warn).toHaveBeenCalledWith('Console line', { count: 2 });
  });
});
