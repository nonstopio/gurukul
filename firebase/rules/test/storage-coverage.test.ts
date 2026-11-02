import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MUTANT_DIR } from './coverage-global';
import { STORAGE_RULES, startStorageEnv } from './helpers';
import { CASES, matches } from './storage/cases';
import { apply, mutants } from './storage/mutants';

// The Storage emulator reports no rule coverage, so each condition in storage.rules is forced to the
// wrong answer in turn and the cases must catch it (see storage/mutants.ts). The result is saved for
// scripts/check-rules-coverage.mjs, which fails the run for any condition no case depends on.
const results: Array<ReturnType<typeof mutants>[number] & { killed: boolean }> = [];

afterAll(() => {
  writeFileSync(
    join(MUTANT_DIR, 'storage.json'),
    JSON.stringify({ rules: STORAGE_RULES, mutants: results }),
  );
});

describe('storage.rules mutants', () => {
  it('first, every case passes against the real rules', async () => {
    const env = await startStorageEnv();
    for (const c of CASES) expect(await matches(env, c), c.name).toBe(true);
    await env.cleanup();
  });

  it('then every condition is decided by at least one case', async () => {
    for (const m of mutants(STORAGE_RULES)) {
      const env = await startStorageEnv(apply(STORAGE_RULES, m));
      let killed = false;
      for (const c of CASES) {
        if (!(await matches(env, c))) {
          killed = true;
          break;
        }
      }
      await env.cleanup();
      results.push({ ...m, killed });
    }
    expect(results.length).toBeGreaterThan(0);
  }, 900_000);
});
