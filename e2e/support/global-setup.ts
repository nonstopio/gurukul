import { buildDesktopShell } from './desktop';
import { desktopSpecsSkipped } from './desktop-platform.mjs';
import { seedAndSnapshot } from './emulators';

/**
 * Runs once, after the emulators and the app are up: loads the Git course, and bundles the shell
 * where the desktop specs run (not on Windows: desktop-platform.mjs).
 */
export default async function globalSetup(): Promise<void> {
  await seedAndSnapshot();
  if (desktopSpecsSkipped(process.platform) === null) buildDesktopShell();
}
