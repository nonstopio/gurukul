import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitAll, entry, git, gitRepo, sh, writeFiles } from './helpers.mjs';

const E = 'apps/web/src/changelog/entries';

function staged(files, committed = {}) {
  const dir = gitRepo(committed);
  if (Object.keys(committed).length) commitAll(dir, 'base');
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  return dir;
}

describe('check-changelog-names.sh', () => {
  it('passes a well-named entry whose date matches', () => {
    const dir = staged({ [`${E}/2026-10-27-143005-good-name.ts`]: entry('2026-10-27') });
    const res = sh('check-changelog-names.sh', { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
  });

  it('passes when nothing under entries is staged', () => {
    const dir = staged({ 'README.md': 'x' });
    assert.equal(sh('check-changelog-names.sh', { cwd: dir }).status, 0);
  });

  it('rejects a malformed name, an impossible time and capitals', () => {
    for (const name of [
      '2026-10-27-99-bad.ts',
      '2026-10-27-256000-late.ts',
      '2026-10-27-143005-Caps.ts',
    ]) {
      const dir = staged({ [`${E}/${name}`]: entry('2026-10-27') });
      const res = sh('check-changelog-names.sh', { cwd: dir });
      assert.equal(res.status, 1, name);
      assert.match(res.stderr, /name must be YYYY-MM-DD-HHMMSS/);
    }
  });

  it('rejects a name whose date disagrees with the entry', () => {
    const dir = staged({ [`${E}/2026-10-27-143005-wrong-day.ts`]: entry('2026-10-26') });
    const res = sh('check-changelog-names.sh', { cwd: dir });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /says 2026-10-27 but the entry's date: field does not/);
  });

  it('rejects a day and time another entry already uses', () => {
    const dir = staged(
      { [`${E}/2026-10-27-143005-second.ts`]: entry('2026-10-27') },
      { [`${E}/2026-10-27-143005-first.ts`]: entry('2026-10-27') },
    );
    const res = sh('check-changelog-names.sh', { cwd: dir });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /already uses that day and time/);
  });
});
