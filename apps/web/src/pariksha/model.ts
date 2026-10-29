import { itemsOf } from '@gurukul/schema';
import type { QuizOptionLetter } from '@gurukul/ui';
import type { Course, Item, Pariksha, Question } from '@gurukul/schema';
import type { AttemptRow } from '../data/types';
import type { CheckAnswerResult, QuestionResult } from './service';

/** Fisher–Yates on a copy; `rng` returns [0, 1) so tests can be deterministic. */
export function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The questions a learner sees: a random subset of `questionsShown` from the pool (all of it when
 * the pool is no larger), with options shuffled when the Pariksha asks for it. Never mutates the course.
 */
export function pickQuestions(pariksha: Pariksha, rng: () => number = Math.random): Question[] {
  const picked =
    pariksha.questions.length > pariksha.questionsShown
      ? shuffle(pariksha.questions, rng).slice(0, pariksha.questionsShown)
      : [...pariksha.questions];
  return pariksha.shuffleOptions
    ? picked.map((q) => ({ ...q, options: shuffle(q.options, rng) }))
    : picked;
}

/** A Pariksha in progress, kept in the browser so a reload carries on where it stopped. */
export interface ParikshaDraft {
  /** Epoch ms of the draw. A draft older than the last graded attempt is stale. */
  startedAt: number;
  /** The questions drawn, in order, with their options in the order shown. */
  order: { id: string; optionIds: string[] }[];
  index: number;
  /** Answers given: saved when checked or when the learner moves to another question. */
  answers: Record<string, string[]>;
  /** Verdicts already shown, so a checked question stays locked after a reload. */
  feedback: Record<string, CheckAnswerResult>;
}

/** The draw as ids, for a draft. */
export function drawOrder(questions: readonly Question[]): ParikshaDraft['order'] {
  return questions.map((q) => ({ id: q.id, optionIds: q.options.map((o) => o.id) }));
}

/**
 * The questions of a saved draw, options in their saved order; null when the Pariksha has changed
 * since (a question or option is gone or added), so the learner gets a fresh draw instead.
 */
export function restoreQuestions(
  pariksha: Pariksha,
  order: ParikshaDraft['order'],
): Question[] | null {
  const out: Question[] = [];
  for (const saved of order) {
    const q = pariksha.questions.find((x) => x.id === saved.id);
    if (!q || q.options.length !== saved.optionIds.length) return null;
    const options = saved.optionIds.map((id) => q.options.find((o) => o.id === id));
    if (options.some((o) => !o)) return null;
    out.push({ ...q, options: options as Question['options'] });
  }
  return out.length > 0 ? out : null;
}

const isRecord = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whatever came out of storage has the shape of a draft. */
export function isDraft(value: unknown): value is ParikshaDraft {
  const d = value as Partial<ParikshaDraft> | null;
  return [
    typeof d?.startedAt === 'number',
    typeof d?.index === 'number',
    Array.isArray(d?.order),
    isRecord(d?.answers),
    isRecord(d?.feedback),
  ].every(Boolean);
}

/** The same options picked, in any order. */
export function sameAnswer(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

const LETTERS = 'ABCDEFGH';

/** The badge letter of the option at `index`; a question has at most eight options. */
export function letterOf(index: number): QuizOptionLetter {
  return LETTERS[index] as QuizOptionLetter;
}

/** The letters of the right options as shown: "B", "A and C", "A, B and D". */
export function answerLetters(optionIds: readonly string[], correctIds: readonly string[]): string {
  const letters = optionIds.flatMap((id, i) => (correctIds.includes(id) ? [letterOf(i)] : []));
  return new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(letters);
}

/** Milliseconds until a retake is allowed; 0 when it already is. */
export function cooldownRemaining(
  lastAttemptAt: Date | null,
  cooldownMinutes: number,
  now: Date,
): number {
  if (!lastAttemptAt) return 0;
  return Math.max(0, lastAttemptAt.getTime() + cooldownMinutes * 60_000 - now.getTime());
}

/** "6 minutes", "1 minute", "less than a minute". */
export function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (ms <= 0 || minutes < 1) return 'less than a minute';
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** "9:05", or "1:02:03" from an hour up: a retake countdown that ticks each second. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** What the result page shows of one attempt, whichever way it arrived. */
export interface AttemptReview {
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  questions: Question[];
  answers: Record<string, string[]>;
  results: QuestionResult[];
}

/**
 * A recorded attempt as a review, after a reload or on another device. The questions come from the
 * course (one removed since is left out); explanations show as `gradeAttempt` would reveal them. The
 * right options are never stored in the browser's reach, so this review names only the learner's.
 */
export function reviewOfAttempt(pariksha: Pariksha, attempt: AttemptRow): AttemptReview {
  const reveal =
    pariksha.revealAnswers === 'each' || (pariksha.revealAnswers === 'onPass' && attempt.passed);
  const questions = attempt.questionIds.flatMap(
    (id) => pariksha.questions.find((q) => q.id === id) ?? [],
  );
  return {
    score: attempt.score,
    correctCount: attempt.correctCount,
    total: attempt.total,
    passed: attempt.passed,
    questions,
    answers: attempt.answers,
    results: attempt.results.map((r) => {
      const explanation = questions.find((q) => q.id === r.questionId)?.explanation;
      return reveal && explanation ? { ...r, explanation } : r;
    }),
  };
}

/** The 1-based number of the parva holding `itemId`; 0 when no parva does. */
export function parvaNumber(course: Pick<Course, 'parvas'>, itemId: string): number {
  return course.parvas.findIndex((p) => p.items.some((i) => i.id === itemId)) + 1;
}

/** The item after `itemId` in reading order, if any. */
export function itemAfter(course: Pick<Course, 'parvas'>, itemId: string): Item | undefined {
  const items = itemsOf(course);
  return items[items.findIndex((i) => i.id === itemId) + 1];
}

/** Where to open an item: a lesson in the player, a Pariksha in its own screen. */
export function itemPath(courseId: string, item: Pick<Item, 'id' | 'type'>): string {
  return item.type === 'pariksha'
    ? `/courses/${courseId}/pariksha/${item.id}`
    : `/courses/${courseId}/learn/${item.id}`;
}

/** LinkedIn's "add certification" link with the organisation, credential id and verify URL. */
export function linkedInUrl(c: {
  title: string;
  credentialId: string;
  verifyUrl: string;
  issuedAt: Date;
}): string {
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.title,
    organizationName: 'NonStop io',
    issueYear: String(c.issuedAt.getUTCFullYear()),
    issueMonth: String(c.issuedAt.getUTCMonth() + 1),
    certId: c.credentialId,
    certUrl: c.verifyUrl,
  });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
}

/** "9 November 2026", in UTC so the day never shifts with the viewer's timezone. */
export function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
