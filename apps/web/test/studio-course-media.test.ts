import { describe, expect, it } from 'vitest';
import { uploadedImages } from '../src/studio/media/courseMedia';
import { lesson, makeCourse } from './fake-data';

const image = (id: string, path: string, over: object = {}) => ({
  type: 'image' as const,
  id,
  url: `https://firebasestorage.googleapis.com/v0/b/b/o/${id}?alt=media`,
  alt: id,
  upload: { path, bytes: 1000, contentType: 'image/png' as const, name: `${id}.png` },
  ...over,
});

const course = (blocks: unknown[][], quiz = false) =>
  makeCourse({
    chapters: [
      {
        id: 'p',
        title: 'P',
        items: [
          ...blocks.map((b, i) => lesson(`l${i}`, { blocks: b })),
          ...(quiz ? [{ type: 'quiz' as const, id: 'q', title: 'Q' }] : []),
        ] as never,
      },
    ],
  });

describe('uploadedImages', () => {
  it('lists each uploaded image once, in lesson order, with its size in pixels', () => {
    const rows = uploadedImages(
      course([
        [image('a', 'courses/git/media/a.png', { width: 800, height: 600 })],
        [image('a-again', 'courses/git/media/a.png'), image('b', 'courses/git/media/b.png')],
      ]),
      'git',
    );
    expect(rows.map((r) => r.upload.path)).toEqual([
      'courses/git/media/a.png',
      'courses/git/media/b.png',
    ]);
    expect(rows[0]).toMatchObject({ width: 800, height: 600 });
    expect(rows[1]?.width).toBeUndefined();
  });

  it('skips linked images, other block types, unaddressed blocks and other courses', () => {
    const rows = uploadedImages(
      course(
        [
          [
            { type: 'image', id: 'l', url: 'https://x.test/a.png', alt: 'linked' },
            { type: 'markdown', id: 'm', md: 'hi' },
            image('empty', 'courses/git/media/e.png', { url: '' }),
            image('other', 'courses/other/media/o.png'),
            image('mine', 'courses/git/media/m.png'),
          ],
        ],
        true,
      ),
      'git',
    );
    expect(rows.map((r) => r.upload.path)).toEqual(['courses/git/media/m.png']);
  });

  it('is empty for a course with no uploaded images', () => {
    expect(uploadedImages(course([[]]), 'git')).toEqual([]);
  });
});
