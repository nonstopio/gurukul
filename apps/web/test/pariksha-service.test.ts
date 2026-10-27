import { describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  fns: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => {
    callables.fns[name] = vi.fn();
    return callables.fns[name];
  },
}));

import { CooldownError, firebaseParikshaService } from '../src/pariksha/service';

const service = firebaseParikshaService({} as never);

describe('firebaseParikshaService', () => {
  it('returns the data of checkAnswer and gradeAttempt', async () => {
    callables.fns.checkAnswer?.mockResolvedValue({ data: { correct: true } });
    callables.fns.gradeAttempt?.mockResolvedValue({ data: { score: 1 } });
    expect(
      await service.checkAnswer({
        courseId: 'g',
        parikshaId: 'p',
        questionId: 'q',
        selected: ['a'],
      }),
    ).toEqual({ correct: true });
    expect(
      await service.gradeAttempt({ courseId: 'g', parikshaId: 'p', questionIds: [], answers: {} }),
    ).toEqual({ score: 1 });
  });

  it('turns a too-early retake into a CooldownError, with or without the time', async () => {
    const req = { courseId: 'g', parikshaId: 'p', questionIds: [], answers: {} };
    callables.fns.gradeAttempt?.mockRejectedValueOnce({
      code: 'functions/resource-exhausted',
      details: { nextAttemptAt: 99 },
    });
    await expect(service.gradeAttempt(req)).rejects.toMatchObject({ nextAttemptAt: 99 });
    callables.fns.gradeAttempt?.mockRejectedValueOnce({ code: 'functions/resource-exhausted' });
    const err = await service.gradeAttempt(req).catch((e) => e);
    expect(err).toBeInstanceOf(CooldownError);
    expect(err.nextAttemptAt).toBeNull();
  });

  it('rethrows any other failure untouched', async () => {
    callables.fns.gradeAttempt?.mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.gradeAttempt({ courseId: 'g', parikshaId: 'p', questionIds: [], answers: {} }),
    ).rejects.toThrow('boom');
  });
});
