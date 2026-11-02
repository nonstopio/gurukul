import { decodeBlurHash, isValidBlurHash } from '@gurukul/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../src/log';
import { BLUR_EDGE, browserImage, imageBlurHash, pdfBlurHash } from '../src/studio/media/blurHash';
import type { Pixels } from '../src/studio/media/canvas';
import { paintPixels } from '../src/studio/media/canvas';
import { loadPdfJs, renderFirstPage } from '../src/studio/media/pdfPage';
import type { PdfJs } from '../src/studio/media/pdfPage';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/assets/pdf.worker.js' }));
const workerOptions = { workerSrc: '' };
const getDocument = vi.fn();
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: workerOptions,
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getDocument.mockReset();
});

const file = new File([new Uint8Array(10)], 'private-name.pdf');
/** A solid colour as RGBA pixels. */
const solid = (width: number, height: number, rgba = [230, 120, 20, 255]): Pixels => ({
  width,
  height,
  data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4] as number),
});
const redOf = (hash: string) => decodeBlurHash(hash, 4, 4)[0] as number;

/** A 2D context that paints nothing and reads back what the test hands it. */
function stubCanvas(read: () => Pixels | Error | null) {
  const context = {
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      const out = read();
      if (out instanceof Error) throw out;
      return { data: out ? out.data : new Uint8ClampedArray(w * h * 4) };
    }),
  };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((() => (read() === null ? null : context)) as never);
  return { context, getContext };
}

describe('paintPixels', () => {
  it('fills the canvas white, paints, and reads the pixels back', async () => {
    const { context, getContext } = stubCanvas(() => solid(3, 2));
    const paint = vi.fn();
    const pixels = await paintPixels(3, 2, paint);
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 3, 2);
    expect(paint).toHaveBeenCalledWith(context, expect.any(HTMLCanvasElement));
    expect(pixels).toMatchObject({ width: 3, height: 2 });
    expect(pixels?.data).toHaveLength(24);
  });

  it('is null where there is no 2D canvas, and paints nothing', async () => {
    stubCanvas(() => null);
    const paint = vi.fn();
    expect(await paintPixels(3, 2, paint)).toBeNull();
    expect(paint).not.toHaveBeenCalled();
  });
});

describe('imageBlurHash', () => {
  it('makes a valid 4 x 3 hash from the pixels it is given', async () => {
    const hash = await imageBlurHash(file, async () => solid(32, 20));
    expect(hash).toBeDefined();
    expect(isValidBlurHash(hash as string)).toBe(true);
    expect(hash).toHaveLength(4 + 2 * 4 * 3);
    expect(redOf(hash as string)).toBeGreaterThan(200);
  });

  it('is undefined, and logs without the file name, when there is nothing to draw', async () => {
    const debug = vi.spyOn(log, 'debug').mockImplementation(() => {});
    expect(await imageBlurHash(file, async () => null)).toBeUndefined();
    expect(debug).toHaveBeenCalledWith('Blur hash skipped', {
      kind: 'image',
      reason: 'nothing to draw',
    });
    expect(JSON.stringify(debug.mock.calls)).not.toContain('private-name');
  });

  it('is undefined when reading or encoding throws, an Error or not', async () => {
    const debug = vi.spyOn(log, 'debug').mockImplementation(() => {});
    expect(
      await imageBlurHash(file, async () => {
        throw new TypeError('no');
      }),
    ).toBeUndefined();
    expect(debug).toHaveBeenLastCalledWith('Blur hash failed', {
      kind: 'image',
      reason: 'TypeError',
    });
    expect(
      await imageBlurHash(file, async () => {
        throw 'nope';
      }),
    ).toBeUndefined();
    expect(debug).toHaveBeenLastCalledWith('Blur hash failed', {
      kind: 'image',
      reason: 'unknown',
    });
    // Pixels of the wrong length make the encoder itself throw.
    expect(
      await imageBlurHash(file, async () => ({ data: [1, 2, 3], width: 2, height: 2 })),
    ).toBeUndefined();
  });
});

describe('browserImage', () => {
  const bitmap = (width: number, height: number) => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width, height, close })),
    );
    return close;
  };

  it('draws the picture at about 32 px on its long side, keeping the aspect, and reads it', async () => {
    const close = bitmap(1600, 800);
    const stub = stubCanvas(() => solid(32, 16));
    const pixels = await browserImage(file);
    expect(pixels).toMatchObject({ width: BLUR_EDGE, height: 16 });
    expect(stub.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 32, 16);
    expect(close).toHaveBeenCalledOnce();
  });

  it('never draws a zero-sized canvas for a hairline image', async () => {
    bitmap(3000, 2);
    const stub = stubCanvas(() => solid(32, 1));
    await browserImage(file);
    expect(stub.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 32, 1);
  });

  it('is null without createImageBitmap or without a canvas, and still releases the bitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await browserImage(file)).toBeNull();
    const close = bitmap(100, 100);
    stubCanvas(() => null);
    expect(await browserImage(file)).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it('throws when getImageData does, so the hash is skipped, and releases the bitmap', async () => {
    const close = bitmap(100, 100);
    stubCanvas(() => new Error('tainted'));
    await expect(browserImage(file)).rejects.toThrow('tainted');
    expect(close).toHaveBeenCalledOnce();
    // Through imageBlurHash that is no hash, not an error.
    expect(await imageBlurHash(file)).toBeUndefined();
  });

  it('makes a hash end to end from the stubbed browser', async () => {
    bitmap(640, 480);
    stubCanvas(() => solid(32, 24));
    expect(isValidBlurHash((await imageBlurHash(file)) as string)).toBe(true);
  });
});

/** A pdf.js stand-in: `pages` pages, the first one `width` by `height` points. */
function fakePdf(pages: number, size = { width: 600, height: 800 }) {
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: size.width * scale,
    height: size.height * scale,
  }));
  const getPage = vi.fn(async () => ({ getViewport, render }));
  const destroy = vi.fn(async () => {});
  const getDoc = vi.fn(() => ({ promise: Promise.resolve({ numPages: pages, getPage }), destroy }));
  const lib = { getDocument: getDoc } as unknown as PdfJs;
  return { lib, load: async () => lib, render, getViewport, getPage, destroy, getDoc };
}

describe('renderFirstPage', () => {
  it('renders page 1 scaled so the long side is 32 px, and frees pdf.js', async () => {
    const pdf = fakePdf(3);
    const stub = stubCanvas(() => solid(24, 32));
    const pixels = await renderFirstPage(file, 32, pdf.load);
    expect(pixels).toMatchObject({ width: 24, height: 32 });
    expect(pdf.getPage).toHaveBeenCalledWith(1);
    expect(pdf.getDoc).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    expect(pdf.render).toHaveBeenCalledWith({
      canvas: expect.any(HTMLCanvasElement),
      canvasContext: stub.context,
      viewport: expect.objectContaining({ width: 24, height: 32 }),
    });
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('is null for a PDF with no pages, and frees pdf.js', async () => {
    const pdf = fakePdf(0);
    expect(await renderFirstPage(file, 32, pdf.load)).toBeNull();
    expect(pdf.getPage).not.toHaveBeenCalled();
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('is null without a canvas', async () => {
    const pdf = fakePdf(1);
    stubCanvas(() => null);
    expect(await renderFirstPage(file, 32, pdf.load)).toBeNull();
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('never asks for a zero-sized canvas for a hairline page', async () => {
    const pdf = fakePdf(1, { width: 3000, height: 1 });
    stubCanvas(() => solid(32, 1));
    expect(await renderFirstPage(file, 32, pdf.load)).toMatchObject({ width: 32, height: 1 });
  });

  it('throws when the page cannot be rendered, and still frees pdf.js', async () => {
    const pdf = fakePdf(1);
    stubCanvas(() => solid(24, 32));
    pdf.render.mockImplementation(() => ({ promise: Promise.reject(new Error('bad stream')) }));
    await expect(renderFirstPage(file, 32, pdf.load)).rejects.toThrow('bad stream');
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('throws when pdf.js cannot open the file (encrypted or damaged)', async () => {
    const lib = {
      getDocument: () => ({
        promise: Promise.reject(new Error('PasswordException')),
        destroy: vi.fn(async () => {}),
      }),
    } as unknown as PdfJs;
    await expect(renderFirstPage(file, 32, async () => lib)).rejects.toThrow('PasswordException');
  });
});

describe('pdfBlurHash', () => {
  it('hashes the rendered first page at 32 px', async () => {
    const read = vi.fn(async () => solid(24, 32, [20, 120, 230, 255]));
    const hash = await pdfBlurHash(file, read);
    expect(read).toHaveBeenCalledWith(file, 32);
    expect(isValidBlurHash(hash as string)).toBe(true);
    expect(redOf(hash as string)).toBeLessThan(60);
  });

  it('is undefined when the page cannot be rendered, with a debug line and no file name', async () => {
    const debug = vi.spyOn(log, 'debug').mockImplementation(() => {});
    const hash = await pdfBlurHash(file, async () => {
      throw new Error('PasswordException');
    });
    expect(hash).toBeUndefined();
    expect(debug).toHaveBeenCalledWith('Blur hash failed', { kind: 'pdf', reason: 'Error' });
    expect(JSON.stringify(debug.mock.calls)).not.toContain('private-name');
  });

  it('is undefined for a PDF with no pages', async () => {
    const pdf = fakePdf(0);
    expect(
      await pdfBlurHash(file, (f, edge) => renderFirstPage(f, edge, pdf.load)),
    ).toBeUndefined();
  });

  it('makes a hash end to end through the default renderer (pdf.js stubbed)', async () => {
    const pdf = fakePdf(1);
    getDocument.mockImplementation(pdf.lib.getDocument);
    stubCanvas(() => solid(24, 32));
    expect(isValidBlurHash((await pdfBlurHash(file)) as string)).toBe(true);
    expect(workerOptions.workerSrc).toBe('/assets/pdf.worker.js');
  });
});

describe('loadPdfJs', () => {
  it('imports pdf.js and points it at its bundled worker', async () => {
    workerOptions.workerSrc = '';
    const lib = await loadPdfJs();
    expect(lib.GlobalWorkerOptions.workerSrc).toBe('/assets/pdf.worker.js');
  });
});
