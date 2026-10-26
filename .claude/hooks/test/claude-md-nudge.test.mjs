import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { context, editPayload, fixtureRepo, runHook, tempDir, writeFiles } from './helpers.mjs';

function repo() {
  return fixtureRepo({
    'CLAUDE.md': '# root\n',
    'apps/web/CLAUDE.md': '# web\n',
    'apps/web/src/App.tsx': 'x\n',
    'apps/web/src/changelog/index.ts': 'x\n',
    'apps/web/src/changelog/entries/2026-01-01-000000-a.ts': 'x\n',
    'scripts/changelog-new.sh': 'x\n',
    'packages/ui/src/Button.tsx': 'x\n',
    '.claude/rules/web.md': "---\npaths:\n  - 'apps/web/src/**'\n---\n# web\n",
    '.claude/rules/inline.md': '---\npaths: ["scripts/*.sh", "firebase.json"]\n---\n',
    '.claude/rules/always.md': '# no frontmatter, always loaded\n',
    '.claude/rules/ui.md': "---\npaths:\n  - 'packages/ui/**'\n---\n",
    '.claude/skills/changelog/SKILL.md':
      'Scaffold with `scripts/changelog-new.sh`. Entries live in `apps/web/src/changelog/`.\n',
    '.claude/skills/entries-only/SKILL.md': 'See apps/web/src/changelog/entries/ only.\n',
  });
}

describe('claude-md-nudge', () => {
  it('names the nearest CLAUDE.md, matching rules and mentioning skills', () => {
    const r = repo();
    const res = runHook(
      'claude-md-nudge',
      editPayload(path.join(r, 'apps/web/src/changelog/index.ts')),
    );
    assert.equal(res.status, 0);
    const text = context(res);
    assert.match(text, /^Notes that govern apps\/web\/src\/changelog\/index\.ts:/);
    assert.match(text, /- apps\/web\/CLAUDE\.md/);
    assert.match(text, /- \.claude\/rules\/web\.md/);
    assert.match(text, /- \.claude\/skills\/changelog\/SKILL\.md/);
    assert.doesNotMatch(text, /always\.md|ui\.md|inline\.md/);
    assert.doesNotMatch(text, /entries-only/, 'a deeper folder is not this folder');
    assert.doesNotMatch(text, /- CLAUDE\.md/, 'only the nearest CLAUDE.md');
    assert.match(text, /updating-claude-md/);
  });

  it('falls back to the root CLAUDE.md and handles inline paths and exact file mentions', () => {
    const r = repo();
    const text = context(
      runHook('claude-md-nudge', editPayload(path.join(r, 'scripts/changelog-new.sh'))),
    );
    assert.match(text, /- CLAUDE\.md/);
    assert.match(text, /- \.claude\/rules\/inline\.md/);
    assert.match(text, /- \.claude\/skills\/changelog\/SKILL\.md/);
  });

  it('names each governing file once per session, and again in a new session', () => {
    const r = repo();
    const tmp = tempDir();
    const app = path.join(r, 'apps/web/src/App.tsx');
    const first = context(runHook('claude-md-nudge', editPayload(app), { tmp }));
    assert.match(first, /apps\/web\/CLAUDE\.md/);
    assert.match(first, /rules\/web\.md/);

    assert.equal(runHook('claude-md-nudge', editPayload(app), { tmp }).stdout, '');

    // A file governed by one already-named note and one new note names only the new one.
    const changelog = path.join(r, 'apps/web/src/changelog/index.ts');
    const second = context(runHook('claude-md-nudge', editPayload(changelog), { tmp }));
    assert.match(second, /skills\/changelog/);
    assert.doesNotMatch(second, /apps\/web\/CLAUDE\.md|rules\/web\.md/);

    assert.ok(context(runHook('claude-md-nudge', editPayload(app, 'session-b'), { tmp })));
  });

  it('ignores tests, build output, CLAUDE.md, .claude notes and non-source paths', () => {
    const r = repo();
    for (const rel of [
      'apps/web/test/App.test.tsx',
      'apps/web/src/App.spec.ts',
      'apps/web/dist/index.js',
      'apps/web/node_modules/x/index.js',
      'apps/web/coverage/lcov.info',
      'apps/web/CLAUDE.md',
      '.claude/rules/web.md',
      '.claude/skills/changelog/SKILL.md',
      'README.md',
      'firebase/functions/lib/index.js',
    ]) {
      writeFiles(r, { [rel]: 'x\n' });
      assert.equal(runHook('claude-md-nudge', editPayload(path.join(r, rel))).stdout, '', rel);
    }
  });

  it('is silent on an unreadable payload and outside a repository', () => {
    const bad = runHook('claude-md-nudge', '');
    assert.equal(bad.status, 0);
    assert.equal(bad.stdout, '');
    const loose = tempDir();
    writeFiles(loose, { 'apps/web/src/App.tsx': 'x\n', 'CLAUDE.md': 'x\n' });
    assert.equal(
      runHook('claude-md-nudge', editPayload(path.join(loose, 'apps/web/src/App.tsx'))).stdout,
      '',
    );
  });
});
