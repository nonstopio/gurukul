import * as logger from 'firebase-functions/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTrace } from '../src/api/trace.js';
import { log } from '../src/logging/log.js';
import { runLogged } from '../src/logging/trigger.js';

const last = (fn: unknown) => vi.mocked(fn as typeof logger.info).mock.calls.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('log levels', () => {
  it('defaults to info: drops debug, writes the rest through the structured logger', () => {
    log.debug('Hidden', { a: 1 });
    log.info('Shown', { a: 1 });
    log.warn('Careful', { a: 2 });
    log.error('Broke', new Error('x'), { a: 3 });
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Shown', { a: 1 });
    expect(logger.warn).toHaveBeenCalledWith('Careful', { a: 2 });
    expect(logger.error).toHaveBeenCalledWith('Broke', expect.objectContaining({ a: 3 }));
  });

  it('honours LOG_LEVEL, case-insensitively', () => {
    vi.stubEnv('LOG_LEVEL', 'DEBUG');
    log.debug('Now shown');
    expect(logger.debug).toHaveBeenCalledWith('Now shown', {});
    vi.stubEnv('LOG_LEVEL', 'warn');
    log.info('Dropped');
    log.warn('Kept');
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    vi.stubEnv('LOG_LEVEL', 'error');
    log.warn('Dropped too');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it.each(['verbose', '', 'WARNING'])('treats the invalid LOG_LEVEL %j as info', (value) => {
    vi.stubEnv('LOG_LEVEL', value);
    log.debug('Dropped');
    log.info('Kept');
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});

describe('log masking', () => {
  it('masks emails, tokens and answer keys by field name at info', () => {
    log.info('Signup', {
      email: 'ajay.kumar@nonstopio.com',
      idToken: 'abc',
      answerKey: ['a'],
      nested: { correctOptionIds: ['b'], emailVerified: true },
      courseId: 'git',
    });
    expect(last(logger.info)?.[1]).toEqual({
      email: 'ajay.*****',
      idToken: '[REDACTED]',
      answerKey: '[REDACTED]',
      nested: { correctOptionIds: '[REDACTED]', emailVerified: true },
      courseId: 'git',
    });
  });

  it('leaves emails readable at debug but still redacts credentials', () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    log.debug('Payload', { email: 'ajay.kumar@nonstopio.com', token: 'abc', answerKey: ['a'] });
    expect(last(logger.debug)?.[1]).toEqual({
      email: 'ajay.kumar@nonstopio.com',
      token: '[REDACTED]',
      answerKey: '[REDACTED]',
    });
  });

  it('masks debug too when LOG_MASK_DEBUG=true', () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.stubEnv('LOG_MASK_DEBUG', 'true');
    log.debug('Payload', { email: 'ajay.kumar@nonstopio.com' });
    expect(last(logger.debug)?.[1]).toEqual({ email: 'ajay.*****' });
  });
});

describe('log trace and errors', () => {
  it('adds the traceId only inside a trace', () => {
    log.info('Outside');
    expect(last(logger.info)?.[1]).toEqual({});
    runWithTrace({ traceId: 'abcd1234abcd1234' }, () => log.info('Inside', { a: 1 }));
    expect(last(logger.info)?.[1]).toEqual({ a: 1, traceId: 'abcd1234abcd1234' });
  });

  it('serialises an Error as name, masked message and stack under err', () => {
    const err = new TypeError('failed for ajay.kumar@nonstopio.com with password=hunter2');
    log.error('Failed', err, { courseId: 'git' });
    const fields = last(logger.error)?.[1] as { courseId: string; err: Record<string, string> };
    expect(fields.courseId).toBe('git');
    expect(fields.err['name']).toBe('TypeError');
    expect(fields.err['stack']).toContain('TypeError');
    expect(fields.err['message']).not.toContain('hunter2');
    expect(fields.err['message']).not.toContain('kumar@');
    expect(fields.err['stack']).not.toContain('hunter2');
    expect(fields.err['stack']).not.toContain('kumar@');
  });

  it('copes with an Error that has no stack', () => {
    const err = new Error('plain');
    delete err.stack;
    log.error('Failed', err);
    expect((last(logger.error)?.[1] as { err: unknown }).err).toEqual({
      name: 'Error',
      message: 'plain',
      stack: undefined,
    });
  });

  it('serialises a non-Error value', () => {
    log.error('Failed', 'token=abc');
    expect((last(logger.error)?.[1] as { err: unknown }).err).toEqual({
      name: 'NonError',
      message: 'token=[REDACTED]',
    });
  });
});

describe('runLogged', () => {
  const events = { done: 'Work done', failed: 'Work failed' };

  it('returns the result and logs one info summary with durationMs and a trace', async () => {
    const out = await runLogged(
      events,
      { courseId: 'git' },
      async () => 5,
      (n) => ({
        fields: { count: n },
      }),
    );
    expect(out).toBe(5);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(last(logger.info)).toEqual([
      'Work done',
      {
        courseId: 'git',
        count: 5,
        durationMs: expect.any(Number),
        traceId: expect.stringMatching(/^[0-9a-f]{16}$/),
      },
    ]);
  });

  it('defaults to a plain info line and can summarise at debug', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    await runLogged(events, {}, async () => 1);
    expect(logger.info).toHaveBeenCalledTimes(1);
    await runLogged(
      events,
      {},
      async () => 1,
      () => ({ level: 'debug' }),
    );
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('logs a failure once with the error and rethrows it', async () => {
    const boom = new Error('boom');
    await expect(
      runLogged(events, { courseId: 'git' }, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
    expect(last(logger.error)?.[0]).toBe('Work failed');
  });
});
