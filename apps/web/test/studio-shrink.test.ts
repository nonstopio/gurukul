import { checkUpload, uploadPolicy } from '@gurukul/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenRaster, Raster } from '../src/studio/media/shrink';
import {
  SHRINK_QUALITIES,
  browserRaster,
  isShrinkable,
  shrinkImage,
  shrunkName,
} from '../src/studio/media/shrink';

const KB = 1024;
const policy = uploadPolicy();
const RIFF = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

/** A blob that starts like a WebP file, padded to `size` bytes. */
const webp = (size: number, type = 'image/webp') =>
  new Blob([new Uint8Array(RIFF), new Uint8Array(size - RIFF.length)], { type });
const big = (name = 'photo.png') =>
  new File([new Uint8Array(2000 * KB)], name, { type: 'image/png' });

/** A canvas that answers each encode from `sizes`, by quality and by the size drawn so far. */
function fakeRaster(sizeFor: (width: number, quality: number) => number | null | Blob) {
  const draws: Array<[number, number]> = [];
  const qualities: number[] = [];
  let width = 0;
  const closed = vi.fn();
  const raster: Raster = {
    draw: (w, h) => {
      width = w;
      draws.push([w, h]);
    },
    toWebp: async (quality) => {
      qualities.push(quality);
      const answer = sizeFor(width, quality);
      if (answer === null) return null;
      return answer instanceof Blob ? answer : webp(answer);
    },
    close: closed,
  };
  const open: OpenRaster = async () => raster;
  return { open, draws, qualities, closed };
}

describe('shrinkImage', () => {
  it('draws at the recommended long edge and keeps the first quality that fits', async () => {
    const fake = fakeRaster((_w, q) => (q >= 0.8 ? 300 * KB : 100 * KB));
    const result = await shrinkImage(big(), { width: 3024, height: 4032 }, policy, fake.open);
    expect(fake.draws).toEqual([[1200, 1600]]);
    expect(fake.qualities).toEqual([0.85]);
    expect(result).toMatchObject({ ok: true, width: 1200, height: 1600 });
    if (!result.ok) throw new Error('unreachable');
    expect(result.file.name).toBe('photo-gurukul.webp');
    expect(result.file.type).toBe('image/webp');
    expect(result.file.size).toBe(300 * KB);
    expect(result.check.ok).toBe(true);
    expect(fake.closed).toHaveBeenCalledOnce();
  });

  it('steps the quality down until the file fits the limit', async () => {
    const fake = fakeRaster((_w, q) => (q > 0.7 ? 900 * KB : 200 * KB));
    const result = await shrinkImage(big(), { width: 3000, height: 2000 }, policy, fake.open);
    expect(fake.qualities).toEqual([0.85, 0.8, 0.7]);
    expect(result.ok).toBe(true);
  });

  it('never upscales: an image under the recommended edge keeps its pixels', async () => {
    const fake = fakeRaster(() => 100 * KB);
    const result = await shrinkImage(big(), { width: 1400, height: 900 }, policy, fake.open);
    expect(fake.draws).toEqual([[1400, 900]]);
    expect(result).toMatchObject({ ok: true, width: 1400, height: 900 });
  });

  it('uses the live byte limit, not a typed number', async () => {
    const lowered = uploadPolicy({ imageMaxKB: 100 });
    const fake = fakeRaster((_w, q) => (q > 0.6 ? 150 * KB : 90 * KB));
    const result = await shrinkImage(big(), { width: 3000, height: 2000 }, lowered, fake.open);
    expect(fake.qualities).toEqual([...SHRINK_QUALITIES]);
    expect(result.ok).toBe(true);
  });

  it('makes the picture smaller, step by step, when the lowest quality is still too big', async () => {
    const fake = fakeRaster((w) => (w <= 1024 ? 400 * KB : 900 * KB));
    const result = await shrinkImage(big(), { width: 3000, height: 1500 }, policy, fake.open);
    expect(fake.draws.map(([w]) => w)).toEqual([1600, 1280, 1024]);
    expect(result).toMatchObject({ ok: true, width: 1024, height: 512 });
  });

  it('gives up at the floor with too-big, and still closes the canvas', async () => {
    const fake = fakeRaster(() => 900 * KB);
    const result = await shrinkImage(big(), { width: 3000, height: 3000 }, policy, fake.open);
    expect(result).toEqual({ ok: false, reason: 'too-big' });
    expect(fake.draws.map(([w]) => w)).toEqual([1600, 1280, 1024, 819]);
    expect(fake.closed).toHaveBeenCalledOnce();
  });

  it('tries a small image that is only too heavy once, with no smaller steps', async () => {
    const fake = fakeRaster(() => 900 * KB);
    await shrinkImage(big(), { width: 600, height: 400 }, policy, fake.open);
    expect(fake.draws).toEqual([[600, 400]]);
  });

  it('reports unsupported when the encoder returns nothing', async () => {
    const fake = fakeRaster(() => null);
    expect(await shrinkImage(big(), { width: 3000, height: 2000 }, policy, fake.open)).toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(fake.closed).toHaveBeenCalledOnce();
  });

  it('reports unsupported when the browser answers with a PNG instead of a WebP', async () => {
    const fake = fakeRaster(() => webp(50 * KB, 'image/png'));
    const result = await shrinkImage(big(), { width: 3000, height: 2000 }, policy, fake.open);
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports unsupported when what comes back is not really a WebP file', async () => {
    const fake = fakeRaster(() => new Blob([new Uint8Array(50 * KB)], { type: 'image/webp' }));
    const result = await shrinkImage(big(), { width: 3000, height: 2000 }, policy, fake.open);
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports unsupported when the file cannot be opened on a canvas', async () => {
    const result = await shrinkImage(
      big(),
      { width: 3000, height: 2000 },
      policy,
      async () => null,
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('shrunkName', () => {
  it('replaces the last extension and keeps dots in the name', () => {
    expect(shrunkName('shot.png')).toBe('shot-gurukul.webp');
    expect(shrunkName('a.b.JPEG')).toBe('a.b-gurukul.webp');
    expect(shrunkName('noext')).toBe('noext-gurukul.webp');
    expect(shrunkName('.png')).toBe('.png-gurukul.webp');
  });
});

describe('isShrinkable', () => {
  const head = (bytes: number[]) => new Uint8Array([...bytes, ...new Array(16).fill(0)]);
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = (over: object) =>
    checkUpload(policy, {
      name: 'a.png',
      size: 40 * KB,
      type: 'image/png',
      head: head(PNG),
      width: 1200,
      height: 800,
      ...over,
    });

  it('is true when only the size, the pixels or both are wrong', () => {
    expect(isShrinkable(png({ size: 2000 * KB }))).toBe(true);
    expect(isShrinkable(png({ width: 3000, height: 2000 }))).toBe(true);
    expect(isShrinkable(png({ size: 2000 * KB, width: 3000, height: 2000 }))).toBe(true);
  });

  it('is false for a fine image, a wrong type, a wrong signature or a PDF', () => {
    expect(isShrinkable(png({}))).toBe(false);
    expect(isShrinkable(png({ name: 'a.gif', type: 'image/gif', size: 2000 * KB }))).toBe(false);
    expect(isShrinkable(png({ type: 'image/jpeg', size: 2000 * KB }))).toBe(false);
    expect(isShrinkable(png({ head: head([1, 2, 3]), size: 2000 * KB }))).toBe(false);
    const pdf = checkUpload(policy, {
      name: 'a.pdf',
      size: 3000 * KB,
      type: 'application/pdf',
      head: head([0x25, 0x50, 0x44, 0x46, 0x2d]),
    });
    expect(isShrinkable(pdf)).toBe(false);
  });
});

describe('browserRaster', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A fake 2D context and bitmap; jsdom has no canvas of its own. */
  function stubCanvas(over: { context?: unknown; toBlob?: (cb: BlobCallback) => void } = {}) {
    const close = vi.fn();
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    const context = 'context' in over ? over.context : { drawImage, clearRect };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3000, height: 2000, close })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as RenderingContext,
    );
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => (over.toBlob ?? ((c) => c(webp(10 * KB))))(cb));
    return { close, drawImage, clearRect, toBlob };
  }

  it('draws the bitmap scaled, exports WebP at the quality and releases the bitmap', async () => {
    const stub = stubCanvas();
    const raster = await browserRaster(big());
    if (!raster) throw new Error('expected a raster');
    raster.draw(1600, 1067);
    expect(stub.clearRect).toHaveBeenCalledWith(0, 0, 1600, 1067);
    expect(stub.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1067);
    const blob = await raster.toWebp(0.8);
    expect(blob?.type).toBe('image/webp');
    expect(stub.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.8);
    raster.close();
    expect(stub.close).toHaveBeenCalledOnce();
  });

  it('passes on a null from an encoder that cannot do WebP', async () => {
    stubCanvas({ toBlob: (cb) => cb(null) });
    const raster = await browserRaster(big());
    expect(await raster?.toWebp(0.8)).toBeNull();
  });

  it('is null without createImageBitmap, without a 2D context, or when decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await browserRaster(big())).toBeNull();
    const stub = stubCanvas({ context: null });
    expect(await browserRaster(big())).toBeNull();
    expect(stub.close).toHaveBeenCalledOnce();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('not an image');
      }),
    );
    expect(await browserRaster(big())).toBeNull();
  });
});
