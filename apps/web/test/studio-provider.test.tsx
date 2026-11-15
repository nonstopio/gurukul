import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { StudioProvider, useStudio } from '../src/studio/StudioProvider';
import { fakeStudio } from './fake-studio';

const setup = () => {
  const studio = fakeStudio();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudioProvider {...studio}>{children}</StudioProvider>
  );
  return { studio, ...renderHook(() => useStudio().service, { wrapper }) };
};

describe('StudioProvider', () => {
  it.each([
    ['createCourse', { title: 't', slug: 's', level: 'beginner', theme: 'ocean' }],
    ['publishCourse', { courseId: 'git' }],
    ['rollbackCourse', { courseId: 'git', version: 1 }],
    ['archiveCourse', { courseId: 'git', archived: true }],
    ['setCourseAccess', { courseId: 'git', visibility: 'public', visibleTeamIds: [] }],
  ] as const)('drops the remembered course list once %s succeeds', async (name, request) => {
    const { studio, result } = setup();
    const call = result.current[name] as (r: unknown) => Promise<unknown>;
    await call(request);
    expect(studio.service[name]).toHaveBeenCalledWith(request);
    expect(studio.data.forgetCourses).toHaveBeenCalledTimes(1);
  });

  it('keeps the list when a call fails', async () => {
    const { studio, result } = setup();
    studio.service.publishCourse = () => Promise.reject(new Error('no'));
    const { result: again } = renderHook(() => useStudio().service, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StudioProvider {...studio}>{children}</StudioProvider>
      ),
    });
    await expect(again.current.publishCourse({ courseId: 'git' })).rejects.toThrow('no');
    expect(studio.data.forgetCourses).not.toHaveBeenCalled();
    expect(result.current).toBeDefined();
  });
});
