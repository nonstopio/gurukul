import type { Block } from '@gurukul/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockEditor } from '../src/studio/blocks/BlockEditor';
import { newBlock } from '../src/studio/lessonEdit';
import { axeViolations } from './axe';
import { BlockProviders } from './block-harness';
import { fakeStudio } from './fake-studio';

const KB = 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

const file = (name: string, size: number, type = 'image/png', head = PNG) =>
  new File([new Uint8Array(head), new Uint8Array(size - head.length)], name, { type });

/**
 * A browser with a canvas, as jsdom has none: the image decodes to `size`, and each WebP encode
 * answers with `bytesFor(quality)`, or null (an encoder without WebP).
 */
function browser(
  size: { width: number; height: number },
  bytesFor: (quality: number) => number | null,
) {
  const drawImage = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ ...size, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    clearRect: vi.fn(),
  } as unknown as RenderingContext);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, _type, quality) => {
    const bytes = bytesFor(quality as number);
    cb(
      bytes === null
        ? null
        : new Blob([new Uint8Array(RIFF), new Uint8Array(bytes - RIFF.length)], {
            type: 'image/webp',
          }),
    );
  });
  return { drawImage };
}

function Harness({ seen }: { seen: (b: Block) => void }) {
  const [block, setBlock] = useState<Block>(newBlock('image'));
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

function setup() {
  const studio = fakeStudio();
  const seen = vi.fn();
  const view = render(
    <BlockProviders studio={studio}>
      <Harness seen={seen} />
    </BlockProviders>,
  );
  return { ...view, studio, seen };
}

const picker = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const pick = async (c: HTMLElement, f: File) => {
  await act(async () => {
    fireEvent.change(picker(c), { target: { files: [f] } });
  });
};
const shrinkButton = () => screen.queryByRole('button', { name: 'Shrink it for me' });
const shrink = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Shrink it for me' }));
  });
};

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Shrink it for me', () => {
  it.each([
    ['too big in bytes only', { width: 1200, height: 800 }, 1800 * KB],
    ['too wide only', { width: 3000, height: 2000 }, 300 * KB],
    ['both', { width: 3024, height: 4032 }, 1800 * KB],
  ])('is offered next to the prompt when an image is %s', async (_n, dims, bytes) => {
    browser(dims, () => 100 * KB);
    const { container } = setup();
    await pick(container, file('phone.png', bytes));
    expect(shrinkButton()).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }),
    ).toBeTruthy();
    expect(screen.getByText(/Location and camera details are removed/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('is not offered for an image that already fits', async () => {
    browser({ width: 1200, height: 800 }, () => 100 * KB);
    const { container } = setup();
    await pick(container, file('ok.png', 40 * KB));
    expect(shrinkButton()).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy();
  });

  it.each([
    ['an SVG', file('logo.svg', 900 * KB, 'image/svg+xml', [0x3c, 0x73, 0x76, 0x67])],
    ['a GIF', file('anim.gif', 900 * KB, 'image/gif')],
    ['a PDF', file('doc.pdf', 3000 * KB, 'application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d])],
    ['a renamed text file', file('fake.png', 900 * KB, 'image/png', [1, 2, 3, 4])],
    ['a big image with the wrong type', file('x.png', 900 * KB, 'image/jpeg')],
  ])('is never offered for %s', async (_n, picked) => {
    browser({ width: 3000, height: 2000 }, () => 100 * KB);
    const { container } = setup();
    await pick(container, picked);
    expect(shrinkButton()).toBeNull();
    expect(screen.queryByText(/Location and camera details/)).toBeNull();
  });

  it('is not offered for a big image the browser cannot read', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('not an image');
      }),
    );
    const { container } = setup();
    await pick(container, file('broken.png', 900 * KB));
    expect(shrinkButton()).toBeNull();
  });

  it('re-encodes to WebP, previews it, and shows the saving and the Upload button', async () => {
    const canvas = browser({ width: 3000, height: 2000 }, (q) => (q > 0.8 ? 700 * KB : 180 * KB));
    const { container, seen, studio } = setup();
    await pick(container, file('holiday.png', 1800 * KB));
    await shrink();
    expect(canvas.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1067);
    expect(screen.getByText('holiday-gurukul.webp · 180 KB · 1600 × 1067 px')).toBeTruthy();
    expect(
      screen.getByText(
        'Shrunk from 1.8 MB to 180 KB (3000 × 2000 px to 1600 × 1067 px). Location and camera details are removed.',
      ),
    ).toBeTruthy();
    const frame = container.querySelector('.studio-previewwidth__frame') as HTMLElement;
    expect(within(frame).getByRole('img', { name: 'Image preview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy();
    expect(shrinkButton()).toBeNull();
    // Nothing is uploaded or written to the draft until the Educator says so.
    expect(studio.storage.upload).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('uploads the shrunk file as WebP when the Educator asks', async () => {
    browser({ width: 3000, height: 2000 }, () => 180 * KB);
    const { container, studio, seen } = setup();
    vi.mocked(studio.storage.upload).mockResolvedValue('https://example.com/new.webp');
    await pick(container, file('holiday.png', 1800 * KB));
    await shrink();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    });
    const request = vi.mocked(studio.storage.upload).mock.calls[0]?.[0];
    expect((request?.file as File).name).toBe('holiday-gurukul.webp');
    expect(request?.path).toMatch(/\.webp$/);
    await waitFor(() =>
      expect(seen.mock.lastCall?.[0]).toMatchObject({
        url: 'https://example.com/new.webp',
        width: 1600,
        height: 1067,
        upload: { contentType: 'image/webp', bytes: 180 * KB },
      }),
    );
  });

  it('shows a busy state while it works', async () => {
    browser({ width: 3000, height: 2000 }, () => 180 * KB);
    const { container } = setup();
    await pick(container, file('holiday.png', 1800 * KB));
    let release: (blob: Blob | null) => void = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      release = cb;
    });
    await shrink();
    expect(screen.getByText('Checking holiday.png…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Shrink it for me' })).toBeNull();
    await act(async () => {
      release(new Blob([new Uint8Array(RIFF), new Uint8Array(1000)], { type: 'image/webp' }));
    });
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy();
  });

  it('can be discarded to choose another file', async () => {
    browser({ width: 3000, height: 2000 }, () => 180 * KB);
    const { container } = setup();
    await pick(container, file('holiday.png', 1800 * KB));
    await shrink();
    fireEvent.click(screen.getByRole('button', { name: 'Discard and choose another' }));
    expect(screen.queryByRole('button', { name: 'Upload image' })).toBeNull();
    expect(screen.getByRole('button', { name: /Choose an image/ })).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('keeps a plain file without Discard when it was not shrunk', async () => {
    browser({ width: 1200, height: 800 }, () => 100 * KB);
    const { container } = setup();
    await pick(container, file('ok.png', 40 * KB));
    expect(screen.queryByRole('button', { name: 'Discard and choose another' })).toBeNull();
  });

  it('says so and keeps the prompt when the browser cannot encode WebP', async () => {
    browser({ width: 3000, height: 2000 }, () => null);
    const { container } = setup();
    await pick(container, file('holiday.png', 1800 * KB));
    await shrink();
    expect(screen.getByText(/This browser could not shrink the image/)).toBeTruthy();
    expect(shrinkButton()).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }),
    ).toBeTruthy();
  });

  it('says so and keeps the prompt when the picture will not get small enough', async () => {
    browser({ width: 3000, height: 3000 }, () => 900 * KB);
    const { container } = setup();
    await pick(container, file('noise.png', 1800 * KB));
    await shrink();
    expect(screen.getByText(/will not get under 500 KB even when made smaller/)).toBeTruthy();
    expect(shrinkButton()).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Copy a prompt for your coding agent' }),
    ).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('keeps transparency: the canvas is not filled before the PNG is drawn', async () => {
    const canvas = browser({ width: 3000, height: 2000 }, () => 100 * KB);
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: canvas.drawImage,
      clearRect: vi.fn(),
      fillRect,
    } as unknown as RenderingContext);
    const { container } = setup();
    await pick(container, file('logo.png', 1800 * KB));
    await shrink();
    expect(fillRect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy();
  });

  it('ends quietly when the Educator leaves while it works', async () => {
    browser({ width: 3000, height: 2000 }, () => 180 * KB);
    const { container, unmount } = setup();
    await pick(container, file('holiday.png', 1800 * KB));
    let release: (blob: Blob | null) => void = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      release = cb;
    });
    await shrink();
    unmount();
    await act(async () => {
      release(new Blob([new Uint8Array(RIFF), new Uint8Array(1000)], { type: 'image/webp' }));
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(0);
  });
});
