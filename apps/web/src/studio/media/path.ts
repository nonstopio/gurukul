import type { ImageContentType } from '@gurukul/schema';

/** The file extension each accepted image type is stored under; the Storage rules check it matches. */
const EXTENSIONS: Readonly<Record<ImageContentType, string>> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** A random file id made in the browser: 22 URL-safe characters (128 bits), never derived from the file name. */
export function newMediaId(
  fill: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => void crypto.getRandomValues(bytes),
): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Where an uploaded image lives: `courses/{courseId}/media/{mediaId}.{ext}`. */
export function mediaPath(courseId: string, mediaId: string, type: ImageContentType): string {
  return `courses/${courseId}/media/${mediaId}.${EXTENSIONS[type]}`;
}

/** Served for a year and never changed: the file's name is new every time, so caching it is safe. */
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** What Storage records about an uploaded image. No file name: it can carry personal data. */
export function imageMetadata(request: {
  contentType: ImageContentType;
  uid: string;
  courseId: string;
  width: number;
  height: number;
}) {
  return {
    contentType: request.contentType,
    cacheControl: MEDIA_CACHE_CONTROL,
    customMetadata: {
      uploadedBy: request.uid,
      courseId: request.courseId,
      width: String(request.width),
      height: String(request.height),
    },
  };
}
