import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, apiFail, apiOk, ApiException } from '@gurukul/schema';

const call = vi.hoisted(() => ({ fn: vi.fn(), names: [] as string[] }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => {
    call.names.push(name);
    return call.fn;
  },
}));

import { ApiClientError, callApi, userMessageOf } from '../src/api';

const fns = {} as never;
const failure = (code: 'PRK_4001' | 'VAL_1001', details = {}) =>
  apiFail([new ApiException(code, ['x'], details)], 'trace-1');

describe('callApi', () => {
  it('returns the data of a success envelope and calls the named function', async () => {
    call.fn.mockResolvedValueOnce({ data: apiOk({ n: 1 }) });
    expect(await callApi(fns, 'doIt', { a: 1 })).toEqual({ n: 1 });
    expect(call.names).toContain('doIt');
    expect(call.fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('turns a failure envelope in details into an ApiClientError', async () => {
    call.fn.mockRejectedValueOnce({
      code: 'functions/invalid-argument',
      details: failure('VAL_1001', { field: 'courseIds' }),
    });
    const err = (await callApi(fns, 'x', {}).catch((e) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      code: 'VAL_1001',
      status: 400,
      retryable: false,
      userMessage: ERROR_CODES.VAL_1001.userMessage,
      details: { field: 'courseIds' },
      traceId: 'trace-1',
      unexpected: false,
    });
    expect(err.errors).toHaveLength(1);
    expect(err.message).toContain('VAL_1001');
  });

  it('keeps a retryable flag from the catalog', async () => {
    call.fn.mockRejectedValueOnce({ details: failure('PRK_4001', { nextAttemptAt: 5 }) });
    expect(await callApi(fns, 'x', {}).catch((e) => e)).toMatchObject({
      code: 'PRK_4001',
      status: 429,
      retryable: true,
    });
  });

  it.each([
    ['missing details', { code: 'functions/internal', message: 'boom' }],
    ['garbage details', { code: 'functions/internal', details: { nope: 1 } }],
    ['a success envelope in details', { details: apiOk({}) }],
    ['a non-object error', undefined],
    ['an error with no message', { code: 'functions/internal' }],
  ])('builds a GEN_5000 error for %s', async (_n, thrown) => {
    call.fn.mockRejectedValueOnce(thrown);
    expect(await callApi(fns, 'x', {}).catch((e) => e)).toMatchObject({
      code: 'GEN_5000',
      status: 500,
      retryable: true,
      unexpected: true,
      userMessage: ERROR_CODES.GEN_5000.userMessage,
    });
  });

  it.each(['functions/unavailable', 'functions/deadline-exceeded', 'functions/cancelled'])(
    'builds a GEN_5003 error for %s',
    async (code) => {
      call.fn.mockRejectedValueOnce({ code, message: 'offline' });
      expect(await callApi(fns, 'x', {}).catch((e) => e)).toMatchObject({
        code: 'GEN_5003',
        status: 503,
        unexpected: true,
        userMessage: ERROR_CODES.GEN_5003.userMessage,
      });
    },
  );

  it.each([
    ['not an envelope', { data: { plain: true } }],
    ['a failure envelope returned as a value', { data: failure('VAL_1001') }],
  ])('treats %s as a contract violation', async (_n, response) => {
    call.fn.mockResolvedValueOnce(response);
    expect(await callApi(fns, 'x', {}).catch((e) => e)).toMatchObject({
      code: 'GEN_5000',
      unexpected: true,
    });
  });
});

describe('userMessageOf', () => {
  it('shows the catalog text for an ApiClientError and the fallback for anything else', async () => {
    call.fn.mockRejectedValueOnce({ details: failure('VAL_1001') });
    const err = await callApi(fns, 'x', {}).catch((e) => e);
    expect(userMessageOf(err, 'fallback')).toBe(ERROR_CODES.VAL_1001.userMessage);
    expect(userMessageOf(new Error('x'), 'fallback')).toBe('fallback');
  });
});
