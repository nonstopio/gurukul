import { z } from 'zod';

/*
 * Parts of the course attached to a message (`DSK-20`, `.plan/22-desktop-studio.md`, The session
 * workspace, "Click a block"): the Educator presses Attach on a block or a question in the preview,
 * or on a chapter, a lesson or a Quiz in the outline, and the next message carries it. The agent
 * gets each one's ids, so "make this shorter" needs no explanation; the chat shows its plain label.
 * Review's "Ask for a change" (`DSK-14`) attaches its row the same way, through the runtime's
 * `attach`.
 */

/** Most parts one message carries: enough to point at, short enough to stay under the shell's limit. */
export const MAX_ATTACHMENTS = 10;

/** Longest label kept, in characters; a longer one is cut on a word with "…". */
export const ATTACHMENT_LABEL_MAX = 120;

/** The ids are the course's own, as the agent's tools name them (`search_course` gives the same). */
const id = z.string().min(1).max(80);
const label = z.string().min(1).max(ATTACHMENT_LABEL_MAX);

/**
 * One attached part: what it is (`kind`), its ids, and what it is called in plain words
 * ("Lesson 3.2 · Text block 2"). Kept in the transcript with the message that carried it.
 */
export const attachTargetSchema = z.discriminatedUnion('kind', [
  /** The course details: title, description, outcomes, level, cover. */
  z.strictObject({ kind: z.literal('course'), ids: z.strictObject({}), label }),
  /** The landing page. */
  z.strictObject({ kind: z.literal('landing'), ids: z.strictObject({}), label }),
  z.strictObject({ kind: z.literal('chapter'), ids: z.strictObject({ chapterId: id }), label }),
  /** A lesson or a Quiz. */
  z.strictObject({ kind: z.literal('item'), ids: z.strictObject({ itemId: id }), label }),
  /** A block of a lesson. */
  z.strictObject({
    kind: z.literal('block'),
    ids: z.strictObject({ itemId: id, blockId: id }),
    label,
  }),
  /** A question of a Quiz. */
  z.strictObject({
    kind: z.literal('question'),
    ids: z.strictObject({ itemId: id, questionId: id }),
    label,
  }),
]);
export type AttachTarget = z.infer<typeof attachTargetSchema>;
export type AttachKind = AttachTarget['kind'];

/** One key per attachable part, whatever its label: `block:l1:b2`. */
export function attachmentKey(target: Pick<AttachTarget, 'kind' | 'ids'>): string {
  return [target.kind, ...Object.values(target.ids)].join(':');
}

/** A label cut to `ATTACHMENT_LABEL_MAX` on a word, on one line. Never empty. */
export function attachmentLabel(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim() || 'Untitled';
  if (flat.length <= ATTACHMENT_LABEL_MAX) return flat;
  const cut = flat.slice(0, ATTACHMENT_LABEL_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > ATTACHMENT_LABEL_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The target as kept: a label made safe, the rest checked. Null when its ids are not ids. */
export function cleanTarget(target: AttachTarget): AttachTarget | null {
  const parsed = attachTargetSchema.safeParse({ ...target, label: attachmentLabel(target.label) });
  return parsed.success ? parsed.data : null;
}

/**
 * What the agent is told ahead of the Educator's words when the message carries attachments: one
 * line per part, its plain label and then its kind and ids as JSON, which the system prompt
 * explains ("Attached parts of the course"). Empty when nothing is attached.
 */
export function attachmentNote(targets: readonly AttachTarget[]): string {
  if (targets.length === 0) return '';
  const lines = targets.map((t) => `- ${t.label}: ${JSON.stringify({ kind: t.kind, ...t.ids })}`);
  return `[From Gurukul: the Educator attached ${
    targets.length === 1 ? 'this part' : 'these parts'
  } of the course to the message below. "This", "it" and "here" in it mean ${
    targets.length === 1 ? 'this part' : 'these parts'
  }.]\n${lines.join('\n')}\n\n`;
}

/** The words for what is attached, in labels (`Lesson 3.2 · Text block 2`). */
export interface AttachWords {
  /** "Lesson" (never a label set's name: lessons have one name). */
  lesson: string;
  /** `useTerms().Quiz`: "Quiz" or "Pariksha". */
  quiz: string;
  /** `useTerms().Chapter`. */
  chapter: string;
}

const named = (prefix: string, title: string) =>
  attachmentLabel(title.trim() === '' ? prefix : `${prefix} · ${title}`);

/** "Chapter 2 · Rebase". */
export function chapterTarget(
  words: AttachWords,
  chapter: { id: string; title: string },
  number: string,
): AttachTarget {
  return {
    kind: 'chapter',
    ids: { chapterId: chapter.id },
    label: named(`${words.chapter} ${number}`, chapter.title),
  };
}

/** "Lesson 3.2 · Rebase before you raise a pull request", "Quiz 3.4 · Check your rebase". */
export function itemTarget(
  words: AttachWords,
  item: { id: string; type: 'lesson' | 'quiz'; title: string },
  number: string,
): AttachTarget {
  const kind = item.type === 'lesson' ? words.lesson : words.quiz;
  return { kind: 'item', ids: { itemId: item.id }, label: named(`${kind} ${number}`, item.title) };
}

/** "Lesson 3.2 · Text block 2": the block's place among all the lesson's blocks. */
export function blockTarget(
  words: AttachWords,
  itemId: string,
  number: string,
  block: { id: string },
  blockWords: string,
  position: number,
): AttachTarget {
  return {
    kind: 'block',
    ids: { itemId, blockId: block.id },
    label: attachmentLabel(`${words.lesson} ${number} · ${blockWords} ${position}`),
  };
}

/** "Quiz 2.4 · Question 3". */
export function questionTarget(
  words: AttachWords,
  itemId: string,
  number: string,
  questionId: string,
  position: number,
): AttachTarget {
  return {
    kind: 'question',
    ids: { itemId, questionId },
    label: attachmentLabel(`${words.quiz} ${number} · Question ${position}`),
  };
}

export const COURSE_TARGET: AttachTarget = { kind: 'course', ids: {}, label: 'Course details' };
export const LANDING_TARGET: AttachTarget = { kind: 'landing', ids: {}, label: 'Landing page' };
