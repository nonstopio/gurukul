import { log } from '../log';

/**
 * Where Gurukul Studio's installers come from, for the download card in Studio
 * (`.plan/22-desktop-studio.md`, Download). The desktop app's releases are this repository's
 * GitHub Releases, tagged `desktop-vX.Y.Z`; the web app pushes tags only, never releases, so the
 * latest release is always a desktop one. No key, no Firestore: one public request per page.
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

/** Every desktop release, newest first: where to go when the card cannot name an installer. */
export const DESKTOP_RELEASES_PAGE = 'https://github.com/nonstopio/gurukul/releases';

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

/**
 * A loader for the latest desktop release, remembered for the life of the page: the card asks
 * once however often it is drawn (GitHub allows 60 unauthenticated calls an hour per address).
 * A refusal (no release yet, the rate limit) is remembered as null too; a network failure is
 * not, so the next card tries again. Never throws.
 */
export function latestReleaseLoader(get: Fetch = (url, init) => fetch(url, init)) {
  let kept: Promise<DesktopRelease | null> | null = null;
  const ask = async (): Promise<DesktopRelease | null> => {
    let res: Response;
    try {
      res = await get(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    } catch {
      log.warn('Desktop release lookup failed', { reason: 'network' });
      kept = null;
      return null;
    }
    if (res.status === 404) {
      // Not a failure: no desktop release has been published yet.
      log.info('No desktop release yet');
      return null;
    }
    if (!res.ok) {
      log.warn('Desktop release lookup failed', { status: res.status });
      return null;
    }
    try {
      return toDesktopRelease(await res.json());
    } catch {
      log.warn('Desktop release lookup failed', { reason: 'unreadable' });
      return null;
    }
  };
  return (): Promise<DesktopRelease | null> => (kept ??= ask());
}

/** The page's one loader. */
export const loadLatestRelease = latestReleaseLoader();

/** The parts of `navigator` the card reads; `userAgentData` is Chromium's and not in the DOM types. */
export interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
}

/**
 * The visitor's own system, or null when it is none Gurukul Studio is built for (Linux, a phone).
 * Chromium says so through `userAgentData`, and on a Mac whether the chip is Intel (`x86`). Other
 * browsers say only "Mac", and Safari says "MacIntel" on Apple Silicon too: a Mac is taken to be
 * Apple Silicon, what every Mac sold since 2020 has, and the Intel installer is offered beside it.
 */
export async function detectSystem(
  nav: NavigatorLike = navigator as NavigatorLike,
): Promise<DesktopSystem | null> {
  const data = nav.userAgentData;
  const said = `${data?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`.toLowerCase();
  if (/iphone|ipad|android/.test(said)) return null;
  if (said.includes('win')) return 'windows';
  if (!said.includes('mac')) return null;
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
