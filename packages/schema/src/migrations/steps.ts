/** One upgrade step: a stored course at `schemaVersion` N in, the same course reshaped for N + 1 out. */
export type MigrationStep = (course: Record<string, unknown>) => Record<string, unknown>;

/**
 * The registry, keyed by the version a step upgrades from: `MIGRATIONS[1]` takes v1 to v2. Bumping
 * `COURSE_SCHEMA_VERSION` adds the step here, a pure function with its own tests. Today the course
 * is still at v1, so there are none.
 */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {};
