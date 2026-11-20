import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { desktopSpecsSkipped } from '../../e2e/support/desktop-platform.mjs';
import { REPO, tempDir } from './helpers.mjs';

const E2E = path.join(REPO, 'e2e');
const PLAYWRIGHT = createRequire(path.join(E2E, 'package.json')).resolve('@playwright/test/cli');

/**
 * What Playwright would do with each desktop spec on `platform`: lists them (no emulators, app or
 * browser needed) in a Node whose `process.platform` says `platform`, and returns each test's
 * expected status.
 */
function desktopSpecsOn(platform) {
  const dir = tempDir('e2e-platform');
  const preload = path.join(dir, 'platform.mjs');
  writeFileSync(
    preload,
    `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });\n`,
  );
  try {
    const res = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        PLAYWRIGHT,
        'test',
        '--list',
        '--reporter=json',
        'tests/desktop-studio.spec.ts',
      ],
      { cwd: E2E, encoding: 'utf8', env: { ...process.env, CI: '' } },
    );
    assert.equal(res.status, 0, res.stderr);
    const report = JSON.parse(res.stdout);
    const statuses = [];
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests) statuses.push(t.expectedStatus);
      }
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites) walk(suite);
    return statuses;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('where the desktop e2e specs run', () => {
  it('skips them on Windows, with the reason, and runs them elsewhere', () => {
    assert.match(desktopSpecsSkipped('win32') ?? '', /POSIX-only; CI runs these specs on Linux/);
    assert.equal(desktopSpecsSkipped('linux'), null);
    assert.equal(desktopSpecsSkipped('darwin'), null);
  });

  // A Windows contributor's push of a web change runs `npm run e2e` (the pre-push hook): the
  // desktop specs, which cannot pass there, must be skipped rather than fail the push.
  it('Playwright skips every desktop spec on Windows', () => {
    const statuses = desktopSpecsOn('win32');
    assert.ok(statuses.length >= 3, `found ${statuses.length} desktop specs`);
    assert.deepEqual(new Set(statuses), new Set(['skipped']));
  });

  it('Playwright runs every desktop spec on Linux, as CI does', () => {
    const statuses = desktopSpecsOn('linux');
    assert.ok(statuses.length >= 3, `found ${statuses.length} desktop specs`);
    assert.deepEqual(new Set(statuses), new Set(['passed']));
  });
});
