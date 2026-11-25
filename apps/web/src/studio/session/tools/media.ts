import type { Working } from '../../types';
import type { Block } from '@gurukul/schema';
import { isEmbedAllowed, videoEmbedUrl } from '@gurukul/schema';

/*
 * The agent adds a video, image or embed block only with an address the Educator typed in this
 * session's chat (`.plan/22-desktop-studio.md`, "The agent's tools"). The runtime reads the
 * addresses out of the Educator's own messages (`linksIn`) and hands them to the tools as
 * `ctx.educatorLinks`; `mediaProblem` refuses any change that gives a media block an address that
 * is neither there nor already in the course. Files stay out of reach: no tool takes a file block.
 */

/** Characters that end a sentence or wrap a link rather than belong to it. */
const TRAILING = /[.,;:!?\]}>*]$/;
const LINK = /https?:\/\/[^\s<>"'`]+/gi;

/** The address in the form both sides are compared in, or null when it is not a web address. */
export function normalLink(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
}

/** One address as written in a sentence, with the punctuation after it taken off. */
function trimLink(raw: string): string {
  let link = raw;
  for (;;) {
    if (TRAILING.test(link)) link = link.slice(0, -1);
    // A closing bracket belongs to the link only when the link opened one: `…/Rust_(language)`.
    else if (link.endsWith(')') && link.split('(').length < link.split(')').length)
      link = link.slice(0, -1);
    else return link;
  }
}

/** Every http(s) address in the texts, normalised; the Educator's own messages in the app. */
export function linksIn(texts: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const text of texts)
    for (const [raw] of text.matchAll(LINK)) {
      const link = normalLink(trimLink(raw));
      if (link) found.add(link);
    }
  return found;
}

/** The video host whose player takes this link, or null when none does. */
export function videoProvider(url: string): 'youtube' | 'loom' | 'drive' | null {
  for (const provider of ['youtube', 'loom', 'drive'] as const)
    if (videoEmbedUrl(provider, url) !== null) return provider;
  return null;
}

const isHttps = (url: string) => normalLink(url)?.startsWith('https:') === true;

/**
 * Why a media block the agent wrote would not play or show, or null. The same checks Studio's
 * editors and publishing apply (`packages/schema/src/draft.ts`); a new block's video host is set
 * here from its link. Other blocks pass as they are.
 */
export function mediaBlockProblem(block: Block): string | null {
  switch (block.type) {
    case 'video':
      return videoProvider(block.url) === null
        ? 'That link is not a YouTube, Loom or Google Drive video Gurukul can play. If its host is on the embed list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz), add it as an embed block; otherwise call add_todo to ask the Educator.'
        : null;
    case 'image':
      return isHttps(block.url)
        ? null
        : 'An image link must start with https://. Call add_todo to ask the Educator for one that does.';
    case 'embed':
      return isEmbedAllowed(block.url)
        ? null
        : 'That address is not on the embed list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz), so learners would see nothing. Call add_todo to ask the Educator instead.';
    default:
      return null;
  }
}

/** Every media block's address in the working copy, with where it is in words. */
function mediaFields(work: Working): { where: string; url: string }[] {
  const out: { where: string; url: string }[] = [];
  for (const p of work.course.chapters)
    for (const item of p.items)
      if (item.type === 'lesson')
        for (const b of item.blocks)
          if (b.type === 'video' || b.type === 'image' || b.type === 'embed' || b.type === 'file')
            out.push({ where: `lesson "${item.title}" (${item.id}), block ${b.id}`, url: b.url });
  return out;
}

/** The address as compared: normalised when it is a web address, else as written. */
const key = (url: string) => normalLink(url) ?? url;

/** Every media address the working copy holds, as compared. */
export const mediaAddresses = (work: Working): Set<string> =>
  new Set(mediaFields(work).map((f) => key(f.url)));

/** The two addresses are the same once normalised. */
export const sameAddress = (a: string, b: string): boolean => key(a) === key(b);

/**
 * Why the change gives a media block an address the Educator did not type in this session, or
 * null. An address the course already held (a block kept or moved) is never new.
 */
export function mediaProblem(
  before: Working,
  after: Working,
  links: ReadonlySet<string>,
): string | null {
  const known = mediaAddresses(before);
  for (const { where, url } of mediaFields(after)) {
    const address = key(url);
    if (!known.has(address) && !links.has(address))
      return `Nothing was changed: ${where} links to an address the Educator did not give in this session's chat. Use only a link the Educator typed, exactly as given; never one you made up, found in a source file or wrote yourself. Otherwise call add_todo to ask for it, saying what and where.`;
  }
  return null;
}
