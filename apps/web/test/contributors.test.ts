import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Contributors from '../src/contributors';

const { loadContributors, toContributors } =
  await vi.importActual<typeof Contributors>('../src/contributors');

const AVATAR = 'https://avatars.githubusercontent.com/u/1?v=4';
const person = (login: string, extra: Record<string, unknown> = {}) => ({
  login,
  avatar_url: AVATAR,
  html_url: 'https://evil.example.com',
  type: 'User',
  ...extra,
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toContributors', () => {
  it('keeps people, builds the profile link from the login, and drops bots, AI agents and odd entries', () => {
    expect(
      toContributors([
        person('asha-rao'),
        person('dependabot[bot]'),
        person('semantic-release-bot'),
        person('robo', { type: 'Bot' }),
        person('claude'),
        person('Copilot'),
        person('elsewhere', { avatar_url: 'https://example.com/a.png' }),
        { login: 7 },
        { login: 'no-avatar' },
        null,
      ]),
    ).toEqual([
      { login: 'asha-rao', avatarUrl: AVATAR, profileUrl: 'https://github.com/asha-rao' },
    ]);
  });

  it('reads anything but a list as nobody', () => {
    expect(toContributors({ message: 'API rate limit exceeded' })).toEqual([]);
  });
});

describe('loadContributors', () => {
  it('fetches once per tab session and serves the next call from sessionStorage', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([person('asha-rao')]), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);
    const first = await loadContributors();
    expect(first.map((p) => p.login)).toEqual(['asha-rao']);
    expect(await loadContributors()).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      'https://api.github.com/repos/nonstopio/gurukul/contributors?per_page=20',
      { headers: { Accept: 'application/vnd.github+json' } },
    ]);
  });

  it('remembers a refusal (rate limit) as nobody, so the tab does not ask again', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}', { status: 403 })));
    vi.stubGlobal('fetch', fetch);
    expect(await loadContributors()).toEqual([]);
    expect(await loadContributors()).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not remember an offline failure, so the next call asks again', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify([person('asha-rao')]), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await loadContributors()).toEqual([]);
    expect((await loadContributors()).map((p) => p.login)).toEqual(['asha-rao']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again when the stored value is not a list', async () => {
    sessionStorage.setItem('gurukul.contributors', '{"login":"x"}');
    const fetch = vi.fn(() => Promise.resolve(new Response('[]', { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    expect(await loadContributors()).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows nobody when offline, and still answers when storage is blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(await loadContributors()).toEqual([]);
  });
});
