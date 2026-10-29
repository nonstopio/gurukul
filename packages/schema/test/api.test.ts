import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiException,
  ERROR_CODES,
  ERROR_CATEGORIES,
  apiErrorSchema,
  apiFail,
  apiOk,
  apiResponseSchema,
  buildApiError,
  formatMessage,
} from '../src';

const NOW = new Date('2026-01-01T12:00:00Z');

describe('the error catalog', () => {
  it('gives every code a stable shape, a 4xx or 5xx status and a known category', () => {
    for (const [code, def] of Object.entries(ERROR_CODES)) {
      expect(code, code).toMatch(/^[A-Z]{3,4}_\d{4}$/);
      expect(def.status, code).toBeGreaterThanOrEqual(400);
      expect(ERROR_CATEGORIES).toContain(def.category);
      for (const text of [def.title, def.userMessage, def.developerMessage])
        expect(text.length).toBeGreaterThan(0);
    }
  });

  it('marks only transient failures retryable: 5xx and 429', () => {
    for (const [code, def] of Object.entries(ERROR_CODES)) {
      expect(def.retryable, code).toBe(
        def.status >= 500 || def.status === 429 ? def.retryable : false,
      );
    }
    expect(ERROR_CODES.GEN_5000.retryable).toBe(true);
    expect(ERROR_CODES.PRK_4001.retryable).toBe(true);
    expect(ERROR_CODES.VAL_1001.retryable).toBe(false);
  });

  it('keeps user messages free of technical placeholders', () => {
    for (const [code, def] of Object.entries(ERROR_CODES))
      expect(def.userMessage, code).not.toContain('%s');
  });
});

describe('the Quiz lock code', () => {
  it('raises PRK_1003 as a 403 naming the Quiz', () => {
    const res = apiFail([new ApiException('PRK_1003', ['pk'])], 't');
    expect(res.status).toBe(403);
    expect(res.errors[0]?.developerMessage).toBe("Quiz 'pk' is locked for this learner.");
    expect(res.errors[0]?.retryable).toBe(false);
    expect(apiResponseSchema(z.unknown()).parse(res).errors[0]?.code).toBe('PRK_1003');
  });
});

describe('the course codes', () => {
  it('raises each new CRS code with its status, message and params', () => {
    const cases = [
      ['CRS_1002', 409, "A course with id 'git' already exists."],
      ['CRS_1003', 400, "Course 'git' failed the publish checks; see details.issues."],
      ['CRS_2002', 404, "Course 'git' has no version 4."],
      ['CRS_1004', 400, "Course 'git' is archived; it takes no new Quiz attempts."],
    ] as const;
    for (const [code, status, dev] of cases) {
      const res = apiFail([new ApiException(code, ['git', '4'], { issues: [] })], 't');
      expect(res.status).toBe(status);
      expect(res.errors[0]?.developerMessage).toBe(dev);
      expect(res.errors[0]?.retryable).toBe(false);
      expect(apiResponseSchema(z.unknown()).parse(res).errors[0]?.code).toBe(code);
    }
  });
});

describe('formatMessage', () => {
  it('fills placeholders in order, marks missing ones and ignores extras', () => {
    expect(formatMessage("Unknown %s '%s'.", ['question', 'k9'])).toBe("Unknown question 'k9'.");
    expect(formatMessage('a %s b %s', ['x'])).toBe('a x b ?');
    expect(formatMessage('plain', ['x'])).toBe('plain');
    expect(formatMessage('%s')).toBe('?');
  });
});

describe('ApiException and buildApiError', () => {
  it('carries its code, params and details, and a readable message', () => {
    const e = new ApiException('VAL_1001', ['firstName'], { field: 'firstName' });
    expect(e.name).toBe('ApiException');
    expect(e.message).toBe("VAL_1001: Field 'firstName' is missing.");
    expect(buildApiError(e, 'abc123')).toEqual({
      code: 'VAL_1001',
      title: 'Missing required field',
      category: 'VALIDATION',
      retryable: false,
      userMessage: 'A required value is missing.',
      developerMessage: "Field 'firstName' is missing.",
      details: { field: 'firstName' },
      traceId: 'abc123',
    });
  });

  it('defaults params and details to empty, and copies details', () => {
    const e = new ApiException('GEN_5000');
    expect(e.params).toEqual([]);
    const built = buildApiError(e, 't');
    expect(built.details).toEqual({});
    expect(built.details).not.toBe(e.details);
  });
});

describe('apiOk and apiFail', () => {
  const schema = apiResponseSchema(z.object({ n: z.number() }));

  it('builds a success with all six keys', () => {
    const r = apiOk({ n: 1 }, { now: NOW });
    expect(r).toEqual({
      timestamp: '2026-01-01T12:00:00.000Z',
      status: 200,
      success: true,
      message: 'OK',
      data: { n: 1 },
      errors: [],
    });
    expect(schema.safeParse(r).success).toBe(true);
    expect(apiOk({ n: 1 }, { status: 201, message: 'Created' }).status).toBe(201);
    expect(apiOk({ n: 1 }).timestamp).toMatch(/Z$/);
  });

  it('builds a failure from the first error, with data null and every error listed', () => {
    const r = apiFail(
      [new ApiException('VAL_1001', ['a']), new ApiException('VAL_1002', ['b', 'bad'])],
      'trace',
      NOW,
    );
    expect(r).toMatchObject({
      status: 400,
      success: false,
      message: 'Missing required field',
      data: null,
    });
    expect(r.errors.map((e) => e.code)).toEqual(['VAL_1001', 'VAL_1002']);
    expect(r.errors.every((e) => e.traceId === 'trace')).toBe(true);
    expect(schema.safeParse(r).success).toBe(true);
  });

  it('turns an empty list into a generic internal error rather than a success', () => {
    const r = apiFail([], 'trace');
    expect(r).toMatchObject({ status: 500, success: false });
    expect(r.errors[0]?.code).toBe('GEN_5000');
  });

  it('rejects inconsistent responses', () => {
    const ok = apiOk({ n: 1 });
    expect(schema.safeParse({ ...ok, success: false }).success).toBe(false);
    expect(schema.safeParse({ ...ok, status: 500 }).success).toBe(false);
    expect(
      schema.safeParse({ ...apiFail([new ApiException('GEN_5000')], 't'), data: { n: 1 } }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...ok, data: { n: 'x' } }).success).toBe(false);
    expect(schema.safeParse({ status: 200 }).success).toBe(false);
  });

  it('validates an error on its own', () => {
    expect(
      apiErrorSchema.safeParse(
        buildApiError(new ApiException('PRK_4001', ['soon'], { nextAttemptAt: 5 }), 't'),
      ).success,
    ).toBe(true);
    expect(apiErrorSchema.safeParse({ code: 'bad' }).success).toBe(false);
  });
});
