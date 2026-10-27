import { log } from './logging/log.js';

const DAY_MS = 86_400_000;

/** The one thing the backup needs from Firestore: start an export under a `gs://` prefix. */
export interface BackupPort {
  exportTo(uriPrefix: string): Promise<void>;
}

/** `backups/YYYY-MM-DD` (UTC): the folder one weekly export goes to inside the bucket. */
export function backupPrefix(now: Date): string {
  return `backups/${now.toISOString().slice(0, 10)}`;
}

/**
 * The moment before which an export is older than the retention window. Retention is a lifecycle
 * rule on the bucket (see `docs/operations.md`), set in the bucket: the function never deletes
 * anything. This helper names the cutoff that rule encodes, so the two stay in step.
 */
export function retentionCutoff(now: Date, weeks = 4): Date {
  return new Date(now.getTime() - weeks * 7 * DAY_MS);
}

/**
 * `weeklyBackup`: starts a Firestore export of the default database to
 * `gs://<bucket>/backups/<date>`. With no bucket configured it warns and does nothing.
 */
export async function runWeeklyBackup(
  port: BackupPort,
  bucket: string | undefined,
  now: Date,
): Promise<'exported' | 'skipped'> {
  if (!bucket) {
    log.warn('Backup skipped', { reason: 'no bucket configured' });
    return 'skipped';
  }
  await port.exportTo(`gs://${bucket}/${backupPrefix(now)}`);
  return 'exported';
}
