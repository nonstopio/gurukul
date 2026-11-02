import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

/** A fresh emulator environment loaded with firestore.rules. */
export function startEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-gurukul',
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  });
}

/** A signed-in NonStop account with optional role claims. */
export function nonstop(
  env: RulesTestEnvironment,
  uid: string,
  claims: Record<string, unknown> = {},
) {
  return env
    .authenticatedContext(uid, {
      email: `${uid}@nonstopio.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      ...claims,
    })
    .firestore();
}

export const STORAGE_RULES = readFileSync(
  resolve(import.meta.dirname, '../../storage.rules'),
  'utf8',
);

/**
 * A fresh emulator environment with `storage.rules` (or other Storage rules, for a mutant) and
 * `firestore.rules`: Storage rules read the course and `config/org` from Firestore.
 */
export function startStorageEnv(storageRules = STORAGE_RULES): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-gurukul',
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
    storage: { rules: storageRules },
  });
}
