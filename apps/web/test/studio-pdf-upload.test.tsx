import type { Block } from '@gurukul/schema';
import { UPLOAD_PATH } from '@gurukul/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockEditor } from '../src/studio/blocks/BlockEditor';
import { labelFromName } from '../src/studio/blocks/usePdfUpload';
import { UploadCancelledError } from '../src/studio/errors';
import { newBlock } from '../src/studio/lessonEdit';
import type { MediaUploadRequest } from '../src/studio/types';
import { axeViolations } from './axe';
import { BlockProviders } from './block-harness';
import { fakeData } from './fake-data';
import { FAKE_BUCKET, fakeStudio } from './fake-studio';

const KB = 1024;

/** A file whose first bytes say PDF, padded to `size` bytes. */
function pdfFile(name = 'handout.pdf', size = 40 * KB, type = 'application/pdf') {
  const head = new TextEncoder().encode('%PDF-1.7\n');
  return new File([head, new Uint8Array(size - head.length)], name, { type });
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
  block: Block = newBlock('file'),
  over: { studio?: ReturnType<typeof fakeStudio>; data?: ReturnType<typeof fakeData> } = {},
) {
  const studio = over.studio ?? fakeStudio();
  const seen = vi.fn();
  const view = render(
    <BlockProviders studio={studio} {...(over.data ? { data: over.data } : {})}>
      <Harness initial={block} seen={seen} />
    </BlockProviders>,
  );
  return { ...view, studio, seen, last: () => seen.mock.lastCall?.[0] as Block };
}

const picker = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;
const pick = async (container: HTMLElement, file: File) => {
  await act(async () => {
    fireEvent.change(picker(container), { target: { files: [file] } });
  });
};
/** The box under the drop zone that says why a file was refused or an upload failed. */
const errorBox = (): HTMLElement | null => {
  const zone = screen.getByRole('button', { name: /Choose a PDF|Replace PDF/ });
  const [, id] = (zone.getAttribute('aria-describedby') ?? '').split(' ');
  return id ? document.getElementById(id) : null;
};
const upload = () => screen.getByRole('button', { name: /^(Upload PDF|Try again)$/ });

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
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const uploaded = {
  path: 'courses/git/media/old1.pdf',
  bytes: 420 * KB,
  contentType: 'application/pdf' as const,
  name: 'old-guide.pdf',
};
const hosted = (over: object = {}): Block =>
  ({
    ...newBlock('file'),
    url: `https://firebasestorage.googleapis.com/v0/b/${FAKE_BUCKET}/o/${encodeURIComponent(uploaded.path)}?alt=media&token=t`,
    label: 'Old guide',
    upload: uploaded,
    ...over,
  }) as Block;

describe('the File block tabs', () => {
  it('opens a new block on Upload, with the rules and the no-personal-data notice', async () => {
    const { container } = setup();
    expect(screen.getByRole('tab', { name: 'Upload' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('PDF only · up to 1.0 MB')).toBeTruthy();
    expect(screen.getByText('No personal data')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose a PDF/ })).toBeTruthy();
    expect(picker(container).accept).toBe('application/pdf');
    // The stand-in address of a new block is not a file, so there is nothing to preview.
    expect(container.querySelector('.file-link')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens a linked file on Link and an uploaded one on Upload', () => {
    const linked = setup({ ...newBlock('file'), url: 'https://example.com/a.pdf' } as Block);
    expect(screen.getByRole('tab', { name: 'Link' }).getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByText(/A file on GitHub or Google Drive \(shared with nonstopio\.com\)/),
    ).toBeTruthy();
    linked.unmount();
    setup(hosted());
    expect(screen.getByRole('tab', { name: 'Upload' }).getAttribute('aria-selected')).toBe('true');
  });

  it('states the Admin-lowered limit, not a typed number', async () => {
    const data = fakeData({ uploadLimits: { imageMaxKB: 500, pdfMaxKB: 300 } });
    setup(newBlock('file'), { data });
    expect(await screen.findByText('PDF only · up to 300 KB')).toBeTruthy();
  });

  it('shows what is uploaded as a learner will see it, and Remove clears the address and upload', () => {
    const { last, container } = setup(hosted());
    expect(screen.getByText('Uploaded: old-guide.pdf · 420 KB')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Replace PDF/ })).toBeTruthy();
    expect(container.querySelector('.file-link')?.textContent).toBe('Old guide · PDF · 420 KB');
    fireEvent.click(screen.getByRole('button', { name: 'Remove PDF' }));
    expect(last()).toMatchObject({ type: 'file', url: '', label: 'Old guide' });
    expect('upload' in last()).toBe(false);
    expect(container.querySelector('.file-link')).toBeNull();
  });

  it('typing an address on Link over an uploaded file makes it a plain link', () => {
    const { last, container } = setup(hosted());
    fireEvent.click(screen.getByRole('tab', { name: 'Link' }));
    expect(screen.getByText(/This PDF is uploaded to Gurukul \(420 KB\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('File address'), {
      target: { value: 'https://drive.google.com/file/d/abc/view' },
    });
    expect(last()).toMatchObject({ url: 'https://drive.google.com/file/d/abc/view' });
    expect('upload' in last()).toBe(false);
    expect(container.querySelector('.file-link')?.textContent).toBe('Old guide');
  });

  it('previews a linked file with a stand-in label until one is typed', () => {
    const { container } = setup({ ...newBlock('file'), url: 'https://example.com/a.pdf' } as Block);
    expect(container.querySelector('.file-link')?.textContent).toBe('Untitled file');
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Cheat sheet' } });
    expect(container.querySelector('.file-link')?.textContent).toBe('Cheat sheet');
  });
});

describe('picking a PDF', () => {
  it('checks it, previews it as the learner will see it, and writes nothing to the draft', async () => {
    const { container, seen } = setup();
    await pick(container, pdfFile());
    expect(screen.getByText('handout.pdf · 40 KB')).toBeTruthy();
    expect(container.querySelector('.file-link')?.textContent).toBe('Untitled file · PDF · 40 KB');
    expect(container.querySelector('.file-link')?.getAttribute('href')).toBe('blob:pdf-1');
    expect(upload()).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('takes a dropped file too, and says it is checking while it reads it', async () => {
    const { container } = setup();
    const file = pdfFile('drop.pdf');
    let finish: (buffer: ArrayBuffer) => void = () => {};
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        }),
    } as unknown as Blob);
    fireEvent.drop(screen.getByRole('button', { name: /Choose a PDF/ }), {
      dataTransfer: { files: [file] },
    });
    expect(await screen.findByText('Checking drop.pdf…')).toBeTruthy();
    await act(async () => finish(new TextEncoder().encode('%PDF-1.4 ').buffer as ArrayBuffer));
    expect(await screen.findByText('drop.pdf · 40 KB')).toBeTruthy();
    expect(container.querySelector('.file-link')).toBeTruthy();
  });

  it('refuses a PDF over the limit with its real size, a prompt, and the way out through Link', async () => {
    const { container, seen } = setup();
    await pick(container, pdfFile('scan.pdf', 3500 * KB));
    const alert = errorBox() as HTMLElement;
    expect(within(alert).getByText('This PDF cannot be uploaded as it is.')).toBeTruthy();
    const steps = within(alert).getAllByRole('listitem');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.textContent).toContain('This PDF is 3.4 MB.');
    expect(steps[0]?.textContent).toContain('up to 1.0 MB');
    expect(steps[0]?.textContent).toContain('GitHub or Google Drive (shared with nonstopio.com)');
    expect(within(alert).getByRole('link', { name: 'How to shrink it by hand' })).toMatchObject({
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(screen.queryByRole('button', { name: 'Upload PDF' })).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(within(alert).getByRole('button', { name: 'Switch to Link' }));
    expect(screen.getByRole('tab', { name: 'Link' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('File address')).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuses a type that is not accepted, with no Switch to Link', async () => {
    const { container } = setup();
    await pick(container, pdfFile('notes.docx', 10 * KB, 'application/msword'));
    const alert = errorBox() as HTMLElement;
    expect(within(alert).getAllByRole('listitem')[0]?.textContent).toMatch(
      /not a type Gurukul accepts/,
    );
    expect(within(alert).queryByRole('button', { name: 'Switch to Link' })).toBeNull();
    expect(within(alert).getByRole('button', { name: /Copy a prompt/ })).toBeTruthy();
  });

  it('refuses a PDF name that says another type', async () => {
    const { container } = setup();
    await pick(container, pdfFile('x.pdf', 10 * KB, 'image/png'));
    expect(within(errorBox() as HTMLElement).getAllByRole('listitem')[0]?.textContent).toMatch(
      /does not accept for a PDF/,
    );
  });

  it('refuses a renamed non-PDF: the first bytes are checked, not the name', async () => {
    const { container } = setup();
    await pick(container, new File(['just some text'], 'fake.pdf', { type: 'application/pdf' }));
    expect(within(errorBox() as HTMLElement).getAllByRole('listitem')[0]?.textContent).toMatch(
      /does not look like a real PDF/,
    );
  });

  it('sends an image to the Image block, with no agent prompt', async () => {
    const { container } = setup();
    await pick(container, new File(['x'], 'shot.png', { type: 'image/png' }));
    const alert = errorBox() as HTMLElement;
    expect(within(alert).getByText(/Image block/)).toBeTruthy();
    expect(within(alert).queryByRole('button', { name: /Copy a prompt/ })).toBeNull();
  });

  it('says so when the file cannot be read at all', async () => {
    const { container } = setup();
    const file = pdfFile();
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () => Promise.reject(new Error('gone')),
    } as unknown as Blob);
    await pick(container, file);
    expect(within(errorBox() as HTMLElement).getByText(/could not be read/)).toBeTruthy();
  });

  it('makes no preview when the editor goes away while a file is being checked', async () => {
    const { container, unmount } = setup();
    const file = pdfFile();
    let finish: (buffer: ArrayBuffer) => void = () => {};
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        }),
    } as unknown as Blob);
    act(() => void fireEvent.change(picker(container), { target: { files: [file] } }));
    await screen.findByText('Checking handout.pdf…');
    unmount();
    await act(async () => finish(new TextEncoder().encode('%PDF-1.4 ').buffer as ArrayBuffer));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('frees the preview address when the file goes away', async () => {
    const { container, unmount } = setup();
    await pick(container, pdfFile());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf-1');
  });
});

describe('the agent prompt', () => {
  const refuse = async () => {
    const view = setup();
    await pick(view.container, pdfFile('scan.pdf', 3500 * KB));
    return view;
  };
  const copy = () =>
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }));
    });

  it('copies a PDF prompt that names the file and the live limit, and confirms with a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await refuse();
    await copy();
    const prompt = writeText.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('shrink a PDF');
    expect(prompt).toContain('"scan.pdf" (currently 3.4 MB)');
    expect(prompt).toContain('under 1.0 MB');
    expect(prompt).toContain('GitHub or Google Drive');
    expect(await screen.findByText('Prompt copied')).toBeTruthy();
  });

  it('says so when nothing can copy', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    await refuse();
    await copy();
    expect(await screen.findByText('Could not copy the prompt')).toBeTruthy();
  });
});

describe('uploading', () => {
  it('starts one upload however fast the button is pressed, and ignores progress that arrives late', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container } = setup(newBlock('file'), { studio });
    await pick(container, pdfFile());
    const button = upload();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(ctl.request).toBeDefined());
    expect(studio.storage.upload).toHaveBeenCalledOnce();
    const request = ctl.request as MediaUploadRequest;
    await act(async () => ctl.fail({ code: 'storage/unknown' }));
    act(() => request.onProgress(90));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('uploads to a new .pdf path, shows progress, and only then writes the block with a label from the name', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, last, seen } = setup(newBlock('file'), { studio });
    await pick(container, pdfFile('Git cheat sheet.v2.pdf'));
    fireEvent.click(upload());
    expect(await screen.findByText(/^Uploading Git cheat sheet\.v2\.pdf/)).toBeTruthy();
    await waitFor(() => expect(ctl.request).toBeDefined());
    const request = ctl.request as MediaUploadRequest;
    expect(request.path).toMatch(UPLOAD_PATH);
    expect(request.path).toMatch(/^courses\/git\/media\/[A-Za-z0-9_-]{22}\.pdf$/);
    expect(request.metadata).toEqual({
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000, immutable',
      customMetadata: { uploadedBy: 'u1', courseId: 'git' },
    });
    expect(request.file).toBeInstanceOf(File);
    act(() => request.onProgress(47));
    expect(screen.getByText('Uploading Git cheat sheet.v2.pdf: 40%')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Upload progress' }).getAttribute('aria-valuenow'),
    ).toBe('47');
    expect(seen).not.toHaveBeenCalled();
    const url = `https://firebasestorage.googleapis.com/v0/b/${FAKE_BUCKET}/o/${encodeURIComponent(request.path)}?alt=media&token=t`;
    await act(async () => ctl.done(url));
    expect(last()).toMatchObject({
      type: 'file',
      url,
      label: 'Git cheat sheet.v2',
      upload: {
        path: request.path,
        bytes: 40 * KB,
        contentType: 'application/pdf',
        name: 'Git cheat sheet.v2.pdf',
      },
    });
    expect(await screen.findByText('PDF uploaded')).toBeTruthy();
    expect(screen.getByText('Uploaded: Git cheat sheet.v2.pdf · 40 KB')).toBeTruthy();
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Git cheat sheet.v2');
    expect(container.querySelector('.file-link')?.textContent).toBe(
      'Git cheat sheet.v2 · PDF · 40 KB',
    );
    expect(screen.queryByRole('button', { name: /^Upload PDF$/ })).toBeNull();
  });

  it('keeps a label that was typed, before or while the file was going up', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, last } = setup(newBlock('file'), { studio });
    await pick(container, pdfFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Handout' } });
    await act(async () => ctl.done('https://firebasestorage.googleapis.com/v0/b/b/o/p'));
    expect(last()).toMatchObject({ label: 'Handout' });
  });

  it('cancels, keeps the file ready and writes nothing', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, seen } = setup(newBlock('file'), { studio });
    await pick(container, pdfFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(ctl.request?.signal.aborted).toBe(true);
    await act(async () => ctl.fail(new UploadCancelledError()));
    expect(screen.getByRole('button', { name: 'Upload PDF' })).toBeTruthy();
    expect(errorBox()).toBeNull();
    expect(seen).not.toHaveBeenCalled();
  });

  it.each([
    ['storage/unauthorized', /refused this upload.*not be an Educator.*larger than the limit/],
    ['storage/network-request-failed', /could not reach Gurukul/],
    ['storage/quota-exceeded', /no storage space/],
    ['storage/unknown', /did not finish, and nothing was saved/],
  ])('says what to do after %s, writes nothing, and a retry can succeed', async (code, message) => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, seen, last } = setup(newBlock('file'), { studio });
    await pick(container, pdfFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    await act(async () => ctl.fail({ code }));
    expect((errorBox() as HTMLElement).textContent).toMatch(message);
    expect(seen).not.toHaveBeenCalled();
    const second = pendingUpload(studio);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(second.request).toBeDefined());
    await act(async () => second.done('https://firebasestorage.googleapis.com/v0/b/b/o/q'));
    expect(last()).toMatchObject({ url: 'https://firebasestorage.googleapis.com/v0/b/b/o/q' });
  });

  it('replaces an upload with a new file and leaves the old one alone', async () => {
    const studio = fakeStudio();
    const { container, last } = setup(hosted(), { studio });
    await pick(container, pdfFile('new.pdf'));
    expect(screen.getByText('Uploaded: old-guide.pdf · 420 KB')).toBeTruthy();
    fireEvent.click(upload());
    await waitFor(() => expect(last()).toMatchObject({ upload: { name: 'new.pdf' } }));
    const { path } = (last() as { upload: { path: string } }).upload;
    expect(path).not.toBe(uploaded.path);
    // A label the Educator already has is not overwritten by the new file's name.
    expect(last()).toMatchObject({ label: 'Old guide' });
    expect(studio.storage.upload).toHaveBeenCalledOnce();
  });

  it('stops an upload when the editor goes away, without touching the draft', async () => {
    const studio = fakeStudio();
    const ctl = pendingUpload(studio);
    const { container, unmount, seen } = setup(newBlock('file'), { studio });
    await pick(container, pdfFile());
    fireEvent.click(upload());
    await waitFor(() => expect(ctl.request).toBeDefined());
    unmount();
    expect(ctl.request?.signal.aborted).toBe(true);
    ctl.fail(new UploadCancelledError());
    expect(seen).not.toHaveBeenCalled();
  });

  it('names a long file at most 120 characters, label included', async () => {
    const { container, last } = setup();
    await pick(container, pdfFile(`${'a'.repeat(200)}.pdf`));
    fireEvent.click(upload());
    await waitFor(() => expect(last()).toMatchObject({ upload: expect.anything() }));
    const block = last() as { upload: { name: string }; label: string };
    expect(block.upload.name).toHaveLength(120);
    expect(block.label).toHaveLength(120);
  });
});

describe('labelFromName', () => {
  it('drops the extension, and keeps a name that is only an extension', () => {
    expect(labelFromName('guide.pdf')).toBe('guide');
    expect(labelFromName('a.b.pdf')).toBe('a.b');
    expect(labelFromName('.pdf')).toBe('.pdf');
    expect(labelFromName('noext')).toBe('noext');
  });
});
