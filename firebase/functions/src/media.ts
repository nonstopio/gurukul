import { courseSchema, upgradeCourse } from '@gurukul/schema';
import type { Block, Course } from '@gurukul/schema';
import { log } from './logging/log.js';

const DAY_MS = 86_400_000;

/** A file is only ever deleted once it is at least this old (by the object's creation time). */
export const MEDIA_MIN_AGE_DAYS = 30;

/**
 * Safeguards: a normal week deletes a handful of files, so a plan far above that means something is
 * wrong (a bug here, a half-written document read as empty, a restore from backup) and the right
 * response is to delete nothing and let a person look. One run never deletes more than
 * `MAX_DELETIONS_PER_RUN` files. One course never loses more than `MAX_DELETED_SHARE` of its files,
 * judged only for a course with at least `MIN_FILES_FOR_SHARE` files, because with two files a
 * single orphan is already half of them and would otherwise block clean-up for ever.
 */
export const MAX_DELETIONS_PER_RUN = 200;
export const MAX_DELETED_SHARE = 0.5;
export const MIN_FILES_FOR_SHARE = 5;

/** One object in a course's media folder. */
export interface MediaFile {
  path: string;
  /** When Storage created the object; `undefined` when unknown, which keeps the file. */
  createdAt: Date | undefined;
}

/** Cloud Storage, as far as the clean-up needs it. */
export interface StoragePort {
  /** Every object under `courses/{courseId}/media/`. */
  listMedia(courseId: string): Promise<MediaFile[]>;
  deleteFile(path: string): Promise<void>;
}

/** Firestore, as far as the clean-up needs it. */
export interface MediaStore {
  /** The ids of the courses that exist (a course document is there). */
  listCourseIds(): Promise<string[]>;
  /**
   * Every stored course object of one course, unparsed: the draft's `course`, the live document and
   * each `versions/{n}` snapshot's `course`. A missing document is simply not in the list.
   */
  readCourseObjects(courseId: string): Promise<unknown[]>;
}

/** What one run did, as counts only. */
export interface MediaCleanupResult {
  /** Files deleted. */
  deleted: number;
  /** Courses whose documents were read and whose files were looked at. */
  courses: number;
  /** Courses left alone: a document did not parse, or a safeguard held. */
  skipped: number;
  /** True when the run-wide safeguard held back every deletion. */
  blocked: boolean;
}

const mediaPrefix = (courseId: string) => `courses/${courseId}/media/`;

/** Every `upload.path` in a block list (only Image and File blocks carry one). */
function uploadPaths(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) =>
    (b.type === 'image' || b.type === 'file') && b.upload ? [b.upload.path] : [],
  );
}

/** Every upload path in a parsed course. Quiz items have no blocks. */
export function referencedPaths(course: Course): string[] {
  return course.chapters.flatMap((chapter) =>
    chapter.items.flatMap((item) => (item.type === 'lesson' ? uploadPaths(item.blocks) : [])),
  );
}

/**
 * The paths every stored copy of a course refers to, or `undefined` when any copy does not parse:
 * then the course's references are not known, so nothing of it may be deleted. Copies are brought
 * up to date first (`upgradeCourse`), the way publish and rollback read them. A copy that cannot be
 * upgraded makes `upgradeCourse` throw, which fails the run before anything is deleted.
 */
export function collectReferences(objects: readonly unknown[]): Set<string> | undefined {
  const paths = new Set<string>();
  for (const raw of objects) {
    const parsed = courseSchema.safeParse(upgradeCourse(raw));
    if (!parsed.success) return undefined;
    for (const p of referencedPaths(parsed.data)) paths.add(p);
  }
  return paths;
}

/**
 * The files that may go: inside the course's media folder, named by no copy of the course, and
 * created at least `MEDIA_MIN_AGE_DAYS` before `now`. A file with no creation time, or one from the
 * future, stays.
 */
export function unusedFiles(
  courseId: string,
  files: readonly MediaFile[],
  referenced: ReadonlySet<string>,
  now: Date,
): string[] {
  const cutoff = now.getTime() - MEDIA_MIN_AGE_DAYS * DAY_MS;
  const prefix = mediaPrefix(courseId);
  return files
    .filter(
      (f) =>
        f.path.startsWith(prefix) &&
        f.path.length > prefix.length &&
        !referenced.has(f.path) &&
        f.createdAt !== undefined &&
        f.createdAt.getTime() <= cutoff,
    )
    .map((f) => f.path);
}

/** True when deleting `count` of a course's `total` files is more than a normal week. */
export function tooManyForCourse(count: number, total: number): boolean {
  return total >= MIN_FILES_FOR_SHARE && count / total > MAX_DELETED_SHARE;
}

/**
 * `weeklyMediaCleanup`: per course whose documents were read, deletes the unreferenced media files
 * older than 30 days. Plans everything first and deletes only afterwards, so the run-wide safeguard
 * can hold the whole run back. Never touches a path outside `courses/{id}/media/` of a course that
 * exists, never a referenced file, never a young one, and never writes a file.
 */
export async function runMediaCleanup(
  deps: { store: MediaStore; storage: StoragePort },
  now: Date,
): Promise<MediaCleanupResult> {
  const { store, storage } = deps;
  const plan: string[] = [];
  let courses = 0;
  let skipped = 0;

  for (const courseId of await store.listCourseIds()) {
    const referenced = collectReferences(await store.readCourseObjects(courseId));
    if (referenced === undefined) {
      skipped += 1;
      log.warn('Media clean-up skipped a course', { courseId, reason: 'course did not parse' });
      continue;
    }
    courses += 1;
    const files = await storage.listMedia(courseId);
    const unused = unusedFiles(courseId, files, referenced, now);
    if (tooManyForCourse(unused.length, files.length)) {
      skipped += 1;
      log.warn('Media clean-up held back a course', {
        courseId,
        reason: 'too many unused files',
        count: unused.length,
        total: files.length,
      });
      continue;
    }
    plan.push(...unused);
  }

  if (plan.length > MAX_DELETIONS_PER_RUN) {
    log.warn('Media clean-up held back the run', {
      reason: 'too many unused files',
      count: plan.length,
      limit: MAX_DELETIONS_PER_RUN,
    });
    return { deleted: 0, courses, skipped, blocked: true };
  }

  for (const path of plan) await storage.deleteFile(path);
  return { deleted: plan.length, courses, skipped, blocked: false };
}
