import { log } from '../log';
import { isDraft } from './model';
import type { QuizDraft } from './model';

/**
 * A Quiz in progress lives in this browser's localStorage, one key per learner and Quiz,
 * so a reload or a closed tab carries on where it stopped. Storage can be full or switched off
 * (private windows); then the Quiz still works, it just starts over after a reload.
 */
export function draftKey(uid: string, courseId: string, quizId: string): string {
  return `gurukul:quiz:${uid}:${courseId}:${quizId}`;
}

export function readDraft(key: string): QuizDraft | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return isDraft(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: QuizDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    log.warn('Saving Quiz answers failed', { reason: e instanceof Error ? e.name : 'unknown' });
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do: a draft that cannot be removed is discarded as stale on the next visit.
  }
}
