// The Storage emulator reports no rules coverage (its rules runtime answers only permit or deny;
// there is no `ruleCoverage` endpoint as in the Firestore emulator), so storage.rules is held to a
// stricter, mutation-based bar instead: every condition in it is forced to the wrong answer and the
// tests must notice. A condition no test depends on survives, and `npm run test:rules` fails.

export interface Mutant {
  /** The condition that is replaced, as written in storage.rules. */
  text: string;
  replacement: 'true' | 'false';
  line: number;
  column: number;
  start: number;
  end: number;
  /** Why no test can tell this mutant apart from the rules, when that is provably so. */
  equivalent?: string;
}

// Mutants that behave exactly like the original rules, so surviving them is correct.
const EQUIVALENT: Record<string, { replacement: 'true' | 'false'; reason: string }> = {
  'request.auth != null': {
    replacement: 'true',
    reason:
      'the next condition reads request.auth.token, which fails for a signed-out request and denies it',
  },
  'resource == null': {
    replacement: 'true',
    reason:
      '`allow create` only ever applies to an object that does not exist yet; an overwrite is an update',
  },
};

/** Comments blanked and string contents replaced, same length, so offsets still line up. */
export function mask(rules: string): string {
  let out = '';
  let i = 0;
  while (i < rules.length) {
    const c = rules[i];
    if (c === '/' && rules[i + 1] === '/') {
      while (i < rules.length && rules[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === "'" || c === '"') {
      out += c;
      i++;
      while (i < rules.length && rules[i] !== c) {
        out += 'x';
        i++;
      }
      out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

type Span = [number, number];

/** The parts of [a, b) separated by `op` outside any brackets. */
function splitTop(masked: string, [a, b]: Span, op: string): Span[] {
  const parts: Span[] = [];
  let depth = 0;
  let from = a;
  for (let i = a; i < b; i++) {
    const c = masked.charAt(i);
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && masked.startsWith(op, i)) {
      parts.push([from, i]);
      from = i + op.length;
      i += op.length - 1;
    }
  }
  parts.push([from, b]);
  return parts;
}

function trim(masked: string, [a, b]: Span): Span {
  let s = a;
  let e = b;
  while (s < e && /\s/.test(masked.charAt(s))) s++;
  while (e > s && /\s/.test(masked.charAt(e - 1))) e--;
  return [s, e];
}

/** True when one pair of brackets encloses the whole span. */
function wrapped(masked: string, [a, b]: Span): boolean {
  if (masked[a] !== '(' || masked[b - 1] !== ')') return false;
  let depth = 0;
  for (let i = a; i < b - 1; i++) {
    if (masked[i] === '(') depth++;
    else if (masked[i] === ')') depth--;
    if (depth === 0) return false;
  }
  return true;
}

/** The conditions of a boolean expression: operands of `||` and `&&`, looking inside parentheses. */
function leaves(masked: string, span: Span): Span[] {
  const [a, b] = trim(masked, span);
  if (wrapped(masked, [a, b])) return leaves(masked, [a + 1, b - 1]);
  for (const op of ['||', '&&']) {
    const parts = splitTop(masked, [a, b], op);
    if (parts.length > 1) return parts.flatMap((p) => leaves(masked, p));
  }
  return [[a, b]];
}

/** The boolean expressions of the rules: `allow ... if`, `return`, and the test of a `let x = c ? a : b`. */
function conditions(masked: string): Span[] {
  const found: Span[] = [];
  const statement = /\ballow\b[^:;]*:\s*if\b|\breturn\b|\blet\s+\w+\s*=/g;
  for (const m of masked.matchAll(statement)) {
    const from = m.index + m[0].length;
    const to = masked.indexOf(';', from);
    if (m[0].startsWith('let')) {
      const ternary = splitTop(masked, [from, to], '?');
      const [test] = ternary;
      if (test && ternary.length > 1) found.push(test);
    } else {
      found.push([from, to]);
    }
  }
  return found;
}

/** Every condition in the rules, forced to the opposite of what it is (both ways for an expression). */
export function mutants(rules: string): Mutant[] {
  const masked = mask(rules);
  const out: Mutant[] = [];
  for (const span of conditions(masked)) {
    for (const [start, end] of leaves(masked, span)) {
      const text = rules.slice(start, end);
      const before = rules.slice(0, start).split('\n');
      const replacements: Array<'true' | 'false'> =
        text === 'true' ? ['false'] : text === 'false' ? ['true'] : ['true', 'false'];
      for (const replacement of replacements) {
        const eq = EQUIVALENT[text];
        out.push({
          text: text.replace(/\s+/g, ' '),
          replacement,
          line: before.length,
          column: (before.at(-1) ?? '').length + 1,
          start,
          end,
          ...(eq && eq.replacement === replacement ? { equivalent: eq.reason } : {}),
        });
      }
    }
  }
  return out;
}

export function apply(rules: string, m: Pick<Mutant, 'start' | 'end' | 'replacement'>): string {
  return rules.slice(0, m.start) + m.replacement + rules.slice(m.end);
}
