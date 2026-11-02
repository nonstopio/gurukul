import { itemsOf } from '@gurukul/schema';
import type { Course, ImageUpload } from '@gurukul/schema';

/** An image this course already hosts: what the Image block's "Choose from this course's media" offers. */
export interface CourseImage {
  url: string;
  upload: ImageUpload;
  width?: number | undefined;
  height?: number | undefined;
}

/**
 * Every uploaded image in a course's draft, one per file (`upload.path`), in the order the lessons
 * show them. Only files under this course's own media folder are offered: another course's file is
 * reused by copying its address in Link mode, never from here.
 */
export function uploadedImages(course: Course, courseId: string): CourseImage[] {
  const prefix = `courses/${courseId}/media/`;
  const found = new Map<string, CourseImage>();
  for (const item of itemsOf(course)) {
    if (item.type !== 'lesson') continue;
    for (const block of item.blocks) {
      if (block.type !== 'image' || !block.upload || !block.url) continue;
      const { path } = block.upload;
      if (!path.startsWith(prefix) || found.has(path)) continue;
      found.set(path, {
        url: block.url,
        upload: block.upload,
        width: block.width,
        height: block.height,
      });
    }
  }
  return [...found.values()];
}
