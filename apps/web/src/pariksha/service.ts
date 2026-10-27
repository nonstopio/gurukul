import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';

export interface CheckAnswerResult {
  correct: boolean;
  correctOptionIds: string[];
  explanation: string;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  correctOptionIds?: string[];
  explanation?: string;
}

export interface AttemptResult {
  attemptId: string;
  /** 0..1 */
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  best: number;
  results: QuestionResult[];
  /** Epoch ms when a retake opens, or null when there is no cooldown. */
  nextAttemptAt: number | null;
}

export interface CheckAnswerRequest {
  courseId: string;
  parikshaId: string;
  questionId: string;
  selected: string[];
}

export interface GradeAttemptRequest {
  courseId: string;
  parikshaId: string;
  questionIds: string[];
  answers: Record<string, string[]>;
}

/** A retake was asked for too early. */
export class CooldownError extends Error {
  constructor(readonly nextAttemptAt: number | null) {
    super('A retake is not open yet.');
  }
}

/**
 * Grading happens on the server, where the answer key lives; the browser only sends choices and
 * receives verdicts. A port, so screens are tested with a fake and `firebaseParikshaService` is real.
 */
export interface ParikshaService {
  checkAnswer(request: CheckAnswerRequest): Promise<CheckAnswerResult>;
  gradeAttempt(request: GradeAttemptRequest): Promise<AttemptResult>;
}

export function firebaseParikshaService(functions: Functions): ParikshaService {
  const check = httpsCallable<CheckAnswerRequest, CheckAnswerResult>(functions, 'checkAnswer');
  const grade = httpsCallable<GradeAttemptRequest, AttemptResult>(functions, 'gradeAttempt');
  return {
    async checkAnswer(request) {
      return (await check(request)).data;
    },
    async gradeAttempt(request) {
      try {
        return (await grade(request)).data;
      } catch (e) {
        const err = e as { code?: string; details?: { nextAttemptAt?: number } };
        if (err.code === 'functions/resource-exhausted') {
          throw new CooldownError(err.details?.nextAttemptAt ?? null);
        }
        throw e;
      }
    },
  };
}
