import * as logger from 'firebase-functions/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupPrefix, retentionCutoff, runWeeklyBackup } from '../src/backup.js';

afterEach(() => vi.clearAllMocks());

describe('backupPrefix', () => {
  it('names the folder by the UTC date', () => {
    expect(backupPrefix(new Date('2026-11-01T02:00:00Z'))).toBe('backups/2026-11-01');
    expect(backupPrefix(new Date('2026-11-01T23:59:59-05:00'))).toBe('backups/2026-11-02');
  });
});

describe('retentionCutoff', () => {
  const now = new Date('2026-11-29T02:00:00Z');
  it('is four weeks back by default', () => {
    expect(retentionCutoff(now).toISOString()).toBe('2026-11-01T02:00:00.000Z');
  });
  it('takes another number of weeks', () => {
    expect(retentionCutoff(now, 1).toISOString()).toBe('2026-11-22T02:00:00.000Z');
  });
});

describe('runWeeklyBackup', () => {
  const now = new Date('2026-11-01T02:00:00Z');

  it('exports to the bucket under the dated prefix', async () => {
    const port = { exportTo: vi.fn().mockResolvedValue(undefined) };
    await expect(runWeeklyBackup(port, 'my-bucket', now)).resolves.toBe('exported');
    expect(port.exportTo).toHaveBeenCalledWith('gs://my-bucket/backups/2026-11-01');
  });

  it.each([undefined, ''])('warns and does nothing without a bucket (%j)', async (bucket) => {
    const port = { exportTo: vi.fn() };
    await expect(runWeeklyBackup(port, bucket, now)).resolves.toBe('skipped');
    expect(port.exportTo).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Backup skipped',
      expect.objectContaining({ reason: 'no bucket configured' }),
    );
  });

  it('lets an export failure through for the caller to log', async () => {
    const port = { exportTo: vi.fn().mockRejectedValue(new Error('denied')) };
    await expect(runWeeklyBackup(port, 'b', now)).rejects.toThrow('denied');
  });
});
