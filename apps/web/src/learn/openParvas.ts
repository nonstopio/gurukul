import { log } from '../log';

/**
 * Which parvas a learner opened on a course overview lives in this browser's localStorage, one key
 * per learner and course. Storage can be full or switched off; then the overview still works, it
 * just opens the current parva again after a reload.
 */
export function openParvasKey(uid: string, courseId: string): string {
  return `gurukul:parvas:${uid}:${courseId}`;
}

export function readOpenParvas(key: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'boolean'));
  } catch {
    return {};
  }
}

export function writeOpenParvas(key: string, open: Record<string, boolean>): void {
  try {
    localStorage.setItem(key, JSON.stringify(open));
  } catch (e) {
    log.warn('Saving open parvas failed', { reason: e instanceof Error ? e.name : 'unknown' });
  }
}
