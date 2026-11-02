import { encodeBlurHash } from '@gurukul/schema';
import { log } from '../../log';
import { paintPixels } from './canvas';
import type { Pixels } from './canvas';
import { renderFirstPage } from './pdfPage';

/** The picture a hash is made from is about this many pixels on its long side. */
export const BLUR_EDGE = 32;

/** The picked image as pixels, or null when the browser cannot decode or draw it. */
export type ReadImage = (file: Blob) => Promise<Pixels | null>;
/** Page 1 of the picked PDF as pixels, or null when there is none to draw. */
export type ReadPdf = (file: Blob, longEdge: number) => Promise<Pixels | null>;

/** The browser's own decoder and canvas: the image drawn at about 32 px on its long side. */
export const browserImage: ReadImage = async (file) => {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = BLUR_EDGE / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    return await paintPixels(width, height, (context) => {
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
    });
  } finally {
    bitmap.close();
  }
};

/**
 * A BlurHash of what `read` returns, or undefined when it cannot be made. A placeholder is a
 * nicety, never a gate: any failure (no canvas, a PDF pdf.js cannot open, a browser that refuses
 * `getImageData`) is logged at debug without the file's name and the upload goes on without one.
 */
async function hashOf(kind: 'image' | 'pdf', read: () => Promise<Pixels | null>) {
  try {
    const pixels = await read();
    if (!pixels) {
      log.debug('Blur hash skipped', { kind, reason: 'nothing to draw' });
      return undefined;
    }
    return encodeBlurHash(pixels.data, pixels.width, pixels.height, {
      componentsX: 4,
      componentsY: 3,
    });
  } catch (error) {
    log.debug('Blur hash failed', {
      kind,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return undefined;
  }
}

/** The BlurHash of a picked image that passed its checks (a shrunk file included). */
export const imageBlurHash = (file: Blob, read: ReadImage = browserImage) =>
  hashOf('image', () => read(file));

/**
 * The BlurHash of a picked PDF's first page. pdf.js loads here and only here, so only a PDF that is
 * picked pays for it.
 */
export const pdfBlurHash = (file: Blob, read: ReadPdf = renderFirstPage) =>
  hashOf('pdf', () => read(file, BLUR_EDGE));
