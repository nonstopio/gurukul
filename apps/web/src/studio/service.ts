import type { Functions } from 'firebase/functions';
import { callApi } from '../api';
import type { CreateCourseRequest, StudioService } from './types';

export function firebaseStudioService(functions: Functions): StudioService {
  return {
    createCourse: (request) =>
      callApi<CreateCourseRequest, { courseId: string }>(functions, 'createCourse', request),
    publishCourse: (request) =>
      callApi<{ courseId: string }, { version: number }>(functions, 'publishCourse', request),
    rollbackCourse: (request) =>
      callApi<{ courseId: string; version: number }, { version: number }>(
        functions,
        'rollbackCourse',
        request,
      ),
    archiveCourse: (request) =>
      callApi<{ courseId: string; archived: boolean }, { status: 'archived' | 'published' }>(
        functions,
        'archiveCourse',
        request,
      ),
  };
}
