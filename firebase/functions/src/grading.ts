import { ApiException, itemStates, itemsOf, migrateCourse, progressSchema } from '@gurukul/schema';
import type { Course, Pariksha, ParikshaResult, Question } from '@gurukul/schema';
import { log } from './logging/log.js';
import { badField } from './validation.js';

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
  /** Right or wrong per question; the analytics trigger reads it for first-try rates. */
  results: { questionId: string; correct: boolean }[];
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
  if (raw === undefined) throw new ApiException('CRS_2001', [courseId]);
  let course: Course;
  try {
    course = migrateCourse(raw);
  } catch {
    throw new ApiException('CRS_3001', [courseId]);
  }
  // A retired course keeps its progress and certificates but takes no new attempts.
  if (course.status === 'archived') throw new ApiException('CRS_1004', [courseId]);
  if (course.status !== 'published') throw new ApiException('CRS_1001', [courseId]);
  const pariksha = itemsOf(course).find(
    (i): i is Pariksha => i.type === 'pariksha' && i.id === parikshaId,
  );
  if (!pariksha) throw new ApiException('PRK_2001', [parikshaId, courseId]);
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
  if (!key) throw new ApiException('PRK_3001', ['Pariksha', parikshaId]);
  return key;
}

/** The answer key of one question, read from the Pariksha's key. */
function keyOf(key: Record<string, unknown>, questionId: string): string[] {
  const ids = key[questionId];
  if (!isStringArray(ids)) {
    throw new ApiException('PRK_3001', ['question', questionId]);
  }
  return ids;
}

/**
 * `checkAnswer`: right or wrong for ONE question, only when the Pariksha reveals after each answer.
 * Records nothing; the key is read server-side and only echoed back because the author allowed it.
 */
export async function checkAnswer(
  store: GradingStore,
  uid: string,
  data: { courseId?: unknown; parikshaId?: unknown; questionId?: unknown; selected?: unknown },
): Promise<{ correct: boolean; correctOptionIds: string[]; explanation: string }> {
  const { courseId, parikshaId, questionId, selected } = data;
  if (!isNonEmptyString(courseId)) throw badField('courseId', courseId, 'must be a course id');
  if (!isNonEmptyString(parikshaId))
    throw badField('parikshaId', parikshaId, 'must be a Pariksha id');
  if (!isNonEmptyString(questionId))
    throw badField('questionId', questionId, 'must be a question id');
  if (!isStringArray(selected))
    throw badField('selected', selected, 'must be a list of option ids');
  log.debug('Checking an answer', { uid, courseId, parikshaId, questionId });
  const { course, pariksha } = await load(store, courseId, parikshaId);
  if (pariksha.revealAnswers !== 'each') throw new ApiException('PRK_1001', [parikshaId]);
  const question = pariksha.questions.find((q) => q.id === questionId);
  if (!question) throw new ApiException('VAL_1003', ['question', questionId]);
  checkUnlocked(course, await store.getProgress(uid, courseId), parikshaId);
  const correctOptionIds = keyOf(await loadKey(store, courseId, parikshaId), questionId);
  return {
    correct: isCorrect(question.kind, selected, correctOptionIds),
    correctOptionIds,
    explanation: question.explanation,
  };
}

/**
 * Throws `PRK_1003` when the learner's progress still locks this Pariksha, by the same `itemStates`
 * the outline shows. Progress that is missing or unreadable counts as nothing done. Checking outside
 * the grading transaction is safe: completions and passes only ever add, so a lock never returns.
 */
export function checkUnlocked(course: Course, progressRaw: unknown, parikshaId: string): void {
  const parsed = progressSchema.safeParse(progressRaw);
  const state = parsed.success ? parsed.data : { completedItemIds: [], pariksha: {} };
  if (itemStates(course, state)[parikshaId] === 'locked') {
    throw new ApiException('PRK_1003', [parikshaId]);
  }
}

/** The learner's Pariksha result so far; throws when they have not started or are cooling down. */
export function checkCooldown(
  progressRaw: unknown,
  courseId: string,
  parikshaId: string,
  cooldownMinutes: number,
  now: number,
): ParikshaResult | undefined {
  const progress = progressSchema.safeParse(progressRaw);
  if (!progress.success) throw new ApiException('PRK_2002', [courseId]);
  const previous = progress.data.pariksha[parikshaId];
  if (previous) {
    const next = previous.lastAttemptAt.toMillis() + cooldownMinutes * 60_000;
    if (now < next) {
      throw new ApiException('PRK_4001', [new Date(next).toISOString()], { nextAttemptAt: next });
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
  if (!isNonEmptyString(courseId)) throw badField('courseId', courseId, 'must be a course id');
  if (!isNonEmptyString(parikshaId))
    throw badField('parikshaId', parikshaId, 'must be a Pariksha id');
  if (!isStringArray(questionIds)) {
    throw badField('questionIds', questionIds, 'must be a list of question ids');
  }
  if (
    typeof answers !== 'object' ||
    answers === null ||
    Array.isArray(answers) ||
    !Object.values(answers).every(isStringArray)
  ) {
    throw badField('answers', answers, 'must map question ids to lists of option ids');
  }
  const given = answers as Record<string, string[]>;
  log.debug('Grading started', { uid, courseId, parikshaId, questionCount: questionIds.length });
  const { course, pariksha } = await load(store, courseId, parikshaId);

  const shown = Math.min(pariksha.questionsShown, pariksha.questions.length);
  const known = new Set(pariksha.questions.map((q) => q.id));
  if (
    new Set(questionIds).size !== questionIds.length ||
    questionIds.length !== shown ||
    !questionIds.every((id) => known.has(id)) ||
    !Object.keys(given).every((id) => questionIds.includes(id))
  ) {
    throw new ApiException('PRK_1002', ['the questions are not this Pariksha’s draw']);
  }

  // Cheap rejection first: a learner cooling down costs one progress read, not the answer key.
  const progress = await store.getProgress(uid, courseId);
  checkCooldown(progress, courseId, parikshaId, pariksha.cooldownMinutes, now);
  checkUnlocked(course, progress, parikshaId);

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
      results: graded.map((g) => ({ questionId: g.question.id, correct: g.correct })),
      courseVersion: course.version,
    },
    (raw) =>
      nextResult(
        checkCooldown(raw, courseId, parikshaId, pariksha.cooldownMinutes, now),
        score,
        passed,
      ),
  );

  log.info('Attempt graded', { uid, attemptId, courseId, parikshaId, passed, correctCount, total });
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
