import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBackup, readBackup, writeBackup } from '../src/studio/draftBackup';
import { log } from '../src/log';
import { makeCourse } from './fake-data';

vi.mock('../src/log', () => ({ log: { warn: vi.fn() } }));

const backup = { rev: 2, savedAt: 5, work: { course: makeCourse(), answers: {} } };

describe('draft backup storage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips and clears', () => {
    writeBackup('k', backup);
    expect(readBackup('k')).toMatchObject({ rev: 2, savedAt: 5 });
    clearBackup('k');
    expect(readBackup('k')).toBeNull();
  });

  it('ignores junk and unreadable storage', () => {
    localStorage.setItem('k', '{"rev":"x"}');
    expect(readBackup('k')).toBeNull();
    localStorage.setItem('k', '[1]');
    expect(readBackup('k')).toBeNull();
    localStorage.setItem('k', 'not json');
    expect(readBackup('k')).toBeNull();
  });

  it('survives storage that refuses writes and removals', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    writeBackup('k', backup);
    expect(log.warn).toHaveBeenCalledWith('Keeping an unsaved draft locally failed', {
      reason: 'QuotaExceededError',
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw 'odd';
    });
    writeBackup('k', backup);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('off');
    });
    expect(() => clearBackup('k')).not.toThrow();
  });
});
