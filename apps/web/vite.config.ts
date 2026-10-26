import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Off on purpose. The changelog and global search collect files with import.meta.glob, and
    // the on-disk module cache keeps the expanded glob: a NEW entry or area file is then invisible
    // to the tests until the cache is cleared, and the "every file is collected" test fails on a
    // correct change. Measured: a new changelog entry was missing from CHANGES on the second run.
    fsModuleCache: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
