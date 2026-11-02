import { checkUpload } from '@gurukul/schema';
import type { UploadCandidate, UploadCheck, UploadPolicy } from '@gurukul/schema';

/** The pixel size of an image file, or null when the browser cannot decode it. */
export type DecodeImage = (file: Blob) => Promise<{ width: number; height: number } | null>;

/** How many bytes `checkUpload` needs to tell what a file really is. */
const HEAD_BYTES = 16;

/** The size decoded through an `<img>`, for a browser without `createImageBitmap`. */
function decodeWithImage(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (size: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done(null);
    img.src = url;
  });
}

/**
 * The browser's own decoder: `createImageBitmap` where it exists, an `<img>` otherwise. A file the
 * browser cannot decode (a renamed text file, a damaged image) gives null, never an error.
 */
export const browserDecode: DecodeImage = async (file) => {
  try {
    if (typeof createImageBitmap !== 'function') return await decodeWithImage(file);
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
};

/** What was learned about a picked image before anything uploads. */
export interface Inspection {
  candidate: UploadCandidate;
  check: UploadCheck;
}

/**
 * Checks a picked file against the live policy in the browser: its first 16 bytes (what it really
 * is), its size and its decoded pixels. Nothing is uploaded or kept; a refused file costs nothing.
 * `decode` is injectable so tests need no real image.
 */
export async function inspectImage(
  file: File,
  policy: UploadPolicy,
  decode: DecodeImage = browserDecode,
): Promise<Inspection> {
  const [head, size] = await Promise.all([file.slice(0, HEAD_BYTES).arrayBuffer(), decode(file)]);
  const candidate: UploadCandidate = {
    name: file.name,
    size: file.size,
    type: file.type,
    head: new Uint8Array(head),
    ...(size ?? {}),
  };
  return { candidate, check: checkUpload(policy, candidate) };
}
