import { afterEach, describe, expect, it, vi } from 'vitest';
import { openParvasKey, readOpenParvas, writeOpenParvas } from '../src/learn/openParvas';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('open parvas store', () => {
  const key = openParvasKey('u1', 'git');

  it('round-trips and keeps only booleans', () => {
    writeOpenParvas(key, { p1: true, p2: false });
    expect(readOpenParvas(key)).toEqual({ p1: true, p2: false });
    localStorage.setItem(key, JSON.stringify({ p1: true, p2: 'x' }));
    expect(readOpenParvas(key)).toEqual({ p1: true });
  });

  it('reads nothing from a missing, malformed or non-object value', () => {
    expect(readOpenParvas(key)).toEqual({});
    localStorage.setItem(key, '{nope');
    expect(readOpenParvas(key)).toEqual({});
    localStorage.setItem(key, '[1]');
    expect(readOpenParvas(key)).toEqual({});
    localStorage.setItem(key, '3');
    expect(readOpenParvas(key)).toEqual({});
  });

  it('survives storage that refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => writeOpenParvas(key, { p1: true })).not.toThrow();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw 'odd';
    });
    expect(() => writeOpenParvas(key, { p1: true })).not.toThrow();
  });
});
