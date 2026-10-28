import { defineConfig } from 'vitest/config';

// Runs inside `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    // Rules coverage: one report per test file, merged by scripts/check-rules-coverage.mjs.
    globalSetup: ['test/coverage-global.ts'],
    setupFiles: ['test/coverage-setup.ts'],
  },
});
