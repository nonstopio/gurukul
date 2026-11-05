import type { Block } from '@gurukul/schema';
import { UPLOAD_PATH, encodeBlurHash } from '@gurukul/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageBlurHash, pdfBlurHash } from '../src/studio/media/blurHash';
import { UploadCancelledError } from '../src/studio/errors';
import { BlockEditor } from '../src/studio/blocks/BlockEditor';
import { newBlock } from '../src/studio/lessonEdit';
import type { MediaUploadRequest } from '../src/studio/types';
import { axeViolations } from './axe';
import { BlockProviders } from './block-harness';
import { fakeData } from './fake-data';
import { FAKE_BUCKET, fakeStudio } from './fake-studio';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KB = 1024;

// The hashing has its own tests (studio-blurhash): here only what the hook does with its answer.
vi.mock('../src/studio/media/blurHash', () => ({
  imageBlurHash: vi.fn(),
  pdfBlurHash: vi.fn(),
}));
/** A well-formed hash; the hook stores whatever the module returns. */
const HASH = encodeBlurHash(new Uint8ClampedArray(16 * 4).fill(200), 4, 4);

/** A file whose first bytes say PNG, padded to `size` bytes. */
function pngFile(name = 'shot.png', size = 40 * KB, type = 'image/png') {
  return new File([new Uint8Array(PNG), new Uint8Array(size - PNG.length)], name, { type });
}

/** What `createImageBitmap` reports for the next decode; null makes it fail. */
function decodes(size: { width: number; height: number } | null) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (size === null) throw new Error('not an image');
      return { ...size, close: vi.fn() };
    }),
  );
}

function Harness({ initial, seen }: { initial: Block; seen: (b: Block) => void }) {
  const [block, setBlock] = useState(initial);
  return (
    <BlockEditor
      block={block}
      onChange={(next) => {
        seen(next);
        setBlock(next);
      }}
    />
  );
}

function setup(
  block: Block = newBlock('image'),
  over: {
    studio?: ReturnType<typeof fakeStudio>;
    data?: ReturnType<typeof fakeData>;
    /** Leave the editor on the tab it opened on. By default the Upload tab is opened, as these tests are about it. */
    stay?: boolean;
  } = {},
) {
  const studio = over.studio ?? fakeStudio();
  const seen = vi.fn();
  const view = render(
    <BlockProviders studio={studio} {...(over.data ? { data: over.data } : {})}>
      <Harness initial={block} seen={seen} />
    </BlockProviders>,
  );
  if (!over.stay) fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
  return { ...view, studio, seen, last: () => seen.mock.lastCall?.[0] as Block };
}

const picker = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;
const pick = async (container: HTMLElement, file: File) => {
  await act(async () => {
    fireEvent.change(picker(container), { target: { files: [file] } });
  });
};
/** The box under the drop zone that says why a file was refused or an upload failed, found as the zone's description. */
const errorBox = (): HTMLElement | null => {
  const zone = screen.getByRole('button', { name: /Choose an image|Replace image/ });
  const [, id] = (zone.getAttribute('aria-describedby') ?? '').split(' ');
  return id ? document.getElementById(id) : null;
};
const upload = () => screen.getByRole('button', { name: /^(Upload image|Try again)$/ });

/** An upload the test finishes itself: it sees the request and decides how the upload ends. */
function pendingUpload(studio: ReturnType<typeof fakeStudio>) {
  const ctl: {
    request?: MediaUploadRequest;
    done: (url: string) => void;
    fail: (error: unknown) => void;
  } = { done: () => {}, fail: () => {} };
  vi.mocked(studio.storage.upload).mockImplementation(
    (request) =>
      new Promise<string>((resolve, reject) => {
        ctl.request = request;
        ctl.done = resolve;
        ctl.fail = reject;
      }),
  );
  return ctl;
}

beforeEach(() => {
  decodes({ width: 1200, height: 800 });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const uploaded = {
  path: 'courses/git/media/old1.png',
  bytes: 120 * KB,
  contentType: 'image/png' as const,
  name: 'old.png',
};
const hosted = (over: object = {}): Block =>
  ({
    ...newBlock('image'),
    url: `https://firebasestorage.googleapis.com/v0/b/${FAKE_BUCKET}/o/${encodeURIComponent(uploaded.path)}?alt=media&token=t`,
    alt: 'A diagram',
    upload: uploaded,
    width: 1000,
    height: 500,
    ...over,
  }) as Block;

describe('the Image block tabs', () => {
  it('opens a new block on Link, first and empty, and lists Upload second', () => {
    setup(undefined, { stay: true });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Link', 'Upload']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Image address') as HTMLInputElement).value).toBe('');
  });

  it('shows the rules and the no-personal-data notice on the Upload tab', async () => {
    const { container } = setup();
    expect(screen.getByRole('tab', { name: 'Upload' }).getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByText('WebP, PNG or JPEG · up to 500 KB · 1600 px wide is ideal'),
    ).toBeTruthy();
    expect(screen.getByText('No personal data')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose an image/ })).toBeTruthy();
    expect(picker(container).accept).toBe('image/webp,image/png,image/jpeg');
    // The stand-in address of a new block is not an image, so there is nothing to preview.
    expect(screen.queryByRole('img')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens a linked image on Link and an uploaded one on Upload', () => {
    const linked = setup({ ...newBlock('image'), url: 'https://example.com/a.png' } as Block, {
      stay: true,
    });
    expect(screen.getByRole('tab', { name: 'Link' }).getAttribute('aria-selected')).toBe('true');
    linked.unmount();
    setup(hosted(), { stay: true });
    expect(screen.getByRole('tab', { name: 'Upload' }).getAttribute('aria-selected')).toBe('true');
  });

  it('states the Admin-lowered limit, not a typed number', async () => {
    const data = fakeData({ uploadLimits: { imageMaxKB: 200, pdfMaxKB: 1024 } });
    setup(newBlock('image'), { data });
    expect(
      await screen.findByText('WebP, PNG or JPEG · up to 200 KB · 1600 px wide is ideal'),
    ).toBeTruthy();
  });

  it('shows what is uploaded, and Remove clears the address, upload and size', () => {
    const { last } = setup(hosted());
    expect(screen.getByText('Uploaded: old.png · 120 KB · 1000 × 500 px')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Replace image/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(last()).toMatchObject({ type: 'image', url: '', alt: 'A diagram' });
    for (const key of ['upload', 'width', 'height']) expect(key in last()).toBe(false);
  });

  it('leaves out the size of an uploaded image that has none', () => {
    setup(hosted({ width: undefined, height: undefined }));
    expect(screen.getByText('Uploaded: old.png · 120 KB')).toBeTruthy();
  });
});

describe('picking an image', () => {
  it('checks it, previews it where a learner will see it, and writes nothing to the draft', async () => {
    const { container, seen } = setup();
    await pick(container, pngFile());
    const frame = container.querySelector('.studio-previewwidth__frame') as HTMLElement;
    expect(within(frame).getByRole('img', { name: 'Image preview' }).getAttribute('src')).toBe(
      'blob:preview-1',
    );
    expect(screen.getByText('shot.png · 40 KB · 1200 × 800 px')).toBeTruthy();
    expect(upload()).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows the preview at the chosen layout and at 1280 or 390 px', async () => {
    const { container } = setup();
    await pick(container, pngFile());
    fireEvent.click(screen.getByRole('button', { name: 'Small' }));
    expect(container.querySelector('.g-figure--small')).toBeTruthy();
    const frame = container.querySelector('.studio-previewwidth__frame') as HTMLElement;
    expect(frame.dataset['width']).toBe('1280');
    fireEvent.click(screen.getByRole('button', { name: '390 px' }));
    expect(frame.dataset['width']).toBe('390');
    fireEvent.click(screen.getByRole('button', { name: '1280 px' }));
    expect(frame.dataset['width']).toBe('1280');
  });

  it('takes a dropped file too, and says it is checking while it reads it', async () => {
    const { container } = setup();
    let finish: (size: { width: number; height: number }) => void = () => {};
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = (size) => resolve({ ...size, close: () => {} });
          }),
      ),
    );
    fireEvent.drop(screen.getByRole('button', { name: /Choose an image/ }), {
      dataTransfer: { files: [pngFile('drop.png')] },
    });
    expect(await screen.findByText('Checking drop.png…')).toBeTruthy();
    await act(async () => finish({ width: 1000, height: 600 }));
    expect(await screen.findByText('drop.png · 40 KB · 1000 × 600 px')).toBeTruthy();
    expect(container.querySelector('.g-figure')).toBeTruthy();
  });

  it('warns about a narrow image and still lets it upload', async () => {
    decodes({ width: 640, height: 400 });
    const { container } = setup();
    await pick(container, pngFile());
    const warning = screen.getByText(/only 640 px wide/);
    expect(warning.textContent).toContain('Choose the Small or Medium layout');
    expect(screen.getByText('This image is narrow')).toBeTruthy();
    expect(upload()).toBeTruthy();
    expect(errorBox()).toBeNull();
  });

  it('refuses an image that is too big and too wide with numbered guidance and the real numbers', async () => {
    decodes({ width: 3024, height: 4032 });
    const { container, seen } = setup();
    await pick(container, pngFile('phone.png', 1800 * KB));
    const alert = errorBox() as HTMLElement;
    expect(within(alert).getByText('This image cannot be uploaded as it is.')).toBeTruthy();
    const steps = within(alert).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[0]?.textContent).toContain('1.8 MB and 3024 × 4032 px');
    expect(steps[0]?.textContent).toContain('500 KB and 2000 px');
    expect(steps[1]?.textContent).toContain('3024 × 4032 px');
    expect(within(alert).getByRole('link', { name: 'How to shrink it by hand' })).toMatchObject({
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(screen.queryByRole('button', { name: 'Upload image' })).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /Choose an image/ }).getAttribute('aria-describedby'),
    ).toContain(alert.id);
    expect(await axeViolations(container)).toEqual([]);
  });

  it.each([
    ['a type that is not accepted', 'anim.gif', 'image/gif', /not a type Gurukul accepts/],
    ['a name that does not match its type', 'x.png', 'image/jpeg', /file name ends in \.png/],
  ])('refuses %s', async (_name, name, type, message) => {
    const { container } = setup();
    await pick(container, pngFile(name, 10 * KB, type));
    expect(within(errorBox() as HTMLElement).getAllByRole('listitem')[0]?.textContent).toMatch(
      message,
    );
  });

  it('refuses a file that only has an image name, and one the browser cannot decode', async () => {
    decodes(null);
    const { container } = setup();
    await pick(container, new File(['just some text'], 'fake.png', { type: 'image/png' }));
    const steps = within(errorBox() as HTMLElement).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent).join(' ')).toMatch(/does not look like a real image/);
    expect(steps.map((s) => s.textContent).join(' ')).toMatch(/could not be read/);
  });

  it('sends a PDF to the File block', async () => {
    const { container } = setup();
    const pdf = new File(['%PDF-1.7 and the rest'], 'guide.pdf', { type: 'application/pdf' });
    await pick(container, pdf);
    expect(within(errorBox() as HTMLElement).getByText(/File block/)).toBeTruthy();
  });

  it('says so when the file cannot be read at all', async () => {
    const { container } = setup();
    const file = pngFile();
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () => Promise.reject(new Error('gone')),
    } as unknown as Blob);
    await pick(container, file);
    expect(within(errorBox() as HTMLElement).getByText(/could not be read/)).toBeTruthy();
  });

  it('takes no second file while the first is being checked', async () => {
    const { container } = setup();
    let finish: (size: { width: number; height: number }) => void = () => {};
    const bitmap = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = (size) => resolve({ ...size, close: () => {} });
        }),
    );
    vi.stubGlobal('createImageBitmap', bitmap);
    act(
      () => void fireEvent.change(picker(container), { target: { files: [pngFile('first.png')] } }),
    );
    act(
      () =>
        void fireEvent.change(picker(container), { target: { files: [pngFile('second.png')] } }),
    );
    expect(await screen.findByText('Checking first.png…')).toBeTruthy();
    await act(async () => finish({ width: 900, height: 600 }));
    expect(screen.getByText('first.png · 40 KB · 900 × 600 px')).toBeTruthy();
    expect(bitmap).toHaveBeenCalledOnce();
  });

  it('makes no preview when the editor goes away while a file is being checked', async () => {
    const { container, unmount } = setup();
    let finish: (size: { width: number; height: number }) => void = () => {};
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = (size) => resolve({ ...size, close: () => {} });
          }),
      ),
    );
    act(() => void fireEvent.change(picker(container), { target: { files: [pngFile()] } }));
    await screen.findByText('Checking shot.png…');
    unmount();
    await act(async () => finish({ width: 900, height: 600 }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('frees the preview address when the file goes away', async () => {
    const { container, unmount } = setup();
    await pick(container, pngFile());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });
});

describe('the agent prompt', () => {
  const refuse = async () => {
    decodes({ width: 3024, height: 4032 });
    const view = setup();
    await pick(view.container, pngFile('phone.png', 1800 * KB));
    return view;
  };

  it('copies a prompt that names the file and the live limits, and confirms with a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await refuse();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }));
    });
    const prompt = writeText.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('"phone.png" (currently 1.8 MB, 3024 × 4032 px)');
    expect(prompt).toContain('under 500 KB');
    expect(await screen.findByText('Prompt copied')).toBeTruthy();
  });

  it('falls back to the copy command when the clipboard API is refused', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    await refuse();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }));
    });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(await screen.findByText('Prompt copied')).toBeTruthy();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('says so when nothing can copy', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('blocked');
    });
    await refuse();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }));
    });
    expect(await screen.findByText('Could not copy the prompt')).toBeTruthy();
  });

  it('reports a copy command that returns false as a failure', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    await refuse();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }));
    });
    expect(await screen.findByText('Could not copy the prompt')).toBeTruthy();
  });
});

describe('uploading', () => {
  it('starts one upload however fast the button is pressed, and ignores progress that arrives late', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    const button = upload();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(ctl.request).toBeDefined());
    expect(studio.storage.upload).toHaveBeenCalledOnce();
    const request = ctl.request as MediaUploadRequest;
    await act(async () => ctl.fail({ code: 'storage/unknown' }));
    // Progress reported after the upload already ended changes nothing on screen.
    act(() => request.onProgress(90));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('uploads to a new path with the right metadata, shows progress, and only then writes the block', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, last, seen } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    fireEvent.click(upload());
    expect(await screen.findByText(/^Uploading shot\.png/)).toBeTruthy();
    await waitFor(() => expect(ctl.request).toBeDefined());
    const request = ctl.request as MediaUploadRequest;
    expect(request.path).toMatch(UPLOAD_PATH);
    expect(request.path).toMatch(/^courses\/git\/media\/[A-Za-z0-9_-]{22}\.png$/);
    expect(request.metadata).toEqual({
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
      customMetadata: { uploadedBy: 'u1', courseId: 'git', width: '1200', height: '800' },
    });
    expect(request.file).toBeInstanceOf(File);
    act(() => request.onProgress(47));
    expect(screen.getByText('Uploading shot.png: 40%')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Upload progress' }).getAttribute('aria-valuenow'),
    ).toBe('47');
    expect(seen).not.toHaveBeenCalled();
    const url = `https://firebasestorage.googleapis.com/v0/b/${FAKE_BUCKET}/o/${encodeURIComponent(request.path)}?alt=media&token=t`;
    await act(async () => ctl.done(url));
    expect(last()).toMatchObject({
      url,
      width: 1200,
      height: 800,
      upload: { path: request.path, bytes: 40 * KB, contentType: 'image/png', name: 'shot.png' },
    });
    expect(await screen.findByText('Image uploaded')).toBeTruthy();
    expect(screen.getByText('Uploaded: shot.png · 40 KB · 1200 × 800 px')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Upload image$/ })).toBeNull();
  });

  it('keeps what was typed while the file was going up', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, last } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    fireEvent.change(screen.getByLabelText('Alt text (required)'), {
      target: { value: 'A branch diagram' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    await act(async () => ctl.done('https://firebasestorage.googleapis.com/v0/b/b/o/p'));
    expect(last()).toMatchObject({ alt: 'A branch diagram', layout: 'medium', width: 1200 });
  });

  it('cancels, keeps the file ready and writes nothing', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, seen } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(ctl.request?.signal.aborted).toBe(true);
    await act(async () => ctl.fail(new UploadCancelledError()));
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy();
    expect(errorBox()).toBeNull();
    expect(seen).not.toHaveBeenCalled();
  });

  it.each([
    ['storage/unauthorized', /refused this upload.*not be an Educator.*larger than the limit/],
    ['storage/unauthenticated', /refused this upload/],
    ['storage/network-request-failed', /could not reach Gurukul/],
    ['storage/retry-limit-exceeded', /could not reach Gurukul/],
    ['storage/quota-exceeded', /no storage space/],
    ['storage/unknown', /did not finish, and nothing was saved/],
  ])('says what to do after %s, writes nothing, and a retry can succeed', async (code, message) => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, seen, last } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    await act(async () => ctl.fail({ code }));
    expect((errorBox() as HTMLElement).textContent).toMatch(message);
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Image preview' })).toBeTruthy();
    // Try again.
    const second = pendingUpload(studio);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(second.request).toBeDefined());
    await act(async () => second.done('https://firebasestorage.googleapis.com/v0/b/b/o/q'));
    expect(last()).toMatchObject({ url: 'https://firebasestorage.googleapis.com/v0/b/b/o/q' });
  });

  it('reads an offline browser as a connection problem, whatever the code says', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => ctl.fail(new Error('boom')));
    expect((errorBox() as HTMLElement).textContent).toMatch(/could not reach Gurukul/);
  });

  it('replaces an upload with a new file and leaves the old one alone', async () => {
    const studio = fakeStudio();
    const { container, last } = setup(hosted(), { studio });
    await pick(container, pngFile('new.png'));
    expect(screen.getByText('Uploaded: old.png · 120 KB · 1000 × 500 px')).toBeTruthy();
    fireEvent.click(upload());
    await waitFor(() => expect(last()).toMatchObject({ upload: { name: 'new.png' } }));
    const { path } = (last() as { upload: { path: string } }).upload;
    expect(path).not.toBe(uploaded.path);
    expect(studio.storage.upload).toHaveBeenCalledOnce();
    expect(studio.data.listCourses).not.toHaveBeenCalled();
  });

  it('stops an upload when the editor goes away, without touching the draft', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, unmount, seen } = setup(newBlock('image'), { studio });
    await pick(container, pngFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    unmount();
    expect(ctl.request?.signal.aborted).toBe(true);
    ctl.fail(new UploadCancelledError());
    expect(seen).not.toHaveBeenCalled();
  });

  it('does nothing when there is no checked file to upload', async () => {
    const { container } = setup();
    expect(screen.queryByRole('button', { name: 'Upload image' })).toBeNull();
    await pick(container, pngFile('x.gif', 10 * KB, 'image/gif'));
    expect(screen.queryByRole('button', { name: 'Upload image' })).toBeNull();
  });

  it('names a long file at most 120 characters', async () => {
    const { container, last } = setup();
    await pick(container, pngFile(`${'a'.repeat(200)}.png`));
    fireEvent.click(upload());
    await waitFor(() => expect(last()).toMatchObject({ upload: expect.anything() }));
    expect((last() as { upload: { name: string } }).upload.name).toHaveLength(120);
  });
});

describe('the blur hash', () => {
  beforeEach(() => {
    vi.mocked(imageBlurHash).mockResolvedValue(undefined);
    vi.mocked(pdfBlurHash).mockResolvedValue(undefined);
  });

  it('is stored in upload.blurHash when it was made', async () => {
    // The preview then paints it; jsdom has no canvas, so it keeps the average colour.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.mocked(imageBlurHash).mockResolvedValue(HASH);
    const { container, last } = setup(newBlock('image'));
    await pick(container, pngFile());
    fireEvent.click(upload());
    await waitFor(() => expect(last()).toMatchObject({ upload: { blurHash: HASH } }));
    expect(imageBlurHash).toHaveBeenCalledWith(expect.any(File));
    expect(await screen.findByText('Image uploaded')).toBeTruthy();
  });

  it('is left out when it could not be made, and the upload still succeeds', async () => {
    const { container, last } = setup(newBlock('image'));
    await pick(container, pngFile());
    fireEvent.click(upload());
    expect(await screen.findByText('Image uploaded')).toBeTruthy();
    expect((last() as { upload: object }).upload).not.toHaveProperty('blurHash');
  });
});
