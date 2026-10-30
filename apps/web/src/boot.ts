/** The loader painted by `index.html` before any script runs; it carries this id. */
export const BOOT_LOADER_ID = 'boot-loader';

/** Shortest time the boot loader stays, so a fast load never flashes it. */
export const BOOT_MIN_MS = 400;

/**
 * Fades the boot loader out and removes it, once the app knows who is signed in. Called whenever
 * the session settles; the first call wins and later ones find nothing to remove.
 */
export function hideBootLoader(
  now: number = performance.now(),
  doc: Document = document,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
): void {
  const loader = doc.getElementById(BOOT_LOADER_ID);
  if (!loader || loader.dataset.leaving) return;
  loader.dataset.leaving = 'true';
  schedule(
    () => {
      loader.classList.add('boot-loader--leaving');
      schedule(() => loader.remove(), 240);
    },
    Math.max(0, BOOT_MIN_MS - now),
  );
}
