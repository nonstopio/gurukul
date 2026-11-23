import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Download from '../src/desktop/download';
import { detectSystem, loadLatestRelease } from '../src/desktop/download';
import type { DesktopRelease } from '../src/desktop/download';
import { axeViolations } from './axe';
import { makeCourse } from './fake-data';
import { fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { TIPS } from '../src/tips/registry';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

// `test/setup.ts` stands in for the loader and the detection everywhere; these are the real ones.
const real = await vi.importActual<typeof Download>('../src/desktop/download');
const {
  toDesktopRelease,
  latestReleaseLoader,
  offerFor,
  DESKTOP_RELEASES_PAGE,
  RELEASE_KEY,
  RELEASE_TIMEOUT_MS,
} = real;

// The loader keeps its last answer for the tab as a fallback; each test starts in a fresh tab.
beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const BASE = 'https://github.com/nonstopio/gurukul/releases/download/desktop-v0.3.0/';
const asset = (name: string, url = `${BASE}${name}`) => ({ name, browser_download_url: url });
const ARM = 'Gurukul-Studio-0.3.0-arm64.dmg';
const INTEL = 'Gurukul-Studio-0.3.0-x64.dmg';
const WIN = 'Gurukul-Studio-Setup-0.3.0.exe';

const RELEASE: DesktopRelease = {
  version: '0.3.0',
  downloads: [
    { system: 'mac-arm', file: ARM, url: `${BASE}${ARM}` },
    { system: 'mac-intel', file: INTEL, url: `${BASE}${INTEL}` },
    { system: 'windows', file: WIN, url: `${BASE}${WIN}` },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('toDesktopRelease', () => {
  it('finds the three installers by their exact names and ignores everything else', () => {
    expect(
      toDesktopRelease({
        tag_name: 'desktop-v0.3.0',
        assets: [
          asset(WIN),
          asset('latest.yml'),
          asset('Gurukul-Studio-0.3.0-arm64.zip'),
          asset(`${ARM}.blockmap`),
          asset(INTEL),
          asset(ARM),
          null,
          { name: 7 },
        ],
      }),
    ).toEqual(RELEASE);
  });

  it('keeps only files that download from this repository’s release of that tag', () => {
    expect(
      toDesktopRelease({
        tag_name: 'desktop-v0.3.0',
        assets: [
          asset(ARM, `https://evil.example.com/${ARM}`),
          asset(
            INTEL,
            `https://github.com/nonstopio/gurukul/releases/download/desktop-v0.2.0/${INTEL}`,
          ),
          asset(WIN),
        ],
      }),
    ).toEqual({ version: '0.3.0', downloads: [RELEASE.downloads[2]] });
  });

  it('is null for a release that is not a desktop one or holds no installer it knows', () => {
    expect(toDesktopRelease(null)).toBeNull();
    expect(toDesktopRelease({ tag_name: 'release-2026-11-20', assets: [asset(ARM)] })).toBeNull();
    expect(toDesktopRelease({ tag_name: 'desktop-v0.3.0-beta.1', assets: [] })).toBeNull();
    expect(toDesktopRelease({ tag_name: 'desktop-v0.3.0', assets: 'none' })).toBeNull();
    expect(
      toDesktopRelease({ tag_name: 'desktop-v0.3.0', assets: [asset('notes.txt')] }),
    ).toBeNull();
    // A file named for another version is not this release's installer.
    expect(
      toDesktopRelease({
        tag_name: 'desktop-v0.3.0',
        assets: [asset('Gurukul-Studio-0.2.0-arm64.dmg')],
      }),
    ).toBeNull();
  });
});

describe('latestReleaseLoader', () => {
  const ANSWER = { tag_name: 'desktop-v0.3.0', assets: [asset(ARM), asset(INTEL), asset(WIN)] };

  const REFUSED = () => json({ message: 'rate limited' }, 403);

  it('asks GitHub every time, so a new release shows at once', async () => {
    const NEWER = {
      tag_name: 'desktop-v0.4.0',
      assets: [
        asset(
          'Gurukul-Studio-0.4.0-arm64.dmg',
          'https://github.com/nonstopio/gurukul/releases/download/desktop-v0.4.0/Gurukul-Studio-0.4.0-arm64.dmg',
        ),
      ],
    };
    const get = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(json(ANSWER))
      .mockResolvedValueOnce(json(NEWER));
    const load = latestReleaseLoader(get);
    expect(await load()).toEqual(RELEASE);
    expect((await load())?.version).toBe('0.4.0');
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith(
      'https://api.github.com/repos/nonstopio/gurukul/releases/latest',
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('gives up on GitHub after a while, ending the request, and falls back to the last answer', async () => {
    let fire: () => void = () => undefined;
    const cancel = vi.fn();
    const later = vi.fn((run: () => void) => {
      fire = run;
      return cancel;
    });
    const never = (_url: string, init: RequestInit) =>
      // GitHub never answers: only the end of the request settles it, as fetch does.
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const get = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(never)
      .mockResolvedValueOnce(json(ANSWER))
      .mockImplementationOnce(never);
    const load = latestReleaseLoader(get, later);
    const first = load();
    expect(later).toHaveBeenCalledWith(expect.any(Function), RELEASE_TIMEOUT_MS);
    expect(RELEASE_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    fire();
    expect(await first).toBeNull();
    expect(get.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expect(log.warn).toHaveBeenCalledWith('Desktop release lookup failed', { reason: 'timeout' });
    expect(sessionStorage.getItem(RELEASE_KEY)).toBeNull();
    // An answer in time stops the timer and is kept; the next timeout shows it.
    expect(await load()).toEqual(RELEASE);
    const third = load();
    fire();
    expect(await third).toEqual(RELEASE);
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it('keeps "no release yet" without calling it a failure', async () => {
    sessionStorage.setItem(RELEASE_KEY, JSON.stringify(ANSWER));
    const get = vi.fn(() => Promise.resolve(json({ message: 'Not Found' }, 404)));
    expect(await latestReleaseLoader(get)()).toBeNull();
    expect(sessionStorage.getItem(RELEASE_KEY)).toBe('null');
    expect(log.info).toHaveBeenCalledWith('No desktop release yet');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('falls back to the tab’s last answer when GitHub refuses (the rate limit)', async () => {
    const get = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(json(ANSWER))
      .mockResolvedValueOnce(REFUSED());
    // A reload starts with a new loader; the answer is in sessionStorage.
    expect(await latestReleaseLoader(get)()).toEqual(RELEASE);
    expect(await latestReleaseLoader(get)()).toEqual(RELEASE);
    expect(get).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith('Desktop release lookup failed', { status: 403 });
  });

  it('is null when GitHub cannot answer and the tab has no answer yet', async () => {
    for (const get of [
      () => Promise.resolve(REFUSED()),
      () => Promise.resolve(new Response('<html>', { status: 200 })),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]) {
      expect(await latestReleaseLoader(get)()).toBeNull();
      expect(sessionStorage.getItem(RELEASE_KEY)).toBeNull();
    }
    expect(log.warn).toHaveBeenCalledWith('Desktop release lookup failed', {
      reason: 'unreadable',
    });
    expect(log.warn).toHaveBeenCalledWith('Desktop release lookup failed', { reason: 'network' });
  });

  it('falls back to the last answer after a network failure or an unreadable answer', async () => {
    sessionStorage.setItem(RELEASE_KEY, JSON.stringify(ANSWER));
    for (const get of [
      () => Promise.resolve(new Response('<html>', { status: 200 })),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]) {
      expect(await latestReleaseLoader(get)()).toEqual(RELEASE);
    }
  });

  it('uses the browser’s fetch by default', async () => {
    const fetch = vi.fn(() => Promise.resolve(json(ANSWER)));
    vi.stubGlobal('fetch', fetch);
    expect(await latestReleaseLoader()()).toEqual(RELEASE);
    expect(await real.loadLatestRelease()).toEqual(RELEASE);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('checks a stored answer again, so an edited one points nowhere else', async () => {
    sessionStorage.setItem(
      RELEASE_KEY,
      JSON.stringify({
        tag_name: 'desktop-v0.3.0',
        assets: [asset(ARM, `https://evil.example.com/${ARM}`), asset(WIN)],
      }),
    );
    expect(await latestReleaseLoader(() => Promise.resolve(REFUSED()))()).toEqual({
      version: '0.3.0',
      downloads: [RELEASE.downloads[2]],
    });
  });

  it('is null when the stored text is unreadable', async () => {
    sessionStorage.setItem(RELEASE_KEY, '{');
    expect(await latestReleaseLoader(() => Promise.resolve(REFUSED()))()).toBeNull();
  });

  it('still answers when storage is blocked (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const get = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(json(ANSWER))
      .mockResolvedValueOnce(REFUSED());
    const load = latestReleaseLoader(get);
    expect(await load()).toEqual(RELEASE);
    expect(await load()).toBeNull();
  });
});

describe('detectSystem', () => {
  const highEntropy = (architecture?: string) => () =>
    Promise.resolve(architecture === undefined ? {} : { architecture });

  it('reads Chromium’s userAgentData, Intel or Apple Silicon on a Mac', async () => {
    expect(await real.detectSystem({ userAgentData: { platform: 'Windows' } })).toBe('windows');
    expect(
      await real.detectSystem({
        userAgentData: { platform: 'macOS', getHighEntropyValues: highEntropy('x86') },
      }),
    ).toBe('mac-intel');
    expect(
      await real.detectSystem({
        userAgentData: { platform: 'macOS', getHighEntropyValues: highEntropy('arm') },
      }),
    ).toBe('mac-arm');
    expect(
      await real.detectSystem({
        userAgentData: { platform: 'macOS', getHighEntropyValues: highEntropy() },
      }),
    ).toBe('mac-arm');
    expect(
      await real.detectSystem({
        userAgentData: {
          platform: 'macOS',
          getHighEntropyValues: () => Promise.reject(new Error('blocked')),
        },
      }),
    ).toBe('mac-arm');
    expect(await real.detectSystem({ userAgentData: { platform: 'Linux' } })).toBeNull();
  });

  it('falls back to the platform and user agent, taking a Mac to be Apple Silicon', async () => {
    expect(await real.detectSystem({ platform: 'MacIntel' })).toBe('mac-arm');
    expect(
      await real.detectSystem({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101',
      }),
    ).toBe('mac-arm');
    expect(await real.detectSystem({ platform: 'Win32' })).toBe('windows');
    expect(
      await real.detectSystem({
        platform: 'iPhone',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      }),
    ).toBeNull();
    expect(await real.detectSystem({ platform: 'Linux x86_64' })).toBeNull();
    // A Mac has no touch screen; a Windows laptop may, and stays Windows.
    expect(await real.detectSystem({ platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac-arm');
    expect(await real.detectSystem({ platform: 'Win32', maxTouchPoints: 10 })).toBe('windows');
    expect(await real.detectSystem({})).toBeNull();
  });

  it('takes an iPad, whose Safari says it is a Mac, to be no system the app is built for', async () => {
    expect(
      await real.detectSystem({
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBeNull();
  });

  it('reads the page’s own navigator by default', async () => {
    // jsdom says it is Linux.
    expect(await real.detectSystem()).toBeNull();
  });
});

describe('offerFor', () => {
  it('leads with the visitor’s installer and keeps the rest in order', () => {
    expect(offerFor(RELEASE, 'windows')).toEqual({
      first: RELEASE.downloads[2],
      others: [RELEASE.downloads[0], RELEASE.downloads[1]],
    });
  });

  it('leads with nothing for an unknown system, or one this release has no installer for', () => {
    expect(offerFor(RELEASE, null)).toEqual({ first: null, others: RELEASE.downloads });
    const macOnly = { version: '0.3.0', downloads: RELEASE.downloads.slice(0, 2) };
    expect(offerFor(macOnly, 'windows')).toEqual({ first: null, others: macOnly.downloads });
  });
});

describe('the download card in the browser Studio', () => {
  const studio = () =>
    fakeStudio({
      courses: [
        { live: makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] }), draft: null },
      ],
    });

  async function openWith(
    release: DesktopRelease | null,
    system: Awaited<ReturnType<typeof detectSystem>>,
  ) {
    vi.mocked(loadLatestRelease).mockResolvedValue(release);
    vi.mocked(detectSystem).mockResolvedValue(system);
    await openApp('/studio/desktop', { roles: ['educator'], studio: studio() });
    const card = await screen.findByRole('region', { name: 'Build a course by chatting' });
    // Settled: the request answered and the card drew what it found.
    await waitFor(() =>
      expect(within(card).queryByText('Looking for the latest version')).toBeNull(),
    );
    return card;
  }

  it('offers a Mac its installer first, with its version, its install steps and the others', async () => {
    const card = await openWith(RELEASE, 'mac-arm');
    expect(within(card).getByText('Version 0.3.0')).toBeTruthy();
    expect(within(card).getByText(/runs Claude Code on your computer/)).toBeTruthy();
    expect(
      within(card)
        .getByRole('link', { name: 'Download for macOS (Apple Silicon)' })
        .getAttribute('href'),
    ).toBe(`${BASE}${ARM}`);
    const steps = within(card).getByRole('region', { name: 'Install on macOS' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Open the downloaded .dmg file.',
      'Drag Gurukul Studio into the Applications folder.',
      'Open Gurukul Studio from Applications and sign in with your NonStop Google account.',
    ]);
    expect(within(card).getByText('Other installers:')).toBeTruthy();
    expect(
      within(card).getByRole('link', { name: 'Download for macOS (Intel)' }).getAttribute('href'),
    ).toBe(`${BASE}${INTEL}`);
    expect(
      within(card).getByRole('link', { name: 'Download for Windows' }).getAttribute('href'),
    ).toBe(`${BASE}${WIN}`);
    expect(within(card).getByRole('link', { name: 'All releases' }).getAttribute('href')).toBe(
      DESKTOP_RELEASES_PAGE,
    );
    // The feature tip's dot sits on the download itself.
    const tip = TIPS.find((t) => t.id === 'desktop-app') as (typeof TIPS)[number];
    expect(document.querySelector(tip.el)?.textContent).toBe('Download for macOS (Apple Silicon)');
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('gives Windows its own steps, SmartScreen included', async () => {
    const card = await openWith(RELEASE, 'windows');
    expect(within(card).getByRole('link', { name: 'Download for Windows' })).toBeTruthy();
    const steps = within(card).getByRole('region', { name: 'Install on Windows' });
    expect(steps.textContent).toMatch(/More info, then Run anyway/);
  });

  it('leads with no installer and guesses no steps for a system the app is not built for', async () => {
    const card = await openWith(RELEASE, null);
    expect(within(card).getByText(/runs on macOS and Windows/)).toBeTruthy();
    expect(within(card).getByText('Installers:')).toBeTruthy();
    expect(within(card).getAllByRole('link', { name: /^Download for/ })).toHaveLength(3);
    expect(within(card).queryByRole('region', { name: /^Install on/ })).toBeNull();
  });

  it('says so when this version has no installer for the visitor’s system', async () => {
    const card = await openWith(
      { version: '0.3.0', downloads: RELEASE.downloads.slice(0, 2) },
      'windows',
    );
    expect(within(card).getByText('This version has no installer for Windows yet.')).toBeTruthy();
    expect(within(card).queryByRole('region', { name: /^Install on/ })).toBeNull();
  });

  it('names no other installers when the visitor’s is the only one', async () => {
    const card = await openWith(
      { version: '0.3.0', downloads: RELEASE.downloads.slice(1, 2) },
      'mac-intel',
    );
    expect(within(card).getByRole('link', { name: 'Download for macOS (Intel)' })).toBeTruthy();
    expect(within(card).queryByText('Other installers:')).toBeNull();
    expect(within(card).getByRole('link', { name: 'All releases' })).toBeTruthy();
  });

  it('links to the releases page when there is no release it can read', async () => {
    const card = await openWith(null, 'mac-arm');
    expect(
      within(card)
        .getByRole('link', { name: 'Get Gurukul Studio from GitHub' })
        .getAttribute('href'),
    ).toBe(DESKTOP_RELEASES_PAGE);
    expect(within(card).queryByText(/^Version/)).toBeNull();
    const tip = TIPS.find((t) => t.id === 'desktop-app') as (typeof TIPS)[number];
    expect(document.querySelector(tip.el)?.textContent).toBe('Get Gurukul Studio from GitHub');
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('shows that it is looking until GitHub answers, and forgets an answer that comes too late', async () => {
    let answer: (r: DesktopRelease | null) => void = () => undefined;
    vi.mocked(loadLatestRelease).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const app = await openApp('/studio/desktop', { roles: ['educator'], studio: studio() });
    const card = await screen.findByRole('region', { name: 'Build a course by chatting' });
    expect(
      within(card).getByText('Looking for the latest version').closest('[aria-busy]'),
    ).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
    await act(async () => {
      await app.router.navigate('/studio/teams');
    });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Build a course by chatting' })).toBeNull(),
    );
    await act(async () => {
      answer(RELEASE);
      await Promise.resolve();
    });
    expect(screen.queryByText('Version 0.3.0')).toBeNull();
  });
});
