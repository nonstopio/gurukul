import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO, tempDir } from './helpers.mjs';

const DESKTOP = path.join(REPO, 'apps/desktop');
const ID = 'GURUKUL_DESKTOP_GOOGLE_CLIENT_ID';
const SECRET = 'GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET';

/** Runs apps/desktop/scripts/bundle.ts into a temporary folder and reads main.cjs back. */
function bundle(env) {
  const out = tempDir('desktop-bundle');
  try {
    const res = spawnSync('npx', ['--no-install', 'tsx', 'scripts/bundle.ts', out], {
      cwd: DESKTOP,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    assert.equal(res.status, 0, res.stderr);
    return {
      main: readFileSync(path.join(out, 'main.cjs'), 'utf8'),
      preload: readFileSync(path.join(out, 'preload.cjs'), 'utf8'),
    };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe('apps/desktop bundle script', () => {
  it('writes the Google client from the build environment into main.cjs as literals', () => {
    const { main, preload } = bundle({ [ID]: 'id-from-ci.example', [SECRET]: 'secret-from-ci' });
    assert.ok(main.includes('"id-from-ci.example"'));
    assert.ok(main.includes('"secret-from-ci"'));
    // Nothing is left for the Educator's environment to set, and the window's preload has neither.
    assert.ok(!main.includes(`process.env.${ID}`));
    assert.ok(!main.includes(`process.env.${SECRET}`));
    assert.ok(!preload.includes('id-from-ci.example'));
  });

  it('writes empty literals without a client, so sign-in answers not_configured', () => {
    // Set but empty, so a developer's apps/desktop/.env does not fill them in.
    const { main } = bundle({ [ID]: '', [SECRET]: '' });
    assert.ok(!main.includes(`process.env.${ID}`));
    assert.match(main, /googleClient\)?\(\s*""\s*,\s*""\s*\)/);
  });
});
