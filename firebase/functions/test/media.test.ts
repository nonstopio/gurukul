import * as logger from 'firebase-functions/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DELETIONS_PER_RUN,
  collectReferences,
  referencedPaths,
  runMediaCleanup,
  tooManyForCourse,
  unusedFiles,
} from '../src/media.js';
import type { MediaFile } from '../src/media.js';
import { course, quiz } from './fixtures.js';

afterEach(() => vi.clearAllMocks());

const NOW = new Date('2026-11-08T05:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const media = (courseId: string, name: string) => `courses/${courseId}/media/${name}`;

const image = (path: string) => ({
  type: 'image',
  id: `i-${path.length}-${path.slice(-8)}`,
  url: 'https://example.com/a.png',
  alt: 'An image',
  upload: { path, bytes: 1000, name: 'a.png', contentType: 'image/png' },
});
const pdf = (path: string) => ({
  type: 'file',
  id: `f-${path.length}-${path.slice(-8)}`,
  url: 'https://example.com/a.pdf',
  label: 'Notes',
  upload: { path, bytes: 1000, name: 'a.pdf', contentType: 'application/pdf' },
});
const linked = { type: 'image', id: 'linked', url: 'https://example.com/l.png', alt: 'Linked' };
const withBlocks = (blocks: object[], over: object = {}) =>
  course(
    {},
    {
      chapters: [
        {
          id: 'c1',
          title: 'C',
          items: [
            {
              type: 'lesson',
              id: 'l1',
              title: 'L',
              minutes: 1,
              layout: 'stacked',
              completeWhen: 'manual',
              blocks,
            },
            quiz(),
          ],
        },
      ],
      ...over,
    },
  );

/** A course whose cover image is the uploaded file `path`. */
const covered = (path: string) => {
  const c = withBlocks([]);
  return {
    ...c,
    cover: {
      ...c.cover,
      image: {
        url: 'https://example.com/c.png',
        width: 1600,
        height: 900,
        upload: { path, bytes: 1000, name: 'c.png', contentType: 'image/png' },
      },
    },
  };
};

describe('referencedPaths', () => {
  it('lists the upload paths of image and file blocks, and ignores linked media and quizzes', () => {
    const c = withBlocks([
      image(media('git-basics', 'a.png')),
      linked,
      pdf(media('git-basics', 'b.pdf')),
    ]);
    const parsed = collectReferences([c]);
    expect([...(parsed ?? [])].sort()).toEqual([
      media('git-basics', 'a.png'),
      media('git-basics', 'b.pdf'),
    ]);
    expect(referencedPaths({ chapters: [], cover: {} } as never)).toEqual([]);
  });
});

describe('collectReferences', () => {
  it('counts a cover image in the draft, the course or any version as referenced', () => {
    // A replaced cover: the draft has the new one, an older version still shows the old one.
    const [newer, older] = [media('git-basics', 'new.png'), media('git-basics', 'old.png')];
    expect(collectReferences([covered(newer), withBlocks([]), covered(older)])).toEqual(
      new Set([newer, older]),
    );
  });

  it('unions the paths of every copy it is given', () => {
    const a = withBlocks([image(media('git-basics', 'a.png'))]);
    const b = withBlocks([image(media('git-basics', 'b.png'))]);
    expect(collectReferences([a, b])).toEqual(
      new Set([media('git-basics', 'a.png'), media('git-basics', 'b.png')]),
    );
  });

  it('upgrades an older copy before reading it', () => {
    const old = withBlocks([image(media('git-basics', 'a.png'))], { schemaVersion: 2 });
    expect(collectReferences([old])).toEqual(new Set([media('git-basics', 'a.png')]));
  });

  it('is empty for no copies', () => {
    expect(collectReferences([])).toEqual(new Set());
  });

  it('is unknown when a copy does not fit the schema', () => {
    expect(collectReferences([withBlocks([]), { title: 'broken' }])).toBeUndefined();
  });

  it('is unknown when a copy is not a course at all', () => {
    expect(collectReferences([null])).toBeUndefined();
    expect(collectReferences([{ schemaVersion: 1 }])).toBeUndefined();
  });
});

describe('unusedFiles', () => {
  const file = (name: string, createdAt: Date | undefined, id = 'git-basics'): MediaFile => ({
    path: media(id, name),
    createdAt,
  });

  it('keeps referenced, young, undated, future and out-of-folder files; takes old unreferenced ones', () => {
    const files = [
      file('used.png', daysAgo(90)),
      file('old.png', daysAgo(31)),
      file('exactly.png', daysAgo(30)),
      file('young.png', daysAgo(29)),
      file('undated.png', undefined),
      file('future.png', new Date(NOW.getTime() + 1000)),
      file('other.png', daysAgo(90), 'other-course'),
      { path: 'courses/git-basics/media/', createdAt: daysAgo(90) },
      { path: 'backups/x.png', createdAt: daysAgo(90) },
    ];
    expect(
      unusedFiles('git-basics', files, new Set([media('git-basics', 'used.png')]), NOW),
    ).toEqual([media('git-basics', 'old.png'), media('git-basics', 'exactly.png')]);
  });
});

describe('tooManyForCourse', () => {
  it('judges the share only for a course with at least five files', () => {
    expect(tooManyForCourse(1, 1)).toBe(false);
    expect(tooManyForCourse(4, 4)).toBe(false);
    expect(tooManyForCourse(3, 5)).toBe(true);
    expect(tooManyForCourse(2, 5)).toBe(false);
    expect(tooManyForCourse(5, 10)).toBe(false);
    expect(tooManyForCourse(6, 10)).toBe(true);
  });
});

describe('runMediaCleanup', () => {
  const setup = (courses: Record<string, { objects: unknown[]; files: MediaFile[] }>) => {
    const store = {
      listCourseIds: vi.fn().mockResolvedValue(Object.keys(courses)),
      readCourseObjects: vi.fn(async (id: string) => courses[id]?.objects ?? []),
    };
    const storage = {
      listMedia: vi.fn(async (id: string) => courses[id]?.files ?? []),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };
    return { store, storage, run: () => runMediaCleanup({ store, storage }, NOW) };
  };
  const f = (id: string, name: string, age: number): MediaFile => ({
    path: media(id, name),
    createdAt: daysAgo(age),
  });

  it('deletes only the old, unreferenced files, across draft, live and version copies', async () => {
    const draft = withBlocks([image(media('a', 'draft.png'))]);
    const live = withBlocks([image(media('a', 'live.png'))]);
    const version = withBlocks([pdf(media('a', 'v1.pdf'))]);
    const { storage, run } = setup({
      a: {
        objects: [draft, live, version],
        files: [
          f('a', 'draft.png', 99),
          f('a', 'live.png', 99),
          f('a', 'v1.pdf', 99),
          f('a', 'orphan.png', 99),
          f('a', 'young.png', 2),
        ],
      },
    });
    await expect(run()).resolves.toEqual({ deleted: 1, courses: 1, skipped: 0, blocked: false });
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(media('a', 'orphan.png'));
  });

  it('deletes a replaced cover image once no copy names it, and keeps one a version still shows', async () => {
    const { storage, run } = setup({
      a: {
        // The draft and the course show the new cover; version 1 shows the first one.
        objects: [
          covered(media('a', 'new.png')),
          covered(media('a', 'new.png')),
          covered(media('a', 'v1.png')),
        ],
        files: [f('a', 'new.png', 99), f('a', 'v1.png', 99), f('a', 'replaced.png', 99)],
      },
    });
    await expect(run()).resolves.toEqual({ deleted: 1, courses: 1, skipped: 0, blocked: false });
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(media('a', 'replaced.png'));
  });

  it('skips a course with a copy that does not parse, deleting nothing of it, and warns', async () => {
    const { storage, run } = setup({
      bad: { objects: [withBlocks([]), { broken: true }], files: [f('bad', 'x.png', 99)] },
      ok: { objects: [withBlocks([])], files: [f('ok', 'y.png', 99)] },
    });
    await expect(run()).resolves.toEqual({ deleted: 1, courses: 1, skipped: 1, blocked: false });
    expect(storage.listMedia).not.toHaveBeenCalledWith('bad');
    expect(storage.deleteFile).toHaveBeenCalledWith(media('ok', 'y.png'));
    expect(logger.warn).toHaveBeenCalledWith('Media clean-up skipped a course', {
      courseId: 'bad',
      reason: 'course did not parse',
    });
  });

  it('holds back a course that would lose most of its files, and warns with counts', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => f('big', `${n}.png`, 99));
    const { storage, run } = setup({
      big: { objects: [withBlocks([image(media('big', 'a.png'))])], files },
    });
    await expect(run()).resolves.toEqual({ deleted: 0, courses: 1, skipped: 1, blocked: false });
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Media clean-up held back a course',
      expect.objectContaining({ courseId: 'big', count: 4, total: 5 }),
    );
  });

  it('deletes nothing at all when the run would delete more than the cap', async () => {
    const ids = ['a', 'b', 'c'];
    const files = (id: string) => [
      f(id, 'keep1.png', 1),
      ...Array.from({ length: 70 }, (_, i) => f(id, `o${i}.png`, 99)),
      ...Array.from({ length: 200 }, (_, i) => f(id, `k${i}.png`, 1)),
    ];
    const used = (id: string) => withBlocks([image(media(id, 'keep1.png'))]);
    const { storage, run } = setup(
      Object.fromEntries(ids.map((id) => [id, { objects: [used(id)], files: files(id) }])),
    );
    await expect(run()).resolves.toEqual({ deleted: 0, courses: 3, skipped: 0, blocked: true });
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Media clean-up held back the run', {
      reason: 'too many unused files',
      count: 210,
      limit: MAX_DELETIONS_PER_RUN,
    });
  });

  it('does nothing when there are no courses', async () => {
    const { run } = setup({});
    await expect(run()).resolves.toEqual({ deleted: 0, courses: 0, skipped: 0, blocked: false });
  });

  it('lets a failed delete surface so the run is logged as failed', async () => {
    const { storage, run } = setup({
      a: { objects: [withBlocks([])], files: [f('a', 'x.png', 99)] },
    });
    storage.deleteFile.mockRejectedValueOnce(new Error('denied'));
    await expect(run()).rejects.toThrow('denied');
  });
});
