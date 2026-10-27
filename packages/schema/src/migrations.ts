import { COURSE_SCHEMA_VERSION, courseSchema } from './course';
import type { Course } from './course';

/**
 * Brings any stored course up to the current shape. Each `vN → vN+1` step is a pure function added
 * here with its tests; today there is only v1, so this validates. Functions migrate on publish;
 * the player migrates on read as a fallback, so an old document never crashes the app.
 */
export function migrateCourse(raw: unknown): Course {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version !== 'number' || version < 1 || version > COURSE_SCHEMA_VERSION) {
    throw new Error(`Unsupported course schemaVersion: ${String(version)}`);
  }
  return courseSchema.parse(raw);
}
