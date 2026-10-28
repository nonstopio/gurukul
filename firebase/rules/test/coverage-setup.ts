import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { COVERAGE_DIR } from './coverage-global';

// The emulator resets its rules coverage whenever rules are loaded, and every test file loads them
// (startEnv), so each file saves its own report; scripts/check-rules-coverage.mjs merges them.
afterAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) return;
  const res = await fetch(`http://${host}/emulator/v1/projects/demo-gurukul:ruleCoverage`);
  if (!res.ok) throw new Error(`rules coverage report: HTTP ${res.status}`);
  writeFileSync(join(COVERAGE_DIR, `${randomUUID()}.json`), await res.text());
});
