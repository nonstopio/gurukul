import { z } from 'zod';
import {
  blockSchema,
  COURSE_SCHEMA_VERSION,
  courseSchema,
  lessonSchema,
  quizSchema,
  chapterSchema,
} from '../course';
import type { Course } from '../course';
import { MIGRATIONS } from './steps';
import type { MigrationStep } from './steps';

export { MIGRATIONS } from './steps';
export type { MigrationStep } from './steps';

/** What the player shows in place of a block it cannot read: a newer type, or one that does not fit. */
export interface UnsupportedBlock {
  type: 'unsupported';
  id: string;
}

function versionOf(raw: unknown): number | undefined {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version >= 1
    ? version
    : undefined;
}

/**
 * Runs every step from the stored `schemaVersion` up to `target`. A course already at or past it, or
 * with no usable version, comes back untouched for the caller to judge. Pure: the input is not changed.
 */
export function upgradeCourse(
  raw: unknown,
  steps: Readonly<Record<number, MigrationStep>> = MIGRATIONS,
  target: number = COURSE_SCHEMA_VERSION,
): unknown {
  const from = versionOf(raw);
  if (from === undefined || from >= target) return raw;
  let course = raw as Record<string, unknown>;
  for (let version = from; version < target; version++) {
    const step = steps[version];
    if (step === undefined) throw new Error(`No course migration from schemaVersion ${version}`);
    course = { ...step(course), schemaVersion: version + 1 };
  }
  return course;
}

/**
 * Brings any stored course up to the current shape and validates it, strictly: Functions use it,
 * where a course that does not fit is a bug to surface. The player reads with `readCourse` instead.
 */
export function migrateCourse(raw: unknown): Course {
  const version = versionOf(raw);
  if (version === undefined || version > COURSE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported course schemaVersion: ${String((raw as { schemaVersion?: unknown } | null)?.schemaVersion)}`,
    );
  }
  return courseSchema.parse(upgradeCourse(raw));
}

function unsupportedFrom(block: unknown): UnsupportedBlock {
  const id = (block as { id?: unknown } | null)?.id;
  return { type: 'unsupported', id: typeof id === 'string' && id !== '' ? id : 'unsupported' };
}

/** The course shape with one difference: a block that does not parse becomes an `UnsupportedBlock`. */
const readableBlock = z.union([blockSchema, z.unknown().transform(unsupportedFrom)]);
const readableLesson = lessonSchema.extend({ blocks: z.array(readableBlock).max(60) });
const readableCourse = courseSchema.extend({
  chapters: z
    .array(chapterSchema.extend({ items: z.array(z.union([readableLesson, quizSchema])).max(60) }))
    .max(30),
});

/**
 * The player's read: upgrades an older course, reads a newer one as far as this app understands it,
 * and turns any block it cannot read into an `unsupported` notice. Returns `null` for a course it
 * cannot read at all, so one bad document is skipped instead of breaking the catalogue.
 */
export function readCourse(raw: unknown): Course | null {
  const version = versionOf(raw);
  if (version === undefined) return null;
  const current =
    version > COURSE_SCHEMA_VERSION
      ? { ...(raw as object), schemaVersion: COURSE_SCHEMA_VERSION }
      : upgradeCourse(raw);
  const parsed = readableCourse.safeParse(current);
  // An `UnsupportedBlock` is the one way this differs from `Course`; the player's fallback renders it.
  return parsed.success ? (parsed.data as Course) : null;
}
