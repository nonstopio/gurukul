import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { sh, tempDir } from './helpers.mjs';

const ENTRIES = 'apps/web/src/changelog/entries';

function workspace() {
  const dir = tempDir('new');
  mkdirSync(path.join(dir, ENTRIES), { recursive: true });
  return dir;
}

describe('changelog-new.sh', () => {
  it('creates a correctly named entry whose date matches its name', () => {
    const dir = workspace();
    const res = sh('changelog-new.sh', { cwd: dir, args: ['Learners can RETRY a Quiz!'] });
    assert.equal(res.status, 0, res.stderr);
    const [file] = readdirSync(path.join(dir, ENTRIES));
    assert.match(file, /^\d{4}-\d{2}-\d{2}-\d{6}-learners-can-retry-a-quiz\.ts$/);
    assert.equal(res.stdout.trim(), `${ENTRIES}/${file}`);
    const src = readFileSync(path.join(dir, ENTRIES, file), 'utf8');
    assert.match(src, new RegExp(`date: '${file.slice(0, 10)}'`));
    assert.match(src, /satisfies ChangelogEntry;\n$/);
  });

  it('caps the slug at 60 characters without a trailing dash', () => {
    const dir = workspace();
    sh('changelog-new.sh', { cwd: dir, args: ['word '.repeat(30)] });
    const [file] = readdirSync(path.join(dir, ENTRIES));
    const slug = file.slice(18, -3);
    assert.ok(slug.length <= 60, slug);
    assert.doesNotMatch(slug, /-$/);
  });

  it('refuses no words, and words with no letters or digits', () => {
    for (const args of [[], ['!!! ???']]) {
      const dir = workspace();
      const res = sh('changelog-new.sh', { cwd: dir, args });
      assert.equal(res.status, 1, String(args));
      assert.deepEqual(readdirSync(path.join(dir, ENTRIES)), []);
    }
  });
});
