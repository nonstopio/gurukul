import type { Functions } from 'firebase/functions';
import { ApiClientError, callApi } from '../api';

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
  quizId: string;
  questionId: string;
  selected: string[];
}

export interface GradeAttemptRequest {
  courseId: string;
  quizId: string;
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
 * receives verdicts. A port, so screens are tested with a fake and `firebaseQuizService` is real.
 */
export interface QuizService {
  checkAnswer(request: CheckAnswerRequest): Promise<CheckAnswerResult>;
  gradeAttempt(request: GradeAttemptRequest): Promise<AttemptResult>;
}

export function firebaseQuizService(functions: Functions): QuizService {
  return {
    checkAnswer: (request) =>
      callApi<CheckAnswerRequest, CheckAnswerResult>(functions, 'checkAnswer', request),
    async gradeAttempt(request) {
      try {
        return await callApi<GradeAttemptRequest, AttemptResult>(
          functions,
          'gradeAttempt',
          request,
        );
      } catch (e) {
        if (e instanceof ApiClientError && e.code === 'PRK_4001') {
          const at = e.details.nextAttemptAt;
          throw new CooldownError(typeof at === 'number' ? at : null);
        }
        throw e;
      }
    },
  };
}
