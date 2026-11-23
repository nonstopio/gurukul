import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** True for an absolute http, https or mailto address: the only links a text may carry. */
export function isSafeLinkUrl(url: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(url.trim()).protocol);
  } catch {
    return false;
  }
}

function tree(md: string): Nodes {
  return fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

/** The tree without positions, which differ whenever the spelling does. */
const bare = (node: Nodes): string =>
  JSON.stringify(node, (key, value: unknown) => (key === 'position' ? undefined : value));

/** Raw HTML and links to addresses the editor refuses are not something Visual mode may keep. */
function hasUnkeepable(node: Nodes): boolean {
  if (node.type === 'html') return true;
  if (node.type === 'link' && !isSafeLinkUrl(node.url)) return true;
  return 'children' in node && node.children.some((child) => hasUnkeepable(child));
}

/**
 * Whether Visual mode can hold `original` without changing what it says: `original` and the
 * Markdown the visual editor wrote back parse to the same tree (positions ignored), and
 * `original` has no raw HTML or link the editor would drop.
 */
export function keepsMeaning(original: string, rewritten: string): boolean {
  const before = tree(original);
  return !hasUnkeepable(before) && bare(before) === bare(tree(rewritten));
}
