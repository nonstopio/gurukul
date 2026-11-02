import { blurHashAverageColor, decodeBlurHash, isValidBlurHash } from '@gurukul/schema';
import type { CSSProperties } from 'react';

/** The decoded picture is this many pixels square; the browser scales it up and it stays soft. */
const SIZE = 32;

/** The hash as a small PNG address, or null where the browser has no canvas to draw it on. */
function blurHashDataUrl(hash: string): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const image = context.createImageData(SIZE, SIZE);
    image.data.set(decodeBlurHash(hash, SIZE, SIZE));
    context.putImageData(image, 0, 0);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

/**
 * The CSS that paints a BlurHash: its decoded 32 x 32 picture stretched over the box, over its
 * average colour (which is all there is where a canvas is missing). Null for a missing or malformed
 * hash: stored data is read, never trusted, so this never throws.
 */
export function blurHashStyle(hash: string | undefined): CSSProperties | null {
  if (!hash || !isValidBlurHash(hash)) return null;
  const url = blurHashDataUrl(hash);
  return {
    backgroundColor: blurHashAverageColor(hash),
    ...(url ? { backgroundImage: `url(${url})`, backgroundSize: '100% 100%' } : {}),
  };
}
