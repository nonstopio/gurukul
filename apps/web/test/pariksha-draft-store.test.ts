import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, draftKey, readDraft, writeDraft } from '../src/pariksha/draftStore';
import { log } from '../src/log';

const key = draftKey('u1', 'git', 'q1');
const draft = { startedAt: 1, order: [], index: 0, answers: { k1: ['a'] }, feedback: {} };

afterEach(() => vi.restoreAllMocks());

describe('Pariksha draft store', () => {
  it('keys a draft by learner, course and Pariksha', () => {
    expect(key).toBe('gurukul:pariksha:u1:git:q1');
  });

  it('writes, reads and clears a draft', () => {
    expect(readDraft(key)).toBeNull();
    writeDraft(key, draft);
    expect(readDraft(key)).toEqual(draft);
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
  });

  it('ignores anything that is not a draft', () => {
    localStorage.setItem(key, '{not json');
    expect(readDraft(key)).toBeNull();
    localStorage.setItem(key, JSON.stringify({ index: 0 }));
    expect(readDraft(key)).toBeNull();
  });

  it('carries on when storage refuses, and says why a save failed', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    writeDraft(key, draft);
    expect(warn).toHaveBeenCalledWith('Saving Pariksha answers failed', {
      reason: 'QuotaExceededError',
    });
    vi.mocked(Storage.prototype.setItem).mockImplementation(() => {
      throw 'odd';
    });
    writeDraft(key, draft);
    expect(warn).toHaveBeenLastCalledWith('Saving Pariksha answers failed', { reason: 'unknown' });
    expect(() => clearDraft(key)).not.toThrow();
  });
});
