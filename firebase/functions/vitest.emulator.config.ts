import { defineConfig } from 'vitest/config';

// Trigger tests against the Firestore emulator. Runs inside `firebase emulators:exec`, which sets
// FIRESTORE_EMULATOR_HOST. No coverage: the unit suite (vitest.config.ts) owns the 100% gate.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['emulator-test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
