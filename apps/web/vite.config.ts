import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { withShareImage } from './src/seo/shareImage.ts';

/** Adds the link-preview image tags to index.html, from the public address (VITE_SITE_URL). */
function shareImage(mode: string): Plugin {
  const siteUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL;
  return {
    name: 'gurukul-share-image',
    transformIndexHtml: (html) => withShareImage(html, siteUrl),
  };
}

/**
 * One id per build, written to dist/version.json and embedded as VITE_BUILD_ID, so an open tab can
 * tell a newer deploy is live (boot.ts). The release name on a production deploy, else the commit,
 * else the time; 'dev' on the dev server and in tests, which turns the check off.
 */
function buildId(command: string): string {
  if (command === 'serve') return 'dev';
  if (process.env.GURUKUL_RELEASE) return process.env.GURUKUL_RELEASE;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return String(Date.now());
  }
}

function versionFile(id: string): Plugin {
  return {
    name: 'gurukul-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id }) });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const id = buildId(command);
  return {
    plugins: [react(), shareImage(mode), versionFile(id)],
    define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(id) },
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
  };
});
