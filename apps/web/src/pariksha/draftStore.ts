import { log } from '../log';
import { isDraft } from './model';
import type { ParikshaDraft } from './model';

/**
 * A Pariksha in progress lives in this browser's localStorage, one key per learner and Pariksha,
 * so a reload or a closed tab carries on where it stopped. Storage can be full or switched off
 * (private windows); then the Pariksha still works, it just starts over after a reload.
 */
export function draftKey(uid: string, courseId: string, parikshaId: string): string {
  return `gurukul:pariksha:${uid}:${courseId}:${parikshaId}`;
}

export function readDraft(key: string): ParikshaDraft | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return isDraft(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: ParikshaDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    log.warn('Saving Pariksha answers failed', { reason: e instanceof Error ? e.name : 'unknown' });
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do: a draft that cannot be removed is discarded as stale on the next visit.
  }
}
