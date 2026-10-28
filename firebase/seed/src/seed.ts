import { DEFAULT_ORG_CONFIG, courseSchema, type Course, type TimestampLike } from '@gurukul/schema';

/** What the seeder needs from Firestore: write a document, or create one only if it is missing. */
export interface SeedDb {
  set(path: string, data: unknown): Promise<void>;
  /** Writes `data` unless a document is already at `path`; true when it wrote. */
  createIfMissing(path: string, data: unknown): Promise<boolean>;
}

/** `{ [parikshaId]: { [questionId]: optionIds } }`, the shape of `courses/{id}/private/answers`. */
export type AnswerKeys = Record<string, Record<string, string[]>>;

export interface SeedInput {
  course: Course;
  answers: AnswerKeys;
  now: TimestampLike;
}

export interface SeedResult {
  coursePath: string;
  answersPath: string;
}

const ONE_CORRECT_OPTION = new Set(['single', 'trueFalse', 'codeOutput']);

/** Every way the answer key fails to match the course's Parikshas, as readable sentences. */
export function answerKeyProblems(course: Course, answers: AnswerKeys): string[] {
  const problems: string[] = [];
  const parikshas = course.parvas.flatMap((parva) =>
    parva.items.flatMap((item) => (item.type === 'pariksha' ? [item] : [])),
  );

  for (const parikshaId of Object.keys(answers)) {
    if (!parikshas.some((p) => p.id === parikshaId)) {
      problems.push(`answer key names unknown pariksha "${parikshaId}"`);
    }
  }
  for (const pariksha of parikshas) {
    const keys = answers[pariksha.id] ?? {};
    for (const questionId of Object.keys(keys)) {
      if (!pariksha.questions.some((q) => q.id === questionId)) {
        problems.push(`answer key names unknown question "${pariksha.id}/${questionId}"`);
      }
    }
    for (const question of pariksha.questions) {
      const where = `${pariksha.id}/${question.id}`;
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
 * Validates the course and its answer key, then writes `courses/{id}` (no answers in it) and
 * `courses/{id}/private/answers`. Nothing is written unless both validate.
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
  await db.set(coursePath, parsed.data);
  await db.set(answersPath, input.answers);
  return { coursePath, answersPath };
}

/**
 * Writes the default `config/org` (no teams, reminders off) when there is none. Never overwrites:
 * once a Kulapati has saved teams or switched reminders on, re-seeding keeps their settings.
 */
export async function seedOrgConfig(db: SeedDb): Promise<{ path: string; created: boolean }> {
  const path = 'config/org';
  return { path, created: await db.createIfMissing(path, DEFAULT_ORG_CONFIG) };
}
