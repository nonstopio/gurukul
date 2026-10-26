import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { context, editPayload, fixtureRepo, runHook, tempDir, writeFiles } from './helpers.mjs';

const ENTRY = 'apps/web/src/changelog/entries/2026-01-01-000000-old.ts';

function repo() {
  return fixtureRepo({
    'apps/web/src/App.tsx': 'export {};\n',
    'apps/web/src/changelog/index.ts': 'export {};\n',
    'packages/ui/src/Button.tsx': 'export {};\n',
    'firebase/firestore.rules': "rules_version = '2';\n",
    'firebase/functions/src/index.ts': 'export {};\n',
    'scripts/build.sh': 'true\n',
    [ENTRY]: 'export default {};\n',
  });
}

describe('changelog-nudge', () => {
  it('asks once per session after a user-visible file changes with no entry', () => {
    const r = repo();
    const tmp = tempDir();
    const file = path.join(r, 'apps/web/src/App.tsx');

    const first = runHook('changelog-nudge', editPayload(file), { tmp });
    assert.equal(first.status, 0);
    assert.match(context(first), /apps\/web\/src\/App\.tsx/);
    assert.match(context(first), /writing-changelog-entries/);
    assert.match(context(first), /npm run changelog:new/);

    const again = runHook(
      'changelog-nudge',
      editPayload(path.join(r, 'firebase/firestore.rules')),
      {
        tmp,
      },
    );
    assert.equal(again.stdout, '', 'second edit in the same session is silent');

    const other = runHook('changelog-nudge', editPayload(file, 'session-b'), { tmp });
    assert.ok(context(other), 'a new session asks again');
  });

  it('covers packages/ui, rules and functions source', () => {
    const r = repo();
    for (const rel of [
      'packages/ui/src/Button.tsx',
      'firebase/firestore.rules',
      'firebase/functions/src/index.ts',
    ]) {
      assert.ok(context(runHook('changelog-nudge', editPayload(path.join(r, rel)))), rel);
    }
  });

  it('is silent once an entry is written, staged or modified', () => {
    const r = repo();
    const file = path.join(r, 'apps/web/src/App.tsx');
    writeFiles(r, { 'apps/web/src/changelog/entries/2026-02-02-101010-new.ts': 'x\n' });
    assert.equal(runHook('changelog-nudge', editPayload(file)).stdout, '');

    const r2 = repo();
    writeFiles(r2, { [ENTRY]: 'export default { changed: true };\n' });
    assert.equal(
      runHook('changelog-nudge', editPayload(path.join(r2, 'apps/web/src/App.tsx'))).stdout,
      '',
    );
  });

  it('ignores tests, the changelog itself, CLAUDE.md and unwatched paths', () => {
    const r = repo();
    for (const rel of [
      'apps/web/src/App.test.tsx',
      'apps/web/src/changelog/index.ts',
      'apps/web/src/CLAUDE.md',
      'scripts/build.sh',
      'apps/web/test/App.test.tsx',
    ]) {
      writeFiles(r, { [rel]: 'x\n' });
      assert.equal(runHook('changelog-nudge', editPayload(path.join(r, rel))).stdout, '', rel);
    }
  });

  it('is silent outside a git repository and on an unreadable payload', () => {
    const loose = tempDir();
    writeFiles(loose, { 'apps/web/src/App.tsx': 'x\n' });
    const res = runHook('changelog-nudge', editPayload(path.join(loose, 'apps/web/src/App.tsx')));
    assert.equal(res.stdout, '');

    const bad = runHook('changelog-nudge', 'not json {');
    assert.equal(bad.status, 0);
    assert.equal(bad.stdout, '');
    assert.equal(runHook('changelog-nudge', { session_id: 'x' }).stdout, '');
  });
});
