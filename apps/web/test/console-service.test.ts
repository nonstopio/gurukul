import { describe, expect, it, vi } from 'vitest';
import { ApiException, apiFail, apiOk } from '@gurukul/schema';

const fns = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => {
    fns[name] ??= vi.fn().mockResolvedValue({ data: apiOk({ from: name }) });
    return fns[name];
  },
}));

import { ApiClientError } from '../src/api';
import { firebaseConsoleService } from '../src/console/service';

describe('firebaseConsoleService', () => {
  const service = firebaseConsoleService({} as never);
  it('returns the envelope data of the callables that answer, and nothing for the ones that do not', async () => {
    expect(await service.assignCourses({} as never)).toEqual({ from: 'assignCourses' });
    expect(await service.setRoles({ uid: 'u' })).toEqual({ from: 'setRoles' });
    expect(await service.remindLearners({ courseId: 'git' })).toEqual({ from: 'remindLearners' });
    expect(await service.resetCooldown({ uid: 'u', courseId: 'g', quizId: 'p' })).toBeUndefined();
    expect(await service.revokeCertificate({ id: 'X' })).toBeUndefined();
    expect(fns.resetCooldown).toHaveBeenCalledWith({ uid: 'u', courseId: 'g', quizId: 'p' });
    expect(fns.revokeCertificate).toHaveBeenCalledWith({ id: 'X' });
  });

  it('throws an ApiClientError carrying the catalog code and friendly text on a failure envelope', async () => {
    (fns.setRoles as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 'functions/invalid-argument',
      details: apiFail([new ApiException('USR_1001')], 'trace'),
    });
    const err = await service.setRoles({ uid: 'me' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      code: 'USR_1001',
      status: 400,
      userMessage: 'You cannot remove your own Admin role.',
    });
  });
});
