import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { bumpOf, nextVersion, plan } from '../desktop-version.mjs';
import { SCRIPTS, commitAll, git, gitRepo, tempDir, writeFiles } from './helpers.mjs';

describe('bumpOf', () => {
  it('reads a breaking change, a feature or anything else', () => {
    assert.equal(bumpOf('feat(desktop)!: sessions move to a new folder\n'), 'major');
    assert.equal(bumpOf('fix(desktop): x\n\nBREAKING CHANGE: the bridge is version 2\n'), 'major');
    assert.equal(bumpOf('fix(desktop): a\n\nfeat(desktop): updates install on quit\n'), 'minor');
    assert.equal(bumpOf('fix(desktop): the window retries\nchore(deps): bump electron\n'), 'patch');
    assert.equal(bumpOf(''), 'patch');
  });

  it('does not count a type named inside a sentence or a bullet', () => {
    assert.equal(bumpOf('fix(desktop): keep feat: out\n\n* feat(desktop): squashed\n'), 'patch');
  });
});

describe('nextVersion', () => {
  it('starts at 0.1.0 when there is no desktop tag, whatever the commits say', () => {
    assert.equal(nextVersion(null, 'fix(desktop): x'), '0.1.0');
    assert.equal(nextVersion(null, 'feat(desktop)!: x'), '0.1.0');
  });

  it('bumps the last tag', () => {
    assert.equal(nextVersion('desktop-v1.2.3', 'feat(desktop)!: x'), '2.0.0');
    assert.equal(nextVersion('desktop-v1.2.3', 'feat(desktop): x'), '1.3.0');
    assert.equal(nextVersion('desktop-v1.2.3', 'fix(desktop): x'), '1.2.4');
  });

  it('refuses a tag that is not a desktop version', () => {
    assert.throws(() => nextVersion('release-2026.11.19-0900', ''), /Not a desktop tag/);
  });
});

/** A repo whose first commit touches apps/desktop/. */
function repo() {
  const dir = gitRepo({ 'apps/desktop/package.json': '{}', 'apps/web/a.ts': '1' });
  commitAll(dir, 'feat(desktop): the shell opens Studio');
  return dir;
}

describe('plan', () => {
  it('releases 0.1.0 first', () => {
    assert.deepEqual(plan(repo()), {
      release: true,
      version: '0.1.0',
      tag: 'desktop-v0.1.0',
      previous: '',
    });
  });

  it('reads only commits that touched apps/desktop/ since the last desktop tag', () => {
    const dir = repo();
    git(dir, 'tag', 'desktop-v0.1.0');
    writeFiles(dir, { 'apps/web/a.ts': '2' });
    commitAll(dir, 'feat(web)!: a web change');
    git(dir, 'tag', 'release-2026.11.19-0900');
    writeFiles(dir, { 'apps/desktop/src/x.ts': '1' });
    commitAll(dir, 'fix(desktop): the window retries');
    assert.deepEqual(plan(dir), {
      release: true,
      version: '0.1.1',
      tag: 'desktop-v0.1.1',
      previous: 'desktop-v0.1.0',
    });
    writeFiles(dir, { 'apps/desktop/src/y.ts': '1' });
    commitAll(dir, 'feat(desktop): check for updates');
    assert.equal(plan(dir).version, '0.2.0');
  });

  it('releases nothing when only the web app changed since the last tag', () => {
    const dir = repo();
    git(dir, 'tag', 'desktop-v0.3.0');
    writeFiles(dir, { 'apps/web/a.ts': '2' });
    commitAll(dir, 'feat(web): something learners see');
    assert.deepEqual(plan(dir), {
      release: false,
      version: '0.3.1',
      tag: 'desktop-v0.3.1',
      previous: 'desktop-v0.3.0',
    });
  });
});

describe('desktop-version.mjs', () => {
  it('prints the plan and appends it to GITHUB_OUTPUT', () => {
    const dir = repo();
    const output = path.join(tempDir('output'), 'out.txt');
    const res = spawnSync('node', [path.join(SCRIPTS, 'desktop-version.mjs'), dir], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    const expected = 'release=true\nversion=0.1.0\ntag=desktop-v0.1.0\nprevious=\n';
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, expected);
    assert.equal(readFileSync(output, 'utf8'), expected);
  });

  it('prints only, in the current folder, without GITHUB_OUTPUT', () => {
    const dir = repo();
    const env = { ...process.env };
    delete env.GITHUB_OUTPUT;
    const res = spawnSync('node', [path.join(SCRIPTS, 'desktop-version.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^release=true\nversion=0\.1\.0\n/);
  });
});
