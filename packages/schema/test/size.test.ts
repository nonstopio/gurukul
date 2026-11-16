import { describe, expect, it } from 'vitest';
import { COURSE_BYTES_LIMIT, COURSE_BYTES_WARN, courseBytes } from '../src';

describe('courseBytes', () => {
  it('is the UTF-8 length of the course and its answer keys as JSON', () => {
    expect(courseBytes({ t: 'ab' }, {})).toBe('{"course":{"t":"ab"},"answers":{}}'.length);
    // Two bytes for é, three for ग: what Firestore stores, not the character count.
    expect(courseBytes({ t: 'é' }, {}) - courseBytes({ t: 'e' }, {})).toBe(1);
    expect(courseBytes({ t: 'ग' }, {}) - courseBytes({ t: 'g' }, {})).toBe(2);
  });

  it('counts the answer keys too', () => {
    expect(courseBytes({}, { pk: { q1: ['a'] } })).toBeGreaterThan(courseBytes({}, {}));
  });

  it('warns before the limit, and the limit leaves room under 1 MiB', () => {
    expect(COURSE_BYTES_WARN).toBeLessThan(COURSE_BYTES_LIMIT);
    expect(COURSE_BYTES_LIMIT).toBeLessThan(1_048_576 - 100_000);
  });
});
