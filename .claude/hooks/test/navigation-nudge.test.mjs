import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { context, editPayload, fixtureRepo, runHook } from './helpers.mjs';

const SOURCES = {
  'apps/web/src/App.tsx': 'x\n',
  'apps/web/src/routes.tsx': 'x\n',
  'apps/web/src/route-paths.ts': 'x\n',
  'apps/web/src/navigation/areas/learn.ts': 'x\n',
  'apps/web/src/navigation/areas/learn.test.ts': 'x\n',
  'apps/web/src/main.tsx': 'x\n',
};

function repo(validator) {
  const pkg = { name: 'fixture', private: true, scripts: {} };
  if (validator) pkg.scripts['validate:navigation'] = 'node check.mjs';
  return fixtureRepo({
    ...SOURCES,
    'package.json': JSON.stringify(pkg),
    'check.mjs':
      validator === 'fail'
        ? "console.error('learn: route /courses/:id has no search entry'); process.exit(1);\n"
        : 'process.exit(0);\n',
  });
}

describe('navigation-nudge', () => {
  it('reports the validator output when it fails', () => {
    const r = repo('fail');
    for (const rel of [
      'apps/web/src/navigation/areas/learn.ts',
      'apps/web/src/routes.tsx',
      'apps/web/src/route-paths.ts',
      'apps/web/src/App.tsx',
    ]) {
      const res = runHook('navigation-nudge', editPayload(path.join(r, rel)));
      assert.equal(res.status, 0);
      assert.match(context(res), /route \/courses\/:id has no search entry/, rel);
      assert.match(context(res), /npm run validate:navigation/);
    }
  });

  it('is silent on this repository, whose real validator passes', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    const res = runHook(
      'navigation-nudge',
      editPayload(path.join(repoRoot, 'apps/web/src/route-paths.ts')),
    );
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });

  it('is silent when the validator passes', () => {
    const r = repo('pass');
    const res = runHook(
      'navigation-nudge',
      editPayload(path.join(r, 'apps/web/src/route-paths.ts')),
    );
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });

  it('is silent when the root package.json has no validate:navigation script', () => {
    const r = repo(null);
    const res = runHook('navigation-nudge', editPayload(path.join(r, 'apps/web/src/App.tsx')));
    assert.equal(res.stdout, '');
  });

  it('ignores tests and files search is not built from', () => {
    const r = repo('fail');
    for (const rel of ['apps/web/src/navigation/areas/learn.test.ts', 'apps/web/src/main.tsx']) {
      assert.equal(runHook('navigation-nudge', editPayload(path.join(r, rel))).stdout, '', rel);
    }
  });

  it('is silent on an unreadable payload', () => {
    const res = runHook('navigation-nudge', '{"tool_input":');
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });
});
