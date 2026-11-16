/**
 * Firestore stores at most 1 MiB (1,048,576 bytes) in one document. The largest copy of a course is
 * the draft (`drafts/current`) and the `versions/{n}` snapshot: both hold the course object and its
 * answer keys. Saves and publishes stop at `COURSE_BYTES_LIMIT`, which leaves about 145 KB for what
 * the estimate does not count (Firestore's per-field overhead, the version's own fields, the
 * access lists beside the live course).
 */
export const COURSE_BYTES_LIMIT = 900_000;

/** Studio warns from here on, while there is still room to move content out. */
export const COURSE_BYTES_WARN = 700_000;

const encoder = new TextEncoder();

/**
 * Approximate stored size of a course with its answer keys: the UTF-8 length of their JSON. The same
 * function runs in Studio (autosave and the warning) and in `publishCourse`, so they agree.
 */
export function courseBytes(course: unknown, answers: unknown): number {
  return encoder.encode(JSON.stringify({ course, answers })).length;
}
