import { vi } from 'vitest';
import type { AttemptResult, ParikshaService } from '../src/pariksha/service';

export const attemptResult = (over: Partial<AttemptResult> = {}): AttemptResult => ({
  attemptId: 'att1',
  score: 1,
  correctCount: 1,
  total: 1,
  passed: true,
  best: 1,
  results: [{ questionId: 'k1', correct: true, correctOptionIds: ['a'], explanation: 'Because' }],
  nextAttemptAt: null,
  ...over,
});

export function fakePariksha(over: Partial<ParikshaService> = {}): ParikshaService {
  return {
    checkAnswer: vi
      .fn()
      .mockResolvedValue({ correct: true, correctOptionIds: ['a'], explanation: 'Because' }),
    gradeAttempt: vi.fn().mockResolvedValue(attemptResult()),
    ...over,
  };
}
