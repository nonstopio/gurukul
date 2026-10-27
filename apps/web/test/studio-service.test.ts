import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<[string, unknown]>);
vi.mock('../src/api', () => ({
  callApi: async (_f: unknown, name: string, request: unknown) => {
    calls.push([name, request]);
    return { from: name };
  },
}));

import { firebaseStudioService } from '../src/studio/service';

describe('firebaseStudioService', () => {
  it('calls each Studio function by name through the api helper', async () => {
    const s = firebaseStudioService({} as never);
    expect(
      await s.createCourse({ title: 'T', slug: 't', level: 'foundation', theme: 'forest' }),
    ).toEqual({ from: 'createCourse' });
    expect(await s.publishCourse({ courseId: 'git' })).toEqual({ from: 'publishCourse' });
    expect(await s.rollbackCourse({ courseId: 'git', version: 2 })).toEqual({
      from: 'rollbackCourse',
    });
    expect(await s.archiveCourse({ courseId: 'git', archived: true })).toEqual({
      from: 'archiveCourse',
    });
    expect(calls.map(([n]) => n)).toEqual([
      'createCourse',
      'publishCourse',
      'rollbackCourse',
      'archiveCourse',
    ]);
  });
});
