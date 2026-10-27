import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { check, initialScripts } from '../check-bundle-size.mjs';
import { REPO, tempDir } from './helpers.mjs';

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-b.js">
<link rel="stylesheet" href="/assets/index.css">
<script src="/classic.js"></script>
</head></html>`;

function dist(sizeBytes) {
  const dir = tempDir('dist');
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), HTML);
  const noise = (n) => randomBytes(n); // incompressible, so gzip cannot shrink it to nothing
  writeFileSync(path.join(dir, 'assets/index-a.js'), noise(sizeBytes));
  writeFileSync(path.join(dir, 'assets/vendor-b.js'), noise(sizeBytes));
  return dir;
}

describe('check-bundle-size', () => {
  it('finds the entry script and the preloaded chunks, and nothing else', () => {
    assert.deepEqual(initialScripts(HTML), ['assets/index-a.js', 'assets/vendor-b.js']);
    assert.deepEqual(initialScripts('<html></html>'), []);
  });

  it('passes under budget and fails over it', () => {
    const dir = dist(20_000);
    const small = check(dir, 500);
    assert.equal(small.ok, true);
    assert.equal(small.files.length, 2);
    assert.equal(check(dir, 1).ok, false);
  });

  it('exits 0 under budget and 1 over, printing the total', () => {
    const dir = dist(20_000);
    const ok = spawnSync(process.execPath, ['scripts/check-bundle-size.mjs', dir, '500'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    assert.equal(ok.status, 0);
    assert.match(ok.stderr, /initial JavaScript \(budget 500 KB\)/);
    const bad = spawnSync(process.execPath, ['scripts/check-bundle-size.mjs', dir, '1'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /over the 1 KB budget/);
  });
});
