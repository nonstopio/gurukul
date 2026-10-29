/** One upgrade step: a stored course at `schemaVersion` N in, the same course reshaped for N + 1 out. */
export type MigrationStep = (course: Record<string, unknown>) => Record<string, unknown>;

/**
 * The registry, keyed by the version a step upgrades from: `MIGRATIONS[1]` takes v1 to v2. Bumping
 * `COURSE_SCHEMA_VERSION` adds the step here, a pure function with its own tests.
 */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {
  // v2 adds `acharyaNames`. A role grant may already have written names onto a v1 live document
  // before its next publish, so names that are there are kept.
  1: (course) => ({ acharyaNames: {}, ...course }),
  // v3 adds the optional `correct` index to `check` blocks. Nothing can tell which option an older
  // check meant, so the course is unchanged: those checks keep revealing only the explanation until
  // an Acharya marks the answer, which publishing then requires.
  2: (course) => course,
};
