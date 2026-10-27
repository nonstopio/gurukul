import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDACTED } from '@gurukul/schema';
import type { LogLevel } from '@gurukul/schema';
import { createLogger, defaultLevel, log } from '../src/log';

type Line = [LogLevel, string, Record<string, unknown>];
function capture(level: LogLevel) {
  const lines: Line[] = [];
  return { lines, logger: createLogger({ level, sink: (l, e, f) => lines.push([l, e, f]) }) };
}

afterEach(() => vi.restoreAllMocks());

describe('log levels', () => {
  it('is warn in production and debug while developing', () => {
    expect(defaultLevel(false)).toBe('warn');
    expect(defaultLevel(true)).toBe('debug');
  });

  it('drops debug and info at the production threshold, keeps warn and error', () => {
    const { lines, logger } = capture(defaultLevel(false));
    logger.debug('Entry', { courseId: 'c' });
    logger.info('Done');
    logger.warn('Retry', { count: 2 });
    logger.error('Failed', new Error('x'));
    expect(lines.map((l) => l[0])).toEqual(['warn', 'error']);
  });

  it('keeps every level at debug', () => {
    const { lines, logger } = capture('debug');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d', 'text');
    expect(lines.map((l) => l[1])).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('masking', () => {
  it('masks fields by name', () => {
    const { lines, logger } = capture('info');
    logger.info('Signup', { email: 'ajay.kumar@nonstopio.com', displayName: 'Ajay', uid: 'u1' });
    expect(lines[0]?.[2]).toEqual({ email: 'ajay.*****', displayName: REDACTED, uid: 'u1' });
  });

  it('never prints credentials or answer keys, even at debug', () => {
    const { lines, logger } = capture('debug');
    logger.debug('Payload', { idToken: 't', correctOptionIds: ['a'], email: 'ajay.kumar@x.com' });
    expect(lines[0]?.[2]).toEqual({
      idToken: REDACTED,
      correctOptionIds: REDACTED,
      email: 'ajay.kumar@x.com',
    });
  });
});

describe('log.error', () => {
  it('serialises the error, masks its message and keeps code and traceId', () => {
    const { lines, logger } = capture('error');
    const err = Object.assign(new Error('failed for ajay.kumar@nonstopio.com token=abc'), {
      code: 'PRK_4001',
      traceId: 't-1',
    });
    logger.error('Grading failed', err, { courseId: 'c' });
    const [, event, fields] = lines[0] as Line;
    expect(event).toBe('Grading failed');
    expect(fields.courseId).toBe('c');
    expect(fields.error).toEqual({
      name: 'Error',
      message: `failed for ajay.***** token=${REDACTED}`,
      code: 'PRK_4001',
      traceId: 't-1',
    });
  });

  it('wraps a thrown non-Error and ignores non-string code and traceId', () => {
    const { lines, logger } = capture('error');
    logger.error('Odd', 'just text');
    logger.error('Odder', Object.assign(new Error('e'), { code: 5, traceId: 7 }));
    expect(lines[0]?.[2].error).toEqual({ name: 'Error', message: 'just text' });
    expect(lines[1]?.[2].error).toEqual({ name: 'Error', message: 'e' });
  });
});

describe('the console sink', () => {
  it('writes the event and the masked fields to the matching console method', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log.warn('Heads up', { email: 'ajay.kumar@x.com' });
    log.error('Broke', new Error('no'));
    expect(warn).toHaveBeenCalledWith('Heads up', { email: 'ajay.*****' });
    expect(err).toHaveBeenCalledWith('Broke', { error: { name: 'Error', message: 'no' } });
  });
});
