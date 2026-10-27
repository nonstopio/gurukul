import { describe, expect, it, vi } from 'vitest';
import { ApiException, apiFail, apiOk } from '@gurukul/schema';

const callables = vi.hoisted(() => {
  const all: Record<string, ReturnType<typeof vi.fn>> = {};
  return { fn: (name: string) => (all[name] ??= vi.fn()) };
});
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => {
    return callables.fn(name);
  },
}));

import { ApiClientError } from '../src/api';
import { CooldownError, firebaseParikshaService } from '../src/pariksha/service';

const service = firebaseParikshaService({} as never);
const req = { courseId: 'g', parikshaId: 'p', questionIds: [], answers: {} };
const cooldown = (details: Record<string, unknown>) => ({
  code: 'functions/resource-exhausted',
  details: apiFail([new ApiException('PRK_4001', ['soon'], details)], 'trace'),
});

describe('firebaseParikshaService', () => {
  it('unwraps the envelope data of checkAnswer and gradeAttempt', async () => {
    callables.fn('checkAnswer').mockResolvedValue({ data: apiOk({ correct: true }) });
    callables.fn('gradeAttempt').mockResolvedValue({ data: apiOk({ score: 1 }) });
    expect(
      await service.checkAnswer({
        courseId: 'g',
        parikshaId: 'p',
        questionId: 'q',
        selected: ['a'],
      }),
    ).toEqual({ correct: true });
    expect(await service.gradeAttempt(req)).toEqual({ score: 1 });
  });

  it('turns a PRK_4001 failure into a CooldownError, with or without the time', async () => {
    callables.fn('gradeAttempt').mockRejectedValueOnce(cooldown({ nextAttemptAt: 99 }));
    await expect(service.gradeAttempt(req)).rejects.toMatchObject({ nextAttemptAt: 99 });
    callables.fn('gradeAttempt').mockRejectedValueOnce(cooldown({}));
    const err = await service.gradeAttempt(req).catch((e) => e);
    expect(err).toBeInstanceOf(CooldownError);
    expect(err.nextAttemptAt).toBeNull();
  });

  it('rethrows any other envelope failure as the ApiClientError', async () => {
    callables.fn('gradeAttempt').mockRejectedValueOnce({
      details: apiFail([new ApiException('PRK_2002', ['g'])], 'trace'),
    });
    const err = await service.gradeAttempt(req).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: 'PRK_2002', status: 400, retryable: false });
  });

  it('gives garbage details, a non-envelope success and an offline error a catalog error', async () => {
    callables.fn('gradeAttempt').mockRejectedValueOnce({ code: 'functions/internal', details: 1 });
    expect(await service.gradeAttempt(req).catch((e) => e)).toMatchObject({
      code: 'GEN_5000',
      unexpected: true,
    });
    callables.fn('gradeAttempt').mockResolvedValueOnce({ data: { score: 1 } });
    expect(await service.gradeAttempt(req).catch((e) => e)).toMatchObject({ code: 'GEN_5000' });
    callables.fn('checkAnswer').mockRejectedValueOnce({ code: 'functions/unavailable' });
    expect(
      await service
        .checkAnswer({ courseId: 'g', parikshaId: 'p', questionId: 'q', selected: [] })
        .catch((e) => e),
    ).toMatchObject({ code: 'GEN_5003', status: 503, retryable: true });
  });
});
