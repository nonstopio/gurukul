// Fails when a Firestore rules expression was never evaluated by the rules tests.
//   node scripts/check-rules-coverage.mjs [reportDir] [rulesFile]
// Each rules test file saves the emulator's coverage report (firebase/rules/test/coverage-setup.ts),
// because the emulator resets coverage whenever a file loads the rules. An expression counts as
// covered when any report shows it evaluated; .plan/10-testing-and-ci.md asks for every one.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Spans are [currentOffset, endOffset], both inclusive.
const key = (pos) => `${pos.currentOffset}:${pos.endOffset}`;

// The emulator lists an expression a short circuit skipped with an empty value, so only a real
// value, or an error (causeMessage), shows it ran.
const ran = (node) =>
  Boolean(node.causeMessage) ||
  (node.values ?? []).some((v) => Object.keys(v.value ?? {}).length > 0);

/** Every expression in the reports, keyed by its source span, with whether any report evaluated it. */
export function merge(reports) {
  const seen = new Map();
  const walk = (node) => {
    const k = key(node.sourcePosition);
    const evaluated = ran(node);
    const prior = seen.get(k);
    seen.set(k, { pos: node.sourcePosition, evaluated: evaluated || Boolean(prior?.evaluated) });
    for (const child of node.children ?? []) walk(child);
  };
  for (const report of reports) for (const node of report.report ?? []) walk(node);
  return [...seen.values()];
}

/**
 * The expressions no report evaluated, innermost dropped when an enclosing one is also missed,
 * with their line, column and source text. Fails when a report was taken against other rules.
 */
export function uncovered(reports, rules) {
  for (const report of reports) {
    const content = report.rules?.files?.[0]?.content;
    if (content !== rules) throw new Error('a coverage report was taken against different rules');
  }
  const missed = merge(reports)
    .filter((e) => !e.evaluated)
    .sort((a, b) => a.pos.currentOffset - b.pos.currentOffset || b.pos.endOffset - a.pos.endOffset);
  const outermost = [];
  for (const e of missed) {
    const last = outermost.at(-1);
    if (last && e.pos.endOffset <= last.pos.endOffset) continue;
    outermost.push(e);
  }
  return outermost.map(({ pos }) => ({
    line: pos.line,
    column: pos.column,
    text: rules.slice(pos.currentOffset, pos.endOffset + 1).replace(/\s+/g, ' '),
  }));
}

export function readReports(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(process.argv[2] ?? 'firebase/rules/coverage');
  const rulesFile = path.resolve(process.argv[3] ?? 'firebase/firestore.rules');
  const reports = readReports(dir);
  if (reports.length === 0) {
    console.error(`x no rules coverage reports in ${dir}; run npm run test:rules`);
    process.exit(1);
  }
  const missed = uncovered(reports, readFileSync(rulesFile, 'utf8'));
  const name = path.relative(process.cwd(), rulesFile);
  for (const m of missed)
    console.error(`${name}:${m.line}:${m.column}  never evaluated: ${m.text}`);
  if (missed.length > 0) {
    console.error(
      `x ${missed.length} rules expressions never evaluated; add a test that reaches each`,
    );
    process.exit(1);
  }
  console.warn(`rules coverage: every expression evaluated (${reports.length} reports)`);
}
