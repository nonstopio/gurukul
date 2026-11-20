/**
 * Where the desktop specs (e2e/tests/desktop-studio.spec.ts) run. They put the fake `claude` on
 * PATH as a POSIX `#!/bin/sh` wrapper, bundle the shell with `npx` run without a shell, and draw
 * the window with Chromium's Linux-only headless mode. Windows has none of these, so there the
 * desktop specs are skipped and the shell is not bundled, and `npm run e2e` (and the pre-push hook
 * that runs it) still runs every web spec. CI runs them on Linux.
 *
 * Plain JavaScript so the tooling tests (`npm run test:tooling`) can check it without a build.
 *
 * @param {string} platform `process.platform`
 * @returns {string | null} why the desktop specs do not run here, or null when they do
 */
export function desktopSpecsSkipped(platform) {
  return platform === 'win32'
    ? 'the fake claude wrapper and headless window are POSIX-only; CI runs these specs on Linux'
    : null;
}
