import { log } from '../log';
import type { Working } from './types';

/**
 * A draft that could not be saved, kept in this browser so a dropped connection or a closed tab
 * does not lose an Acharya's edits. One key per person and course; `rev` is the draft revision the
 * edits were made on, so a backup is only offered back while the stored draft is still that one.
 * Storage can be full or switched off (private windows); then there is simply no backup.
 */
export interface DraftBackup {
  rev: number;
  savedAt: number;
  work: Working;
}

export const backupKey = (uid: string, courseId: string): string =>
  `gurukul:studio-backup:${uid}:${courseId}`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isBackup(v: unknown): v is DraftBackup {
  return (
    isRecord(v) &&
    typeof v.rev === 'number' &&
    typeof v.savedAt === 'number' &&
    isRecord(v.work) &&
    isRecord(v.work.course) &&
    isRecord(v.work.answers)
  );
}

export function readBackup(key: string): DraftBackup | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return isBackup(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeBackup(key: string, backup: DraftBackup): void {
  try {
    localStorage.setItem(key, JSON.stringify(backup));
  } catch (e) {
    log.warn('Keeping an unsaved draft locally failed', {
      reason: e instanceof Error ? e.name : 'unknown',
    });
  }
}

export function clearBackup(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // A backup that cannot be removed is dropped as stale the next time the draft loads.
  }
}
