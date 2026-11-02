import { describe, expect, it } from 'vitest';
import { apply, mask, mutants } from './storage/mutants';

describe('the storage rules mutant generator', () => {
  const rules = `
    function f() {
      let limit = a == 1 ? b : c; // x && y
      return a && (b || c('p||q'))
        || d;
    }
    match /x { allow read: if f(); allow update: if false; }
  `;

  it('finds every operand of && and ||, inside parentheses, and the test of a ternary', () => {
    const found = mutants(rules).map((m) => `${m.text} -> ${m.replacement}`);
    expect(found).toEqual([
      'a == 1 -> true',
      'a == 1 -> false',
      'a -> true',
      'a -> false',
      'b -> true',
      'b -> false',
      "c('p||q') -> true",
      "c('p||q') -> false",
      'd -> true',
      'd -> false',
      'f() -> true',
      'f() -> false',
      'false -> true',
    ]);
  });

  it('says where a condition is and rewrites only it', () => {
    const m = mutants(rules).find((x) => x.text === 'd' && x.replacement === 'false');
    if (!m) throw new Error('no mutant for d');
    expect(m.line).toBe(5);
    expect(apply(rules, m)).toBe(rules.replace('|| d', '|| false'));
  });

  it('keeps the offsets of the text it masks', () => {
    const src = "a // c\n'x||y'";
    expect(mask(src)).toBe("a     \n'xxxx'");
  });

  it('marks only the mutants that provably change nothing', () => {
    const real = mutants('function s() { return request.auth != null && resource == null; }');
    expect(real.map((m) => [m.text, m.replacement, Boolean(m.equivalent)])).toEqual([
      ['request.auth != null', 'true', true],
      ['request.auth != null', 'false', false],
      ['resource == null', 'true', true],
      ['resource == null', 'false', false],
    ]);
  });
});
