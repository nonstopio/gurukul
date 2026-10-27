import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { next, parse, problems, report } from '../tracker.mjs';
import { REPO } from './helpers.mjs';

const tracker = ({
  summary = '| Learning | 1 | 2 | 0 | 0 |',
  total = '| **Total** | 1 | 2 | 0 | 0 |',
  order = ['LRN-02', 'LRN-03'],
  rows,
} = {}) =>
  [
    '# Tracker',
    '',
    '## Summary',
    '',
    '| Section | Done | Todo | Blocked | Maintainer |',
    '| --- | --- | --- | --- | --- |',
    summary,
    total,
    '',
    '## Pick order',
    '',
    ...order.map((id, i) => `${i + 1}. \`${id}\` — something`),
    '',
    '## Learning',
    '',
    '| ID | Item | Status | Depends | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...(rows ?? [
      '| `LRN-01` | Home | done | — | `apps/web/src/HomePage.tsx` |',
      '| `LRN-02` | Catalogue filters | todo | `LRN-03` | |',
      '| `LRN-03` | Retired courses | todo | — | |',
    ]),
    '',
  ].join('\n');

describe('tracker', () => {
  it('parses sections, statuses, dependencies and the pick order', () => {
    const t = parse(tracker());
    assert.equal(t.sections.length, 1);
    assert.equal(t.sections[0].title, 'Learning');
    assert.deepEqual(
      t.sections[0].items.map((i) => [i.id, i.status, i.depends]),
      [
        ['LRN-01', 'done', []],
        ['LRN-02', 'todo', ['LRN-03']],
        ['LRN-03', 'todo', []],
      ],
    );
    assert.deepEqual(t.pickOrder, ['LRN-02', 'LRN-03']);
    assert.deepEqual(t.summary, [{ section: 'Learning', counts: [1, 2, 0, 0] }]);
    assert.deepEqual(t.total, [1, 2, 0, 0]);
    assert.deepEqual(problems(t), []);
  });

  it('picks the first todo whose dependencies are done, skipping claimed ones', () => {
    const t = parse(tracker());
    assert.equal(next(t).id, 'LRN-03'); // LRN-02 waits on LRN-03
    assert.equal(next(t, ['LRN-03']), null);
    assert.match(report(t), /Next: LRN-03 Retired courses/);
    assert.match(report(parse(tracker({ order: [] }))), /Next: nothing pickable/);
  });

  it('reports a stale summary, a bad status, an unknown dependency and pick-order drift', () => {
    const found = problems(
      parse(
        tracker({
          summary: '| Learning | 3 | 0 | 0 | 0 |\n| Gone | 0 | 0 | 0 | 0 |',
          order: ['LRN-01', 'LRN-02', 'LRN-02'],
          rows: [
            '| `LRN-01` | Home | done | — | |',
            '| `LRN-02` | Filters | todo | `XYZ-09` | |',
            '| `LRN-03` | Retired | doing | — | |',
            '| `LRN-03` | Again | blocked | — | |',
            '| `lrn-4` | Bad id | done | — | |',
          ],
        }),
      ),
    );
    for (const expected of [
      /lrn-4: id is not AREA-NN/,
      /LRN-03: listed twice/,
      /LRN-03: status "doing"/,
      /LRN-02: depends on unknown XYZ-09/,
      /LRN-03: open but missing from the pick order/,
      /LRN-02: twice in the pick order/,
      /LRN-01: in the pick order but not todo or blocked/,
      /"Learning" says 3\/0\/0\/0, rows say 2\/1\/1\/0/,
      /"Gone" is not a section/,
    ]) {
      assert.ok(
        found.some((p) => expected.test(p)),
        `${expected} in\n${found.join('\n')}`,
      );
    }
    assert.ok(
      problems(parse(tracker({ summary: '' }))).some((p) => /no row for "Learning"/.test(p)),
    );
    const totals = (total) => problems(parse(tracker({ total })));
    assert.ok(totals('| **Total** | 9 | 2 | 0 | 0 |').some((p) => /Total says 9\/2\/0\/0/.test(p)));
    assert.ok(totals('').some((p) => /Total says nothing/.test(p)));
  });

  it('the real tracker is consistent', () => {
    const t = parse(readFileSync(path.join(REPO, '.plan/tracker.md'), 'utf8'));
    assert.ok(t.sections.length > 5);
    assert.deepEqual(problems(t), []);
  });

  it('prints the summary, and --check stays quiet when clean', () => {
    const run = (...args) =>
      spawnSync(process.execPath, ['scripts/tracker.mjs', ...args], {
        cwd: REPO,
        encoding: 'utf8',
      });
    const shown = run();
    assert.equal(shown.status, 0);
    assert.match(shown.stdout, /^Section +done +todo +blocked +maintainer/);
    assert.match(shown.stdout, /Next: /);
    const checked = run('--check');
    assert.equal(checked.status, 0);
    assert.equal(checked.stdout, '');
  });
});
