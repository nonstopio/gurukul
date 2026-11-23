import { log } from '../log';

/**
 * Where Gurukul Studio's installers come from, for the download card in Studio
 * (`.plan/22-desktop-studio.md`, Download). The desktop app's releases are this repository's
 * GitHub Releases, tagged `desktop-vX.Y.Z`; the web app pushes tags only, never releases, so the
 * latest release is always a desktop one. No key, no Firestore: one public request each time the card
 * is drawn.
 */

/** The systems Gurukul Studio is built for, in the order they are offered when nothing says otherwise. */
export type DesktopSystem = 'mac-arm' | 'mac-intel' | 'windows';

export interface DesktopDownload {
  system: DesktopSystem;
  /** The installer's file name, as `apps/desktop/electron-builder.yml` writes it. */
  file: string;
  url: string;
}

export interface DesktopRelease {
  /** The tag without `desktop-v`: `0.3.0`. */
  version: string;
  /** The installers this release has, Apple Silicon, Intel, Windows, in that order. */
  downloads: DesktopDownload[];
}

/**
 * Every desktop release, newest first: where to go when the card cannot name an installer, and
 * where a browser that opens a session's link is sent for the app (`SessionRoute`).
 */
export const DESKTOP_RELEASES_PAGE = 'https://github.com/nonstopio/gurukul/releases';

/** How long the card waits for GitHub before it links to the releases page instead. */
export const RELEASE_TIMEOUT_MS = 8000;

const LATEST_API = 'https://api.github.com/repos/nonstopio/gurukul/releases/latest';
const DOWNLOADS = 'https://github.com/nonstopio/gurukul/releases/download/';
// Desktop releases are never prereleases (the updater would skip them), so a plain version.
const TAG = /^desktop-v(\d+\.\d+\.\d+)$/;

/** The file names `electron-builder.yml` gives each installer (`artifactName`), by system. */
const FILES: readonly [DesktopSystem, (version: string) => string][] = [
  ['mac-arm', (v) => `Gurukul-Studio-${v}-arm64.dmg`],
  ['mac-intel', (v) => `Gurukul-Studio-${v}-x64.dmg`],
  ['windows', (v) => `Gurukul-Studio-Setup-${v}.exe`],
];

/** How a system is named on screen. */
export const SYSTEM_NAMES: Record<DesktopSystem, string> = {
  'mac-arm': 'macOS (Apple Silicon)',
  'mac-intel': 'macOS (Intel)',
  windows: 'Windows',
};

/**
 * GitHub's latest release → the version and the installers in it, or null when it is not a desktop
 * release or holds none of the three. A file counts only under its exact name and only when it
 * downloads from this repository's release of that tag; anything else in the answer is ignored.
 */
export function toDesktopRelease(data: unknown): DesktopRelease | null {
  const { tag_name: tag, assets } = (data ?? {}) as Record<string, unknown>;
  const version = typeof tag === 'string' ? TAG.exec(tag)?.[1] : undefined;
  if (!version || !Array.isArray(assets)) return null;
  const urls = new Map<string, string>();
  for (const asset of assets as unknown[]) {
    const { name, browser_download_url: url } = (asset ?? {}) as Record<string, unknown>;
    if (typeof name === 'string' && url === `${DOWNLOADS}${String(tag)}/${name}`)
      urls.set(name, url);
  }
  const downloads = FILES.flatMap(([system, fileFor]): DesktopDownload[] => {
    const file = fileFor(version);
    const url = urls.get(file);
    return url ? [{ system, file, url }] : [];
  });
  return downloads.length ? { version, downloads } : null;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Starts `run` after `ms`; returns what cancels it. Tests play it by hand. */
type Later = (run: () => void, ms: number) => () => void;

const afterTimeout: Later = (run, ms) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

/**
 * Key in sessionStorage holding the tab's last answer from GitHub, in GitHub's shape, so reading it
 * checks it again. Only a fallback: it is shown when GitHub cannot answer, never instead of asking.
 */
export const RELEASE_KEY = 'gurukul.desktopRelease';

/** A release back in the shape GitHub gave it, with only the installers kept. */
function toAnswer(release: DesktopRelease | null) {
  return (
    release && {
      tag_name: `desktop-v${release.version}`,
      assets: release.downloads.map(({ file, url }) => ({ name: file, browser_download_url: url })),
    }
  );
}

/**
 * The tab's last answer, or null when there is none (or storage is off or holds something
 * unreadable). Stored text is read through `toDesktopRelease` again, so an edited value can never
 * point a download anywhere else.
 */
function lastKnown(): DesktopRelease | null {
  try {
    const raw = sessionStorage.getItem(RELEASE_KEY);
    return raw === null ? null : toDesktopRelease(JSON.parse(raw));
  } catch {
    return null;
  }
}

function keep(release: DesktopRelease | null): DesktopRelease | null {
  try {
    sessionStorage.setItem(RELEASE_KEY, JSON.stringify(toAnswer(release)));
  } catch {
    // Storage off (private mode): nothing to fall back on next time, which is all it costs.
  }
  return release;
}

/**
 * A loader for the latest desktop release that asks GitHub every time it is called, so a release
 * shows the moment it is published. GitHub's answer (a release, or none yet: 404) is kept in
 * sessionStorage. When GitHub cannot answer (its limit of 60 unauthenticated calls an hour per
 * address, which an office's Educators share; a network failure; no answer in `RELEASE_TIMEOUT_MS`,
 * when the request is ended; an unreadable answer) the tab's last answer is used instead, or null
 * when it has none. Never throws.
 */
export function latestReleaseLoader(
  get: Fetch = (url, init) => fetch(url, init),
  later: Later = afterTimeout,
) {
  return async (): Promise<DesktopRelease | null> => {
    let res: Response;
    const controller = new AbortController();
    const stop = later(() => controller.abort(), RELEASE_TIMEOUT_MS);
    try {
      res = await get(LATEST_API, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
    } catch {
      log.warn('Desktop release lookup failed', {
        reason: controller.signal.aborted ? 'timeout' : 'network',
      });
      return lastKnown();
    } finally {
      stop();
    }
    if (res.status === 404) {
      // Not a failure: no desktop release has been published yet.
      log.info('No desktop release yet');
      return keep(null);
    }
    if (!res.ok) {
      log.warn('Desktop release lookup failed', { status: res.status });
      return lastKnown();
    }
    try {
      return keep(toDesktopRelease(await res.json()));
    } catch {
      log.warn('Desktop release lookup failed', { reason: 'unreadable' });
      return lastKnown();
    }
  };
}

/** The page's one loader. */
export const loadLatestRelease = latestReleaseLoader();

/** The parts of `navigator` the card reads; `userAgentData` is Chromium's and not in the DOM types. */
export interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
}

/**
 * The visitor's own system, or null when it is none Gurukul Studio is built for (Linux, a phone,
 * an iPad). Chromium says so through `userAgentData`, and on a Mac whether the chip is Intel
 * (`x86`). Other browsers say only "Mac", and Safari says "MacIntel" on Apple Silicon too: a Mac is
 * taken to be Apple Silicon, what every Mac sold since 2020 has, and the Intel installer is offered
 * beside it. An iPad's Safari says "MacIntel" and "Macintosh" as well; only its touch screen
 * (`maxTouchPoints` above 1, where a Mac has none) tells it apart.
 */
export async function detectSystem(
  nav: NavigatorLike = navigator as NavigatorLike,
): Promise<DesktopSystem | null> {
  const data = nav.userAgentData;
  const said = `${data?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`.toLowerCase();
  if (/iphone|ipad|android/.test(said)) return null;
  if (/\bwin/.test(said)) return 'windows'; // not "darwin", which jsdom reports on a Mac
  if (!said.includes('mac') || (nav.maxTouchPoints ?? 0) > 1) return null;
  try {
    const { architecture } = (await data?.getHighEntropyValues?.(['architecture'])) ?? {};
    return architecture === 'x86' ? 'mac-intel' : 'mac-arm';
  } catch {
    return 'mac-arm';
  }
}

/**
 * The installer to offer first and the rest. `first` is the visitor's own system's installer, or
 * null when their system is unknown or this release has none for it; `others` keep the release's
 * order.
 */
export function offerFor(
  release: DesktopRelease,
  system: DesktopSystem | null,
): { first: DesktopDownload | null; others: DesktopDownload[] } {
  const first = release.downloads.find((d) => d.system === system) ?? null;
  return { first, others: release.downloads.filter((d) => d !== first) };
}
