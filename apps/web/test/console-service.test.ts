import { describe, expect, it, vi } from 'vitest';
import { ApiException, apiFail, apiOk } from '@gurukul/schema';

const fns = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const opts = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string, options?: unknown) => {
    opts[name] = options;
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
    expect(await service.listEmailTemplates()).toEqual({ from: 'listEmailTemplates' });
    expect(
      await service.sendTestEmail({ templateId: 'assigned', recipients: ['a@nonstopio.com'] }),
    ).toEqual({
      from: 'sendTestEmail',
    });
    expect(fns.sendTestEmail).toHaveBeenCalledWith({
      templateId: 'assigned',
      recipients: ['a@nonstopio.com'],
    });
    expect(fns.resetCooldown).toHaveBeenCalledWith({ uid: 'u', courseId: 'g', quizId: 'p' });
    expect(await service.teamReport({ teamId: 'web' })).toEqual({ from: 'teamReport' });
    expect(await service.updateAssignment({ assignmentId: 'a', dueAt: null })).toEqual({
      from: 'updateAssignment',
    });
    expect(await service.removeAssignment({ assignmentId: 'a' })).toEqual({
      from: 'removeAssignment',
    });
    expect(fns.updateAssignment).toHaveBeenCalledWith({ assignmentId: 'a', dueAt: null });
    expect(fns.removeAssignment).toHaveBeenCalledWith({ assignmentId: 'a' });
    expect(fns.revokeCertificate).toHaveBeenCalledWith({ id: 'X' });
  });

  it('waits 30 minutes for the two callables that email a batch, the default for the rest', async () => {
    await service.assignCourses({} as never);
    await service.remindLearners({ courseId: 'git' });
    await service.setRoles({ uid: 'u' });
    expect(opts.assignCourses).toEqual({ timeout: 1_800_000 });
    expect(opts.remindLearners).toEqual({ timeout: 1_800_000 });
    expect(opts.setRoles).toBeUndefined();
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
