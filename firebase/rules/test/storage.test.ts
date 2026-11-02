import { type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { startStorageEnv } from './helpers';
import { CASES, run } from './storage/cases';

// storage.rules against the Storage emulator. Each case is one request and the answer the rules owe it;
// the cases cover every condition with an allowed and a denied request (see storage/cases.ts).
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await startStorageEnv();
});
afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules', () => {
  for (const c of CASES) {
    it(`${c.expect === 'allow' ? 'allows' : 'denies'}: ${c.name}`, () => run(env, c));
  }
});
