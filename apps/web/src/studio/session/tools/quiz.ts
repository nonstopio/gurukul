import { z } from 'zod';
import type { Course, Question, Quiz } from '@gurukul/schema';
import { patch } from '../../patch';
import {
  KIND_LABELS,
  MAX_ANSWERS,
  MIN_ANSWERS,
  addQuestion as addKeyed,
  changeKind,
  moveQuestion as moveKeyed,
  removeQuestion as removeKeyed,
  syncKey,
  updateQuestion as updateKeyed,
  updateQuiz,
} from '../../questionEdit';
import type { Keyed } from '../../questionEdit';
import { idMaker, indexFor, needLesson, needQuiz } from './find';
import { defineTool, done, refuse } from './types';

const id = z.string().min(1).max(80);
const quizId = id.describe('The Quiz’s id, from get_course.');
const questionId = id.describe('The question’s id, from get_item.');
const kind = z
  .enum(['single', 'multiple', 'trueFalse', 'codeOutput'])
  .describe(
    'single: one right answer; multiple: one or more; trueFalse: True or False; codeOutput: what the code prints.',
  );
const correct = z
  .array(
    z
      .int()
      .min(0)
      .max(MAX_ANSWERS - 1),
  )
  .min(1)
  .max(MAX_ANSWERS)
  .describe(
    'Indexes, from 0, of the right answers in options. Exactly one unless kind is multiple.',
  );
const reviewItemId = id.describe('The id of the lesson this question revisits.');
const position = z.int().min(1).describe('1 is first. Left out: at the end.');

export const questionInput = z.strictObject({
  kind,
  prompt: z.string().trim().min(1).max(2_000),
  code: z.string().max(4_000).optional().describe('Code shown with the question.'),
  options: z
    .array(z.string().trim().min(1).max(400))
    .min(MIN_ANSWERS)
    .max(MAX_ANSWERS)
    .optional()
    .describe('The answers, in order. Leave out for trueFalse: it is always True, False.'),
  correct,
  explanation: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .describe('Why the right answer is right, in a sentence or two; shown after answering.'),
  reviewItemId: reviewItemId.optional(),
});
type QuestionInput = z.output<typeof questionInput>;

const TRUE_FALSE = ['True', 'False'];
const KEEP_TRUE_FALSE =
  'A true or false question has the answers True and False; leave options out.';
const SAY_TRUE_OR_FALSE = 'Say which is right: give correct as [0] for True or [1] for False.';

/** The right answers' option ids from indexes, or why they are wrong. */
function keyFrom(
  kindOf: Question['kind'],
  options: Question['options'],
  indexes: readonly number[],
): string[] | string {
  const wrong = indexes.find((i) => i >= options.length);
  if (wrong !== undefined)
    return `correct lists ${wrong}, but there are only ${options.length} answers (counted from 0).`;
  const ids = [...new Set(indexes)].map((i) => (options[i] as Question['options'][number]).id);
  return oneIfSingle(kindOf, ids);
}

function oneIfSingle(kindOf: Question['kind'], key: string[]): string[] | string {
  if (kindOf !== 'multiple' && key.length !== 1)
    return `A "${KIND_LABELS[kindOf]}" question has exactly one right answer. Give correct with one index.`;
  return key;
}

const revisits = (course: Course, lessonId: string | undefined): string | null => {
  if (lessonId === undefined) return null;
  const found = needLesson(course, lessonId);
  return typeof found === 'string' ? `reviewItemId: ${found}` : null;
};

/** A new question with ids made here, and its key, from the model's input; or why not. */
export function buildQuestion(
  input: QuestionInput,
  course: Course,
  makeId: (prefix: string) => string,
): Keyed | string {
  let texts = input.options;
  if (input.kind === 'trueFalse') {
    if (texts && texts.join('\n') !== TRUE_FALSE.join('\n')) return KEEP_TRUE_FALSE;
    texts = TRUE_FALSE;
  }
  if (!texts) return `Give 2 to ${MAX_ANSWERS} options.`;
  const problem = revisits(course, input.reviewItemId);
  if (problem) return problem;
  const options = texts.map((text) => ({ id: makeId('o'), text }));
  const key = keyFrom(input.kind, options, input.correct);
  if (typeof key === 'string') return key;
  const question: Question = {
    id: makeId('q'),
    kind: input.kind,
    prompt: input.prompt,
    ...(input.code && { code: input.code }),
    options,
    explanation: input.explanation,
    ...(input.reviewItemId !== undefined && { reviewItemId: input.reviewItemId }),
  };
  return { question, key: syncKey(input.kind, options, key) };
}

/** Quiz settings the model may set, shared by `add_quiz` and `update_quiz_settings`. */
export const quizSettings = {
  passMarkPercent: z
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe('This Quiz’s pass mark; null uses the course pass mark.'),
  questionsShown: z
    .int()
    .min(1)
    .optional()
    .describe('How many questions a learner gets each attempt, at most the number of questions.'),
  shuffleOptions: z.boolean().optional(),
  cooldownMinutes: z.int().min(0).max(10_080).optional().describe('Wait before another try.'),
  revealAnswers: z
    .enum(['each', 'onPass', 'never'])
    .optional()
    .describe('When learners see the right answers: after each question, once passed, or never.'),
  blocksNext: z.boolean().optional().describe('The next item stays locked until this is passed.'),
};
type Settings = { [K in keyof typeof quizSettings]?: z.output<(typeof quizSettings)[K]> };

/** The settings as a patch of the Quiz: a null pass mark removes it (the course's applies). */
export function settingsPatch(s: Settings): { [K in keyof Quiz]?: Quiz[K] | undefined } {
  const out: Record<string, unknown> = {};
  if (s.passMarkPercent !== undefined)
    out.passMark = s.passMarkPercent === null ? undefined : s.passMarkPercent / 100;
  for (const k of [
    'questionsShown',
    'shuffleOptions',
    'cooldownMinutes',
    'revealAnswers',
    'blocksNext',
  ] as const)
    if (s[k] !== undefined) out[k] = s[k];
  return out as { [K in keyof Quiz]?: Quiz[K] | undefined };
}

const tooManyShown = (shown: number, total: number) =>
  `questionsShown is ${shown}, but the Quiz has ${total} ${total === 1 ? 'question' : 'questions'}. Show at most ${total}.`;

export const updateQuizSettings = defineTool({
  name: 'update_quiz_settings',
  description:
    'Changes a Quiz’s title and settings: pass mark, how many questions are shown, shuffling, wait between tries, when answers are revealed and whether it blocks the next item. Give only what changes.',
  input: z.strictObject({
    quizId,
    title: z.string().trim().min(1).max(160).optional(),
    ...quizSettings,
  }),
  run: (state, { quizId, title, ...settings }) => {
    const found = needQuiz(state.work.course, quizId);
    if (typeof found === 'string') return refuse(found);
    const changes = { ...settingsPatch(settings), ...(title !== undefined && { title }) };
    if (Object.keys(changes).length === 0) return refuse('Give at least one setting to change.');
    const total = found.item.questions.length;
    const shown = settings.questionsShown;
    if (shown !== undefined && shown > total) return refuse(tooManyShown(shown, total));
    const work = updateQuiz(state.work, quizId, (q) => patch(q, changes));
    return done(
      { ...state, work },
      `Updated the Quiz settings: ${Object.keys(changes).join(', ')}.`,
    );
  },
});

export const addQuestion = defineTool({
  name: 'add_question',
  description:
    'Adds a question to a Quiz with its answers, right answers and explanation. Ids are made for you. Only ask about what a lesson already teaches, and name that lesson in reviewItemId.',
  input: z.strictObject({ quizId, question: questionInput, position: position.optional() }),
  run: (state, { quizId, question, position }, ctx) => {
    const found = needQuiz(state.work.course, quizId);
    if (typeof found === 'string') return refuse(found);
    const keyed = buildQuestion(question, state.work.course, idMaker(ctx, state.work));
    if (typeof keyed === 'string') return refuse(keyed);
    const total = found.item.questions.length + 1;
    let work = addKeyed(state.work, quizId, keyed);
    const to = indexFor(position, total);
    work = moveKeyed(work, quizId, total - 1, to);
    return done(
      { ...state, work },
      `Added question ${keyed.question.id} at position ${to + 1} of ${total}.`,
    );
  },
});

const optionEdit = z.strictObject({
  id: id
    .optional()
    .describe('An existing answer’s id, to keep it (reworded or not). Leave out for a new answer.'),
  text: z.string().trim().min(1).max(400),
});

export const updateQuestion = defineTool({
  name: 'update_question',
  description:
    'Changes one question: kind, prompt, code, answers, right answers, explanation or the lesson it revisits. Give only what changes. To reword an answer keep its id, so the Review shows it as reworded rather than replaced. When answers change and correct is left out, the answers already marked right stay marked. Changing kind to trueFalse needs correct: [0] for True or [1] for False.',
  input: z.strictObject({
    quizId,
    questionId,
    kind: kind.optional(),
    prompt: z.string().trim().min(1).max(2_000).optional(),
    code: z.string().max(4_000).optional().describe('An empty string removes the code.'),
    options: z.array(optionEdit).min(MIN_ANSWERS).max(MAX_ANSWERS).optional(),
    correct: correct.optional(),
    explanation: z.string().trim().min(1).max(2_000).optional(),
    reviewItemId: reviewItemId.nullable().optional().describe('null removes the link.'),
  }),
  run: (state, input, ctx) => {
    const { quizId, questionId, ...edit } = input;
    const found = needQuiz(state.work.course, quizId);
    if (typeof found === 'string') return refuse(found);
    const old = found.item.questions.find((q) => q.id === questionId);
    if (!old)
      return refuse(`The Quiz has no question "${questionId}". Call get_item to see the ids.`);
    if (Object.keys(edit).length === 0) return refuse('Give at least one field to change.');
    const kindOf = edit.kind ?? old.kind;
    let current: Keyed = { question: old, key: [] };
    if (edit.kind !== undefined) current = changeKind(current, edit.kind, ctx.random);
    let options = current.question.options;
    if (edit.options) {
      if (kindOf === 'trueFalse') return refuse(KEEP_TRUE_FALSE);
      const ids = edit.options.flatMap((o) => (o.id === undefined ? [] : [o.id]));
      const unknown = ids.find((x) => !old.options.some((o) => o.id === x));
      if (unknown !== undefined)
        return refuse(`The question has no answer "${unknown}"; leave id out for a new answer.`);
      if (new Set(ids).size !== ids.length) return refuse('An answer id is given twice.');
      const makeId = idMaker(ctx, state.work);
      options = edit.options.map((o) => ({ id: o.id ?? makeId('o'), text: o.text }));
    }
    // Turning a question into true or false replaces its answers with True and False, so the old
    // right answer means nothing any more: which one is right must be said, never guessed.
    if (kindOf === 'trueFalse' && old.kind !== 'trueFalse' && !edit.correct)
      return refuse(SAY_TRUE_OR_FALSE);
    let key: string[] | string;
    if (edit.correct) key = keyFrom(kindOf, options, edit.correct);
    else {
      // The stored key, not the one `changeKind` trimmed: a multiple choice question turned into
      // single choice must not silently keep only its first right answer.
      const stored = state.work.answers[quizId]?.[questionId] ?? [];
      const kept = stored.filter((k) => options.some((o) => o.id === k));
      key =
        kept.length === 0
          ? 'None of the answers marked right are left. Give correct as well.'
          : oneIfSingle(kindOf, kept);
    }
    if (typeof key === 'string') return refuse(key);
    const problem = revisits(state.work.course, edit.reviewItemId ?? undefined);
    if (problem) return refuse(problem);
    const question = patch(current.question, {
      options,
      ...(edit.prompt !== undefined && { prompt: edit.prompt }),
      ...(edit.code !== undefined && { code: edit.code === '' ? undefined : edit.code }),
      ...(edit.explanation !== undefined && { explanation: edit.explanation }),
      ...(edit.reviewItemId !== undefined && { reviewItemId: edit.reviewItemId ?? undefined }),
    });
    const settled = key;
    const work = updateKeyed(state.work, quizId, questionId, () => ({ question, key: settled }));
    return done(
      { ...state, work },
      `Updated question ${questionId}: ${Object.keys(edit).join(', ')}.`,
    );
  },
});

export const moveQuestion = defineTool({
  name: 'move_question',
  description: 'Moves a question to another position in its Quiz.',
  input: z.strictObject({ quizId, questionId, position }),
  run: (state, { quizId, questionId, position }) => {
    const found = needQuiz(state.work.course, quizId);
    if (typeof found === 'string') return refuse(found);
    const from = found.item.questions.findIndex((q) => q.id === questionId);
    if (from < 0)
      return refuse(`The Quiz has no question "${questionId}". Call get_item to see the ids.`);
    const to = indexFor(position, found.item.questions.length);
    const work = moveKeyed(state.work, quizId, from, to);
    return done({ ...state, work }, `Moved question ${questionId} to position ${to + 1}.`);
  },
});

export const removeQuestion = defineTool({
  name: 'remove_question',
  description: 'Removes a question and its right answers from a Quiz.',
  input: z.strictObject({ quizId, questionId }),
  run: (state, { quizId, questionId }) => {
    const found = needQuiz(state.work.course, quizId);
    if (typeof found === 'string') return refuse(found);
    if (!found.item.questions.some((q) => q.id === questionId))
      return refuse(`The Quiz has no question "${questionId}". Call get_item to see the ids.`);
    if (found.item.questions.length === 1)
      return refuse('A Quiz needs at least one question. To drop the whole Quiz, use remove_item.');
    const work = removeKeyed(state.work, quizId, questionId);
    return done({ ...state, work }, `Removed question ${questionId}.`);
  },
});

export const QUIZ_TOOLS = [
  updateQuizSettings,
  addQuestion,
  updateQuestion,
  moveQuestion,
  removeQuestion,
];
