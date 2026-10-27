import { itemsOf, migrateCourse, progressSchema } from '@gurukul/schema';
import type { Course, Pariksha, ParikshaResult, Question } from '@gurukul/schema';

/** A failure the handler turns into a `CallError` with the same code. */
export class GradeError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'not-found' | 'failed-precondition' | 'resource-exhausted',
    message: string,
    readonly details?: { nextAttemptAt: number },
  ) {
    super(message);
  }
}

/** What a learner's best/passed/attempts become after one more attempt. */
export interface ParikshaUpdate {
  best: number;
  passed: boolean;
  attempts: number;
}

/** The attempt document, minus the server timestamp the adapter stamps as `createdAt`. */
export interface AttemptRecord {
  uid: string;
  courseId: string;
  parikshaId: string;
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  answers: Record<string, string[]>;
  questionIds: string[];
  courseVersion: number;
}

/** Where grading reads the course, the private answer key and progress. `stores.ts` adapts Firestore. */
export interface GradingStore {
  /** The course document, or undefined when it does not exist. */
  getCourse(courseId: string): Promise<unknown | undefined>;
  /** `courses/{id}/private/answers`: `{ [parikshaId]: { [questionId]: optionIds } }`. */
  getAnswers(courseId: string): Promise<unknown | undefined>;
  /** `progress/{uid}_{courseId}`, or undefined when the learner has not started. */
  getProgress(uid: string, courseId: string): Promise<unknown | undefined>;
  /**
   * One transaction: `decide` sees the progress document as it is inside the transaction and
   * returns the new Pariksha result (or throws); the adapter then writes the attempt and that
   * result, stamping `lastAttemptAt` and `lastActiveAt`. Returns the new attempt's id and the result it wrote.
   */
  recordAttempt(
    attempt: AttemptRecord,
    decide: (progress: unknown | undefined) => ParikshaUpdate,
  ): Promise<{ attemptId: string; update: ParikshaUpdate }>;
}

export interface AttemptResult {
  attemptId: string;
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  best: number;
  results: {
    questionId: string;
    correct: boolean;
    correctOptionIds?: string[];
    explanation?: string;
  }[];
  nextAttemptAt: number | null;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * Is `selected` the answer key? A single, true/false or code-output question needs exactly the one
 * key id; a multiple-choice one needs the same set. An empty selection is never correct.
 */
export function isCorrect(kind: Question['kind'], selected: string[], key: string[]): boolean {
  if (selected.length === 0) return false;
  if (kind !== 'multiple' && selected.length !== 1) return false;
  const chosen = new Set(selected);
  const wanted = new Set(key);
  return chosen.size === wanted.size && [...chosen].every((id) => wanted.has(id));
}

/** The published course, its Pariksha and that Pariksha's answer key. Rejects unknown ids. */
async function load(
  store: GradingStore,
  courseId: string,
  parikshaId: string,
): Promise<{ course: Course; pariksha: Pariksha }> {
  const raw = await store.getCourse(courseId);
  let course: Course | undefined;
  try {
    course = raw === undefined ? undefined : migrateCourse(raw);
  } catch {
    throw new GradeError('failed-precondition', 'This course cannot be read.');
  }
  if (course?.status !== 'published') throw new GradeError('not-found', 'No such course.');
  const pariksha = itemsOf(course).find(
    (i): i is Pariksha => i.type === 'pariksha' && i.id === parikshaId,
  );
  if (!pariksha) throw new GradeError('invalid-argument', 'No such Pariksha in this course.');
  return { course, pariksha };
}

async function loadKey(
  store: GradingStore,
  courseId: string,
  parikshaId: string,
): Promise<Record<string, unknown>> {
  const all = (await store.getAnswers(courseId)) as
    Record<string, Record<string, unknown> | undefined> | undefined;
  const key = all?.[parikshaId];
  if (!key) throw new GradeError('failed-precondition', 'This Pariksha has no answer key yet.');
  return key;
}

/** The answer key of one question, read from the Pariksha's key. */
function keyOf(key: Record<string, unknown>, questionId: string): string[] {
  const ids = key[questionId];
  if (!isStringArray(ids)) {
    throw new GradeError('failed-precondition', 'This question has no answer key yet.');
  }
  return ids;
}

/**
 * `checkAnswer`: right or wrong for ONE question, only when the Pariksha reveals after each answer.
 * Records nothing; the key is read server-side and only echoed back because the author allowed it.
 */
export async function checkAnswer(
  store: GradingStore,
  data: { courseId?: unknown; parikshaId?: unknown; questionId?: unknown; selected?: unknown },
): Promise<{ correct: boolean; correctOptionIds: string[]; explanation: string }> {
  const { courseId, parikshaId, questionId, selected } = data;
  if (
    !isNonEmptyString(courseId) ||
    !isNonEmptyString(parikshaId) ||
    !isNonEmptyString(questionId) ||
    !isStringArray(selected)
  ) {
    throw new GradeError(
      'invalid-argument',
      'courseId, parikshaId, questionId and selected are required.',
    );
  }
  const { pariksha } = await load(store, courseId, parikshaId);
  if (pariksha.revealAnswers !== 'each') {
    throw new GradeError(
      'failed-precondition',
      'This Pariksha does not reveal answers one by one.',
    );
  }
  const question = pariksha.questions.find((q) => q.id === questionId);
  if (!question) throw new GradeError('invalid-argument', 'No such question in this Pariksha.');
  const correctOptionIds = keyOf(await loadKey(store, courseId, parikshaId), questionId);
  return {
    correct: isCorrect(question.kind, selected, correctOptionIds),
    correctOptionIds,
    explanation: question.explanation,
  };
}

/** The learner's Pariksha result so far; throws when they have not started or are cooling down. */
export function checkCooldown(
  progressRaw: unknown,
  parikshaId: string,
  cooldownMinutes: number,
  now: number,
): ParikshaResult | undefined {
  const progress = progressSchema.safeParse(progressRaw);
  if (!progress.success) {
    throw new GradeError('failed-precondition', 'Start the course before taking a Pariksha.');
  }
  const previous = progress.data.pariksha[parikshaId];
  if (previous) {
    const next = previous.lastAttemptAt.toMillis() + cooldownMinutes * 60_000;
    if (now < next) {
      throw new GradeError(
        'resource-exhausted',
        `Try again after ${new Date(next).toISOString()}.`,
        { nextAttemptAt: next },
      );
    }
  }
  return previous;
}

/** One more attempt on top of the previous result: best never drops, passed never reverts. */
export function nextResult(
  previous: ParikshaResult | undefined,
  score: number,
  passed: boolean,
): ParikshaUpdate {
  return {
    best: Math.max(previous?.best ?? 0, score),
    passed: (previous?.passed ?? false) || passed,
    attempts: (previous?.attempts ?? 0) + 1,
  };
}

/** `gradeAttempt`: validates the submission, scores it against the private key and records it. */
export async function gradeAttempt(
  store: GradingStore,
  uid: string,
  data: { courseId?: unknown; parikshaId?: unknown; questionIds?: unknown; answers?: unknown },
  now: number,
): Promise<AttemptResult> {
  const { courseId, parikshaId, questionIds, answers } = data;
  if (
    !isNonEmptyString(courseId) ||
    !isNonEmptyString(parikshaId) ||
    !isStringArray(questionIds) ||
    typeof answers !== 'object' ||
    answers === null ||
    Array.isArray(answers) ||
    !Object.values(answers).every(isStringArray)
  ) {
    throw new GradeError(
      'invalid-argument',
      'courseId, parikshaId, questionIds and answers are required.',
    );
  }
  const given = answers as Record<string, string[]>;
  const { course, pariksha } = await load(store, courseId, parikshaId);

  const shown = Math.min(pariksha.questionsShown, pariksha.questions.length);
  const known = new Set(pariksha.questions.map((q) => q.id));
  if (
    new Set(questionIds).size !== questionIds.length ||
    questionIds.length !== shown ||
    !questionIds.every((id) => known.has(id)) ||
    !Object.keys(given).every((id) => questionIds.includes(id))
  ) {
    throw new GradeError('invalid-argument', 'The questions submitted are not this Pariksha’s.');
  }

  // Cheap rejection first: a learner cooling down costs one progress read, not the answer key.
  const progress = await store.getProgress(uid, courseId);
  checkCooldown(progress, parikshaId, pariksha.cooldownMinutes, now);

  const key = await loadKey(store, courseId, parikshaId);
  const byId = new Map(pariksha.questions.map((q) => [q.id, q]));
  const graded = questionIds.map((questionId) => {
    const question = byId.get(questionId) as Question;
    const correctOptionIds = keyOf(key, questionId);
    return {
      question,
      correctOptionIds,
      correct: isCorrect(question.kind, given[questionId] ?? [], correctOptionIds),
    };
  });
  const correctCount = graded.filter((g) => g.correct).length;
  const total = graded.length;
  const score = correctCount / total;
  const passed = score >= (pariksha.passMark ?? course.rules.passMark);

  const { attemptId, update } = await store.recordAttempt(
    {
      uid,
      courseId,
      parikshaId,
      score,
      correctCount,
      total,
      passed,
      answers: given,
      questionIds,
      courseVersion: course.version,
    },
    (raw) =>
      nextResult(checkCooldown(raw, parikshaId, pariksha.cooldownMinutes, now), score, passed),
  );

  const reveal =
    pariksha.revealAnswers === 'each' || (pariksha.revealAnswers === 'onPass' && passed);
  return {
    attemptId,
    score,
    correctCount,
    total,
    passed,
    best: update.best,
    results: graded.map((g) => ({
      questionId: g.question.id,
      correct: g.correct,
      ...(reveal
        ? { correctOptionIds: g.correctOptionIds, explanation: g.question.explanation }
        : {}),
    })),
    nextAttemptAt: pariksha.cooldownMinutes > 0 ? now + pariksha.cooldownMinutes * 60_000 : null,
  };
}
