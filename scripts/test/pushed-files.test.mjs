import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitAll, git, gitRepo, sh, tempDir, writeFiles } from './helpers.mjs';

const ZERO = '0'.repeat(40);

/** A repo with a bare remote holding main (a.txt); returns { dir, base }. */
function withRemote() {
  const remote = tempDir('remote');
  git(remote, 'init', '-q', '--bare');
  const dir = gitRepo({ 'a.txt': '1' });
  const base = commitAll(dir, 'base');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  return { dir, base };
}
const lines = (res) => res.stdout.trim().split('\n').filter(Boolean);

describe('pushed-files.sh', () => {
  it('lists what a new branch adds that no remote has', () => {
    const { dir } = withRemote();
    git(dir, 'checkout', '-q', '-b', 'feat');
    writeFiles(dir, { 'apps/web/x.ts': '1' });
    const sha = commitAll(dir, 'x');
    const res = sh('pushed-files.sh', {
      cwd: dir,
      input: `refs/heads/feat ${sha} refs/heads/feat ${ZERO}\n`,
    });
    assert.deepEqual(lines(res), ['apps/web/x.ts']);
  });

  it('lists only the new commits when the remote branch exists', () => {
    const { dir, base } = withRemote();
    writeFiles(dir, { 'packages/ui/y.ts': '1' });
    const sha = commitAll(dir, 'y');
    const res = sh('pushed-files.sh', {
      cwd: dir,
      input: `refs/heads/main ${sha} refs/heads/main ${base}\n`,
    });
    assert.deepEqual(lines(res), ['packages/ui/y.ts']);
  });

  it('checks the ref being pushed, not the checked-out branch', () => {
    const { dir } = withRemote();
    git(dir, 'checkout', '-q', '-b', 'other');
    writeFiles(dir, { 'firebase/z.ts': '1' });
    const other = commitAll(dir, 'z');
    git(dir, 'checkout', '-q', 'main');
    const res = sh('pushed-files.sh', {
      cwd: dir,
      input: `refs/heads/other ${other} refs/heads/other ${ZERO}\n`,
    });
    assert.deepEqual(lines(res), ['firebase/z.ts']);
  });

  it('lists nothing for a deleted branch', () => {
    const { dir } = withRemote();
    const res = sh('pushed-files.sh', {
      cwd: dir,
      input: `(delete) ${ZERO} refs/heads/gone abc\n`,
    });
    assert.deepEqual(lines(res), []);
  });

  it('says UNKNOWN when git cannot resolve a commit, so everything runs', () => {
    const { dir } = withRemote();
    const res = sh('pushed-files.sh', {
      cwd: dir,
      input: `refs/heads/main ${'1'.repeat(40)} refs/heads/main ${'2'.repeat(40)}\n`,
    });
    assert.deepEqual(lines(res), ['UNKNOWN']);
  });

  it('falls back to HEAD when run by hand with no refs', () => {
    const { dir } = withRemote();
    writeFiles(dir, { 'b.txt': '1' });
    commitAll(dir, 'b');
    assert.deepEqual(lines(sh('pushed-files.sh', { cwd: dir, input: '' })), ['b.txt']);
  });
});
