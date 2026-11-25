import type { Working } from '../../types';
import { fromMarkdown } from 'mdast-util-from-markdown';

/*
 * The agent never invents a media address (`.plan/22-desktop-studio.md`, "The agent's tools").
 * Media blocks take only a link the Educator typed (`media.ts`), but Markdown text could still
 * show a picture (`![shot](https://…)`), which learners' browsers would load. So every Markdown field is read
 * with the same parser the player uses, and a change that adds a picture address no field held
 * before is refused. Addresses the Educator already wrote stay, so the agent can still edit the
 * text around them.
 */

/** A node of the Markdown tree, read loosely: only what is needed to find pictures. */
interface MdNode {
  type: string;
  url?: string;
  value?: string;
  identifier?: string;
  children?: MdNode[];
}

/** Raw HTML that would show media; the player drops raw HTML, but it is refused all the same. */
const MEDIA_HTML = /<(?:img|picture|source|video|audio|iframe|embed|object)\b/i;
/** Cheap test before parsing: most text holds no picture at all. */
const MAYBE = /!\[|<(?:img|picture|source|video|audio|iframe|embed|object)\b/i;

/** The picture addresses in one Markdown text (raw media HTML counts as its own text). */
export function picturesIn(md: string): string[] {
  if (!MAYBE.test(md)) return [];
  const found: string[] = [];
  const defined = new Map<string, string>();
  const references: string[] = [];
  const walk = (node: MdNode) => {
    if (node.type === 'image') found.push(node.url as string);
    else if (node.type === 'imageReference') references.push(node.identifier as string);
    else if (node.type === 'definition') defined.set(node.identifier as string, node.url as string);
    else if (node.type === 'html' && MEDIA_HTML.test(node.value as string))
      found.push(node.value as string);
    node.children?.forEach(walk);
  };
  walk(fromMarkdown(md) as MdNode);
  // A reference only becomes a picture through its definition, so the parser made both.
  for (const ref of references) found.push(defined.get(ref) as string);
  return found;
}

/** Every Markdown text in the working copy, with where it is in words. */
function markdownFields(work: Working): { where: string; md: string }[] {
  const c = work.course;
  const out = [{ where: 'the course description', md: c.description }];
  for (const p of c.chapters)
    for (const item of p.items) {
      const called = `"${item.title}" (${item.id})`;
      if (item.type === 'lesson')
        for (const b of item.blocks) {
          const where = `lesson ${called}, block ${b.id}`;
          if (b.type === 'markdown' || b.type === 'callout') out.push({ where, md: b.md });
          if (b.type === 'check')
            for (const md of [b.prompt, b.explanation, ...b.options]) out.push({ where, md });
        }
      else
        for (const q of item.questions) {
          const where = `Quiz ${called}, question ${q.id}`;
          for (const md of [q.prompt, q.explanation, ...q.options.map((o) => o.text)])
            out.push({ where, md });
        }
    }
  return out;
}

const addresses = (work: Working): Set<string> =>
  new Set(markdownFields(work).flatMap((f) => picturesIn(f.md)));

/** Why the change adds a picture to Markdown text, or null when it does not. */
export function pictureProblem(before: Working, after: Working): string | null {
  const known = addresses(before);
  for (const field of markdownFields(after))
    if (picturesIn(field.md).some((address) => !known.has(address)))
      return `Nothing was changed: the text of ${field.where} shows a picture. A picture goes in an image block, never in text: add one with a link the Educator typed in the chat, or call add_todo to ask the Educator, saying what and where.`;
  return null;
}
