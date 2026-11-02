import {
  DEFAULT_ORG_CONFIG,
  PUBLIC_ACCESS,
  accessOf,
  courseSchema,
  type Course,
  type TimestampLike,
} from '@gurukul/schema';

/** What the seeder needs from Firestore: read, write, or create a document only if it is missing. */
export interface SeedDb {
  /** The document's data, or `undefined` when there is none. */
  get(path: string): Promise<unknown>;
  set(path: string, data: unknown): Promise<void>;
  /** Writes `data` unless a document is already at `path`; true when it wrote. */
  createIfMissing(path: string, data: unknown): Promise<boolean>;
}

/** `{ [quizId]: { [questionId]: optionIds } }`, the shape of `courses/{id}/private/answers`. */
export type AnswerKeys = Record<string, Record<string, string[]>>;

export interface SeedInput {
  course: Course;
  answers: AnswerKeys;
  now: TimestampLike;
}

export interface SeedResult {
  coursePath: string;
  answersPath: string;
  draftPath: string;
  /** The live version written: the course's own on a first seed, one past the live one after. */
  version: number;
  /**
   * `created` when there was none; `updated` when the seed wrote the last one and nobody has edited
   * it since; `kept` when an Educator has edited it, so their work is not thrown away.
   */
  draft: 'created' | 'updated' | 'kept';
}

/** The fields of an existing live course that a re-seed must not overwrite. */
interface LiveFields {
  version?: number;
  status?: Course['status'];
  educatorIds?: string[];
  educatorNames?: Record<string, string>;
}

const ONE_CORRECT_OPTION = new Set(['single', 'trueFalse', 'codeOutput']);

/** Every way the answer key fails to match the course's Quizzes, as readable sentences. */
export function answerKeyProblems(course: Course, answers: AnswerKeys): string[] {
  const problems: string[] = [];
  const quizzes = course.chapters.flatMap((chapter) =>
    chapter.items.flatMap((item) => (item.type === 'quiz' ? [item] : [])),
  );

  for (const quizId of Object.keys(answers)) {
    if (!quizzes.some((p) => p.id === quizId)) {
      problems.push(`answer key names unknown quiz "${quizId}"`);
    }
  }
  for (const quiz of quizzes) {
    const keys = answers[quiz.id] ?? {};
    for (const questionId of Object.keys(keys)) {
      if (!quiz.questions.some((q) => q.id === questionId)) {
        problems.push(`answer key names unknown question "${quiz.id}/${questionId}"`);
      }
    }
    for (const question of quiz.questions) {
      const where = `${quiz.id}/${question.id}`;
      const correct = keys[question.id] ?? [];
      if (correct.length === 0) {
        problems.push(`question "${where}" has no answer key`);
        continue;
      }
      for (const optionId of correct) {
        if (!question.options.some((o) => o.id === optionId)) {
          problems.push(`answer key for "${where}" names unknown option "${optionId}"`);
        }
      }
      if (ONE_CORRECT_OPTION.has(question.kind) && correct.length !== 1) {
        problems.push(
          `question "${where}" is ${question.kind} and needs exactly one correct option`,
        );
      }
    }
  }
  return problems;
}

/**
 * Validates the course and its answer key, then publishes it as Studio's `publishCourse` does:
 * `courses/{id}` (no answers in it), `courses/{id}/private/answers` and the snapshot
 * `versions/{n}`. Nothing is written unless both validate.
 *
 * Re-seeding a live course is a new version: it keeps who may open it, its Educators and a retired
 * (archived) status, which an Admin or the role grants set, not the seed. The Studio draft
 * `drafts/current` is created when missing and brought up to date when the seed wrote it and nobody
 * has edited it since; a draft an Educator has edited is kept, since publishing it is their call.
 */
export async function seedCourse(db: SeedDb, input: SeedInput): Promise<SeedResult> {
  const parsed = courseSchema.safeParse({ ...input.course, publishedAt: input.now });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Course is invalid:\n${issues.join('\n')}`);
  }
  const problems = answerKeyProblems(parsed.data, input.answers);
  if (problems.length > 0) throw new Error(`Answer key is invalid:\n${problems.join('\n')}`);

  const coursePath = `courses/${parsed.data.id}`;
  const answersPath = `${coursePath}/private/answers`;
  const draftPath = `${coursePath}/drafts/current`;
  const live = (await db.get(coursePath)) as LiveFields | undefined;
  const course: Course =
    live === undefined
      ? parsed.data
      : {
          ...parsed.data,
          version: (live.version ?? 0) + 1,
          status: live.status === 'archived' ? 'archived' : parsed.data.status,
          educatorIds: live.educatorIds ?? [],
          educatorNames: live.educatorNames ?? {},
        };
  // A first seed is public, as every course starts: the catalogue lists only courses that say who
  // may open them. A re-seed keeps what an Admin chose.
  const published = { ...course, ...(live === undefined ? PUBLIC_ACCESS : accessOf(live)) };
  await db.set(coursePath, published);
  await db.set(answersPath, input.answers);
  await db.set(`${coursePath}/versions/${course.version}`, {
    version: course.version,
    publishedAt: input.now,
    publishedBy: 'seed',
    course: published,
    answers: input.answers,
  });

  const existing = (await db.get(draftPath)) as { rev?: number; updatedBy?: string } | undefined;
  const draft =
    existing === undefined ? 'created' : existing.updatedBy === 'seed' ? 'updated' : 'kept';
  if (draft !== 'kept') {
    await db.set(draftPath, {
      rev: (existing?.rev ?? 0) + 1,
      updatedAt: input.now,
      updatedBy: 'seed',
      course,
      answers: input.answers,
    });
  }
  return { coursePath, answersPath, draftPath, version: course.version, draft };
}

/**
 * Writes the default `config/org` (no teams, reminders off, a fictional signatory) when there is none. Never overwrites:
 * once an Admin has saved teams or switched reminders on, re-seeding keeps their settings.
 */
export async function seedOrgConfig(db: SeedDb): Promise<{ path: string; created: boolean }> {
  const path = 'config/org';
  return { path, created: await db.createIfMissing(path, DEFAULT_ORG_CONFIG) };
}
