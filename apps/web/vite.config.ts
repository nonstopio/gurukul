import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { shareImageTags } from './src/seo/shareImage';

/** Adds the link-preview image tags to index.html, from the public address (VITE_SITE_URL). */
function shareImage(mode: string): Plugin {
  const siteUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL;
  return {
    name: 'gurukul-share-image',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta name="twitter:card"',
        `${shareImageTags(siteUrl)}\n    <meta name="twitter:card"`,
      ),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), shareImage(mode)],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Off on purpose. The changelog and global search collect files with import.meta.glob, and
    // the on-disk module cache keeps the expanded glob: a NEW entry or area file is then invisible
    // to the tests until the cache is cleared, and the "every file is collected" test fails on a
    // correct change. Measured: a new changelog entry was missing from CHANGES on the second run.
    fsModuleCache: false,
    // Matches the 5 s wait in test/setup.ts with room to spare: a wait that is allowed to last 5 s
    // must not be cut off by the 5 s default test timeout.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
}));
