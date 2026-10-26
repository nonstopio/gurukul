import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO } from './helpers.mjs';

const WEB = path.join(REPO, 'apps/web');
const tsx = (script, env = {}) =>
  spawnSync('npx', ['--no-install', 'tsx', `scripts/${script}`], {
    cwd: WEB,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

describe('apps/web build scripts', () => {
  it('validate-navigation passes on the real metadata and routes', () => {
    const res = tsx('validate-navigation.ts');
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stderr, /navigation: \d+ area\(s\), \d+ route\(s\), clean/);
  });

  it('changelog-releases files untagged entries under the release being cut', () => {
    const res = tsx('changelog-releases.ts', { GURUKUL_RELEASE: 'release-test' });
    assert.equal(res.status, 0, res.stderr);
    const data = JSON.parse(
      readFileSync(path.join(WEB, 'src/changelog/releases.generated.json'), 'utf8'),
    );
    assert.equal(data.releases[0], 'release-test');
    assert.ok(Object.keys(data.byFile).length > 0);
    // Put the file back the way a plain build leaves it.
    assert.equal(tsx('changelog-releases.ts').status, 0);
  });
});
