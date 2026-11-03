import { log } from './log';

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

/** Key in sessionStorage holding when this tab last reloaded for a missing page file. */
export const STALE_RELOAD_KEY = 'gurukul.staleReloadAt';

/** A second missing file this soon after reloading is a real fault, not an old tab: show the error. */
const STALE_RELOAD_GAP_MS = 30_000;

/**
 * A deploy replaces the hashed page files, so a tab opened before it asks for files that no longer
 * exist and the page fails to load. Vite reports that as `vite:preloadError`; reload once to fetch
 * the new build. With no sessionStorage there is no way to stop a loop, so the error page stays.
 */
export function reloadOnStaleBuild(win: Window = window): void {
  win.addEventListener('vite:preloadError', () => {
    try {
      const last = Number(win.sessionStorage.getItem(STALE_RELOAD_KEY));
      const now = Date.now();
      if (now - last < STALE_RELOAD_GAP_MS) return;
      win.sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
    } catch {
      return;
    }
    log.warn('Page file missing, reloading for the new build');
    win.location.reload();
  });
}
