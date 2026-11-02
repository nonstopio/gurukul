import { vi } from 'vitest';
import type { Course } from '@gurukul/schema';
import type {
  BankQuestion,
  DraftDoc,
  MediaStorage,
  PublishChecks,
  StudioCourse,
  StudioData,
  StudioService,
  VersionRow,
} from '../src/studio/types';

export function draftDoc(course: Course, over: Partial<DraftDoc> = {}): DraftDoc {
  return {
    rev: 1,
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    updatedBy: 'u1',
    course,
    answers: {},
    ...over,
  };
}

/** In-memory StudioData + StudioService with vi.fn spies; tests override any method. */
export function fakeStudio(
  init: {
    courses?: StudioCourse[];
    draft?: DraftDoc | null;
    versions?: VersionRow[];
    versionDocs?: Record<number, Course>;
    bank?: BankQuestion[];
  } = {},
) {
  const data: StudioData = {
    listCourses: vi.fn().mockResolvedValue(init.courses ?? []),
    getDraft: vi.fn().mockResolvedValue(init.draft === undefined ? null : init.draft),
    saveDraft: vi.fn(async (_id: string, _work: unknown, baseRev: number) => baseRev + 1),
    listVersions: vi.fn().mockResolvedValue(init.versions ?? []),
    getVersion: vi.fn(async (_id: string, version: number) => init.versionDocs?.[version] ?? null),
    questionBank: vi.fn().mockResolvedValue(init.bank ?? []),
    addToBank: vi.fn().mockResolvedValue('bank-1'),
    updateInBank: vi.fn().mockResolvedValue(undefined),
    removeFromBank: vi.fn().mockResolvedValue(undefined),
    completedCount: vi.fn().mockResolvedValue(0),
    getAccess: vi.fn().mockResolvedValue({ visibility: 'public', visibleTeamIds: [] }),
  };
  const service: StudioService = {
    createCourse: vi.fn().mockResolvedValue({ courseId: 'new-course' }),
    publishCourse: vi.fn().mockResolvedValue({ version: 1 }),
    rollbackCourse: vi.fn().mockResolvedValue({ version: 3 }),
    archiveCourse: vi.fn().mockResolvedValue({ status: 'archived' }),
  };
  // Cloud Storage: resolves with a download URL for the path, reporting no progress unless a test does.
  const storage: MediaStorage = {
    upload: vi.fn(
      async ({ path }: { path: string }) =>
        `https://firebasestorage.googleapis.com/v0/b/${FAKE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=t`,
    ),
  };
  const checks: PublishChecks = { bucket: FAKE_BUCKET };
  return { data, service, storage, checks };
}

/** The bucket the fake Storage and the inline publish checks agree on. */
export const FAKE_BUCKET = 'demo-gurukul.firebasestorage.app';
