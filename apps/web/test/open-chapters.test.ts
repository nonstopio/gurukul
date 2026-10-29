import { afterEach, describe, expect, it, vi } from 'vitest';
import { openChaptersKey, readOpenChapters, writeOpenChapters } from '../src/learn/openChapters';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('open chapters store', () => {
  const key = openChaptersKey('u1', 'git');

  it('round-trips and keeps only booleans', () => {
    writeOpenChapters(key, { p1: true, p2: false });
    expect(readOpenChapters(key)).toEqual({ p1: true, p2: false });
    localStorage.setItem(key, JSON.stringify({ p1: true, p2: 'x' }));
    expect(readOpenChapters(key)).toEqual({ p1: true });
  });

  it('reads nothing from a missing, malformed or non-object value', () => {
    expect(readOpenChapters(key)).toEqual({});
    localStorage.setItem(key, '{nope');
    expect(readOpenChapters(key)).toEqual({});
    localStorage.setItem(key, '[1]');
    expect(readOpenChapters(key)).toEqual({});
    localStorage.setItem(key, '3');
    expect(readOpenChapters(key)).toEqual({});
  });

  it('survives storage that refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => writeOpenChapters(key, { p1: true })).not.toThrow();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw 'odd';
    });
    expect(() => writeOpenChapters(key, { p1: true })).not.toThrow();
  });
});
