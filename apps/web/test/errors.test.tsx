import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, type ErrorCodeKey } from '@gurukul/schema';
import type { ToastApi } from '@gurukul/ui';
import { ApiClientError } from '../src/api';
import { describeError, toastError, type ErrorType } from '../src/errors';

function failure(code: ErrorCodeKey) {
  const d = ERROR_CODES[code];
  return new ApiClientError(d.status, [
    {
      code,
      title: d.title,
      category: d.category,
      retryable: d.retryable,
      userMessage: d.userMessage,
      developerMessage: 'x',
      details: {},
      traceId: 't',
    },
  ]);
}

const EXPECTED: Partial<Record<ErrorCodeKey, [ErrorType, string]>> = {
  AUTH_1001: ['permission', 'AUTH-EXPIRED'],
  AUTH_1002: ['permission', 'AUTH-FORBIDDEN'],
  AUTH_2001: ['permission', 'AUTH-FORBIDDEN'],
  VAL_1001: ['validation', 'VAL-FIELD'],
  USR_2001: ['not-found', 'DATA-NOT-FOUND'],
  CRS_1002: ['conflict', 'DATA-CONFLICT'],
  CRS_3001: ['server', 'SRV-INTERNAL'],
  PRK_1003: ['permission', 'AUTH-FORBIDDEN'],
  PRK_4001: ['rate-limit', 'API-RATE'],
  GEN_5000: ['server', 'SRV-INTERNAL'],
  GEN_5003: ['network', 'NET-TIMEOUT'],
};

type ShowCall = [string, { tone: string; code: string; action?: { onSelect: () => void } }];

describe('describeError', () => {
  it.each(Object.keys(ERROR_CODES) as ErrorCodeKey[])('describes %s', (code) => {
    const d = describeError(failure(code), 'fallback');
    expect(d.sentence).toBe(ERROR_CODES[code].userMessage);
    expect(d.retryable).toBe(ERROR_CODES[code].retryable);
    expect(d.kind.length).toBeGreaterThan(0);
    expect(d.title.length).toBeGreaterThan(0);
    const expected = EXPECTED[code];
    if (expected) expect([d.type, d.uiCode]).toEqual(expected);
  });

  it('treats anything that is not an API failure as a retryable server error with the fallback', () => {
    expect(describeError(new Error('boom raw text'), 'Try again.')).toMatchObject({
      type: 'server',
      sentence: 'Try again.',
      retryable: true,
      uiCode: 'SRV-INTERNAL',
    });
  });
});

describe('toastError', () => {
  const toast = () => ({ show: vi.fn(() => 1), dismiss: vi.fn() }) satisfies ToastApi;

  it('toasts the sentence and code as an error, with Retry when it can work', () => {
    const t = toast();
    const retry = vi.fn();
    toastError(t, failure('GEN_5003'), 'x', retry);
    const [message, options] = t.show.mock.calls[0] as unknown as ShowCall;
    expect(message).toBe(ERROR_CODES.GEN_5003.userMessage);
    expect(options).toMatchObject({ tone: 'danger', code: 'NET-TIMEOUT' });
    options.action?.onSelect();
    expect(retry).toHaveBeenCalled();
  });

  it('offers no Retry for a non-retryable error or when the caller gives none', () => {
    const t = toast();
    toastError(t, failure('AUTH_2001'), 'x', vi.fn());
    toastError(t, failure('GEN_5003'), 'x');
    for (const call of t.show.mock.calls) {
      expect((call as unknown as ShowCall)[1].action).toBeUndefined();
    }
  });

  it('warns for a rate limit', () => {
    const t = toast();
    toastError(t, failure('PRK_4001'), 'x');
    expect((t.show.mock.calls[0] as unknown as ShowCall)[1].tone).toBe('warning');
  });
});
