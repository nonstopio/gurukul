import type { UploadCheck, UploadPolicy, UploadProblem } from '@gurukul/schema';
import { inspectImage } from './inspect';

/** WebP qualities tried in order; the first result inside the byte limit wins. */
export const SHRINK_QUALITIES = [0.85, 0.8, 0.7, 0.6] as const;
/** Each step down in long edge once even the lowest quality is over the limit. */
const EDGE_STEP = 0.8;

/** The decoded image drawn on a canvas, ready to export. */
export interface Raster {
  /** Draws the whole image scaled to this size, replacing what was drawn before. */
  draw: (width: number, height: number) => void;
  /** The canvas as WebP, or null when the browser cannot encode WebP. */
  toWebp: (quality: number) => Promise<Blob | null>;
  close: () => void;
}

/** Opens a picked file as a `Raster`, or null when the browser cannot decode or draw it. */
export type OpenRaster = (file: Blob) => Promise<Raster | null>;

/**
 * The browser's own canvas. A canvas starts transparent and is never filled, so a PNG's
 * transparency survives (WebP has an alpha channel). Re-encoding drops every metadata block: the
 * location and camera details in a photo do not reach the new file.
 */
export const browserRaster: OpenRaster = async (file) => {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return null;
    }
    context.imageSmoothingQuality = 'high';
    return {
      draw: (width, height) => {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
      },
      toWebp: (quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality)),
      close: () => bitmap.close(),
    };
  } catch {
    return null;
  }
};

/** Why a file could not be shrunk: the browser cannot do it, or the picture will not go small enough. */
export type ShrinkFailure = 'unsupported' | 'too-big';

export type ShrinkResult =
  | {
      ok: true;
      file: File;
      width: number;
      height: number;
      /** The new file through `checkUpload` once more; its warnings reach the Educator. */
      check: UploadCheck;
    }
  | { ok: false; reason: ShrinkFailure };

/** True when the only things wrong are size and pixels of a real image: a re-encode can fix those. */
export function isShrinkable(check: UploadCheck) {
  return (
    check.kind === 'image' &&
    check.problems.length > 0 &&
    check.problems.every((p: UploadProblem) => p.code === 'size' || p.code === 'pixels')
  );
}

/** `holiday.photo.png` becomes `holiday.photo-gurukul.webp`. */
export function shrunkName(name: string) {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}-gurukul.webp`;
}

/** Long edges to try: the recommended one (never an upscale), then smaller steps down to a floor. */
function edgesToTry(longEdge: number, policy: UploadPolicy) {
  const start = Math.min(longEdge, policy.image.recommendedLongEdge);
  const floor = Math.min(start, policy.image.warnBelowWidth);
  const edges = [start];
  for (
    let next = Math.round(start * EDGE_STEP);
    next >= floor;
    next = Math.round(next * EDGE_STEP)
  ) {
    edges.push(next);
  }
  return edges;
}

/**
 * Re-encodes a too-big image as WebP in the browser: long edge at most the policy's recommended
 * size, the best quality that fits the live byte limit, smaller sizes only when it must. Nothing is
 * uploaded. `open` is injectable so tests need no real canvas.
 */
export async function shrinkImage(
  file: File,
  size: { width: number; height: number },
  policy: UploadPolicy,
  open: OpenRaster = browserRaster,
): Promise<ShrinkResult> {
  const raster = await open(file);
  if (!raster) return { ok: false, reason: 'unsupported' };
  try {
    const longEdge = Math.max(size.width, size.height);
    for (const edge of edgesToTry(longEdge, policy)) {
      const scale = Math.min(1, edge / longEdge);
      const width = Math.max(1, Math.round(size.width * scale));
      const height = Math.max(1, Math.round(size.height * scale));
      raster.draw(width, height);
      for (const quality of SHRINK_QUALITIES) {
        const blob = await raster.toWebp(quality);
        // A browser that cannot encode WebP hands back a PNG or nothing; neither is a shrink.
        if (!blob || blob.type !== 'image/webp') return { ok: false, reason: 'unsupported' };
        if (blob.size <= policy.image.maxBytes) {
          const shrunk = new File([blob], shrunkName(file.name), { type: 'image/webp' });
          const { check } = await inspectImage(shrunk, policy, async () => ({ width, height }));
          // The new file must pass the same check as any other, or it is not offered.
          return check.ok
            ? { ok: true, file: shrunk, width, height, check }
            : { ok: false, reason: 'unsupported' };
        }
      }
    }
    return { ok: false, reason: 'too-big' };
  } finally {
    raster.close();
  }
}
