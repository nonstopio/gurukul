// =================================================================================================
//  After editing anything global search is built from, run the navigation validator.
//
//  PostToolUse on Edit|Write|MultiEdit. Exits 0 always and prints only when the validator reports
//  a real discrepancy. It is ADVISORY: the enforcement is `npm run validate:navigation` in CI,
//  which runs whoever or whatever made the edit.
//
//  WHY THIS EXISTS
//
//  Global search is generated from the per-area metadata in apps/web/src/navigation/areas/*.ts. A
//  route added to the app and never described there is a screen search cannot find, and nothing
//  on screen says so. Telling the editor in the same turn is cheaper than a red CI run later.
//
//  It computes, it does not recite: the validator reads the metadata and the routes itself, so a
//  new area is covered the day it lands and this hook needs no edit.
//
//  WHAT IT DOES NOT DO
//
//  It stays silent when the root package.json has no `validate:navigation` script (search may not
//  exist yet on your branch), when the validator passes (the normal case), and when it cannot run
//  or takes longer than 25 seconds. A slow or missing validator is CI's problem to report, not a
//  reason to interrupt an edit.
// =================================================================================================

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  editedFile,
  isTestPath,
  readPayload,
  readText,
  relativeTo,
  repoRootOf,
  run,
  sayAfter,
} from './lib.mjs';

const MAX_OUTPUT = 4000;

function watched(rel) {
  if (isTestPath(rel)) return false;
  return (
    rel.startsWith('apps/web/src/navigation/') ||
    rel === 'apps/web/src/routes.tsx' ||
    rel === 'apps/web/src/route-paths.ts' ||
    rel === 'apps/web/src/App.tsx'
  );
}

function hasValidator(root) {
  try {
    const pkg = JSON.parse(readText(path.join(root, 'package.json')) ?? '{}');
    return typeof pkg?.scripts?.['validate:navigation'] === 'string';
  } catch {
    return false;
  }
}

await run(async () => {
  const payload = await readPayload();
  if (!payload) return;
  const file = editedFile(payload);
  if (!file) return;
  const root = repoRootOf(file);
  if (!root) return;
  const rel = relativeTo(root, file);
  if (!rel || !watched(rel) || !hasValidator(root)) return;

  const result = spawnSync('npm', ['run', '-s', 'validate:navigation'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 25_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Could not start, or timed out: not a discrepancy, so not ours to report.
  if (result.error || result.signal || result.status === null) return;
  if (result.status === 0) return;

  let output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (output.length > MAX_OUTPUT) output = `${output.slice(0, MAX_OUTPUT)}\n… (truncated)`;

  sayAfter(
    'Global search metadata no longer agrees with the code. Search is generated from ' +
      'apps/web/src/navigation/areas/*.ts, so a route left undescribed is a page nobody can ' +
      `find.\n\n${output || '(the validator printed nothing)'}\n\n` +
      'Fix it in this same change; CI fails on exactly this. Re-run: npm run validate:navigation',
  );
});
