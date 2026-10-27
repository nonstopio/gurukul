import { describe, expect, it } from 'vitest';
import { newId } from '../src/studio/ids';

describe('newId', () => {
  it('prefixes 8 hex characters, and differs between calls', () => {
    expect(newId('lesson')).toMatch(/^lesson-[0-9a-f]{8}$/);
    expect(newId('x')).not.toBe(newId('x'));
  });
  it('is deterministic for a given random source', () => {
    expect(newId('b', () => 0)).toBe('b-00000000');
    expect(newId('b', () => 0.999)).toBe('b-ffffffff');
  });
});
