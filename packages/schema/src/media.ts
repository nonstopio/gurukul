/** Where lesson media may come from. Shared so the player and the Studio's validation agree. */

export const EMBED_HOSTS = [
  'www.youtube-nocookie.com',
  'www.youtube.com',
  'youtu.be',
  'www.loom.com',
  'drive.google.com',
  'codesandbox.io',
  'stackblitz.com',
];

/** Embeds only from the allow-list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz). */
export function isEmbedAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && EMBED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The iframe URL for a video block, or null when the link is not one this provider can embed
 * (the player then shows the plain "open in a new tab" link instead).
 */
export function videoEmbedUrl(provider: 'youtube' | 'drive' | 'loom', url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (provider === 'youtube') {
    const id =
      u.hostname === 'youtu.be'
        ? u.pathname.slice(1)
        : /^(www\.)?youtube(-nocookie)?\.com$/.test(u.hostname)
          ? u.pathname.startsWith('/embed/')
            ? u.pathname.slice('/embed/'.length)
            : u.searchParams.get('v')
          : null;
    return id && /^[\w-]{3,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (provider === 'loom') {
    const m = /^\/(?:share|embed)\/([\w-]+)/.exec(u.pathname);
    return u.hostname === 'www.loom.com' && m ? `https://www.loom.com/embed/${m[1]}` : null;
  }
  const m = /^\/file\/d\/([\w-]+)/.exec(u.pathname);
  return u.hostname === 'drive.google.com' && m
    ? `https://drive.google.com/file/d/${m[1]}/preview`
    : null;
}
