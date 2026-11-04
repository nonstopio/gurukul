/** A person who committed to the public repository, as the shell's foot shows them. */
export interface Contributor {
  login: string;
  /** Always on avatars.githubusercontent.com; anything else is dropped. */
  avatarUrl: string;
  /** Their GitHub profile, built from the login rather than taken from the response. */
  profileUrl: string;
}

const API = 'https://api.github.com/repos/nonstopio/gurukul/contributors?per_page=20';
const KEY = 'gurukul.contributors';
const AVATARS = 'https://avatars.githubusercontent.com/';
// Some bots (semantic-release-bot) report type "User", so bot-suffixed logins go too, and so do
// AI coding agents, which GitHub credits as users from a commit's Co-Authored-By line.
const BOT = /(\[bot\]|-bot)$/i;
const AGENTS = new Set(['claude', 'copilot']);

/** GitHub's contributor list → the people to show: no bots or AI agents, only well-formed entries. */
export function toContributors(data: unknown): Contributor[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((c: unknown) => {
    const { login, avatar_url: avatar, type } = (c ?? {}) as Record<string, unknown>;
    if (typeof login !== 'string' || typeof avatar !== 'string') return [];
    if (
      type === 'Bot' ||
      BOT.test(login) ||
      AGENTS.has(login.toLowerCase()) ||
      !avatar.startsWith(AVATARS)
    )
      return [];
    return [
      {
        login,
        avatarUrl: avatar,
        profileUrl: `https://github.com/${encodeURIComponent(login)}`,
      },
    ];
  });
}

function cached(): Contributor[] | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? (list as Contributor[]) : null;
  } catch {
    return null;
  }
}

/**
 * The repository's contributors, best effort: fetched once per tab session (GitHub allows 60
 * unauthenticated calls an hour per address) and kept in sessionStorage. A refusal (rate limit) is
 * kept too, as `[]`, so the tab does not keep asking; a network failure (offline) is not, so the
 * next mount tries again. Never throws; nothing to show is `[]`.
 */
export async function loadContributors(): Promise<Contributor[]> {
  const hit = cached();
  if (hit) return hit;
  let people: Contributor[] = [];
  try {
    const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.ok) people = toContributors(await res.json());
  } catch {
    // Offline or blocked: nothing to show now, and nothing remembered.
    return [];
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(people));
  } catch {
    // Storage off (private mode): the next mount asks again.
  }
  return people;
}
