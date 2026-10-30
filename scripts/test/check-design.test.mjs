import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { ALLOW, check } from '../check-design.mjs';
import { REPO, tempDir, writeFiles } from './helpers.mjs';

function repo(files) {
  const dir = tempDir('design');
  writeFiles(dir, files);
  return dir;
}

const rules = (dir) => check(dir).map((f) => `${f.file}:${f.line} ${f.rule}`);

describe('check-design', () => {
  it('flags raw select, table and h1 in app TSX, and nothing in clean files', () => {
    const dir = repo({
      'apps/web/src/Bad.tsx': '<select>\n<table>\n<h1 className="x">\n<main>',
      'apps/web/src/Shell.tsx': '<main id="content">',
      'apps/web/src/Good.tsx': '<Select label="Team" />\n<PageHeader title="Hi" />\n<h2>Ok</h2>',
    });
    assert.deepEqual(rules(dir), [
      'apps/web/src/Bad.tsx:1 select',
      'apps/web/src/Bad.tsx:2 table',
      'apps/web/src/Bad.tsx:3 h1',
      'apps/web/src/Bad.tsx:4 main',
    ]);
  });

  it('flags an email field, because people are picked with PeoplePicker', () => {
    const dir = repo({
      'apps/web/src/Who.tsx':
        '<Input type="email" label="Who" />\n<PeoplePicker label="Add people" />',
    });
    assert.deepEqual(rules(dir), ['apps/web/src/Who.tsx:1 email-box']);
  });

  it('keeps app CSS to layout and tokens', () => {
    const dir = repo({
      'apps/web/src/a.css': [
        '.a { color: #fff; }',
        '.b { background: rgb(0 0 0 / 0.5); }',
        '.c { font-size: 13px; }',
        '.d { box-shadow: 0 1px 2px black; }',
        '.e { border-radius: 8px; }',
        '.f { z-index: 10; }',
        '.g { max-width: 960px; }',
        '/* #abc in a comment is fine */',
        '.h { color: var(--text); box-shadow: var(--shadow-xs); max-width: var(--width-reading); }',
        '.i { box-shadow: none; z-index: var(--z-menu); }',
      ].join('\n'),
    });
    assert.deepEqual(
      check(dir).map((f) => f.rule),
      ['hex', 'colour-fn', 'font-size', 'shadow', 'radius', 'z-index', 'width'],
    );
  });

  it('keeps components on role tokens, except tokens.css itself', () => {
    const dir = repo({
      'packages/ui/src/b.css': '.b { color: var(--g-gray-25); }\n.c { color: var(--text); }',
      'packages/ui/src/tokens.css': ':root { --g-x: #fff; --y: var(--g-x); --s: rgb(0 0 0); }',
    });
    assert.deepEqual(rules(dir), ['packages/ui/src/b.css:1 scale']);
    assert.ok(ALLOW['packages/ui/src/tokens.css'].hex);
  });

  it('passes when the source folders are missing', () => {
    assert.deepEqual(check(repo({ 'README.md': '#1' })), []);
  });

  it('exits 1 and names each violation, or exits 0 when clean', () => {
    const bad = repo({ 'apps/web/src/A.tsx': '<table>' });
    const run = (dir) =>
      spawnSync(process.execPath, ['scripts/check-design.mjs', dir], {
        cwd: REPO,
        encoding: 'utf8',
      });
    const failed = run(bad);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /apps\/web\/src\/A\.tsx:1 {2}table/);
    assert.match(failed.stderr, /1 design-system violations/);
    assert.equal(run(repo({ 'apps/web/src/A.tsx': '<DataTable />' })).status, 0);
  });
});
