import type { Course } from '@gurukul/schema';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { fakeData, lesson, makeCourse } from './fake-data';
import { FAKE_BUCKET, draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

// The hashing has its own tests (studio-blurhash); here it simply has no answer.
vi.mock('../src/studio/media/blurHash', () => ({
  imageBlurHash: vi.fn(async () => undefined),
  pdfBlurHash: vi.fn(async () => undefined),
}));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngFile = () =>
  new File([new Uint8Array(PNG), new Uint8Array(40 * 1024 - PNG.length)], 'cover.png', {
    type: 'image/png',
  });
const dl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${FAKE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=t`;

const OLD = 'courses/git/media/old1.png';
const covered = (): Course['cover'] => ({
  theme: 'forest',
  glyph: 'G',
  image: {
    url: dl(OLD),
    width: 1600,
    height: 900,
    upload: { path: OLD, bytes: 120 * 1024, contentType: 'image/png', name: 'old.png' },
  },
});

async function open(course: Course) {
  const studio = fakeStudio({ draft: draftDoc(course, { rev: 5 }) });
  await openApp(`/studio/courses/${course.id}`, {
    roles: ['educator'],
    studio,
    data: fakeData({ courses: [course] }),
    console: fakeConsole(),
  });
  await screen.findByRole('tab', { name: 'Structure' });
  return studio;
}

const tileImage = () =>
  screen.getByRole('article', { name: 'Course tile preview' }).querySelector('img');
const savedCover = (studio: ReturnType<typeof fakeStudio>) =>
  (vi.mocked(studio.data.saveDraft).mock.lastCall?.[1] as { course: Course }).course.cover;
/** Autosave runs a second after the last edit, on the real clock, as in the browser. */
const saved = (check: () => void) => waitFor(check, { timeout: 3000 });

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1600, height: 900, close: vi.fn() })),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover-1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Course editor: cover image', () => {
  it('uploads a cover image, previews it on the tile and saves it on the draft', async () => {
    const studio = await open(makeCourse({ educatorIds: ['u1'] }));
    const panel = screen.getByRole('complementary', { name: 'Course details' });
    // No picture yet: the tile shows the title on the theme colour.
    expect(tileImage()).toBeNull();
    expect(within(panel).getByText('No personal data')).toBeTruthy();
    const input = panel.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [pngFile()] } });
    });
    // Picked, not uploaded: the tile previews the file and the draft is unchanged.
    expect(tileImage()?.getAttribute('src')).toBe('blob:cover-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Upload image' }));
    await screen.findByText('The cover image is on the course. Learners see it once you publish.');
    const path = vi.mocked(studio.storage.upload).mock.lastCall?.[0].path as string;
    expect(path).toMatch(/^courses\/git\/media\/[A-Za-z0-9_-]+\.png$/);
    expect(tileImage()?.getAttribute('src')).toBe(dl(path));
    expect(screen.getByText(/^Uploaded: cover\.png · 40 KB · 1600 × 900 px$/)).toBeTruthy();
    await saved(() =>
      expect(savedCover(studio)).toEqual({
        theme: 'forest',
        glyph: 'G',
        image: {
          url: dl(path),
          width: 1600,
          height: 900,
          upload: { path, bytes: 40 * 1024, contentType: 'image/png', name: 'cover.png' },
        },
      }),
    );
    expect(await axeViolations(panel)).toEqual([]);
  });

  it('replaces the cover image: the new upload overwrites the field', async () => {
    const studio = await open(makeCourse({ educatorIds: ['u1'], cover: covered() }));
    expect(screen.getByText(/^Uploaded: old\.png/)).toBeTruthy();
    expect(tileImage()?.getAttribute('src')).toBe(dl(OLD));
    const zone = screen.getByRole('button', { name: /Replace image/ });
    const input = zone.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [pngFile()] } });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload image' }));
    await screen.findByText(/^Uploaded: cover\.png/);
    await saved(() => expect(savedCover(studio).image?.upload.name).toBe('cover.png'));
    expect(savedCover(studio).image?.upload.path).not.toBe(OLD);
  });

  it('removes the cover image: the tile falls back to the first lesson image', async () => {
    const first = 'https://example.com/first.png';
    const course = makeCourse({
      educatorIds: ['u1'],
      cover: covered(),
      chapters: [
        {
          id: 'c1',
          title: 'Basics',
          items: [
            lesson('l1', { blocks: [{ type: 'image', id: 'i1', url: first, alt: 'First' }] }),
          ],
        },
      ],
    });
    const studio = await open(course);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(tileImage()?.getAttribute('src')).toBe(first);
    expect(screen.queryByText(/^Uploaded:/)).toBeNull();
    await saved(() => expect(savedCover(studio)).toEqual({ theme: 'forest', glyph: 'G' }));
  });
});
