import type { Course, CourseStats, Quiz, Question } from '@gurukul/schema';
import { moveItem } from '@gurukul/ui';
import { newId } from './ids';
import { patch } from './patch';
import type { BankQuestion, Working } from './types';

export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 6;

export type QuestionKind = Question['kind'];
type Option = Question['options'][number];

/** A question with its correct option ids, which the draft keeps apart in `answers`. */
export interface Keyed {
  question: Question;
  key: string[];
}

export const KIND_LABELS: Record<QuestionKind, string> = {
  single: 'Single choice',
  multiple: 'Multiple choice',
  trueFalse: 'True or false',
  codeOutput: 'What does this code print?',
};

export const findQuiz = (course: Course, quizId: string): Quiz | null => {
  for (const chapter of course.chapters) {
    for (const item of chapter.items) if (item.type === 'quiz' && item.id === quizId) return item;
  }
  return null;
};

/**
 * The correct option ids a question may hold: only ids that still exist; exactly one for single
 * choice, true or false and code output; at least one for multiple choice. An empty key falls back
 * to the first option, so there is always an answer marked after an edit.
 */
export function syncKey(kind: QuestionKind, options: Option[], key: readonly string[]): string[] {
  const ids = new Set(options.map((o) => o.id));
  const kept = key.filter((id) => ids.has(id));
  if (kept.length === 0) return options.slice(0, 1).map((o) => o.id);
  return kind === 'multiple' ? kept : kept.slice(0, 1);
}

/** A fresh single-choice question with two answers and the first marked correct. */
export function newQuestion(random: () => number = Math.random): Keyed {
  const options = [
    { id: newId('o', random), text: 'Answer 1' },
    { id: newId('o', random), text: 'Answer 2' },
  ];
  return {
    question: {
      id: newId('q', random),
      kind: 'single',
      prompt: 'New question',
      options,
      explanation: '',
    },
    key: syncKey('single', options, []),
  };
}

/** Switching kind: true or false locks to True and False (keeping their ids when they exist). */
export function changeKind(
  { question, key }: Keyed,
  kind: QuestionKind,
  random: () => number = Math.random,
): Keyed {
  const options: Option[] =
    kind === 'trueFalse'
      ? ['True', 'False'].map((text, i) => ({
          id: question.options[i]?.id ?? newId('o', random),
          text,
        }))
      : question.options;
  return { question: { ...question, kind, options }, key: syncKey(kind, options, key) };
}

/** One more empty answer, up to six; not for true or false. */
export function addAnswer(keyed: Keyed, random: () => number = Math.random): Keyed {
  const { question, key } = keyed;
  if (question.kind === 'trueFalse' || question.options.length >= MAX_ANSWERS) return keyed;
  const option = { id: newId('o', random), text: '' };
  return { question: { ...question, options: [...question.options, option] }, key };
}

/** Without one answer, never below two, not for true or false; the key follows. */
export function removeAnswer(keyed: Keyed, optionId: string): Keyed {
  const { question, key } = keyed;
  if (question.kind === 'trueFalse' || question.options.length <= MIN_ANSWERS) return keyed;
  const options = question.options.filter((o) => o.id !== optionId);
  return { question: { ...question, options }, key: syncKey(question.kind, options, key) };
}

export const setAnswerText = (question: Question, optionId: string, text: string): Question => ({
  ...question,
  options: question.options.map((o) => (o.id === optionId ? { ...o, text } : o)),
});

/**
 * Marks or unmarks one answer. Single choice, true or false and code output hold exactly that
 * answer. Multiple choice toggles it but never ends up with none.
 */
export function toggleCorrect(
  kind: QuestionKind,
  key: readonly string[],
  optionId: string,
): string[] {
  if (kind !== 'multiple') return [optionId];
  if (!key.includes(optionId)) return [...key, optionId];
  return key.length > 1 ? key.filter((id) => id !== optionId) : [...key];
}

/** `tags` from what was typed: comma-separated, lower case, no blanks, no repeats, at most ten. */
export function parseTags(raw: string): string[] {
  const tags = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '');
  return [...new Set(tags)].slice(0, 10);
}

/** What goes into the bank: the question without its course-specific revisit link. */
export function bankEntry(
  { question, key }: Keyed,
  tags: string[],
): Omit<BankQuestion, 'id' | 'createdBy'> {
  return { question: patch(question, { reviewItemId: undefined }), answers: key, tags };
}

/** A bank question as a new one for this Quiz: every id is new, the key follows the new option ids. */
export function importFromBank(bank: BankQuestion, random: () => number = Math.random): Keyed {
  const ids = new Map(bank.question.options.map((o) => [o.id, newId('o', random)]));
  const options = bank.question.options.map((o) => ({ ...o, id: ids.get(o.id) as string }));
  const question = patch(bank.question, {
    id: newId('q', random),
    options,
    reviewItemId: undefined,
  });
  const key = bank.answers.flatMap((id) => ids.get(id) ?? []);
  return { question, key: syncKey(question.kind, options, key) };
}

/** Bank questions whose text or a tag contains `search` (case-insensitive). Blank shows everything. */
export function matchBank(bank: readonly BankQuestion[], search: string): BankQuestion[] {
  const needle = search.trim().toLowerCase();
  return bank.filter(
    (b) =>
      b.question.prompt.toLowerCase().includes(needle) ||
      b.tags.some((t) => t.toLowerCase().includes(needle)),
  );
}

/** Fewer than half got it right first time, from at least three tries. */
export function isLowFirstTry(stats: CourseStats | null, questionId: string): boolean {
  const tries = stats?.questionFirstTry[questionId];
  return !!tries && tries.total >= 3 && tries.correct / tries.total < 0.5;
}

/** Whole-number percentage of learners who got the question right first time, or null with no tries. */
export function firstTryPercent(stats: CourseStats | null, questionId: string): number | null {
  const tries = stats?.questionFirstTry[questionId];
  return tries && tries.total > 0 ? Math.round((tries.correct / tries.total) * 100) : null;
}

/** Pass mark as typed (a percentage); blank means "the course default" and is absent. */
export function parsePassMark(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const percent = Number(raw);
  return Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) / 100 : undefined;
}

export const passMarkText = (passMark: number | undefined): string =>
  passMark === undefined ? '' : String(Math.round(passMark * 100));

/** How many questions to show, as typed: a whole number from 1 up to the number of questions. */
export function parseShown(raw: string, total: number): number {
  const n = Math.round(Number(raw));
  return Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), Math.max(total, 1));
}

export function parseCooldown(raw: string): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10_080) : 0;
}

// ---- Edits on the working copy: the Quiz and its answer keys change together ----

function withQuiz(work: Working, quizId: string, edit: (p: Quiz) => Quiz): Working {
  return {
    ...work,
    course: {
      ...work.course,
      chapters: work.course.chapters.map((chapter) => ({
        ...chapter,
        items: chapter.items.map((i) => (i.type === 'quiz' && i.id === quizId ? edit(i) : i)),
      })),
    },
  };
}

const withKey = (work: Working, quizId: string, questionId: string, key: string[]): Working => ({
  ...work,
  answers: { ...work.answers, [quizId]: { ...work.answers[quizId], [questionId]: key } },
});

export const updateQuiz = withQuiz;

/** Applies `edit` to one question and its key. An unknown question changes nothing. */
export function updateQuestion(
  work: Working,
  quizId: string,
  questionId: string,
  edit: (keyed: Keyed) => Keyed,
): Working {
  const quiz = findQuiz(work.course, quizId);
  const question = quiz?.questions.find((q) => q.id === questionId);
  if (!question) return work;
  const next = edit({ question, key: work.answers[quizId]?.[questionId] ?? [] });
  const edited = withQuiz(work, quizId, (p) => ({
    ...p,
    questions: p.questions.map((q) => (q.id === questionId ? next.question : q)),
  }));
  return withKey(edited, quizId, questionId, next.key);
}

/** Appends a question and records its key. */
export function addQuestion(work: Working, quizId: string, keyed: Keyed): Working {
  const added = withQuiz(work, quizId, (p) => ({
    ...p,
    questions: [...p.questions, keyed.question],
  }));
  return withKey(added, quizId, keyed.question.id, keyed.key);
}

/** Removes a question and its key; "questions shown" never exceeds what is left. */
export function removeQuestion(work: Working, quizId: string, questionId: string): Working {
  const removed = withQuiz(work, quizId, (p) => {
    const questions = p.questions.filter((q) => q.id !== questionId);
    return {
      ...p,
      questions,
      questionsShown: parseShown(String(p.questionsShown), questions.length),
    };
  });
  const keys = Object.fromEntries(
    Object.entries(removed.answers[quizId] ?? {}).filter(([id]) => id !== questionId),
  );
  return { ...removed, answers: { ...removed.answers, [quizId]: keys } };
}

export const moveQuestion = (work: Working, quizId: string, from: number, to: number): Working =>
  withQuiz(work, quizId, (p) => ({ ...p, questions: moveItem(p.questions, from, to) }));
