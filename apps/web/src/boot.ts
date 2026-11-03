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
 * Reloads unless this tab already reloaded in the last 30 seconds, so a build that keeps looking
 * stale can never reload in a loop. With no sessionStorage there is no way to stop a loop, so it
 * does nothing. Shared by both ways a tab learns it runs an old build.
 */
function reloadOnce(win: Window, event: string): void {
  try {
    const last = Number(win.sessionStorage.getItem(STALE_RELOAD_KEY));
    const now = Date.now();
    if (now - last < STALE_RELOAD_GAP_MS) return;
    win.sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    return;
  }
  log.warn(event);
  win.location.reload();
}

/**
 * A deploy replaces the hashed page files, so a tab opened before it asks for files that no longer
 * exist and the page fails to load. Vite reports that as `vite:preloadError`; reload once to fetch
 * the new build.
 */
export function reloadOnStaleBuild(win: Window = window): void {
  win.addEventListener('vite:preloadError', () =>
    reloadOnce(win, 'Page file missing, reloading for the new build'),
  );
}

/** How often a visible tab asks whether a newer build is live. */
export const VERSION_CHECK_MS = 10 * 60_000;

/** Pages where a reload would lose work: a Quiz being taken, any Studio editor. */
const BUSY_PATH = /^\/(courses\/[^/]+\/quiz\/|studio\/)/;

/**
 * A tab left open across a deploy keeps running the old code. When it becomes visible again, and
 * every ten minutes while visible, read `/version.json` (written by the build) and reload if it
 * names a different build. On a Quiz or Studio page, or offline, it waits for the next check
 * instead. Off on the dev server and in tests (`buildId` is 'dev' or absent).
 */
export function checkForNewBuild(buildId: string | undefined, win: Window = window): void {
  if (!buildId || buildId === 'dev') return;
  let warned = false;
  const check = async () => {
    if (win.document.visibilityState !== 'visible' || !win.navigator.onLine) return;
    if (BUSY_PATH.test(win.location.pathname)) return;
    let live: unknown;
    try {
      const res = await win.fetch('/version.json', { cache: 'no-store' });
      live = ((await res.json()) as { id?: unknown }).id;
    } catch {
      if (!warned) log.warn('Build version check failed');
      warned = true;
      return;
    }
    if (typeof live === 'string' && live !== buildId) {
      reloadOnce(win, 'Newer build is live, reloading');
    }
  };
  win.document.addEventListener('visibilitychange', () => void check());
  setInterval(() => void check(), VERSION_CHECK_MS);
}
