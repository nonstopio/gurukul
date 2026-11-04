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
 * does nothing.
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

/** How often an open tab asks whether a newer build is live (browsers slow this in background tabs). */
export const VERSION_CHECK_MS = 10 * 60_000;

/**
 * A newer build is live. `soft`: offer it, the person picks when. `hard`: the live build's
 * required-update number is above this tab's, so this tab must stop until it reloads.
 */
export interface Update {
  kind: 'soft' | 'hard';
  /** The live build's id. */
  id: string;
}

/**
 * What the live `/version.json` means for a tab built as `id` with required-update number
 * `required`. A file from before the number existed counts as 0; one without a string id is ignored.
 */
export function updateFor(id: string, required: number, live: unknown): Update | null {
  const file = (live ?? {}) as { id?: unknown; required?: unknown };
  if (typeof file.id !== 'string') return null;
  const liveRequired = typeof file.required === 'number' ? file.required : 0;
  if (liveRequired > required) return { kind: 'hard', id: file.id };
  return file.id === id ? null : { kind: 'soft', id: file.id };
}

/**
 * A tab left open across a deploy keeps running the old code. When it becomes visible again, and
 * every ten minutes whether visible or not, read `/version.json` (written by the build) and hand any
 * update to `onUpdate`; nothing reloads by itself. Hidden tabs check too: a background tab running a
 * broken build is the one a required update most needs to stop. Offline it waits for the next check; after a hard
 * update it stops checking. Off on the dev server and in tests (`buildId` is 'dev' or absent).
 */
export function checkForNewBuild(
  buildId: string | undefined,
  required: number,
  onUpdate: (update: Update) => void,
  win: Window = window,
): void {
  if (!buildId || buildId === 'dev') return;
  let warned = false;
  let stopped = false;
  const check = async () => {
    if (stopped || !win.navigator.onLine) return;
    let live: unknown;
    try {
      const res = await win.fetch('/version.json', { cache: 'no-store' });
      live = await res.json();
    } catch {
      if (!warned) log.warn('Build version check failed');
      warned = true;
      return;
    }
    const update = updateFor(buildId, required, live);
    if (!update) return;
    stopped = update.kind === 'hard';
    onUpdate(update);
  };
  win.document.addEventListener('visibilitychange', () => void check());
  setInterval(() => void check(), VERSION_CHECK_MS);
}
