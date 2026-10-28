import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { merge, readReports, uncovered } from '../check-rules-coverage.mjs';
import { REPO, tempDir } from './helpers.mjs';

// `a || b`: a at offsets 9-9, b at 14-14, the whole expression 9-14 (ends inclusive).
const RULES = 'allow r: a || b;';
const at = (currentOffset, endOffset) => ({
  line: 1,
  column: currentOffset + 1,
  currentOffset,
  endOffset,
});
const value = (boolValue, count = 1) => ({ value: { boolValue }, count });
const skipped = (count = 1) => ({ value: {}, count });

function report(bValues, rules = RULES) {
  return {
    rules: { files: [{ name: 'firestore.rules', content: rules }] },
    report: [
      {
        sourcePosition: at(9, 14),
        values: [value(true)],
        children: [
          { sourcePosition: at(9, 9), values: [value(true)] },
          { sourcePosition: at(14, 14), ...(bValues ? { values: bValues } : {}) },
        ],
      },
    ],
  };
}

function run(reports, rules = RULES) {
  const dir = tempDir('rules-coverage');
  reports.forEach((r, i) => writeFileSync(path.join(dir, `${i}.json`), JSON.stringify(r)));
  writeFileSync(path.join(dir, 'firestore.rules'), rules);
  writeFileSync(path.join(dir, 'notes.txt'), 'not a report');
  return spawnSync(
    process.execPath,
    [path.join(REPO, 'scripts/check-rules-coverage.mjs'), dir, path.join(dir, 'firestore.rules')],
    { encoding: 'utf8' },
  );
}

describe('check-rules-coverage', () => {
  it('counts an expression a short circuit skipped as never evaluated', () => {
    assert.deepEqual(uncovered([report([skipped(3)])], RULES), [
      { line: 1, column: 15, text: 'b' },
    ]);
  });

  it('counts a real value or an error as evaluated', () => {
    assert.deepEqual(uncovered([report([value(false)])], RULES), []);
    const errored = report(undefined);
    errored.report[0].children[1].causeMessage = 'Property b is undefined on object.';
    assert.deepEqual(uncovered([errored], RULES), []);
  });

  it('merges reports: one that reaches an expression covers it for all', () => {
    const missed = report([skipped()]);
    const reached = report([value(true), skipped()]);
    assert.equal(uncovered([missed], RULES).length, 1);
    assert.deepEqual(uncovered([missed, reached], RULES), []);
    assert.equal(merge([missed, reached]).length, 3);
  });

  it('names only the outermost of nested expressions that never ran', () => {
    const none = report([skipped()]);
    none.report[0].values = [skipped()];
    none.report[0].children[0].values = [skipped()];
    assert.deepEqual(uncovered([none], RULES), [{ line: 1, column: 10, text: 'a || b' }]);
  });

  it('refuses a report taken against other rules, or one with no rules or nodes', () => {
    assert.throws(() => uncovered([report([value(true)], 'other')], RULES), /different rules/);
    assert.throws(() => uncovered([{}], RULES), /different rules/);
    assert.deepEqual(merge([{}]), []);
  });

  it('reads only the .json reports in a folder', () => {
    const dir = tempDir('rules-coverage');
    writeFileSync(path.join(dir, 'a.json'), JSON.stringify(report([value(true)])));
    writeFileSync(path.join(dir, 'b.txt'), 'x');
    assert.equal(readReports(dir).length, 1);
  });

  it('exits 0 when every expression ran, 1 with the place and text when one did not', () => {
    const ok = run([report([value(true)])]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stderr, /every expression evaluated \(1 reports\)/);

    const bad = run([report([skipped()])]);
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes('firestore.rules:1:15  never evaluated: b'), bad.stderr);
    assert.ok(bad.stderr.includes('1 rules expressions never evaluated'), bad.stderr);
  });

  it('exits 1 when there are no reports to read', () => {
    const empty = run([]);
    assert.equal(empty.status, 1);
    assert.ok(empty.stderr.includes('no rules coverage reports'), empty.stderr);
  });
});
