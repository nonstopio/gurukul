import {
  ApiException,
  apiResponseSchema,
  certificateSchema,
  apiErrorSchema,
} from '@gurukul/schema';
import * as logger from 'firebase-functions/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly details?: unknown,
    ) {
      super(message);
    }
  },
  onCall: (options: unknown, fn: (r: unknown) => unknown) => {
    onCallOptions.push(options);
    return fn;
  },
}));
const onCallOptions: unknown[] = [];

const { apiCallable, httpsCodeFor } = await import('../src/api/callable.js');
const { currentTrace } = await import('../src/api/trace.js');

type Call = (request: unknown) => Promise<unknown>;
const call = (handler: (request: never) => unknown): Call =>
  apiCallable(handler as never) as unknown as Call;

/** Runs a callable that must fail and returns the HttpsError it threw. */
async function failure(fn: Call, request: unknown = {}) {
  try {
    await fn(request);
  } catch (e) {
    return e as { code: string; message: string; details: unknown };
  }
  return expect.unreachable('the callable should have thrown');
}

const failureEnvelope = apiResponseSchema(z.unknown());
const secret = 'sk-live-hunter2';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('apiCallable success', () => {
  it('passes its options to onCall, and none by default', () => {
    onCallOptions.length = 0;
    call(() => null);
    apiCallable(() => null, { secrets: ['GMAIL_CREDENTIALS'] });
    expect(onCallOptions).toEqual([{}, { secrets: ['GMAIL_CREDENTIALS'] }]);
  });

  it('returns the data inside a valid envelope', async () => {
    const out = await call(() => ({ roles: ['learner'] }))({});
    const parsed = failureEnvelope.parse(out);
    expect(parsed).toMatchObject({
      status: 200,
      success: true,
      data: { roles: ['learner'] },
      errors: [],
    });
  });

  it('awaits an async handler and gives it the request', async () => {
    const handler = vi.fn(async (r: { data: number }) => r.data + 1);
    const out = (await call(handler)({ data: 1 })) as { data: number };
    expect(out.data).toBe(2);
  });

  it('runs the handler inside a trace and logs debug then info with durationMs', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    let seen: string | undefined;
    await call(() => {
      seen = currentTrace()?.traceId;
    })({ auth: { uid: 'u1' } });
    expect(seen).toMatch(/^[0-9a-f]{16}$/);
    expect(logger.debug).toHaveBeenCalledWith(
      'Callable received',
      expect.objectContaining({ uid: 'u1', traceId: seen }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Callable completed',
      expect.objectContaining({ status: 200, durationMs: expect.any(Number), traceId: seen }),
    );
    expect(currentTrace()).toBeUndefined();
  });
});

describe('apiCallable failures', () => {
  it('turns a 4xx ApiException into an HttpsError whose details are the envelope, logged once as warn', async () => {
    const e = await failure(
      call(() => {
        throw new ApiException('PRK_4001', ['2026-10-27T10:00:00.000Z'], { nextAttemptAt: 7 });
      }),
    );
    expect(e.code).toBe('resource-exhausted');
    const envelope = failureEnvelope.parse(e.details);
    expect(envelope).toMatchObject({ status: 429, success: false, data: null });
    expect(envelope.errors).toHaveLength(1);
    expect(envelope.errors[0]).toMatchObject({
      code: 'PRK_4001',
      details: { nextAttemptAt: 7 },
      traceId: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(e.message).toBe(envelope.message);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Callable refused',
      expect.objectContaining({
        code: 'PRK_4001',
        status: 429,
        traceId: envelope.errors[0]?.traceId,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps a 5xx ApiException to internal and logs it once as error with the Error', async () => {
    const e = await failure(
      call(() => {
        throw new ApiException('CRS_3001', ['git']);
      }),
    );
    expect(e.code).toBe('internal');
    expect(failureEnvelope.parse(e.details)).toMatchObject({ status: 500 });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Callable failed',
      expect.objectContaining({
        code: 'CRS_3001',
        err: expect.objectContaining({ name: 'ApiException' }),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('hides an unknown error behind GEN_5000 and never leaks its message', async () => {
    const e = await failure(
      call(() => {
        throw new Error(`connect failed password=${secret} for ajay.kumar@nonstopio.com`);
      }),
    );
    expect(e.code).toBe('internal');
    const envelope = failureEnvelope.parse(e.details);
    expect(envelope.errors[0]?.code).toBe('GEN_5000');
    expect(JSON.stringify(e)).not.toContain(secret);
    expect(JSON.stringify(e.details)).not.toContain(secret);
    expect(e.message).not.toContain(secret);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('ajay.kumar@');
    expect(logged).toContain('stack');
  });

  it('handles a non-Error throw as unknown', async () => {
    const e = await failure(
      call(() => {
        throw 'a bare string';
      }),
    );
    expect(failureEnvelope.parse(e.details).errors[0]?.code).toBe('GEN_5000');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('turns a zod error into one VAL error per invalid field with details.field', async () => {
    const e = await failure(
      call(() => {
        certificateSchema.parse({ id: 5 });
      }),
    );
    expect(e.code).toBe('invalid-argument');
    const envelope = failureEnvelope.parse(e.details);
    expect(envelope.status).toBe(400);
    expect(envelope.errors.length).toBeGreaterThan(1);
    for (const err of envelope.errors) {
      expect(apiErrorSchema.parse(err).code).toMatch(/^VAL_100[12]$/);
      expect(err.details).toHaveProperty('field');
    }
    const byField = new Map(envelope.errors.map((x) => [x.details['field'], x.code]));
    expect(byField.get('id')).toBe('VAL_1002');
    expect(byField.get('uid')).toBe('VAL_1001');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('names a field-less zod issue "request"', async () => {
    const e = await failure(
      call(() => {
        z.string().parse(3);
      }),
    );
    expect(failureEnvelope.parse(e.details).errors[0]?.details).toEqual({ field: 'request' });
  });

  it('treats a ZodError without issues as unknown', async () => {
    const e = await failure(
      call(() => {
        throw Object.assign(new Error('x'), { name: 'ZodError', issues: [] });
      }),
    );
    expect(failureEnvelope.parse(e.details).errors[0]?.code).toBe('GEN_5000');
    const e2 = await failure(
      call(() => {
        throw Object.assign(new Error('x'), { name: 'ZodError' });
      }),
    );
    expect(failureEnvelope.parse(e2.details).errors[0]?.code).toBe('GEN_5000');
  });

  it('gives each failure its own trace id', async () => {
    const fn = call(() => {
      throw new ApiException('AUTH_1001');
    });
    const ids = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const e = await failure(fn);
      ids.add(failureEnvelope.parse(e.details).errors[0]?.traceId as string);
    }
    expect(ids.size).toBe(3);
  });
});

describe('httpsCodeFor', () => {
  it.each([
    [400, 'invalid-argument'],
    [401, 'unauthenticated'],
    [403, 'permission-denied'],
    [404, 'not-found'],
    [409, 'already-exists'],
    [429, 'resource-exhausted'],
    [503, 'unavailable'],
    [500, 'internal'],
    [418, 'internal'],
  ])('maps %i to %s', (status, code) => {
    expect(httpsCodeFor(status)).toBe(code);
  });
});
