import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { frontmatterPaths, isTestPath, matchesGlob } from '../lib.mjs';

describe('matchesGlob', () => {
  const cases = [
    ['apps/**', 'apps/web/src/App.tsx', true],
    ['apps/**', 'apps', true],
    ['apps/**', 'appsx/a.ts', false],
    ['apps/web/src/**', 'apps/web/src/a/b/c.ts', true],
    ['apps/web/src/**', 'apps/web/test/a.ts', false],
    ['**/CLAUDE.md', 'CLAUDE.md', true],
    ['**/CLAUDE.md', 'apps/web/CLAUDE.md', true],
    ['**/CLAUDE.md', 'apps/web/NOTCLAUDE.md', false],
    ['.claude/**', '.claude/hooks/x.mjs', true],
    ['scripts/*.sh', 'scripts/a.sh', true],
    ['scripts/*.sh', 'scripts/deep/a.sh', false],
    ['firebase.json', 'firebase.json', true],
    ['firebase.json', 'firebaseXjson', false],
    ['firebase/firestore.rules', 'firebase/firestore.rules', true],
    ['apps/**/test/*.ts', 'apps/web/test/a.ts', true],
    ['./apps/**', 'apps/a.ts', true],
    ['src/?.ts', 'src/a.ts', true],
  ];
  for (const [glob, rel, want] of cases) {
    it(`${glob} ${want ? 'matches' : 'does not match'} ${rel}`, () => {
      assert.equal(matchesGlob(rel, glob), want);
    });
  }
});

describe('frontmatterPaths', () => {
  it('reads block lists, inline lists and a single value', () => {
    assert.deepEqual(frontmatterPaths('---\npaths:\n  - \'a/**\'\n  - "b"\nother: 1\n---\n'), [
      'a/**',
      'b',
    ]);
    assert.deepEqual(frontmatterPaths('---\npaths: ["a/**", \'b\']\n---\n'), ['a/**', 'b']);
    assert.deepEqual(frontmatterPaths('---\npaths: a/**\n---\n'), ['a/**']);
  });

  it('returns nothing without frontmatter or without paths', () => {
    assert.deepEqual(frontmatterPaths('# title\n'), []);
    assert.deepEqual(frontmatterPaths('---\nname: x\n---\n'), []);
  });
});

describe('isTestPath', () => {
  it('knows tests from source', () => {
    assert.equal(isTestPath('apps/web/test/a.ts'), true);
    assert.equal(isTestPath('apps/web/src/a.test.tsx'), true);
    assert.equal(isTestPath('firebase/rules/test/rules.spec.ts'), true);
    assert.equal(isTestPath('apps/web/src/latest.ts'), false);
  });
});
